import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNAVAILABLE_PATTERNS = [
  "no longer available",
  "this item has been removed",
  "مع الأسف",
  "oops",
  "page not found",
  "currently unavailable",
  "out of stock",
  "0 in stock",
  "item is not available",
  "page d'erreur",
  "sorry, this product is no longer available",
  "we can't find the page",
  "该商品已下架",
  "商品不存在",
];

const HOMEPAGE_PATTERNS = [
  /^https?:\/\/(www\.)?aliexpress\.(com|us|ru)\/?(\?.*)?$/i,
  /aliexpress\.(com|us|ru)\/wholesale/i,
  /aliexpress\.(com|us|ru)\/category/i,
];

async function checkProductAvailability(url: string): Promise<{ status: string; reason?: string }> {
  if (!url) return { status: "error", reason: "No URL provided" };

  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { status: "unchecked", reason: "URL must be HTTP/HTTPS" };
    }
    normalizedUrl = parsed.toString();
  } catch {
    return { status: "unchecked", reason: "Invalid URL format" };
  }

  try {
    const response = await fetch(normalizedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });

    const finalUrl = response.url;

    // Check if redirected to homepage or search
    for (const pattern of HOMEPAGE_PATTERNS) {
      if (pattern.test(finalUrl)) {
        return { status: "unavailable", reason: "Redirected to homepage/search" };
      }
    }

    if (response.status === 404 || response.status >= 500) {
      return { status: "unavailable", reason: `HTTP ${response.status}` };
    }

    if (!response.ok && response.status !== 200) {
      return { status: "error", reason: `HTTP ${response.status}` };
    }

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    for (const pattern of UNAVAILABLE_PATTERNS) {
      if (lowerHtml.includes(pattern.toLowerCase())) {
        return { status: "unavailable", reason: `Page contains: "${pattern}"` };
      }
    }

    // Check for price/add-to-cart indicators (product likely available)
    const hasPrice = /class="[^"]*price[^"]*"/i.test(html) || /data-price/i.test(html);
    const hasAddToCart = /add.to.cart/i.test(html) || /buy.now/i.test(html);

    if (hasPrice || hasAddToCart) {
      return { status: "available" };
    }

    // If we got a 200 but can't confirm availability, assume available
    return { status: "available" };
  } catch (error) {
    return { status: "error", reason: String(error) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { productId, url, userId } = await req.json();

    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await checkProductAvailability(url);

    // Update product in database if productId provided
    if (productId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get current count first
      const { data: currentProduct } = await supabase
        .from("products")
        .select("stock_check_count")
        .eq("id", productId)
        .single();

      const newCount = ((currentProduct?.stock_check_count as number) || 0) + 1;

      const { error } = await supabase
        .from("products")
        .update({
          stock_status: result.status,
          last_stock_check: new Date().toISOString(),
          auto_disabled: result.status === "unavailable",
          stock_check_count: newCount,
        })
        .eq("id", productId);

      if (error) console.error("Failed to update product:", error);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-product-stock] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
