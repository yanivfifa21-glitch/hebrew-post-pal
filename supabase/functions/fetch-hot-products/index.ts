import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category IDs for hot products API
const CATEGORY_IDS: Record<string, string> = {
  "509": "509",           // Electronics & mobile
  "15": "15",             // Home & Garden
  "66": "66",             // Beauty & Health
  "200000297": "200000297", // Sports
  "34": "34",             // Automotive
  "200003482": "200003482", // Tools & Hardware (gadgets)
  "7": "7",               // Computers & Office
  "44": "44",             // Consumer Electronics (Audio)
};

// All categories for "הכל" mode - rotate through them
const ALL_CATEGORY_IDS = ["509", "15", "66", "200000297", "34", "200003482", "7", "44"];

const MAX_DELIVERY_DAYS = 45;
const MIN_COMMISSION_RATE = "0.01"; // Minimum 1% commission
const MIN_SALES_COUNT = 200; // Minimum 200 sales for quality filtering
const MIN_RATING = 4.0; // Minimum 4.0 star rating

type HotProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
  commission_rate?: number;
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
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[fetch-hot-products] Missing authorization header");
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify user with anon key
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      console.error("[fetch-hot-products] Auth verification failed:", authError);
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const category = String(body?.category || "").trim();
    const userKeywords = String(body?.keywords || "").trim();
    const pageSize = Math.min(parseInt(body?.pageSize) || 20, 50);
    const pageNo = Math.max(parseInt(body?.pageNo) || 1, 1);

    // Use service role to fetch user's decrypted credentials via RPC
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credentials, error: credentialsError } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

    if (credentialsError || credentials?.error) {
      console.error("[fetch-hot-products] Error fetching credentials:", credentialsError || credentials?.error);
      const payload: ApiErr = { success: false, error: "Failed to fetch user credentials" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch tracking ID from app_settings
    const { data: settings } = await supabase
      .from("app_settings")
      .select("aliexpress_tracking_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const appKey = credentials?.aliexpress_app_key?.trim();
    const appSecret = credentials?.aliexpress_app_secret?.trim();
    const trackingId = settings?.aliexpress_tracking_id?.trim() || "default";

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "Please configure your AliExpress API credentials in Settings" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[fetch-hot-products] User:", user.id, "| category:", category || "ALL", "| userKeywords:", userKeywords, "| pageSize:", pageSize, "| pageNo:", pageNo);

    const desiredCount = pageSize;

    // ============================================
    // USE THE DEDICATED HOT PRODUCTS API
    // aliexpress.affiliate.hotproduct.query
    // This returns trending/hot products with high sales and commission
    // ============================================
    const callHotProductQuery = async (categoryId?: string, keywords?: string, pageNo: number = 1) => {
      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.hotproduct.query", // HOT PRODUCTS API!
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
        tracking_id: trackingId,
        target_language: "EN",
        target_currency: "ILS",
        ship_to_country: "IL",
        delivery_days: MAX_DELIVERY_DAYS.toString(),
        page_no: pageNo.toString(),
        page_size: "50", // Request more to filter by quality
        sort: "LAST_VOLUME_DESC", // Sort by recent sales volume for better quality
      };

      // Add category filter if specified
      if (categoryId) {
        params.category_ids = categoryId;
      }

      // Add keywords if provided by user
      if (keywords) {
        params.keywords = keywords;
      }

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] HOT API call - category:", categoryId || "all", "| keywords:", keywords || "none", "| page:", pageNo);
      
      const resp = await fetch(apiUrl, { method: "GET" });
      const data = await resp.json().catch(() => ({}));
      return data;
    };

    // Fallback to regular product query if hot products fails
    const callProductQuery = async (keywords: string, categoryId?: string) => {
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
        delivery_days: MAX_DELIVERY_DAYS.toString(),
        page_no: "1",
        page_size: "50",
        sort: "SALE_PRICE_ASC",
        keywords: keywords,
      };

      if (categoryId) {
        params.category_ids = categoryId;
      }

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] FALLBACK API call - keywords:", keywords, "| category:", categoryId || "none");
      
      const resp = await fetch(apiUrl, { method: "GET" });
      const data = await resp.json().catch(() => ({}));
      return data;
    };

    const mapProduct = (p: any): HotProduct | null => {
      const productId = String(p.product_id || "").trim();
      const title = String(p.product_title || "").trim();
      const imageUrl = String(p.product_main_image_url || p.product_main_image || "").trim();

      const price = parseFloat(p.target_sale_price || p.target_original_price || p.app_sale_price || p.original_price || "0") || 0;
      const originalPrice = parseFloat(p.target_original_price || p.original_price || "0") || price;

      const salesCount = parseInt(p.lastest_volume || p.volume || p.total_sold || "0") || 0;
      const ratingPercent = parseFloat(p.evaluate_rate || "0") || 0;
      const ratingStars = (ratingPercent / 100) * 5;
      
      // Commission rate (available in hot products API)
      const commissionRate = parseFloat(p.commission_rate || "0") || 0;

      const productUrl = `https://www.aliexpress.com/item/${productId}.html`;

      // Avoid broken cards
      if (!productId || !title || !imageUrl) return null;

      return {
        product_id: productId,
        title,
        price,
        original_price: originalPrice,
        image_url: imageUrl,
        sales_count: salesCount,
        rating: Math.min(Math.max(ratingStars, 0), 5),
        product_url: productUrl,
        commission_rate: commissionRate,
      };
    };

    const seen = new Set<string>();
    const products: HotProduct[] = [];

    // If user provided keywords, use hot products API with keywords
    if (userKeywords) {
      const data = await callHotProductQuery(category || undefined, userKeywords, pageNo);
      
      const err = data?.error_response;
      if (err?.msg || err?.code) {
        console.warn("[fetch-hot-products] Hot API Error:", err, "- falling back to regular query");
        // Fallback to regular product query
        const fallbackData = await callProductQuery(userKeywords, category || undefined);
        const rr = fallbackData?.aliexpress_affiliate_product_query_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p);
            if (!mapped || seen.has(mapped.product_id)) continue;
            // Quality filter - minimum sales AND rating
            if (mapped.sales_count < MIN_SALES_COUNT) continue;
            if (mapped.rating < MIN_RATING) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      } else {
        const rr = data?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          console.log("[fetch-hot-products] HOT API returned", rawProducts.length, "products");
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p);
            if (!mapped || seen.has(mapped.product_id)) continue;
            // Quality filter - minimum sales AND rating
            if (mapped.sales_count < MIN_SALES_COUNT) continue;
            if (mapped.rating < MIN_RATING) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      }
    } else {
      // No user keywords - fetch hot products by category
      // For pagination: if pageNo > 1, cycle through categories differently
      const categoriesToFetch = category ? [category] : ALL_CATEGORY_IDS;
      
      // Shuffle categories based on pageNo for variety
      const shuffledCategories = [...categoriesToFetch].sort(() => Math.random() - 0.5);
      
      // For pagination, start from different pages of the API
      const apiPageOffset = pageNo;
      
      for (const catId of shuffledCategories) {
        if (products.length >= desiredCount) break;
        
        try {
          const data = await callHotProductQuery(catId, undefined, apiPageOffset);
          
          const err = data?.error_response;
          if (err?.msg || err?.code) {
            console.warn("[fetch-hot-products] Hot API Error for category", catId, ":", err);
            continue;
          }

          const rr = data?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
          if (rr?.resp_code !== 200) {
            console.warn("[fetch-hot-products] Hot API non-200 response for category", catId, ":", rr?.resp_code);
            continue;
          }

          const rawProducts = rr?.result?.products?.product || [];
          console.log("[fetch-hot-products] Category", catId, "page", apiPageOffset, "returned", rawProducts.length, "hot products");
          
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p);
            if (!mapped || seen.has(mapped.product_id)) continue;
            // Quality filter - minimum sales count AND rating for better products
            if (mapped.sales_count < MIN_SALES_COUNT) continue;
            if (mapped.rating < MIN_RATING) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        } catch (e) {
          console.error("[fetch-hot-products] Error with category:", catId, e);
        }
      }
    }

    // Sort products by sales count (highest first) for better quality
    products.sort((a, b) => b.sales_count - a.sales_count);

    console.log("[fetch-hot-products] Returning", products.length, "hot products (sorted by sales)");
    
    const payload: ApiOk = { success: true, products, total: products.length };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-hot-products] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
