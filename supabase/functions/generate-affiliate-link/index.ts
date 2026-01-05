import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; affiliateLink: string; originalUrl: string; cleanUrl: string; productId: string };
type ApiErr = {
  success: false;
  error: string;
  code?: string;
  request_id?: string;
  trace_id?: string;
  raw?: unknown;
};

async function generateMd5Signature(params: Record<string, string>, appSecretRaw: string): Promise<string> {
  const appSecret = appSecretRaw.trim();
  const sortedKeys = Object.keys(params).sort();

  let signStr = appSecret;
  for (const key of sortedKeys) {
    signStr += key + params[key];
  }
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[generate-affiliate-link] Missing authorization header");
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
      console.error("[generate-affiliate-link] Auth verification failed:", authError);
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const productUrl = String(body?.productUrl || "").trim();
    const userId = String(body?.userId || "").trim();

    console.log("[generate-affiliate-link] Input URL:", productUrl, "userId:", userId);

    if (!productUrl) {
      const payload: ApiErr = { success: false, error: "Product URL is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SECURITY: Verify the userId matches the authenticated user
    if (userId && userId !== user.id) {
      console.error("[generate-affiliate-link] User ID mismatch - potential attack");
      const payload: ApiErr = { success: false, error: "Forbidden: Cannot access other users' data" };
      return new Response(JSON.stringify(payload), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Use service role to fetch settings (after security verification)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch user's credentials from app_settings using verified user.id
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("aliexpress_app_key, aliexpress_app_secret, aliexpress_tracking_id")
      .eq("user_id", user.id) // Use verified user.id
      .maybeSingle();

    if (settingsError) {
      console.error("[generate-affiliate-link] Error fetching settings:", settingsError);
      const payload: ApiErr = { success: false, error: "Failed to fetch user settings" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const appKey = settings?.aliexpress_app_key?.trim();
    const appSecret = settings?.aliexpress_app_secret?.trim();
    const trackingId = settings?.aliexpress_tracking_id?.trim() || "TELEGRAM";

    if (!appKey || !appSecret) {
      const payload: ApiErr = { success: false, error: "Please configure your AliExpress API credentials in Settings" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log("[generate-affiliate-link] Processing for user:", user.email);

    const expanded = await expandShortUrl(productUrl);
    console.log("[generate-affiliate-link] Expanded URL:", expanded);
    
    const productId = parseProductId(expanded);
    console.log("[generate-affiliate-link] Extracted productId:", productId);

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
      method: "aliexpress.affiliate.link.generate",
      timestamp: Date.now().toString(),
      v: "2.0",
      sign_method: "md5",
      tracking_id: trackingId,
      promotion_link_type: "0",
      source_values: cleanUrl,
    };

    console.log("[generate-affiliate-link] API params:", JSON.stringify(params));

    const sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries({ ...params, sign })
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    const resp = await fetch(apiUrl, { method: "GET" });
    const data = await resp.json().catch(() => ({}));

    console.log("[generate-affiliate-link] API response:", JSON.stringify(data).substring(0, 500));

    const result = data?.aliexpress_affiliate_link_generate_response?.resp_result;
    
    const promotionLinks = result?.result?.promotion_links;
    let promotionLink: string | undefined;
    
    if (promotionLinks) {
      if (promotionLinks?.promotion_link?.[0]?.promotion_link) {
        promotionLink = promotionLinks.promotion_link[0].promotion_link;
      }
      else if (Array.isArray(promotionLinks) && promotionLinks[0]?.promotion_link) {
        promotionLink = promotionLinks[0].promotion_link;
      }
      else if (promotionLinks?.promotion_link?.promotion_link) {
        promotionLink = promotionLinks.promotion_link.promotion_link;
      }
    }

    console.log("[generate-affiliate-link] resp_code:", result?.resp_code, "promotionLink:", promotionLink);

    if (result?.resp_code === 200 && promotionLink) {
      const payload: ApiOk = {
        success: true,
        affiliateLink: promotionLink,
        originalUrl: productUrl,
        cleanUrl,
        productId,
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const err = data?.error_response;
    if (err?.msg || err?.code) {
      const payload: ApiErr = {
        success: false,
        error: String(err?.msg || "AliExpress API error"),
        code: err?.code,
        request_id: err?.request_id,
        trace_id: err?._trace_id_,
        raw: data,
      };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload: ApiErr = { 
      success: false, 
      error: `Unexpected AliExpress response (resp_code: ${result?.resp_code})`, 
      raw: data 
    };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-affiliate-link] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
