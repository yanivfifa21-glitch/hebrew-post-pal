import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category fallback keywords for better results
const CATEGORY_FALLBACK_KEYWORDS: Record<string, string[]> = {
  // Electronics & mobile
  "509": ["phone case", "phone holder", "charger", "cable", "screen protector"],
  // Smart home & home
  "15": ["led lights", "kitchen gadgets", "home decor", "storage", "organizer"],
  // Beauty, health
  "66": ["skincare", "makeup", "beauty tools", "hair accessories", "nail art"],
  // Sports
  "200000297": ["yoga", "fitness", "gym", "running", "outdoor"],
  // Automotive
  "34": ["car holder", "car charger", "car organizer", "car accessories"],
  // Viral gadgets
  "200003482": ["gadgets", "cool gadgets", "useful tools", "mini"],
  // Computers / office
  "7": ["mouse", "keyboard", "laptop stand", "usb hub", "webcam"],
  // Audio / wearables
  "44": ["earbuds", "headphones", "bluetooth speaker", "smartwatch"],
};

// Keep delivery constraint reasonable
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
    const keywords = String(body?.keywords || "").trim();
    const page = parseInt(body?.page) || 1;
    const pageSize = Math.min(parseInt(body?.pageSize) || 20, 50);
    // Sort by volume (sales) to get hottest products
    const sort = String(body?.sort || "VOLUME_DESC").trim();

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
    const trackingId = settings?.aliexpress_tracking_id?.trim() || "TELEGRAM";

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "Please configure your AliExpress API credentials in Settings" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[fetch-hot-products] User:", user.id, "| category:", category, "| keywords:", keywords, "| requested pageSize:", pageSize);

    const desiredCount = Math.min(pageSize || 20, 50);

    // API call helper
    const callAliProductQuery = async (categoryId: string, pageNo: number, perPage: number, searchKeywords?: string) => {
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
        page_no: String(pageNo),
        page_size: String(perPage),
        sort,
      };

      // Add category if provided
      if (categoryId) {
        params.category_ids = categoryId;
      }

      // Add keywords (user typed or fallback)
      if (searchKeywords || keywords) {
        params.keywords = searchKeywords || keywords;
      }

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] Calling API with category:", categoryId, "keywords:", searchKeywords || keywords || "(none)");
      
      const resp = await fetch(apiUrl, { method: "GET" });
      const data = await resp.json().catch(() => ({}));
      return { resp, data };
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

      // Avoid broken cards - require at least ID, title, and image
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

    const collectTopForCategory = async (categoryId: string, fallbackKeywordsList?: string[]) => {
      const collected: HotProduct[] = [];
      const seen = new Set<string>();
      const perPage = 50;
      const maxPages = 3;

      // First try: without keywords (pure category browsing)
      for (let pageNo = 1; pageNo <= maxPages && collected.length < desiredCount; pageNo++) {
        try {
          const { data } = await callAliProductQuery(categoryId, pageNo, perPage);

          const err = data?.error_response;
          if (err?.msg || err?.code) {
            console.error("[fetch-hot-products] API Error:", err);
            break;
          }

          const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
          if (!rr) break;
          if (rr?.resp_code === 405) break; // No more pages
          if (rr?.resp_code !== 200) {
            console.error("[fetch-hot-products] API resp_code error:", rr?.resp_code, rr?.resp_msg);
            break;
          }

          const rawProducts = rr?.result?.products?.product || [];
          console.log("[fetch-hot-products] Page", pageNo, "returned", rawProducts.length, "products");
          
          for (const p of rawProducts) {
            const mapped = mapProduct(p);
            if (!mapped) continue;
            if (seen.has(mapped.product_id)) continue;
            seen.add(mapped.product_id);
            collected.push(mapped);
          }
        } catch (e) {
          console.error("[fetch-hot-products] Error fetching page:", e);
          break;
        }
      }

      // If we don't have enough products, try with fallback keywords
      if (collected.length < desiredCount && fallbackKeywordsList && fallbackKeywordsList.length > 0) {
        console.log("[fetch-hot-products] Not enough products (", collected.length, "), trying fallback keywords");
        
        for (const fallbackKw of fallbackKeywordsList) {
          if (collected.length >= desiredCount) break;
          
          try {
            const { data } = await callAliProductQuery(categoryId, 1, perPage, fallbackKw);
            
            const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
            if (!rr || rr?.resp_code !== 200) continue;

            const rawProducts = rr?.result?.products?.product || [];
            console.log("[fetch-hot-products] Fallback keyword '", fallbackKw, "' returned", rawProducts.length, "products");
            
            for (const p of rawProducts) {
              if (collected.length >= desiredCount) break;
              const mapped = mapProduct(p);
              if (!mapped) continue;
              if (seen.has(mapped.product_id)) continue;
              seen.add(mapped.product_id);
              collected.push(mapped);
            }
          } catch (e) {
            console.error("[fetch-hot-products] Error with fallback keyword:", fallbackKw, e);
          }
        }
      }

      // Sort by sales and return
      return collected
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, desiredCount);
    };

    let products: HotProduct[] = [];

    // If category is empty ("הכל"), take the top sellers across our hot categories list
    if (!category) {
      const categoryOrder = ["509", "15", "66", "200000297", "34", "200003482", "7", "44"];
      const seen = new Set<string>();
      
      // Collect from each category with its fallback keywords
      for (const catId of categoryOrder) {
        if (products.length >= desiredCount) break;
        
        const fallbackKws = CATEGORY_FALLBACK_KEYWORDS[catId] || [];
        const chunk = await collectTopForCategory(catId, fallbackKws);
        
        for (const p of chunk) {
          if (products.length >= desiredCount) break;
          if (!seen.has(p.product_id)) {
            seen.add(p.product_id);
            products.push(p);
          }
        }
      }

      // Final sort by sales
      products = products
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, desiredCount);
    } else {
      // Specific category selected
      const fallbackKws = CATEGORY_FALLBACK_KEYWORDS[category] || [];
      products = await collectTopForCategory(category, fallbackKws);
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
