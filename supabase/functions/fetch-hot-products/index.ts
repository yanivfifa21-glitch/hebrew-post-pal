import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Top-selling categories for Israel market
const POPULAR_CATEGORIES = ["509", "15", "44", "34"];

// Quality filters
const MIN_RATING = 4.5;
const MIN_SALES = 50;
const MAX_DELIVERY_DAYS = 15;

type HotProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
  delivery_days?: number;
};

type ApiOk = { success: true; products: HotProduct[]; total: number };
type ApiErr = { success: false; error: string; code?: string };

async function generateMd5Signature(params: Record<string, string>, appSecret: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  let signStr = appSecret;
  for (const key of sortedKeys) signStr += key + params[key];
  signStr += appSecret;

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("MD5", encoder.encode(signStr));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
  const body = await req.json().catch(() => ({}));
    const category = String(body?.category || "").trim();
    const keywords = String(body?.keywords || "").trim();
    const page = parseInt(body?.page) || 1;
    const pageSize = Math.min(parseInt(body?.pageSize) || 30, 50);
    // Use BEST_MATCH for more relevant products - better quality than volume-based
    const sort = String(body?.sort || "BEST_MATCH").trim();

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY")?.trim();
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET")?.trim();
    const trackingId = (Deno.env.get("ALIEXPRESS_TRACKING_ID") || "default").trim();

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "AliExpress API not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use specified category or cycle through popular categories
    let categoryIds = category;
    if (!categoryIds) {
      const randomIndex = Math.floor(Math.random() * POPULAR_CATEGORIES.length);
      categoryIds = POPULAR_CATEGORIES[randomIndex];
    }

    // Build API params for hot products with Israel market focus
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.hotproduct.query",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      target_language: "EN",
      target_currency: "ILS",
      ship_to_country: "IL",
      page_no: page.toString(),
      page_size: pageSize.toString(),
      sort: sort,
      category_ids: categoryIds,
      delivery_days: MAX_DELIVERY_DAYS.toString(),
    };

    if (keywords) {
      params.keywords = keywords;
    }

    console.log("[fetch-hot-products] API params:", JSON.stringify(params));

    const sign = await generateMd5Signature(params, appSecret);
    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[fetch-hot-products] API response:", JSON.stringify(data).substring(0, 500));

    const err = data?.error_response;
    if (err?.msg || err?.code) {
      const payload: ApiErr = {
        success: false,
        error: String(err?.msg || "AliExpress API error"),
        code: err?.code,
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rr = data?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
    const result = rr?.result;
    
    if (!rr || rr?.resp_code !== 200) {
      const payload: ApiErr = { 
        success: false, 
        error: `API error (resp_code: ${rr?.resp_code})` 
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawProducts = result?.products?.product || [];
    
    // Map and apply quality filters: 4.5+ rating, 50+ sales
    const products: HotProduct[] = rawProducts
      .map((p: any) => {
        // Rating comes as percentage string like "95.2" meaning 95.2%
        const ratingPercent = parseFloat(p.evaluate_rate || "0");
        // Convert to 5-star scale (95.2% = 4.76 stars)
        const ratingStars = (ratingPercent / 100) * 5;
        
        return {
          product_id: String(p.product_id || ""),
          title: String(p.product_title || ""),
          price: parseFloat(p.target_sale_price || p.target_original_price || "0"),
          original_price: parseFloat(p.target_original_price || "0"),
          image_url: String(p.product_main_image_url || ""),
          sales_count: parseInt(p.lastest_volume || "0") || 0,
          rating: ratingStars,
          product_url: `https://www.aliexpress.com/item/${p.product_id}.html`,
        };
      })
      .filter((p: HotProduct) => p.rating >= MIN_RATING && p.sales_count >= MIN_SALES);

    console.log(`[fetch-hot-products] Filtered ${rawProducts.length} -> ${products.length} products (min rating: ${MIN_RATING}, min sales: ${MIN_SALES})`);

    const payload: ApiOk = { 
      success: true, 
      products, 
      total: products.length 
    };
    
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-hot-products] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
