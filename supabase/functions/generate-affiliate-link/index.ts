import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; affiliateLink: string; originalUrl: string; cleanUrl: string; productId: string };
type ApiErr = {
  success: false;
  error: string;
  code?: string;
  request_id?: string;
  trace_id?: string;
  raw?: unknown;
};

async function generateMd5Signature(params: Record<string, string>, appSecretRaw: string): Promise<string> {
  const appSecret = appSecretRaw.trim();
  const sortedKeys = Object.keys(params).sort();

  // AliExpress Open Platform style: secret + (k1v1k2v2...) + secret
  let signStr = appSecret;
  for (const key of sortedKeys) {
    signStr += key + params[key];
  }
  signStr += appSecret;

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("MD5", encoder.encode(signStr));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function expandShortUrl(url: string): Promise<string> {
  const u = url.trim();
  if (!u) return u;

  if (!u.includes("a.aliexpress.com") && !u.includes("s.click.aliexpress.com")) return u;

  try {
    const resp = await fetch(u, { method: "HEAD", redirect: "follow" });
    return resp.url || u;
  } catch {
    return u;
  }
}

function parseProductId(url: string): string | undefined {
  // Multiple patterns to extract numeric product ID
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

function cleanProductUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const productUrl = String(body?.productUrl || "").trim();

    console.log("[generate-affiliate-link] Input URL:", productUrl);

    if (!productUrl) {
      const payload: ApiErr = { success: false, error: "Product URL is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY")?.trim();
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET")?.trim();
    // Use TELEGRAM as the default tracking ID
    const trackingId = "TELEGRAM";

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "AliExpress API is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expanded = await expandShortUrl(productUrl);
    console.log("[generate-affiliate-link] Expanded URL:", expanded);
    
    const productId = parseProductId(expanded);
    console.log("[generate-affiliate-link] Extracted productId:", productId);

    if (!productId) {
      const payload: ApiErr = { 
        success: false, 
        error: "Could not extract numeric product ID from URL", 
        raw: { input: productUrl, expanded } 
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cleanUrl = cleanProductUrl(productId);

    // Use the clean URL for affiliate link generation
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

    console.log("[generate-affiliate-link] API params:", JSON.stringify(params));

    const sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[generate-affiliate-link] API response:", JSON.stringify(data).substring(0, 500));

    // Success parse
    const result = data?.aliexpress_affiliate_link_generate_response?.resp_result;
    const promotionLink = result?.result?.promotion_links?.[0]?.promotion_link;

    if (result?.resp_code === 200 && promotionLink) {
      const payload: ApiOk = {
        success: true,
        affiliateLink: promotionLink,
        originalUrl: productUrl,
        cleanUrl,
        productId,
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Error parse
    const err = data?.error_response;
    if (err?.msg || err?.code) {
      const payload: ApiErr = {
        success: false,
        error: String(err?.msg || "AliExpress API error"),
        code: err?.code,
        request_id: err?.request_id,
        trace_id: err?._trace_id_,
        raw: data,
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload: ApiErr = { 
      success: false, 
      error: `Unexpected AliExpress response (resp_code: ${result?.resp_code})`, 
      raw: data 
    };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-affiliate-link] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
