import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeExtractedUrl(rawUrl: string): string {
  return rawUrl.replace(/[),.;!?]+$/g, "").trim();
}

function extractUrls(text: string): string[] {
  const matches = text.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi) || [];
  const normalized = matches
    .map((url) => normalizeExtractedUrl(url))
    .filter((url) => url.length > 0);
  return [...new Set(normalized)];
}

function isAliExpressUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes("aliexpress.");
  } catch {
    return /aliexpress/i.test(url);
  }
}

function stripAffiliateParams(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ["aff_id","af","dp","cv","sk","aff_fcid","aff_fsk","aff_platform","aff_trace_key","terminal_id","algo_pvid","algo_exp_id"]) {
      u.searchParams.delete(k);
    }
    return u.toString();
  } catch { return url; }
}

function buildAffiliateUrl(base: string, params: Record<string, string>): string {
  try {
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) { if (v) u.searchParams.set(k, v); }
    return u.toString();
  } catch { return base; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const update = await req.json();
    const message = update.message || update.channel_post;
    if (!message) {
      return new Response(JSON.stringify({ ok: true, skipped: "no message" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chatId = String(message.chat?.id || "");
    if (!chatId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no chat_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find matching relay group
    const { data: relayGroup } = await supabase
      .from("relay_groups")
      .select("*")
      .eq("telegram_group_id", chatId)
      .eq("is_active", true)
      .maybeSingle();

    if (!relayGroup) {
      // Try negative format
      const { data: relayGroup2 } = await supabase
        .from("relay_groups")
        .select("*")
        .eq("telegram_group_id", `-100${chatId.replace(/^-100/, "")}`)
        .eq("is_active", true)
        .maybeSingle();
      if (!relayGroup2) {
        return new Response(JSON.stringify({ ok: true, skipped: "group not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Use relayGroup2
      return await processMessage(supabase, supabaseUrl, message, relayGroup2);
    }

    return await processMessage(supabase, supabaseUrl, message, relayGroup);
  } catch (error) {
    console.error("[telegram-listener-webhook] Error:", error);
    return new Response(JSON.stringify({ ok: false, error: String(error) }), {
      status: 200, // Always return 200 to Telegram to prevent retries
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function processMessage(supabase: any, supabaseUrl: string, message: any, relayGroup: any) {
  const userId = relayGroup.user_id;
  const botToken = relayGroup.bot_token;

  // Extract text
  const text = message.caption || message.text || "";
  const urls = extractUrls(text);

  // Rule: exactly one link per post; skip posts with zero/multiple links
  if (urls.length !== 1) {
    return new Response(JSON.stringify({
      ok: true,
      skipped: urls.length === 0 ? "no_links_in_post" : "multiple_links_in_post",
      urlCount: urls.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const aliUrl = urls[0];
  if (!isAliExpressUrl(aliUrl)) {
    return new Response(JSON.stringify({
      ok: true,
      skipped: "link_is_not_aliexpress",
      url: aliUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Download photo if present
  let imageUrl: string | null = null;
  if (message.photo && message.photo.length > 0 && botToken) {
    const largestPhoto = message.photo[message.photo.length - 1];
    const fileId = largestPhoto.file_id;

    try {
      // Get file path from Telegram
      const fileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();

      if (fileData.ok && fileData.result?.file_path) {
        // Download the file
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
        const imgResp = await fetch(downloadUrl);

        if (imgResp.ok) {
          const imgBlob = await imgResp.blob();
          const filename = `captured/${crypto.randomUUID()}.jpg`;

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filename, imgBlob, { contentType: "image/jpeg", upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filename);
            imageUrl = urlData?.publicUrl || null;
          } else {
            console.error("[telegram-listener-webhook] Upload error:", uploadError);
          }
        }
      }
    } catch (e) {
      console.error("[telegram-listener-webhook] Photo download error:", e);
    }
  }

  // Get user's affiliate params
  const { data: settings } = await supabase
    .from("app_settings")
    .select("affiliate_params, aliexpress_tracking_id")
    .eq("user_id", userId)
    .maybeSingle();

  const affiliateParams = (settings?.affiliate_params as Record<string, string>) || {};
  const trackingId = settings?.aliexpress_tracking_id || "";

  // Process URL
  let modifiedUrl = aliUrl || "";
  if (aliUrl && /aliexpress/i.test(aliUrl)) {
    const cleanUrl = stripAffiliateParams(aliUrl);
    const params = { ...affiliateParams };
    if (trackingId && !params.aff_id) params.aff_id = trackingId;
    modifiedUrl = buildAffiliateUrl(cleanUrl, params);
  }

  // Process text
  let modifiedText = text;
  if (relayGroup.text_template_prepend) {
    modifiedText = relayGroup.text_template_prepend + "\n" + modifiedText;
  }
  if (relayGroup.text_template_append) {
    modifiedText = modifiedText + "\n" + relayGroup.text_template_append;
  }
  // Replace AliExpress links in text
  if (aliUrl && modifiedUrl && aliUrl !== modifiedUrl) {
    modifiedText = modifiedText.replace(
      new RegExp(aliUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      modifiedUrl
    );
    // Also replace any other aliexpress URLs
    modifiedText = modifiedText.replace(
      /https?:\/\/[^\s]*aliexpress[^\s]*/gi,
      modifiedUrl
    );
  }

  const status = relayGroup.auto_approve ? "approved" : "pending_review";

  // Create captured post
  const { data: capturedPost, error: insertError } = await supabase
    .from("captured_posts")
    .insert({
      user_id: userId,
      source_group_id: relayGroup.id,
      original_text: text,
      modified_text: modifiedText,
      original_url: aliUrl,
      modified_url: modifiedUrl || null,
      image_url: imageUrl,
      status,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  // Increment captured count
  await supabase
    .from("relay_groups")
    .update({ captured_count: (relayGroup.captured_count || 0) + 1 })
    .eq("id", relayGroup.id);

  // If auto-approved, create product
  let productId = null;
  if (relayGroup.auto_approve) {
    const productTitle = (text || "").substring(0, 100) || "Captured Product";
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        user_id: userId,
        title: productTitle,
        original_url: aliUrl || "",
        affiliate_link: modifiedUrl || null,
        image_url: imageUrl,
        hebrew_description: modifiedText || null,
        status: "Scheduled",
        sent_via: "auto",
      })
      .select()
      .single();

    if (!productError && product) {
      productId = product.id;
      await supabase
        .from("captured_posts")
        .update({ product_id: product.id, status: "queued", reviewed_at: new Date().toISOString() })
        .eq("id", capturedPost.id);
    }
  }

  console.log(`[telegram-listener-webhook] Captured post from group ${relayGroup.group_name}, status=${status}`);

  return new Response(JSON.stringify({
    ok: true,
    capturedPostId: capturedPost.id,
    productId,
    status,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
