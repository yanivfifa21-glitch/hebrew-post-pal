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

// AD CENTER + Incentive product sources
type ProductSource = "hot" | "hot_deals" | "high_commission" | "featured" | "campaigns" | "search" | "smart_match" | "incentive";

const ALL_CATEGORY_IDS = ["509", "15", "66", "200000297", "34", "200003482", "7", "44"];

const MAX_DELIVERY_DAYS = 45;
// ========== WINNING PRODUCT QUALITY THRESHOLDS ==========
const MIN_PRICE_USD = "5";             // Price floor: avoid $1 junk items
const MIN_SALES_COUNT_HOT = 10;        // Low threshold - API already curates hot products
const MIN_RATING_HOT = 3.5;            // Rating threshold: 3.5+ stars (lenient - let client filter)
const MIN_SALES_COUNT_PROMO = 10;      // Lower threshold for promo products
const MIN_COMMISSION_HIGH = 8;         // 8% minimum for high commission filter
const MIN_COMMISSION_RATE = "0.01";    // Minimum commission rate for API

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
  source?: string;
};

type ApiOk = { success: true; products: HotProduct[]; total: number; campaigns?: CampaignInfo[] };
type ApiErr = { success: false; error: string; code?: string };

type CampaignInfo = {
  promo_name: string;
  promo_desc?: string;
  landing_page_url?: string;
  banner_url?: string;
};

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
    // Product source selector (AD CENTER / Incentive)
    const source: ProductSource = body?.source || "hot";
    // For smart_match, optional product IDs
    const matchProductIds = String(body?.matchProductIds || "").trim();
    // For campaign_products: specific campaign name to fetch products for
    const campaignName = String(body?.campaignName || "").trim();
    const campaignDbId = String(body?.campaignId || "").trim();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credentials, error: credentialsError } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

    if (credentialsError || credentials?.error) {
      console.error("[fetch-hot-products] Error fetching credentials:", credentialsError || credentials?.error);
      const payload: ApiErr = { success: false, error: "Failed to fetch user credentials" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

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

    console.log("[fetch-hot-products] User:", user.id, "| source:", source, "| category:", category || "ALL", "| pageNo:", pageNo);

    const desiredCount = pageSize;

    // ============================================
    // HOT PRODUCTS API - "Winning Products" Query
    // Uses hotproduct.query with quality filters
    // ============================================
    const callHotProductQuery = async (categoryId?: string, keywords?: string, pageNo: number = 1, sortBy: string = "LAST_VOLUME_DESC") => {
      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.hotproduct.query",
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
        tracking_id: trackingId,
        target_language: "EN",
        target_currency: "ILS",
        ship_to_country: "IL",                    // Target market: Israel
        delivery_days: MAX_DELIVERY_DAYS.toString(),
        page_no: pageNo.toString(),
        page_size: "50",
        sort: sortBy,                             // VOLUME_DESC for best sellers
        min_sale_price: MIN_PRICE_USD,            // Price floor: $10+ (avoid junk)
      };

      if (categoryId) params.category_ids = categoryId;
      if (keywords) params.keywords = keywords;

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] HOT API - category:", categoryId || "all", "| sort:", sortBy, "| minPrice:", MIN_PRICE_USD, "| page:", pageNo);
      
      const resp = await fetch(apiUrl, { method: "GET" });
      return await resp.json().catch(() => ({}));
    };

    // ============================================
    // FEATURED PROMO PRODUCTS API - Higher quality!
    // aliexpress.affiliate.featuredpromo.products.get
    // ============================================
    const callFeaturedPromoProducts = async (promoType?: string, pageNo: number = 1) => {
      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.featuredpromo.products.get",
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
        tracking_id: trackingId,
        target_language: "EN",
        target_currency: "ILS",
        ship_to_country: "IL",
        page_no: pageNo.toString(),
        page_size: "50",
      };

      // promo_type_name: "HOT DEALS" | "HIGHER COMMISSION" | etc.
      if (promoType) {
        params.promotion_name = promoType;
      }

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] FEATURED PROMO API - type:", promoType || "all", "| page:", pageNo);
      
      const resp = await fetch(apiUrl, { method: "GET" });
      return await resp.json().catch(() => ({}));
    };

    // ============================================
    // GET AVAILABLE PROMOTIONS - for campaigns
    // aliexpress.affiliate.featuredpromo.get
    // ============================================
    const callGetPromotions = async () => {
      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.featuredpromo.get",
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
      };

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] GET PROMOTIONS API");
      
      const resp = await fetch(apiUrl, { method: "GET" });
      return await resp.json().catch(() => ({}));
    };

    // ============================================
    // PRODUCT QUERY API (fallback + search) - With Quality Filters
    // ============================================
    const callProductQuery = async (keywords: string, categoryId?: string, sort: string = "VOLUME_DESC") => {
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
        page_no: pageNo.toString(),
        page_size: "50",
        sort: sort,
        keywords: keywords,
        min_sale_price: MIN_PRICE_USD,
      };

      if (categoryId) params.category_ids = categoryId;

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] PRODUCT QUERY - keywords:", keywords, "| sort:", sort);
      
      const resp = await fetch(apiUrl, { method: "GET" });
      return await resp.json().catch(() => ({}));
    };

    // ============================================
    // SMART MATCH API - AI-powered recommendations
    // aliexpress.affiliate.product.smartmatch
    // ============================================
    const callSmartMatch = async (productIds?: string, keywords?: string) => {
      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.product.smartmatch",
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
        tracking_id: trackingId,
        target_language: "EN",
        target_currency: "ILS",
        ship_to_country: "IL",
        page_no: pageNo.toString(),
        page_size: "50",
      };

      if (productIds) params.product_id = productIds;
      if (keywords) params.keywords = keywords;
      if (category) params.category_ids = category;

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
      console.log("[fetch-hot-products] SMART MATCH API - productIds:", productIds || "none", "| keywords:", keywords || "none");
      
      const resp = await fetch(apiUrl, { method: "GET" });
      return await resp.json().catch(() => ({}));
    };

    const mapProduct = (p: any, sourceLabel?: string): HotProduct | null => {
      const productId = String(p.product_id || "").trim();
      const title = String(p.product_title || "").trim();
      const imageUrl = String(p.product_main_image_url || p.product_main_image || "").trim();

      const price = parseFloat(p.target_sale_price || p.target_original_price || p.app_sale_price || p.original_price || "0") || 0;
      const originalPrice = parseFloat(p.target_original_price || p.original_price || "0") || price;

      const salesCount = parseInt(p.lastest_volume || p.volume || p.total_sold || "0") || 0;
      const ratingPercent = parseFloat(p.evaluate_rate || "0") || 0;
      const ratingStars = (ratingPercent / 100) * 5;
      
      const commissionRate = parseFloat(p.commission_rate || "0") || 0;

      const productUrl = `https://www.aliexpress.com/item/${productId}.html`;

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
        source: sourceLabel,
      };
    };

    const seen = new Set<string>();
    const products: HotProduct[] = [];
    let extraCampaigns: CampaignInfo[] | undefined;
    // ============================================
    // FETCH BASED ON SOURCE TYPE
    // ============================================
    
    if (source === "hot_deals" || source === "high_commission" || source === "featured") {
      // For hot_deals and high_commission, use the campaigns approach
      // The Featured Promo API with type names doesn't work reliably
      // Instead, fetch from the available promotions list
      const promoData = await callGetPromotions();
      const promos = promoData?.aliexpress_affiliate_featuredpromo_get_response?.resp_result?.result?.promos?.promo || [];
      console.log("[fetch-hot-products] Available promotions for", source, ":", promos.length);
      
      // For hot_deals, try to find promos with "deal" or "hot" in the name
      // For high_commission, try to find promos with "commission" in the name
      // For featured, just use the first available promo
      let targetPromos = promos;
      if (source === "hot_deals") {
        const filtered = promos.filter((p: any) => {
          const name = (p.promo_name || "").toLowerCase();
          return name.includes("deal") || name.includes("hot") || name.includes("sale");
        });
        targetPromos = filtered.length > 0 ? filtered : promos.slice(0, 2);
      } else if (source === "high_commission") {
        const filtered = promos.filter((p: any) => {
          const name = (p.promo_name || "").toLowerCase();
          return name.includes("commission");
        });
        targetPromos = filtered.length > 0 ? filtered : promos.slice(0, 2);
      }
      
      // Fetch products from target promotions
      for (const promo of targetPromos.slice(0, 3)) {
        if (products.length >= desiredCount) break;
        const promoName = promo.promo_name || "";
        const data = await callFeaturedPromoProducts(promoName, pageNo);
        
        const rr = data?.aliexpress_affiliate_featuredpromo_products_get_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          console.log("[fetch-hot-products] Featured promo", promoName, "returned", rawProducts.length, "products");
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p, source);
            if (!mapped || seen.has(mapped.product_id)) continue;
            // For high_commission, prioritize by commission rate
            if (source === "high_commission" && (mapped.commission_rate || 0) < 5) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      }
    } else if (source === "campaigns" || source === "incentive") {
      // Campaigns + Incentive: get all available promotions and their products
      const promoData = await callGetPromotions();
      const promos = promoData?.aliexpress_affiliate_featuredpromo_get_response?.resp_result?.result?.promos?.promo || [];
      console.log("[fetch-hot-products] Available promotions:", promos.length);
      
      // For incentive, filter for incentive-type campaigns
      let targetPromos = promos;
      if (source === "incentive") {
        const filtered = promos.filter((p: any) => {
          const name = (p.promo_name || "").toLowerCase();
          return name.includes("incentive") || name.includes("bonus") || name.includes("reward");
        });
        targetPromos = filtered.length > 0 ? filtered : promos.slice(0, 3);
      }
      
      // Collect campaign info with banners
      const campaignInfos: CampaignInfo[] = targetPromos.map((p: any) => ({
        promo_name: p.promo_name || "",
        promo_desc: p.promo_desc || "",
        landing_page_url: p.landing_page_url || "",
        banner_url: p.banner_url || "",
      }));
      
      // Fetch products from target promotions
      for (const promo of targetPromos.slice(0, 5)) {
        if (products.length >= desiredCount) break;
        const promoName = promo.promo_name || "";
        const data = await callFeaturedPromoProducts(promoName, pageNo);
        
        const rr = data?.aliexpress_affiliate_featuredpromo_products_get_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p, `campaign:${promoName}`);
            if (!mapped || seen.has(mapped.product_id)) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      }
      
      // Include campaign info in response
      extraCampaigns = campaignInfos;
    } else if (source === "search") {
      // Ad Center Search: use product.query with different sort options
      const searchKw = userKeywords || "bestseller";
      const sortOptions = ["VOLUME_DESC", "SALE_PRICE_ASC", "LAST_VOLUME_DESC"];
      
      // Try multiple sort strategies for variety
      for (const sort of sortOptions) {
        if (products.length >= desiredCount) break;
        const data = await callProductQuery(searchKw, category || undefined, sort);
        const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          console.log("[fetch-hot-products] Search sort:", sort, "returned", rawProducts.length, "products");
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p, "search");
            if (!mapped || seen.has(mapped.product_id)) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      }
    } else if (source === "smart_match") {
      // Smart Match: AI-powered recommendations
      const data = await callSmartMatch(matchProductIds || undefined, userKeywords || undefined);
      
      // Try multiple response keys (API documentation varies)
      const rr = data?.aliexpress_affiliate_product_smartmatch_response?.resp_result 
        || data?.aliexpress_affiliate_product_smartmatch_response;
      
      if (rr?.resp_code === 200 || rr?.result) {
        const rawProducts = rr?.result?.products?.product || [];
        console.log("[fetch-hot-products] Smart Match returned", rawProducts.length, "products");
        for (const p of rawProducts) {
          if (products.length >= desiredCount) break;
          const mapped = mapProduct(p, "smart_match");
          if (!mapped || seen.has(mapped.product_id)) continue;
          seen.add(mapped.product_id);
          products.push(mapped);
        }
      } else {
        console.warn("[fetch-hot-products] Smart Match failed, falling back to hot products");
        // Fallback to hot products
        const fallbackData = await callHotProductQuery(category || undefined, userKeywords || undefined, pageNo);
        const fallbackRr = fallbackData?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
        if (fallbackRr?.resp_code === 200) {
          const rawProducts = fallbackRr?.result?.products?.product || [];
          for (const p of rawProducts) {
            if (products.length >= desiredCount) break;
            const mapped = mapProduct(p, "smart_match");
            if (!mapped || seen.has(mapped.product_id)) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        }
      }
    } else {
      // Default: HOT products
      if (userKeywords) {
        const data = await callHotProductQuery(category || undefined, userKeywords, pageNo);
        
        const err = data?.error_response;
        if (err?.msg || err?.code) {
          console.warn("[fetch-hot-products] Hot API Error:", err);
          const fallbackData = await callProductQuery(userKeywords, category || undefined, "LAST_VOLUME_DESC");
          const rr = fallbackData?.aliexpress_affiliate_product_query_response?.resp_result;
          if (rr?.resp_code === 200) {
            const rawProducts = rr?.result?.products?.product || [];
            for (const p of rawProducts) {
              if (products.length >= desiredCount) break;
              const mapped = mapProduct(p, "search");
              if (!mapped || seen.has(mapped.product_id)) continue;
              if (mapped.sales_count < MIN_SALES_COUNT_HOT) continue;
              if (mapped.rating < MIN_RATING_HOT) continue;
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
              const mapped = mapProduct(p, "hot");
              if (!mapped || seen.has(mapped.product_id)) continue;
              if (mapped.sales_count < MIN_SALES_COUNT_HOT) continue;
              if (mapped.rating < MIN_RATING_HOT) continue;
              seen.add(mapped.product_id);
              products.push(mapped);
            }
          }
        }
      } else {
        if (category) {
          const data = await callHotProductQuery(category, undefined, pageNo);
          const err = data?.error_response;
          if (!err?.msg && !err?.code) {
            const rr = data?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
            if (rr?.resp_code === 200) {
              const rawProducts = rr?.result?.products?.product || [];
              for (const p of rawProducts) {
                if (products.length >= desiredCount) break;
                const mapped = mapProduct(p, "hot");
                if (!mapped || seen.has(mapped.product_id)) continue;
                if (mapped.sales_count < MIN_SALES_COUNT_HOT) continue;
                if (mapped.rating < MIN_RATING_HOT) continue;
                seen.add(mapped.product_id);
                products.push(mapped);
              }
            }
          }
        } else {
          const categoriesToFetch = [...ALL_CATEGORY_IDS].sort(() => Math.random() - 0.5);
          const promises = categoriesToFetch.map(catId => 
            callHotProductQuery(catId, undefined, pageNo).catch(() => ({}))
          );
          const results = await Promise.all(promises);
          
          for (let i = 0; i < results.length; i++) {
            const data = results[i];
            const err = (data as any)?.error_response;
            if (err?.msg || err?.code) continue;
            
            const rr = (data as any)?.aliexpress_affiliate_hotproduct_query_response?.resp_result;
            if (rr?.resp_code !== 200) continue;
            
            const rawProducts = rr?.result?.products?.product || [];
            for (const p of rawProducts) {
              const mapped = mapProduct(p, "hot");
              if (!mapped || seen.has(mapped.product_id)) continue;
              if (mapped.sales_count < MIN_SALES_COUNT_HOT) continue;
              if (mapped.rating < MIN_RATING_HOT) continue;
              seen.add(mapped.product_id);
              products.push(mapped);
            }
          }
        }
      }
    }

    // Sort by sales for hot/search, by commission for high_commission
    if (source === "high_commission") {
      products.sort((a, b) => (b.commission_rate || 0) - (a.commission_rate || 0));
    } else {
      products.sort((a, b) => b.sales_count - a.sales_count);
    }

    console.log("[fetch-hot-products] Returning", products.length, "products from source:", source);

    // ============================================
    // CACHE: Save campaigns and products to DB
    // ============================================
    try {
      // Cache campaigns if any
      if (extraCampaigns && extraCampaigns.length > 0) {
        for (const camp of extraCampaigns) {
          await supabase.from("affiliate_campaigns").upsert({
            user_id: user.id,
            campaign_name: camp.promo_name,
            promo_desc: camp.promo_desc || null,
            landing_page_url: camp.landing_page_url || null,
            banner_url: camp.banner_url || null,
            source: source,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,campaign_name", ignoreDuplicates: false }).select();
        }
      }

      // Cache products
      if (products.length > 0) {
        // Get campaign IDs for linking
        const { data: campaignRows } = await supabase
          .from("affiliate_campaigns")
          .select("id, campaign_name")
          .eq("user_id", user.id);
        const campaignMap = new Map((campaignRows || []).map((c: any) => [c.campaign_name, c.id]));

        const productRows = products.map((p) => {
          // Extract campaign name from source label like "campaign:PromoName"
          const campName = p.source?.startsWith("campaign:") ? p.source.replace("campaign:", "") : null;
          return {
            user_id: user.id,
            product_id: p.product_id,
            title: p.title,
            image_url: p.image_url,
            price: p.price,
            original_price: p.original_price,
            product_url: p.product_url,
            source: source,
            campaign_id: campName ? (campaignMap.get(campName) || null) : null,
            sales_count: p.sales_count,
            rating: p.rating,
            commission_rate: p.commission_rate || 0,
            fetched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        });

        // Upsert in batches of 50
        for (let i = 0; i < productRows.length; i += 50) {
          const batch = productRows.slice(i, i + 50);
          await supabase.from("ad_center_products").upsert(batch, {
            onConflict: "user_id,product_id,source",
            ignoreDuplicates: false,
          });
        }
        console.log("[fetch-hot-products] Cached", productRows.length, "products to ad_center_products");
      }
    } catch (cacheErr) {
      // Don't fail the request if caching fails
      console.warn("[fetch-hot-products] Cache error (non-fatal):", cacheErr);
    }
    
    const payload: ApiOk = { success: true, products, total: products.length, campaigns: extraCampaigns };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-hot-products] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
