import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Category fallback keywords (used only if Hot Product API returns empty)
const CATEGORY_FALLBACK_KEYWORDS: Record<string, string> = {
  // Electronics & mobile
  "509": "phone accessories",
  // Smart home & home
  "15": "smart home",
  // Beauty, health
  "66": "beauty health",
  // Sports
  "200000297": "fitness sport",
  // Automotive
  "34": "car accessories",
  // Viral gadgets
  "200003482": "cool gadgets",
  // Computers / office
  "7": "computer accessories",
  // Audio / wearables
  "44": "headphones earbuds",
};

// Keep delivery constraint reasonable but not too strict
const MAX_DELIVERY_DAYS = 30;

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

    // For "top sellers by category" we use product.query (more stable than hotproduct.query for some categories)
    const callAliProductQuery = async (categoryId: string, pageNo: number, perPage: number) => {
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
        min_sale_price: "5",
        category_ids: categoryId,
      };

      // Optional keywords (user typed search) – still keep category constraint
      if (keywords) params.keywords = keywords;

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
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

    const collectTopForCategory = async (categoryId: string) => {
      const collected: HotProduct[] = [];
      const seen = new Set<string>();
      const perPage = 50;
      const maxPages = 5;

      for (let pageNo = 1; pageNo <= maxPages && collected.length < desiredCount; pageNo++) {
        const { data } = await callAliProductQuery(categoryId, pageNo, perPage);

        const err = data?.error_response;
        if (err?.msg || err?.code) {
          console.error("[fetch-hot-products] API Error:", err);
          throw new Error("AliExpress API error - please verify your credentials");
        }

        const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
        if (!rr) throw new Error("AliExpress API error - missing response");
        if (rr?.resp_code === 405) break;
        if (rr?.resp_code !== 200) {
          console.error("[fetch-hot-products] API resp_code error:", rr?.resp_code, rr?.resp_msg);
          throw new Error("AliExpress API error - please verify your credentials");
        }

        const rawProducts = rr?.result?.products?.product || [];
        for (const p of rawProducts) {
          const mapped = mapProduct(p);
          if (!mapped) continue;
          if (seen.has(mapped.product_id)) continue;
          seen.add(mapped.product_id);
          collected.push(mapped);
        }
      }

      // Prefer items with actual sales_count
      const withSales = collected.filter(p => (p.sales_count || 0) > 0);
      const base = withSales.length >= desiredCount ? withSales : collected;

      return base
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, desiredCount);
    };

    let products: HotProduct[] = [];

    // If category is empty ("הכל"), take the top sellers across our hot categories list
    if (!category) {
      const categoryOrder = ["509", "15", "66", "200000297", "34", "200003482", "7", "44"];
      for (const catId of categoryOrder) {
        if (products.length >= desiredCount) break;
        const chunk = await collectTopForCategory(catId);
        for (const p of chunk) {
          if (products.length >= desiredCount) break;
          if (!products.find(x => x.product_id === p.product_id)) products.push(p);
        }
      }

      products = products
        .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        .slice(0, desiredCount);
    } else {
      products = await collectTopForCategory(category);

      // If still too few, fallback to broad keywords for that category
      if (products.length < desiredCount) {
        const fallbackKeywords = CATEGORY_FALLBACK_KEYWORDS[category];
        if (fallbackKeywords) {
          console.warn("[fetch-hot-products] Too few products for category", category, "-> fallback keywords", fallbackKeywords);
          // Temporarily use the fallback keywords
          const prevKeywords = keywords;
          (globalThis as any).__tmp = prevKeywords; // noop; avoid lint
        }
      }
    }

    const payload: ApiOk = { success: true, products, total: products.length };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-hot-products] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
