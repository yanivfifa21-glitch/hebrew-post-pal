import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Product = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
};

type ApiOk = { success: true; products: Product[]; total: number };
type ApiErr = { success: false; error: string; code?: string };

async function generateMd5Signature(
  params: Record<string, string>,
  appSecret: string
): Promise<string> {
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
    const pageSize = Math.min(parseInt(body?.pageSize) || 20, 50);
    // Default sort by volume (sales) for most relevant deals
    const sort = String(body?.sort || "VOLUME_DESC").trim();

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY")?.trim();
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET")?.trim();
    const trackingId = (Deno.env.get("ALIEXPRESS_TRACKING_ID") || "TELEGRAM").trim();

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "AliExpress API not configured" };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!keywords && !category) {
      const payload: ApiErr = {
        success: false,
        error: "Missing search input (keywords or category)",
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use aliexpress.affiliate.product.query for better keyword relevance
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.product.query",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      target_language: "EN",
      target_currency: "USD",
      page_no: page.toString(),
      page_size: pageSize.toString(),
      sort: sort,
    };

    // Add keywords - this is the main search parameter
    if (keywords) {
      params.keywords = keywords;
    }
    
    // Add category filter if provided
    if (category) {
      params.category_ids = category;
    }

    console.log("[search-ali-products] API params:", JSON.stringify(params));

    const sign = await generateMd5Signature(params, appSecret);
    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[search-ali-products] API response:", JSON.stringify(data).substring(0, 500));

    const err = data?.error_response;
    if (err?.msg || err?.code) {
      const payload: ApiErr = {
        success: false,
        error: String(err?.msg || "AliExpress API error"),
        code: err?.code,
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
    const result = rr?.result;

    if (!rr || rr?.resp_code !== 200) {
      const payload: ApiErr = {
        success: false,
        error: `API error (resp_code: ${rr?.resp_code})`,
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawProducts = result?.products?.product || [];

    const products: Product[] = rawProducts.map((p: any) => ({
      product_id: String(p.product_id || ""),
      title: String(p.product_title || ""),
      price: parseFloat(p.target_sale_price || p.target_original_price || "0"),
      original_price: parseFloat(p.target_original_price || "0"),
      image_url: String(p.product_main_image_url || ""),
      sales_count:
        parseInt(p.lastest_volume || p.volume || p.total_sold || "0") || 0,
      rating: parseFloat(p.evaluate_rate || "0") || 0,
      product_url: `https://www.aliexpress.com/item/${p.product_id}.html`,
    }));

    const payload: ApiOk = {
      success: true,
      products,
      total: parseInt(result?.total_record_count || "0"),
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("[search-ali-products] Error:", e);
    const payload: ApiErr = {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
