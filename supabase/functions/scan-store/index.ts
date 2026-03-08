import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type StoreProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  sales_count: number;
  rating: number;
  product_url: string;
  commission_rate?: number;
};

type ApiOk = { success: true; products: StoreProduct[]; total: number; sellerId: string; hasMore: boolean };
type ApiErr = { success: false; error: string };

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

async function expandShortUrl(url: string): Promise<string> {
  if (/^https?:\/\/(a\.aliexpress|s\.click\.aliexpress)/.test(url)) {
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow" });
      const finalUrl = resp.url || url;
      if (finalUrl === url || finalUrl.includes("login")) {
        const html = await resp.text();
        const metaMatch = html.match(/url=["']?(https?:\/\/[^"'\s>]+)/i);
        if (metaMatch?.[1]) return metaMatch[1];
      }
      return finalUrl;
    } catch {
      return url;
    }
  }
  return url;
}

function extractSellerId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{5,}$/.test(trimmed)) return trimmed;
  const patterns = [
    /aliexpress\.com\/store\/(\d+)/i,
    /aliexpress\.com\/store\/group\/[^/]+\/(\d+)/i,
    /seller\/(\d+)/i,
    /owner_member_id[=:](\d+)/i,
    /shopId[=:](\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

/**
 * Fetch product IDs from the store using AliExpress public AJAX/JSON endpoints.
 * Tries multiple approaches: mobile API, AJAX endpoints, and HTML scraping.
 */
async function fetchStoreProductIds(sellerId: string, pageNo: number): Promise<string[]> {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.aliexpress.com/",
  };

  const allProductIds = new Set<string>();

  // Approach 1: Try the store AJAX search endpoint  
  const ajaxUrls = [
    `https://www.aliexpress.com/store/productGroupsAjax.htm?storeId=${sellerId}&SortType=bestmatch_sort&page=${pageNo}`,
    `https://m.aliexpress.com/store/${sellerId}?SortType=orders_desc`,
    `https://www.aliexpress.com/store/${sellerId}`,
  ];

  for (const url of ajaxUrls) {
    try {
      console.log("[scan-store] Fetching:", url);
      const resp = await fetch(url, { headers, redirect: "follow" });
      const contentType = resp.headers.get("content-type") || "";
      const body = await resp.text();

      // Try to parse JSON response
      if (contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
        try {
          const json = JSON.parse(body);
          // Extract product IDs from various JSON structures
          const extractFromObj = (obj: any) => {
            if (!obj || typeof obj !== "object") return;
            if (obj.productId) allProductIds.add(String(obj.productId));
            if (obj.product_id) allProductIds.add(String(obj.product_id));
            if (obj.itemId) allProductIds.add(String(obj.itemId));
            if (Array.isArray(obj)) obj.forEach(extractFromObj);
            else Object.values(obj).forEach((v) => { if (typeof v === "object") extractFromObj(v); });
          };
          extractFromObj(json);
        } catch { /* not JSON */ }
      }

      // Also extract from HTML/script tags
      const scriptPatterns = [
        /\/item\/(\d{8,15})\.html/g,
        /"productId"\s*:\s*"?(\d{8,15})"?/gi,
        /"product_id"\s*:\s*"?(\d{8,15})"?/gi,
        /"itemId"\s*:\s*"?(\d{8,15})"?/gi,
        /data-product-id="(\d{8,15})"/g,
        /data-item-id="(\d{8,15})"/g,
        /\/(\d{10,15})\.html/g,
      ];

      for (const pattern of scriptPatterns) {
        let match;
        while ((match = pattern.exec(body)) !== null) {
          if (match[1] && match[1].length >= 10 && match[1].length <= 15) {
            allProductIds.add(match[1]);
          }
        }
      }

      console.log(`[scan-store] Found ${allProductIds.size} product IDs from ${url}`);
      if (allProductIds.size > 0) break;
    } catch (e) {
      console.error("[scan-store] Fetch error for", url, e);
    }
  }

  // Approach 2: Try AliExpress global site with different store URL format
  if (allProductIds.size === 0) {
    try {
      const url = `https://www.aliexpress.com/store/all-wholesale-products/${sellerId}.html?SortType=orders_desc&page=${pageNo}`;
      console.log("[scan-store] Trying wholesale URL:", url);
      const resp = await fetch(url, { headers: { ...headers, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36" }, redirect: "follow" });
      const body = await resp.text();

      // Look for window.__INIT_DATA or similar JSON data embedded in scripts
      const dataPatterns = [
        /window\.__INIT_DATA\s*=\s*({.+?});\s*<\/script>/s,
        /window\.runParams\s*=\s*({.+?});\s*<\/script>/s,
        /"itemList"\s*:\s*\[([^\]]+)\]/g,
        /"productList"\s*:\s*\[([^\]]+)\]/g,
      ];

      for (const pattern of dataPatterns) {
        let match;
        while ((match = pattern.exec(body)) !== null) {
          const chunk = match[1] || match[0];
          const idPattern = /"(?:productId|product_id|itemId)"\s*:\s*"?(\d{10,15})"?/g;
          let idMatch;
          while ((idMatch = idPattern.exec(chunk)) !== null) {
            allProductIds.add(idMatch[1]);
          }
        }
      }

      // Fallback: any product URL pattern
      const urlPattern = /\/item\/(\d{10,15})\.html/g;
      let match;
      while ((match = urlPattern.exec(body)) !== null) {
        allProductIds.add(match[1]);
      }

      console.log(`[scan-store] Found ${allProductIds.size} product IDs from wholesale URL`);
    } catch (e) {
      console.error("[scan-store] Wholesale URL error:", e);
    }
  }

  return Array.from(allProductIds);
}

function mapProductDetail(p: any): StoreProduct | null {
  const productId = String(p.product_id || "").trim();
  const title = String(p.product_title || "").trim();
  const imageUrl = String(p.product_main_image_url || "").trim();

  const price = parseFloat(p.target_sale_price || p.target_original_price || p.app_sale_price || p.original_price || "0") || 0;
  const originalPrice = parseFloat(p.target_original_price || p.original_price || "0") || price;
  const salesCount = parseInt(p.lastest_volume || p.volume || "0") || 0;
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
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const storeUrl = String(body?.storeUrl || "").trim();
    const pageNo = Math.max(parseInt(body?.pageNo) || 1, 1);

    if (!storeUrl) {
      const payload: ApiErr = { success: false, error: "Store URL is required" };
      return new Response(JSON.stringify(payload), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expandedUrl = await expandShortUrl(storeUrl);
    console.log("[scan-store] Expanded URL:", expandedUrl);

    let sellerId = extractSellerId(expandedUrl);

    if (!sellerId && expandedUrl.includes("aliexpress.com")) {
      try {
        const pageResp = await fetch(expandedUrl, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        });
        const html = await pageResp.text();
        const storePatterns = [
          /storeNum[=:]["']?(\d+)/i,
          /store\/(\d+)/i,
          /sellerId[=:]["']?(\d+)/i,
          /owner_member_id[=:]["']?(\d+)/i,
          /shopId[=:]["']?(\d+)/i,
        ];
        for (const p of storePatterns) {
          const m = html.match(p);
          if (m?.[1]) { sellerId = m[1]; break; }
        }
      } catch (e) {
        console.error("[scan-store] Failed to fetch page for store ID:", e);
      }
    }

    if (!sellerId) {
      const payload: ApiErr = { success: false, error: "לא הצלחנו לזהות מזהה חנות מהקישור. השתמש בקישור ישיר לחנות כמו: aliexpress.com/store/123456" };
      return new Response(JSON.stringify(payload), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credentials, error: credentialsError } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

    if (credentialsError || credentials?.error) {
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

    console.log("[scan-store] User:", user.id, "| sellerId:", sellerId, "| page:", pageNo);

    // Step 1: Fetch product IDs from store page
    const productIds = await fetchStoreProductIds(sellerId, pageNo);

    if (productIds.length === 0) {
      // Fallback: use product.query API (returns general products, not store-specific)
      // but at least provide something. Mark this clearly.
      console.log("[scan-store] No IDs scraped, falling back to product.query with store name search");
      
      const payload: ApiErr = { 
        success: false, 
        error: "לא הצלחנו למשוך מוצרים מהחנות הזו. אליאקספרס חוסמת סריקה ישירה של חנויות.\n\nנסה במקום זאת:\n• העתק קישורים של מוצרים ספציפיים מהחנות\n• השתמש בחיפוש חופשי כדי למצוא מוצרים דומים\n• השתמש ב-Discovery כדי למצוא מוצרים פופולריים" 
      };
      return new Response(JSON.stringify(payload), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[scan-store] Found", productIds.length, "product IDs from store page");

    // Step 2: Fetch product details via affiliate API in batches of 20
    const BATCH_SIZE = 20;
    const products: StoreProduct[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE);
      const batchIds = batch.join(",");

      const params: Record<string, string> = {
        app_key: appKey,
        method: "aliexpress.affiliate.productdetail.get",
        timestamp: Date.now().toString(),
        v: "2.0",
        sign_method: "md5",
        tracking_id: trackingId,
        target_language: "EN",
        target_currency: "ILS",
        ship_to_country: "IL",
        product_ids: batchIds,
      };

      const sign = await generateMd5Signature(params, appSecret);
      const qs = Object.entries({ ...params, sign })
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");

      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

      try {
        const resp = await fetch(apiUrl, { method: "GET" });
        const data = await resp.json().catch(() => ({}));

        const rr = data?.aliexpress_affiliate_productdetail_get_response?.resp_result;
        if (rr?.resp_code === 200) {
          const rawProducts = rr?.result?.products?.product || [];
          for (const p of rawProducts) {
            const mapped = mapProductDetail(p);
            if (!mapped || seen.has(mapped.product_id)) continue;
            seen.add(mapped.product_id);
            products.push(mapped);
          }
        } else {
          console.error("[scan-store] Batch API error:", JSON.stringify(rr));
        }
      } catch (e) {
        console.error("[scan-store] Batch fetch error:", e);
      }
    }

    console.log("[scan-store] Got", products.length, "valid products from", productIds.length, "scraped IDs");

    const payload: ApiOk = {
      success: true,
      products,
      total: products.length,
      sellerId,
      hasMore: false,
    };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: unknown) {
    console.error("[scan-store] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Failed to scan store" };
    return new Response(JSON.stringify(payload), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
