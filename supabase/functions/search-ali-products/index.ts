import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Israel market settings
const MIN_PRICE_USD = "5";
const MAX_DELIVERY_DAYS = 15;

// Accessory keywords to filter out for certain searches
const ACCESSORY_KEYWORDS = ["strap", "band", "case", "cover", "film", "protector", "cable", "charger", "holder", "stand", "dock"];
const PRODUCT_KEYWORDS_TO_FILTER = ["watch", "phone", "tablet", "laptop", "earbuds", "headphones"];

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

type ApiOk = { success: true; products: Product[]; total: number; translatedKeywords?: string };
type ApiErr = { success: false; error: string; code?: string };

// Check if text contains Hebrew characters
function containsHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text);
}

// Translate Hebrew to English using Google Translate API
async function translateToEnglish(text: string): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=he&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    
    // Extract translated text from response
    if (data && data[0] && data[0][0] && data[0][0][0]) {
      return data[0][0][0];
    }
    return text;
  } catch (error) {
    console.error("[search-ali-products] Translation error:", error);
    return text;
  }
}

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

function shouldFilterAccessories(searchKeyword: string): boolean {
  const lowerKeyword = searchKeyword.toLowerCase();
  return PRODUCT_KEYWORDS_TO_FILTER.some(k => lowerKeyword.includes(k));
}

function isAccessory(title: string): boolean {
  const lowerTitle = title.toLowerCase();
  return ACCESSORY_KEYWORDS.some(acc => lowerTitle.includes(acc));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));

    const category = String(body?.category || "").trim();
    const keywords = String(body?.keywords || "").trim();
    const page = parseInt(body?.page) || 1;
    const pageSize = Math.min(parseInt(body?.pageSize) || 40, 50);
    
    // FORCE sort by sales volume - never use any other sort
    const sort = "VOLUME_DESC";

    const appKey = Deno.env.get("ALIEXPRESS_APP_KEY")?.trim();
    const appSecret = Deno.env.get("ALIEXPRESS_APP_SECRET")?.trim();
    const trackingId = (Deno.env.get("ALIEXPRESS_TRACKING_ID") || "default").trim();

    console.log("[search-ali-products] ===== NEW SEARCH REQUEST =====");
    console.log("[search-ali-products] Input - keywords:", keywords, "| category:", category, "| page:", page);

    if (!appKey || !appSecret) {
      console.error("[search-ali-products] Missing API credentials");
      const payload: ApiErr = { success: false, error: "AliExpress API not configured" };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!keywords && !category) {
      console.error("[search-ali-products] Missing search input");
      const payload: ApiErr = {
        success: false,
        error: "Missing search input (keywords or category)",
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Translate Hebrew to English if needed
    let searchKeywords = keywords;
    let translatedKeywords: string | undefined;
    
    if (containsHebrew(keywords)) {
      console.log("[search-ali-products] Hebrew detected, translating:", keywords);
      searchKeywords = await translateToEnglish(keywords);
      translatedKeywords = searchKeywords;
      console.log("[search-ali-products] Translated to:", searchKeywords);
    }

    // Build params - DIRECT API CALL to AliExpress
    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.product.query",
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
      min_sale_price: MIN_PRICE_USD,
      delivery_days: MAX_DELIVERY_DAYS.toString(),
    };

    // Explicitly set keywords - use translated keywords
    if (searchKeywords) {
      params.keywords = searchKeywords;
    }
    
    if (category) {
      params.category_ids = category;
    }

    // Generate signature
    const sign = await generateMd5Signature(params, appSecret);
    
    // Build query string
    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
    
    // DEBUG: Log exact URL and params being sent
    console.log("[search-ali-products] ===== API REQUEST =====");
    console.log("[search-ali-products] Full API URL:", apiUrl);
    console.log("[search-ali-products] Params sent:", JSON.stringify(params, null, 2));

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[search-ali-products] ===== API RESPONSE =====");
    console.log("[search-ali-products] Response status:", resp.status);
    console.log("[search-ali-products] Response preview:", JSON.stringify(data).substring(0, 800));

    const err = data?.error_response;
    if (err?.msg || err?.code) {
      console.error("[search-ali-products] API Error:", err);
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
      console.error("[search-ali-products] API resp_code error:", rr?.resp_code);
      const payload: ApiErr = {
        success: false,
        error: `API error (resp_code: ${rr?.resp_code})`,
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawProducts = result?.products?.product || [];
    console.log("[search-ali-products] Raw products count:", rawProducts.length);

    // Check if we need to filter accessories (use translated keywords)
    const filterAccessories = shouldFilterAccessories(searchKeywords);
    console.log("[search-ali-products] Filter accessories:", filterAccessories, "for keyword:", searchKeywords);

    let products: Product[] = rawProducts.map((p: any) => {
      // Rating comes as percentage string like "95.2" meaning 95.2%
      const ratingPercent = parseFloat(p.evaluate_rate || "0");
      // Convert to 5-star scale
      const ratingStars = (ratingPercent / 100) * 5;
      
      return {
        product_id: String(p.product_id || ""),
        title: String(p.product_title || ""),
        price: parseFloat(p.target_sale_price || p.target_original_price || "0"),
        original_price: parseFloat(p.target_original_price || "0"),
        image_url: String(p.product_main_image_url || ""),
        sales_count: parseInt(p.lastest_volume || p.volume || p.total_sold || "0") || 0,
        rating: ratingStars,
        product_url: `https://www.aliexpress.com/item/${p.product_id}.html`,
      };
    });

    // Filter out accessories if searching for main products like Watch, Phone
    if (filterAccessories) {
      const beforeFilter = products.length;
      products = products.filter(p => !isAccessory(p.title));
      console.log(`[search-ali-products] Filtered accessories: ${beforeFilter} -> ${products.length} products`);
    }

    console.log("[search-ali-products] Final products count:", products.length);

    const payload: ApiOk = {
      success: true,
      products,
      total: parseInt(result?.total_record_count || "0"),
      translatedKeywords,
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    console.error("[search-ali-products] Exception:", e);
    const payload: ApiErr = {
      success: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
