import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProductMeta = {
  title: string;
  price: number;
  image_url: string;
  orders_count: number;
  rating: number;
};

type ApiOk = { success: true; data: ProductMeta; cleanUrl: string; productId?: string; raw?: unknown };
type ApiErr = { success: false; error: string; code?: string; request_id?: string; trace_id?: string; raw?: unknown };

async function generateMd5Signature(params: Record<string, string>, appSecretRaw: string): Promise<string> {
  const appSecret = appSecretRaw.trim();
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
  const u = url.trim();
  if (!u) return u;
  if (!u.includes("a.aliexpress.com") && !u.includes("s.click.aliexpress.com")) return u;
  try {
    const resp = await fetch(u, { method: "HEAD", redirect: "follow" });
    return resp.url || u;
  } catch {
    return u;
  }
}

function parseProductId(url: string): string | undefined {
  const patterns = [
    /\/item\/(\d+)\.html/i,
    /\/(\d{10,})\.html/i,
    /productId[=:](\d+)/i,
    /product\/(\d+)/i,
    /item\/(\d+)/i,
    /\/(\d{10,})/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function cleanProductUrl(productId: string): string {
  return `https://www.aliexpress.com/item/${productId}.html`;
}

function normalizeMetaFromApi(raw: any): ProductMeta {
  const p = raw?.product || raw;

  const title = String(p?.product_title || p?.productTitle || p?.title || "AliExpress Product");
  const image_url =
    String(
      p?.product_main_image_url ||
        p?.productMainImageUrl ||
        p?.product_image_url ||
        p?.productImageUrl ||
        p?.main_image_url ||
        p?.image_url ||
        ""
    ) || "";

  const priceStr =
    p?.target_sale_price ||
    p?.targetSalePrice ||
    p?.target_original_price ||
    p?.targetOriginalPrice ||
    p?.sale_price ||
    p?.salePrice ||
    p?.original_price ||
    p?.originalPrice ||
    0;

  const price = typeof priceStr === "number" ? priceStr : parseFloat(String(priceStr)) || 0;

  // Use lastest_volume directly from AliExpress API for actual sales count
  const orders_count = parseInt(String(p?.lastest_volume || p?.lastestVolume || 0)) || 0;

  // Use evaluate_rate directly from AliExpress API for actual user rating (percentage)
  const ratingPercent = parseFloat(String(p?.evaluate_rate || p?.evaluateRate || 0)) || 0;
  const rating = (ratingPercent / 100) * 5; // Convert percentage to 5-star scale

  return { title, price, image_url, orders_count, rating };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[fetch-ali-product] Missing authorization header");
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
      console.error("[fetch-ali-product] Auth verification failed:", authError);
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const productUrl = String(body?.productUrl || "").trim();

    console.log("[fetch-ali-product] Input URL:", productUrl, "for user:", user.id);

    if (!productUrl) {
      const payload: ApiErr = { success: false, error: "Product URL is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use service role to fetch user's decrypted credentials via RPC
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: credentials, error: credentialsError } = await supabase
      .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

    if (credentialsError || credentials?.error) {
      console.error("[fetch-ali-product] Error fetching credentials:", credentialsError || credentials?.error);
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

    const expanded = await expandShortUrl(productUrl);
    console.log("[fetch-ali-product] Expanded URL:", expanded);
    
    const productId = parseProductId(expanded);
    console.log("[fetch-ali-product] Extracted productId:", productId);

    if (!productId) {
      const payload: ApiErr = { 
        success: false, 
        error: "Could not extract numeric product ID from URL", 
        raw: { input: productUrl, expanded } 
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cleanUrl = cleanProductUrl(productId);

    const params: Record<string, string> = {
      app_key: appKey,
      method: "aliexpress.affiliate.productdetail.get",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      product_ids: productId,
      target_language: "EN",
      target_currency: "USD",
    };

    console.log("[fetch-ali-product] API params for user:", user.id);

    const sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[fetch-ali-product] API response:", JSON.stringify(data).substring(0, 500));

    const err = data?.error_response;
    if (err?.msg || err?.code) {
      // Log details server-side for debugging
      console.error("[fetch-ali-product] AliExpress API Error:", {
        code: err?.code,
        request_id: err?.request_id,
        message: err?.msg,
      });
      
      // Return generic message to client (avoid exposing internal details)
      const payload: ApiErr = {
        success: false,
        error: "AliExpress API error - please verify your credentials",
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rr = data?.aliexpress_affiliate_productdetail_get_response?.resp_result;
    const products = rr?.result?.products;
    const product = Array.isArray(products) ? products[0] : products?.product?.[0] || products?.product;

    if (!rr || rr?.resp_code !== 200 || !product) {
      const payload: ApiErr = { 
        success: false, 
        error: "No product data returned from AliExpress"
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = normalizeMetaFromApi(product);
    const payload: ApiOk = { success: true, data: meta, cleanUrl, productId };

    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[fetch-ali-product] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
