import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractUrls(text: string): string[] {
  return (text.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi) || []);
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

function replaceLinksInText(text: string, originalUrl: string, newUrl: string): string {
  if (!text || !originalUrl) return text;
  let result = text.replace(new RegExp(originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newUrl);
  result = result.replace(/https?:\/\/[^\s]*aliexpress[^\s]*/gi, newUrl);
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth check
    const authHeader = req.headers.get("authorization");
    const authClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader || "" } },
    });

    let userId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData } = await authClient.auth.getClaims(token);
      if (claimsData?.claims?.sub) {
        userId = claimsData.claims.sub as string;
      }
    }

    const body = await req.json();
    if (!userId && body.userId) userId = body.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { originalText, originalUrl, imageUrl, sourceGroupId, sourceGroupName } = body;

    // Get user's affiliate params
    const { data: settings } = await supabase
      .from("app_settings")
      .select("affiliate_params, aliexpress_tracking_id")
      .eq("user_id", userId)
      .maybeSingle();

    const affiliateParams = (settings?.affiliate_params as Record<string, string>) || {};
    const trackingId = settings?.aliexpress_tracking_id || "";

    // Process URL
    let modifiedUrl = originalUrl || "";
    if (originalUrl) {
      const cleanUrl = stripAffiliateParams(originalUrl);
      const params = { ...affiliateParams };
      if (trackingId && !params.aff_id) params.aff_id = trackingId;
      modifiedUrl = buildAffiliateUrl(cleanUrl, params);
    }

    // Process text
    let modifiedText = originalText || "";

    if (sourceGroupId) {
      const { data: group } = await supabase
        .from("relay_groups")
        .select("text_template_prepend, text_template_append")
        .eq("id", sourceGroupId)
        .maybeSingle();

      if (group?.text_template_prepend) modifiedText = group.text_template_prepend + "\n" + modifiedText;
      if (group?.text_template_append) modifiedText = modifiedText + "\n" + group.text_template_append;
    }

    if (originalUrl && modifiedUrl) {
      modifiedText = replaceLinksInText(modifiedText, originalUrl, modifiedUrl);
    }

    // Determine auto-approve
    let autoApprove = false;
    if (sourceGroupId) {
      const { data: group } = await supabase
        .from("relay_groups")
        .select("auto_approve")
        .eq("id", sourceGroupId)
        .maybeSingle();
      autoApprove = group?.auto_approve || false;
    }

    const status = autoApprove ? "approved" : "pending_review";

    const { data: capturedPost, error: insertError } = await supabase
      .from("captured_posts")
      .insert({
        user_id: userId,
        source_group_id: sourceGroupId || null,
        original_text: originalText,
        modified_text: modifiedText,
        original_url: originalUrl,
        modified_url: modifiedUrl,
        image_url: imageUrl,
        status,
        captured_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Increment captured count
    if (sourceGroupId) {
      const { data: currentGroup } = await supabase
        .from("relay_groups")
        .select("captured_count")
        .eq("id", sourceGroupId)
        .single();
      
      if (currentGroup) {
        await supabase
          .from("relay_groups")
          .update({ captured_count: (currentGroup.captured_count || 0) + 1 })
          .eq("id", sourceGroupId);
      }
    }

    // If auto-approved, create product
    let productId = null;
    if (autoApprove) {
      const productTitle = (originalText || "").substring(0, 100) || "Captured Product";
      const { data: product, error: productError } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          title: productTitle,
          original_url: originalUrl || "",
          affiliate_link: modifiedUrl || null,
          image_url: imageUrl || null,
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

    return new Response(JSON.stringify({
      success: true, capturedPostId: capturedPost.id, productId, status, modifiedUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-captured-post] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
