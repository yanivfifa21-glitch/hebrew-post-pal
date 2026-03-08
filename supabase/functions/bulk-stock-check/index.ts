import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isValidHttpUrl = (value: string | null | undefined): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get all users with scheduled stock check enabled
    const { data: settings } = await supabase
      .from("app_settings")
      .select("user_id, stock_check_scheduled")
      .eq("stock_check_scheduled", true);

    if (!settings || settings.length === 0) {
      return new Response(JSON.stringify({ message: "No users with stock check enabled" }), { headers: corsHeaders });
    }

    let totalChecked = 0;
    let totalUnavailable = 0;
    let totalRestored = 0;

    for (const userSetting of settings) {
      // Get all scheduled products for this user
      const { data: products } = await supabase
        .from("products")
        .select("id, affiliate_link, original_url, stock_status, auto_disabled")
        .eq("user_id", userSetting.user_id)
        .in("status", ["Scheduled", "processing"])
        .limit(100);

      if (!products || products.length === 0) continue;

      for (const product of products) {
        const checkUrl = product.original_url || product.affiliate_link;
        if (!checkUrl || !isValidHttpUrl(checkUrl)) {
          await supabase
            .from("products")
            .update({
              stock_status: "unchecked",
              last_stock_check: new Date().toISOString(),
              auto_disabled: false,
            })
            .eq("id", product.id);
          continue;
        }

        try {
          // Call check-product-stock function inline (same logic)
          const response = await fetch(checkUrl, {
            method: "GET",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            redirect: "follow",
          });

          let stockStatus = "available";
          const finalUrl = response.url;
          
          const homepagePatterns = [
            /^https?:\/\/(www\.)?aliexpress\.(com|us|ru)\/?(\?.*)?$/i,
            /aliexpress\.(com|us|ru)\/wholesale/i,
          ];

          for (const pattern of homepagePatterns) {
            if (pattern.test(finalUrl)) {
              stockStatus = "unavailable";
              break;
            }
          }

          if (stockStatus === "available" && (response.status === 404 || response.status >= 500)) {
            stockStatus = "unavailable";
          }

          if (stockStatus === "available" && response.ok) {
            const html = await response.text();
            const lowerHtml = html.toLowerCase();
            const unavailablePatterns = [
              "no longer available", "this item has been removed", "oops",
              "page not found", "currently unavailable", "out of stock",
            ];
            for (const p of unavailablePatterns) {
              if (lowerHtml.includes(p)) {
                stockStatus = "unavailable";
                break;
              }
            }
          }

          const wasUnavailable = product.auto_disabled;

          await supabase
            .from("products")
            .update({
              stock_status: stockStatus,
              last_stock_check: new Date().toISOString(),
              auto_disabled: stockStatus === "unavailable",
            })
            .eq("id", product.id);

          totalChecked++;
          if (stockStatus === "unavailable") totalUnavailable++;
          if (wasUnavailable && stockStatus === "available") totalRestored++;

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 500));
        } catch (err) {
          console.error(`[bulk-stock-check] Product ${product.id} error:`, err);
          await supabase
            .from("products")
            .update({
              stock_status: "error",
              last_stock_check: new Date().toISOString(),
            })
            .eq("id", product.id);
          totalChecked++;
        }
      }

      // Update last bulk check timestamp
      await supabase
        .from("app_settings")
        .update({ last_bulk_stock_check: new Date().toISOString() })
        .eq("user_id", userSetting.user_id);
    }

    console.log(`[bulk-stock-check] Done: ${totalChecked} checked, ${totalUnavailable} unavailable, ${totalRestored} restored`);

    return new Response(JSON.stringify({
      success: true, totalChecked, totalUnavailable, totalRestored,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("[bulk-stock-check] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
