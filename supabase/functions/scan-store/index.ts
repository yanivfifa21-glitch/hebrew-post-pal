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

/**
 * Expand short AliExpress URLs (a.aliexpress.com, s.click.aliexpress.com)
 */
async function expandShortUrl(url: string): Promise<string> {
  if (/^https?:\/\/(a\.aliexpress|s\.click\.aliexpress)/.test(url)) {
    try {
      const resp = await fetch(url, { method: "GET", redirect: "follow" });
      const finalUrl = resp.url || url;
      // Also check for meta refresh in the HTML
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

/**
 * Extract seller/store ID from various AliExpress store URL formats:
 * - https://www.aliexpress.com/store/1234567
 * - https://www.aliexpress.com/store/1234567?...
 * - https://he.aliexpress.com/store/1102345678
 * - https://www.aliexpress.com/store/group/..../1234567_...
 * - Direct numeric ID
 */
function extractSellerId(input: string): string | null {
  const trimmed = input.trim();

  // Direct numeric ID
  if (/^\d{5,}$/.test(trimmed)) return trimmed;

  // Store URL patterns
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

function mapProduct(p: any): StoreProduct | null {
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

    // Expand short URLs first (a.aliexpress.com, s.click.aliexpress.com)
    const expandedUrl = await expandShortUrl(storeUrl);
    console.log("[scan-store] Expanded URL:", expandedUrl);

    let sellerId = extractSellerId(expandedUrl);
    
    // If still no seller ID, try to fetch the page and look for store ID in HTML
    if (!sellerId && expandedUrl.includes("aliexpress.com")) {
      try {
        const pageResp = await fetch(expandedUrl, {
          method: "GET",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });
        const html = await pageResp.text();
        // Look for store/seller ID in page HTML
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

    // Use product.query with seller_ids filter to get store products
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
      page_no: pageNo.toString(),
      page_size: "50",
      sort: "LAST_VOLUME_DESC",
    };

    // Try with seller_ids parameter (works for affiliate product.query)
    params.seller_ids = sellerId;

    const sign = await generateMd5Signature(params, appSecret);
    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;
    console.log("[scan-store] Calling API for seller:", sellerId);

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    const rr = data?.aliexpress_affiliate_product_query_response?.resp_result;
    if (rr?.resp_code !== 200) {
      console.error("[scan-store] API error:", JSON.stringify(rr || data));
      const payload: ApiErr = { success: false, error: `API error: ${rr?.resp_msg || "Unknown error"}` };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawProducts = rr?.result?.products?.product || [];
    const totalResults = parseInt(rr?.result?.total_record_count || "0");
    console.log("[scan-store] Got", rawProducts.length, "products, total:", totalResults);

    const products: StoreProduct[] = [];
    const seen = new Set<string>();

    for (const p of rawProducts) {
      const mapped = mapProduct(p);
      if (!mapped || seen.has(mapped.product_id)) continue;
      seen.add(mapped.product_id);
      products.push(mapped);
    }

    const hasMore = pageNo * 50 < totalResults;

    const payload: ApiOk = { success: true, products, total: totalResults, sellerId, hasMore };
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
