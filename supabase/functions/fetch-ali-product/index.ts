import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProductMeta = {
  title: string;
  price: number;
  image_url: string;
  orders_count: number;
  rating: number;
};

type ApiOk = { success: true; data: ProductMeta; cleanUrl: string; productId?: string; raw?: unknown };
type ApiErr = { success: false; error: string; code?: string; request_id?: string; trace_id?: string; raw?: unknown };

async function generateMd5Signature(params: Record<string, string>, appSecretRaw: string): Promise<string> {
  const appSecret = appSecretRaw.trim();
  const sortedKeys = Object.keys(params).sort();
  let signStr = appSecret;
  for (const key of sortedKeys) signStr += key + params[key];
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
  const m = url.match(/\/item\/(\d+)\.html/i) || url.match(/\/(\d+)\.html/i) || url.match(/productId[=:](\d+)/i);
  return m?.[1];
}

function cleanProductUrl(url: string, productId?: string): string {
  if (productId) return `https://www.aliexpress.com/item/${productId}.html`;
  return url;
}

function normalizeMetaFromApi(raw: any): ProductMeta {
  // API shape tends to vary between accounts/regions; be defensive.
  const p = raw?.product || raw;

  const title = String(p?.product_title || p?.productTitle || p?.title || "AliExpress Product");
  const image_url =
    String(
      p?.product_main_image_url ||
        p?.productMainImageUrl ||
        p?.product_image_url ||
        p?.productImageUrl ||
        p?.main_image_url ||
        p?.image_url ||
        ""
    ) || "";

  const priceStr =
    p?.target_sale_price ||
    p?.targetSalePrice ||
    p?.target_original_price ||
    p?.targetOriginalPrice ||
    p?.sale_price ||
    p?.salePrice ||
    p?.original_price ||
    p?.originalPrice ||
    0;

  const price = typeof priceStr === "number" ? priceStr : parseFloat(String(priceStr)) || 0;

  const orders_count =
    (typeof p?.sales_count === "number" ? p.sales_count : parseInt(String(p?.sales_count || p?.salesCount || 0))) || 0;

  const rating = typeof p?.evaluate_rate === "number" ? p.evaluate_rate : parseFloat(String(p?.evaluate_rate || p?.evaluateRate || 0)) || 0;

  return { title, price, image_url, orders_count, rating };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const productUrl = String(body?.productUrl || "").trim();

    if (!productUrl) {
      const payload: ApiErr = { success: false, error: "Product URL is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY")?.trim();
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET")?.trim();
    const trackingId = Deno.env.get("ALIEXPRESS_TRACKING_ID")?.trim();

    if (!appKey || !appSecret || !trackingId) {
      const payload: ApiErr = { success: false, error: "AliExpress API is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expanded = await expandShortUrl(productUrl);
    const productId = parseProductId(expanded);
    const cleanUrl = cleanProductUrl(expanded, productId);

    if (!productId) {
      const payload: ApiErr = { success: false, error: "Could not detect product ID from URL", raw: { expanded, cleanUrl } };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // AliExpress affiliate API product detail
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.productdetail.get",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      product_ids: productId,
      target_language: "EN",
      target_currency: "USD",
    };

    const sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

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

    const rr = data?.aliexpress_affiliate_productdetail_get_response?.resp_result;
    const product = rr?.result?.products?.[0] || rr?.result?.products?.product?.[0] || rr?.result?.products?.product || rr?.result?.products?.[0];

    if (!rr || rr?.resp_code !== 200 || !product) {
      const payload: ApiErr = { success: false, error: "No product data returned", raw: data };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = normalizeMetaFromApi(product);
    const payload: ApiOk = { success: true, data: meta, cleanUrl, productId, raw: undefined };

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
