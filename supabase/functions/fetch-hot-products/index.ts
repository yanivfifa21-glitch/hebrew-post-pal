import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category keywords for BEST_MATCH search - multiple keywords per category for variety
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Electronics & mobile - 509
  "509": [
    "phone accessories 2024",
    "mobile phone holder",
    "wireless charger fast",
    "phone case popular",
    "screen protector",
    "usb c cable",
    "power bank portable",
  ],
  // Smart home & home - 15
  "15": [
    "led strip lights",
    "kitchen gadgets useful",
    "home organizer storage",
    "smart home devices",
    "cleaning tools home",
    "bathroom accessories",
  ],
  // Beauty, health - 66
  "66": [
    "skincare tools",
    "makeup brushes set",
    "hair styling tools",
    "nail art supplies",
    "beauty accessories",
    "face care device",
  ],
  // Sports - 200000297
  "200000297": [
    "yoga mat accessories",
    "fitness equipment home",
    "gym workout gear",
    "running accessories",
    "outdoor sports gear",
    "resistance bands set",
  ],
  // Automotive - 34
  "34": [
    "car phone holder",
    "car charger fast",
    "car organizer trunk",
    "car accessories interior",
    "car cleaning tools",
    "led car lights",
  ],
  // Viral gadgets - 200003482
  "200003482": [
    "cool gadgets 2024",
    "mini gadgets useful",
    "trending products",
    "creative tools",
    "portable gadgets",
    "smart gadgets",
  ],
  // Computers / office - 7
  "7": [
    "laptop stand desk",
    "wireless mouse keyboard",
    "usb hub multiport",
    "desk organizer office",
    "monitor accessories",
    "webcam accessories",
  ],
  // Audio / wearables - 44
  "44": [
    "wireless earbuds bluetooth",
    "headphones gaming",
    "bluetooth speaker portable",
    "smartwatch accessories",
    "earphone case",
  ],
};

// All categories for "הכל" mode
const ALL_CATEGORY_IDS = ["509", "15", "66", "200000297", "34", "200003482", "7", "44"];

const MAX_DELIVERY_DAYS = 45;

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

    console.log("[fetch-hot-products] User:", user.id, "| category:", category || "ALL", "| userKeywords:", userKeywords, "| pageSize:", pageSize);

    const desiredCount = pageSize;

    // API call helper - uses BEST_MATCH sorting
    const callAliProductQuery = async (searchKeywords: string, categoryId?: string) => {
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
        sort: "BEST_MATCH", // Changed to BEST_MATCH as requested
        keywords: searchKeywords,
      };

      // Optionally add category filter
      if (categoryId) {
        params.category_ids = categoryId;
      }

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] API call - keywords:", searchKeywords, "| category:", categoryId || "none");
      
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
      };
    };

    const seen = new Set<string>();
    const products: HotProduct[] = [];

    // If user provided keywords, use those directly
    if (userKeywords) {
      const data = await callAliProductQuery(userKeywords, category || undefined);
      
      const err = data?.error_response;
      if (err?.msg || err?.code) {
        console.error("[fetch-hot-products] API Error:", err);
        const payload: ApiErr = { success: false, error: "AliExpress API error - please verify your credentials" };
        return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
      if (rr?.resp_code === 200) {
        const rawProducts = rr?.result?.products?.product || [];
        for (const p of rawProducts) {
          if (products.length >= desiredCount) break;
          const mapped = mapProduct(p);
          if (!mapped || seen.has(mapped.product_id)) continue;
          seen.add(mapped.product_id);
          products.push(mapped);
        }
      }
    } else {
      // No user keywords - use category keywords
      const categoriesToFetch = category ? [category] : ALL_CATEGORY_IDS;
      
      for (const catId of categoriesToFetch) {
        if (products.length >= desiredCount) break;
        
        const keywords = CATEGORY_KEYWORDS[catId] || ["trending products"];
        
        // Try each keyword for this category until we have enough products
        for (const kw of keywords) {
          if (products.length >= desiredCount) break;
          
          try {
            const data = await callAliProductQuery(kw, catId);
            
            const err = data?.error_response;
            if (err?.msg || err?.code) {
              console.warn("[fetch-hot-products] API Error for keyword", kw, ":", err);
              continue;
            }

            const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
            if (rr?.resp_code !== 200) continue;

            const rawProducts = rr?.result?.products?.product || [];
            console.log("[fetch-hot-products] Keyword '", kw, "' returned", rawProducts.length, "products");
            
            for (const p of rawProducts) {
              if (products.length >= desiredCount) break;
              const mapped = mapProduct(p);
              if (!mapped || seen.has(mapped.product_id)) continue;
              seen.add(mapped.product_id);
              products.push(mapped);
            }
          } catch (e) {
            console.error("[fetch-hot-products] Error with keyword:", kw, e);
          }
        }
      }
    }

    console.log("[fetch-hot-products] Returning", products.length, "products");
    
    const payload: ApiOk = { success: true, products, total: products.length };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-hot-products] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
