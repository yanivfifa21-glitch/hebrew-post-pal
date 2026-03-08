import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AffiliateOrder = {
  order_id: string;
  product_id: string;
  product_title: string;
  product_image: string;
  order_status: string;
  paid_amount: number;
  estimated_commission: number;
  created_at: string;
  is_completed: boolean;
};

type EarningsSummary = {
  paid_orders: number;
  paid_earnings: number;
  completed_orders: number;
  completed_earnings: number;
  clicks: number;
  orders: AffiliateOrder[];
  daily_stats: Record<string, { paid_orders: number; paid_earnings: number; completed_orders: number; completed_earnings: number; clicks: number }>;
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

// Convert a Date to PST string format "yyyy-MM-dd HH:mm:ss"
function toPSTString(date: Date): string {
  const pst = new Date(date.getTime() - 8 * 60 * 60 * 1000); // UTC-8
  const y = pst.getUTCFullYear();
  const m = String(pst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(pst.getUTCDate()).padStart(2, "0");
  const h = String(pst.getUTCHours()).padStart(2, "0");
  const min = String(pst.getUTCMinutes()).padStart(2, "0");
  const s = String(pst.getUTCSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get credentials
    const { data: creds, error: credsError } = await supabaseAdmin.rpc("get_decrypted_user_credentials", { p_user_id: user.id });
    if (credsError || !creds || creds.error) {
      return new Response(JSON.stringify({ success: false, error: "Missing API credentials. Configure in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const appKey = creds.aliexpress_app_key;
    const appSecret = creds.aliexpress_app_secret;
    if (!appKey || !appSecret) {
      return new Response(JSON.stringify({ success: false, error: "AliExpress API keys not configured." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get tracking ID
    const { data: settingsData } = await supabaseAdmin
      .from("app_settings")
      .select("aliexpress_tracking_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const trackingId = settingsData?.aliexpress_tracking_id || "";

    if (!trackingId) {
      return new Response(JSON.stringify({ success: false, error: "Tracking ID not configured." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const body = await req.json();
    const { startTime, endTime } = body;

    if (!startTime || !endTime) {
      return new Response(JSON.stringify({ success: false, error: "startTime and endTime required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all pages of orders
    const allOrders: AffiliateOrder[] = [];
    let pageNo = 1;
    let hasMore = true;
    let startQueryIndexId = "";

    while (hasMore && pageNo <= 20) {
      const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

      const params: Record<string, string> = {
        method: "aliexpress.affiliate.order.listbyindex",
        app_key: appKey,
        sign_method: "md5",
        timestamp,
        format: "json",
        v: "2.0",
        start_time: startTime,
        end_time: endTime,
        tracking_id: trackingId,
        page_size: "50",
        status: "Payment Completed",
      };

      if (startQueryIndexId) {
        params.start_query_index_id = startQueryIndexId;
      }

      params.sign = await generateMd5Signature(params, appSecret);

      const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

      console.log(`Fetching orders page ${pageNo}...`);
      const apiResp = await fetch(apiUrl);
      const apiData = await apiResp.json();

      const respBody = apiData?.aliexpress_affiliate_order_listbyindex_response;
      if (!respBody || respBody.resp_result?.resp_code !== 200) {
        console.log("API response:", JSON.stringify(apiData).substring(0, 500));
        // If no orders, that's ok
        if (respBody?.resp_result?.resp_code === 200 || !respBody) {
          hasMore = false;
          break;
        }
        // Try to continue even on errors for first page
        if (pageNo === 1 && allOrders.length === 0) {
          const errMsg = respBody?.resp_result?.resp_msg || "Failed to fetch orders";
          return new Response(JSON.stringify({ success: false, error: errMsg, raw: apiData }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        hasMore = false;
        break;
      }

      const result = respBody.resp_result?.result;
      const orders = result?.orders?.order || [];

      if (orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const o of orders) {
        const isCompleted = o.order_status === "Completed" || o.is_finished === true;
        allOrders.push({
          order_id: String(o.order_id || o.order_number || ""),
          product_id: String(o.product_id || ""),
          product_title: o.product_title || o.sub_order_title || "",
          product_image: o.product_main_image_url || o.product_image || "",
          order_status: o.order_status || "unknown",
          paid_amount: parseFloat(o.paid_amount || o.order_amount || "0"),
          estimated_commission: parseFloat(o.estimated_paid_commission || o.estimated_commission || o.new_buyer_bonus_commission || "0"),
          created_at: o.created_time || o.order_create_time || "",
          is_completed: isCompleted,
        });
      }

      // Pagination
      if (result?.current_record_count < 50) {
        hasMore = false;
      } else {
        startQueryIndexId = String(orders[orders.length - 1]?.order_id || "");
        pageNo++;
      }
    }

    // Now fetch completed orders too
    let completedPageNo = 1;
    let completedHasMore = true;
    let completedStartIdx = "";

    while (completedHasMore && completedPageNo <= 20) {
      const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

      const params: Record<string, string> = {
        method: "aliexpress.affiliate.order.listbyindex",
        app_key: appKey,
        sign_method: "md5",
        timestamp,
        format: "json",
        v: "2.0",
        start_time: startTime,
        end_time: endTime,
        tracking_id: trackingId,
        page_size: "50",
        status: "Completed",
      };

      if (completedStartIdx) {
        params.start_query_index_id = completedStartIdx;
      }

      params.sign = await generateMd5Signature(params, appSecret);

      const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

      console.log(`Fetching completed orders page ${completedPageNo}...`);
      const apiResp = await fetch(apiUrl);
      const apiData = await apiResp.json();

      const respBody = apiData?.aliexpress_affiliate_order_listbyindex_response;
      if (!respBody || respBody.resp_result?.resp_code !== 200) {
        completedHasMore = false;
        break;
      }

      const result = respBody.resp_result?.result;
      const orders = result?.orders?.order || [];

      if (orders.length === 0) {
        completedHasMore = false;
        break;
      }

      for (const o of orders) {
        // Only add if not already present from paid query
        const existingIdx = allOrders.findIndex(ao => ao.order_id === String(o.order_id || o.order_number || ""));
        if (existingIdx >= 0) {
          // Update to completed
          allOrders[existingIdx].is_completed = true;
          allOrders[existingIdx].order_status = o.order_status || "Completed";
          allOrders[existingIdx].estimated_commission = parseFloat(o.estimated_paid_commission || o.estimated_commission || String(allOrders[existingIdx].estimated_commission));
        } else {
          allOrders.push({
            order_id: String(o.order_id || o.order_number || ""),
            product_id: String(o.product_id || ""),
            product_title: o.product_title || o.sub_order_title || "",
            product_image: o.product_main_image_url || o.product_image || "",
            order_status: o.order_status || "Completed",
            paid_amount: parseFloat(o.paid_amount || o.order_amount || "0"),
            estimated_commission: parseFloat(o.estimated_paid_commission || o.estimated_commission || "0"),
            created_at: o.created_time || o.order_create_time || "",
            is_completed: true,
          });
        }
      }

      if (result?.current_record_count < 50) {
        completedHasMore = false;
      } else {
        completedStartIdx = String(orders[orders.length - 1]?.order_id || "");
        completedPageNo++;
      }
    }

    // Build summary
    const paid = allOrders.filter(o => !o.is_completed);
    const completed = allOrders.filter(o => o.is_completed);

    const summary: EarningsSummary = {
      paid_orders: paid.length,
      paid_earnings: paid.reduce((sum, o) => sum + o.estimated_commission, 0),
      completed_orders: completed.length,
      completed_earnings: completed.reduce((sum, o) => sum + o.estimated_commission, 0),
      clicks: 0, // AliExpress order API doesn't provide clicks
      orders: allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      daily_stats: {},
    };

    // Build daily stats
    for (const order of allOrders) {
      const date = order.created_at?.substring(0, 10) || "unknown";
      if (!summary.daily_stats[date]) {
        summary.daily_stats[date] = { paid_orders: 0, paid_earnings: 0, completed_orders: 0, completed_earnings: 0, clicks: 0 };
      }
      if (order.is_completed) {
        summary.daily_stats[date].completed_orders++;
        summary.daily_stats[date].completed_earnings += order.estimated_commission;
      } else {
        summary.daily_stats[date].paid_orders++;
        summary.daily_stats[date].paid_earnings += order.estimated_commission;
      }
    }

    return new Response(JSON.stringify({ success: true, data: summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
