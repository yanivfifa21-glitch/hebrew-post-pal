import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function normalizeExtractedUrl(rawUrl: string): string {
  return rawUrl.replace(/[),.;!?]+$/g, "").trim();
}

function extractUrlsFromText(text: string): string[] {
  const matches = text.match(/(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi) || [];
  return matches
    .map((url) => normalizeExtractedUrl(url))
    .filter((url) => url.length > 0);
}

function extractUrlsFromEntities(text: string, entities: any[] | undefined): string[] {
  if (!entities || entities.length === 0 || !text) return [];

  const urls: string[] = [];
  for (const entity of entities) {
    if (!entity) continue;

    if (entity.type === "text_link" && typeof entity.url === "string") {
      urls.push(normalizeExtractedUrl(entity.url));
      continue;
    }

    if (entity.type === "url" && typeof entity.offset === "number" && typeof entity.length === "number") {
      const entityUrl = text.slice(entity.offset, entity.offset + entity.length);
      if (entityUrl) urls.push(normalizeExtractedUrl(entityUrl));
    }
  }

  return urls.filter((url) => url.length > 0);
}

function extractUrlsFromInlineKeyboard(message: any): string[] {
  const rows = message?.reply_markup?.inline_keyboard;
  if (!Array.isArray(rows)) return [];

  const urls: string[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    for (const button of row) {
      if (button?.url && typeof button.url === "string") {
        urls.push(normalizeExtractedUrl(button.url));
      }
    }
  }

  return urls.filter((url) => url.length > 0);
}

function collectMessageUrls(message: any): string[] {
  const text = message.text || "";
  const caption = message.caption || "";

  const allUrls = [
    ...extractUrlsFromText(text),
    ...extractUrlsFromText(caption),
    ...extractUrlsFromEntities(text, message.entities),
    ...extractUrlsFromEntities(caption, message.caption_entities),
    ...extractUrlsFromInlineKeyboard(message),
  ];

  if (message?.link_preview_options?.url && typeof message.link_preview_options.url === "string") {
    allUrls.push(normalizeExtractedUrl(message.link_preview_options.url));
  }

  return [...new Set(allUrls.filter((url) => url.length > 0))];
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

    // Normalize chat ID variants for matching
    const digitsOnlyId = chatId.replace(/^-100/, "").replace(/^-/, "");
    const candidateIds = [
      chatId,                  // as-is from Telegram
      `-100${digitsOnlyId}`,   // supergroup format
      `-${digitsOnlyId}`,      // short negative format
      digitsOnlyId,            // bare numeric format
    ].filter(Boolean);
    const uniqueIds = [...new Set(candidateIds)];

    console.log(`[telegram-listener-webhook] chatId=${chatId}, trying IDs: ${uniqueIds.join(", ")}`);

    // Find matching relay group using any variant
    const { data: relayGroup } = await supabase
      .from("relay_groups")
      .select("*")
      .in("telegram_group_id", uniqueIds)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!relayGroup) {
      return new Response(JSON.stringify({ ok: true, skipped: "group not configured", tried: uniqueIds }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
  const rewriteMode: string = relayGroup.rewrite_mode || "link_only";

  // Extract text + URLs (supports plain URLs, text_link entities, and inline keyboard links)
  const text = message.caption || message.text || "";
  const urls = collectMessageUrls(message);

  // Rule: exactly one link per post; skip posts with zero/multiple links
  if (urls.length !== 1) {
    console.log(`[telegram-listener-webhook] skipped=${urls.length === 0 ? "no_links_in_post" : "multiple_links_in_post"}, urlCount=${urls.length}, urls=${JSON.stringify(urls)}`);
    return new Response(JSON.stringify({
      ok: true,
      skipped: urls.length === 0 ? "no_links_in_post" : "multiple_links_in_post",
      urlCount: urls.length,
      urls,
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

  // Download media (photo, video, animation, or video document)
  let mediaUrl: string | null = null;
  let mediaType: 'image' | 'video' = 'image';

  // Determine which media to download
  let fileId: string | null = null;
  let contentType = "image/jpeg";
  let fileExtension = "jpg";

  if (message.video && botToken) {
    fileId = message.video.file_id;
    contentType = message.video.mime_type || "video/mp4";
    fileExtension = "mp4";
    mediaType = 'video';
  } else if (message.animation && botToken) {
    // GIFs sent as animation – treat as video
    fileId = message.animation.file_id;
    contentType = message.animation.mime_type || "video/mp4";
    fileExtension = message.animation.mime_type?.includes("gif") ? "gif" : "mp4";
    mediaType = 'video';
  } else if (message.document && botToken && message.document.mime_type?.startsWith("video/")) {
    // Videos sent as documents
    fileId = message.document.file_id;
    contentType = message.document.mime_type || "video/mp4";
    fileExtension = "mp4";
    mediaType = 'video';
  } else if (message.photo && message.photo.length > 0 && botToken) {
    const largestPhoto = message.photo[message.photo.length - 1];
    fileId = largestPhoto.file_id;
    contentType = "image/jpeg";
    fileExtension = "jpg";
    mediaType = 'image';
  }

  if (fileId && botToken) {
    try {
      const fileResp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
      const fileData = await fileResp.json();

      if (fileData.ok && fileData.result?.file_path) {
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
        const mediaResp = await fetch(downloadUrl);

        if (mediaResp.ok) {
          const arrayBuffer = await mediaResp.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const filename = `captured/${crypto.randomUUID()}.${fileExtension}`;

          const { error: uploadError } = await supabase.storage
            .from("product-images")
            .upload(filename, uint8, { contentType, upsert: true });

          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(filename);
            mediaUrl = urlData?.publicUrl || null;
          } else {
            console.error("[telegram-listener-webhook] Upload error:", uploadError);
          }
        }
      }
    } catch (e) {
      console.error("[telegram-listener-webhook] Media download error:", e);
    }
  }

  // ========== GENERATE REAL AFFILIATE LINK via API ==========
  let modifiedUrl: string | null = null;
  let fetchedImageUrl: string | null = null;
  let modifiedText: string = text;
  let ordersCount: number | null = null;
  let rating: number | null = null;

  try {
    // Get user's decrypted credentials for affiliate link generation
    const { data: credentials } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: userId });

    const { data: settings } = await supabase
      .from("app_settings")
      .select("affiliate_params, aliexpress_tracking_id")
      .eq("user_id", userId)
      .maybeSingle();

    const appKey = credentials?.aliexpress_app_key?.trim();
    const appSecret = credentials?.aliexpress_app_secret?.trim();
    const trackingId = settings?.aliexpress_tracking_id?.trim() || "TELEGRAM";

    if (!appKey || !appSecret) {
      console.warn(`[telegram-listener-webhook] No API credentials – skipping post`);
      return new Response(JSON.stringify({ ok: true, skipped: "no_api_credentials" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Expand short URL and extract product ID
    const expanded = await expandShortUrl(aliUrl);
    const productId = parseProductId(expanded);

    if (!productId) {
      console.warn(`[telegram-listener-webhook] Could not extract product ID – skipping post`);
      return new Response(JSON.stringify({ ok: true, skipped: "no_product_id", url: aliUrl, expanded }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanUrl = `https://www.aliexpress.com/item/${productId}.html`;

    // Generate affiliate link via AliExpress API (MUST succeed)
    const affiliateLink = await generateAffiliateLink(appKey, appSecret, trackingId, cleanUrl);
    if (!affiliateLink) {
      console.warn(`[telegram-listener-webhook] Affiliate link generation FAILED – skipping post`);
      return new Response(JSON.stringify({ ok: true, skipped: "affiliate_link_failed", productId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    modifiedUrl = affiliateLink;
    console.log(`[telegram-listener-webhook] Generated affiliate link for product ${productId}: ${affiliateLink}`);

    // For full_rewrite mode: also fetch product data and rewrite text
    if (rewriteMode === "full_rewrite") {
      console.log(`[telegram-listener-webhook] Full rewrite mode: fetching product data + AI rewrite`);

      // Fetch product data for image + stats
      try {
        const fetchResp = await fetch(`${supabaseUrl}/functions/v1/fetch-ali-product`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ productUrl: cleanUrl, userId }),
        });
        const fetchData = await fetchResp.json();

        if (fetchData?.success && fetchData?.data) {
          if (fetchData.data.image_url) fetchedImageUrl = fetchData.data.image_url;
          if (fetchData.data.orders_count) ordersCount = Number(fetchData.data.orders_count);
          if (fetchData.data.rating) rating = Number(fetchData.data.rating);
        }
      } catch (e) {
        console.error("[telegram-listener-webhook] fetch-ali-product failed:", e);
      }

      // AI rewrite
      try {
        const textForAi = text.replace(/https?:\/\/(?:s\.click\.aliexpress\.com|a\.aliexpress\.com|www\.aliexpress\.com|aliexpress\.com)\S+/gi, "").trim();
        const rewriteResp = await fetch(`${supabaseUrl}/functions/v1/generate-hebrew-post`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ title: textForAi, manualRewrite: true }),
        });
        const rewriteData = await rewriteResp.json();

        if (rewriteData?.success && rewriteData?.hebrewDescription) {
          modifiedText = rewriteData.hebrewDescription.trim();

          // Add stats
          const statsLines: string[] = [];
          const hasOrdersStat = /מעל\s+[\d,]+\s+הזמנות|📦\s.*הזמנות|👥\s.*הזמנות/.test(modifiedText);
          const hasRatingStat = /דירוג[:\s]+[\d.]+\s+מתוך|⭐\s.*דירוג/.test(modifiedText);

          if (ordersCount && ordersCount > 0 && !hasOrdersStat) {
            const rounded = Math.ceil(ordersCount / 100) * 100;
            statsLines.push(`👥 מעל ${rounded.toLocaleString()} הזמנות`);
          }
          if (rating && rating > 0 && !hasRatingStat) {
            let r = rating;
            if (r > 5) r = r / 20;
            statsLines.push(`⭐ דירוג: ${r.toFixed(1)} מתוך 5`);
          }

          if (statsLines.length > 0) {
            modifiedText = modifiedText + "\n\n" + statsLines.join("\n");
          }

          // Add CTA with affiliate link
          const ctaOptions = ["לרכישה", "להזמנה", "להזמנה מאליאקספרס"];
          const randomCta = ctaOptions[Math.floor(Math.random() * ctaOptions.length)];
          modifiedText = modifiedText + `\n\n👇 ${randomCta}\n${modifiedUrl}`;

          console.log(`[telegram-listener-webhook] AI rewrite completed`);
        } else {
          console.warn("[telegram-listener-webhook] AI rewrite failed, falling back to link replacement");
          modifiedText = replaceLinksInText(text, aliUrl, modifiedUrl, relayGroup);
        }
      } catch (e) {
        console.error("[telegram-listener-webhook] AI rewrite error:", e);
        modifiedText = replaceLinksInText(text, aliUrl, modifiedUrl, relayGroup);
      }
    } else {
      // link_only mode: just replace the link in existing text
      modifiedText = replaceLinksInText(text, aliUrl, modifiedUrl, relayGroup);
    }
  } catch (e) {
    console.error("[telegram-listener-webhook] Affiliate/rewrite processing error:", e);
    // If we couldn't generate affiliate link at all, skip
    if (!modifiedUrl) {
      return new Response(JSON.stringify({ ok: true, skipped: "processing_error", error: String(e) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    modifiedText = replaceLinksInText(text, aliUrl, modifiedUrl, relayGroup);
  }

  // Use fetched image if we got one and no media from message
  const finalMediaUrl = mediaUrl || fetchedImageUrl;
  // For video from telegram, keep mediaType; if fallback to fetched image, it's 'image'
  const finalMediaType = mediaUrl ? mediaType : 'image';

  // Skip if no media available at all
  if (!finalMediaUrl) {
    console.warn(`[telegram-listener-webhook] No media available (telegram media + API fetch both failed) – skipping post`);
    return new Response(JSON.stringify({ ok: true, skipped: "no_media_available" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Duplicate detection: skip if same original_url was captured for this user in last 24h
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: existingPost } = await supabase
    .from("captured_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("original_url", aliUrl)
    .gte("captured_at", twentyFourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (existingPost) {
    console.log(`[telegram-listener-webhook] Duplicate post detected, original_url=${aliUrl}, existing_id=${existingPost.id}`);
    return new Response(JSON.stringify({ ok: true, skipped: "duplicate_post", existingId: existingPost.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
      image_url: finalMediaUrl,
      media_type: finalMediaType,
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
    const productTitle = (rewriteMode === "full_rewrite" ? modifiedText : text || "").substring(0, 100) || "Captured Product";
    const insertData: Record<string, any> = {
      user_id: userId,
      title: productTitle,
      original_url: aliUrl || "",
      affiliate_link: modifiedUrl || null,
      image_url: finalImageUrl,
      hebrew_description: modifiedText || null,
      status: "Scheduled",
      sent_via: "auto",
    };
    if (ordersCount) insertData.orders_count = ordersCount;
    if (rating) insertData.rating = rating;

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert(insertData)
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

  console.log(`[telegram-listener-webhook] Captured post from group ${relayGroup.group_name}, mode=${rewriteMode}, status=${status}`);

  return new Response(JSON.stringify({
    ok: true,
    capturedPostId: capturedPost.id,
    productId,
    status,
    rewriteMode,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Helper: replace links in text with template processing
function replaceLinksInText(text: string, aliUrl: string, modifiedUrl: string, relayGroup: any): string {
  let result = text;
  if (relayGroup.text_template_prepend) {
    result = relayGroup.text_template_prepend + "\n" + result;
  }
  if (relayGroup.text_template_append) {
    result = result + "\n" + relayGroup.text_template_append;
  }
  if (aliUrl && modifiedUrl && aliUrl !== modifiedUrl) {
    result = result.replace(
      new RegExp(aliUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      modifiedUrl
    );
    result = result.replace(
      /https?:\/\/[^\s]*aliexpress[^\s]*/gi,
      modifiedUrl
    );
  }
  return result;
}

// Helper: expand short AliExpress URLs
async function expandShortUrl(url: string): Promise<string> {
  const u = url.trim();
  if (!u) return u;
  if (!u.includes("a.aliexpress.com") && !u.includes("s.click.aliexpress.com")) return u;
  try {
    const resp = await fetch(u, { method: "HEAD", redirect: "follow" });
    return resp.url || u;
  } catch { return u; }
}

// Helper: extract product ID from URL
function parseProductId(url: string): string | undefined {
  const patterns = [
    /\/item\/(\d+)\.html/i,
    /\/(\d{10,})\.html/i,
    /productId[=:](\d+)/i,
    /product\/(\d+)/i,
    /item\/(\d+)/i,
    /\/(\d{10,})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

// Helper: generate affiliate link via AliExpress API
async function generateAffiliateLink(appKey: string, appSecret: string, trackingId: string, cleanUrl: string): Promise<string | null> {
  try {
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.link.generate",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      promotion_link_type: "0",
      source_values: cleanUrl,
    };

    const sign = await generateMd5Signature(params, appSecret);
    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    const result = data?.aliexpress_affiliate_link_generate_response?.resp_result;
    const promotionLinks = result?.result?.promotion_links;
    let promotionLink: string | undefined;

    if (promotionLinks) {
      if (promotionLinks?.promotion_link?.[0]?.promotion_link) {
        promotionLink = promotionLinks.promotion_link[0].promotion_link;
      } else if (Array.isArray(promotionLinks) && promotionLinks[0]?.promotion_link) {
        promotionLink = promotionLinks[0].promotion_link;
      } else if (promotionLinks?.promotion_link?.promotion_link) {
        promotionLink = promotionLinks.promotion_link.promotion_link;
      }
    }

    if (result?.resp_code === 200 && promotionLink) {
      return promotionLink;
    }
    return null;
  } catch (e) {
    console.error("[telegram-listener-webhook] generateAffiliateLink error:", e);
    return null;
  }
}

// Helper: MD5 signature for AliExpress API (Deno-compatible)
async function generateMd5Signature(params: Record<string, string>, appSecret: string): Promise<string> {
  const { crypto: stdCrypto } = await import("https://deno.land/std@0.168.0/crypto/mod.ts");
  const secret = appSecret.trim();
  const sortedKeys = Object.keys(params).sort();
  let signStr = secret;
  for (const key of sortedKeys) { signStr += key + params[key]; }
  signStr += secret;
  const encoder = new TextEncoder();
  const hashBuffer = await stdCrypto.subtle.digest("MD5", encoder.encode(signStr));
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
