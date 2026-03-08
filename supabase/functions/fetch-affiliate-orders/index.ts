import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  orders: AffiliateOrder[];
  daily_stats: Record<string, { paid_orders: number; paid_earnings: number; completed_orders: number; completed_earnings: number }>;
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

function parseOrder(o: any): AffiliateOrder {
  const isCompleted = o.order_status === "Completed" || o.is_finished === true;
  // AliExpress returns amounts as string cents (e.g. "1468" = $14.68) or as decimal strings
  const rawPaid = parseFloat(o.paid_amount || o.order_amount || "0");
  const rawCommission = parseFloat(o.estimated_paid_commission || o.estimated_commission || o.new_buyer_bonus_commission || "0");
  
  // If values look like cents (> 100 for a typical order), divide by 100
  // Actually AliExpress API returns values in USD as-is (e.g. "14.68")
  // But some fields are returned without decimal. Let's use as-is since the API docs say USD.
  return {
    order_id: String(o.order_id || o.order_number || ""),
    product_id: String(o.product_id || ""),
    product_title: o.product_title || o.sub_order_title || "",
    product_image: o.product_main_image_url || o.product_image || "",
    order_status: o.order_status || "unknown",
    paid_amount: rawPaid,
    estimated_commission: rawCommission,
    created_at: o.created_time || o.order_create_time || "",
    is_completed: isCompleted,
  };
}

async function fetchOrdersByStatus(
  appKey: string, appSecret: string, trackingId: string,
  startTime: string, endTime: string, status: string
): Promise<AffiliateOrder[]> {
  const orderMap = new Map<string, AffiliateOrder>();
  let startQueryIndexId = "";
  let pageNo = 1;

  while (pageNo <= 50) {
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
      status,
    };

    // CRITICAL: Only use start_query_index_id for page 2+
    if (startQueryIndexId && pageNo > 1) {
      params.start_query_index_id = startQueryIndexId;
    } else {
      params.page_no = "1";
    }

    params.sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    console.log(`[${status}] Fetching page ${pageNo}...`);
    const apiResp = await fetch(apiUrl);
    const apiData = await apiResp.json();

    const respBody = apiData?.aliexpress_affiliate_order_listbyindex_response;
    
    if (!respBody || respBody.resp_result?.resp_code !== 200) {
      console.log(`[${status}] API error on page ${pageNo}:`, JSON.stringify(apiData).substring(0, 300));
      break;
    }

    const result = respBody.resp_result?.result;
    const orders = result?.orders?.order || [];

    if (orders.length === 0) {
      console.log(`[${status}] No more orders on page ${pageNo}`);
      break;
    }

    // Log first page raw to understand structure
    if (pageNo === 1) {
      console.log(`[${status}] Sample order keys:`, Object.keys(orders[0]).join(", "));
      console.log(`[${status}] Sample order:`, JSON.stringify(orders[0]).substring(0, 400));
      console.log(`[${status}] current_record_count:`, result?.current_record_count, "total_record_count:", result?.total_record_count);
    }

    let newOrdersAdded = 0;
    for (const o of orders) {
      const parsed = parseOrder(o);
      // Use order_id + product_id as unique key (one order can have multiple products)
      const uniqueKey = `${parsed.order_id}_${parsed.product_id}`;
      if (!orderMap.has(uniqueKey)) {
        orderMap.set(uniqueKey, parsed);
        newOrdersAdded++;
      }
    }

    console.log(`[${status}] Page ${pageNo}: ${orders.length} orders received, ${newOrdersAdded} new unique`);

    // If no new orders were added, we're getting duplicates - stop
    if (newOrdersAdded === 0) {
      console.log(`[${status}] All duplicates on page ${pageNo}, stopping.`);
      break;
    }

    // Check if there are more pages
    const totalRecords = result?.total_record_count || 0;
    if (orderMap.size >= totalRecords) {
      console.log(`[${status}] Got all ${totalRecords} orders, stopping.`);
      break;
    }

    // Use the last order's order_id as pagination cursor
    const lastOrder = orders[orders.length - 1];
    startQueryIndexId = String(lastOrder?.order_id || "");
    
    if (!startQueryIndexId) {
      break;
    }

    pageNo++;
  }

  return Array.from(orderMap.values());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const body = await req.json();
    const { startTime, endTime } = body;

    if (!startTime || !endTime) {
      return new Response(JSON.stringify({ success: false, error: "startTime and endTime required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch paid and completed orders in parallel
    const [paidOrders, completedOrders] = await Promise.all([
      fetchOrdersByStatus(appKey, appSecret, trackingId, startTime, endTime, "Payment Completed"),
      fetchOrdersByStatus(appKey, appSecret, trackingId, startTime, endTime, "Completed"),
    ]);

    // Mark completed orders
    for (const o of completedOrders) {
      o.is_completed = true;
    }

    // Merge: completed takes priority over paid
    const allMap = new Map<string, AffiliateOrder>();
    for (const o of paidOrders) {
      allMap.set(`${o.order_id}_${o.product_id}`, o);
    }
    for (const o of completedOrders) {
      allMap.set(`${o.order_id}_${o.product_id}`, o);
    }
    
    const allOrders = Array.from(allMap.values());
    const paid = allOrders.filter(o => !o.is_completed);
    const completed = allOrders.filter(o => o.is_completed);

    // Build daily stats
    const dailyStats: EarningsSummary["daily_stats"] = {};
    for (const order of allOrders) {
      const date = order.created_at?.substring(0, 10) || "unknown";
      if (!dailyStats[date]) {
        dailyStats[date] = { paid_orders: 0, paid_earnings: 0, completed_orders: 0, completed_earnings: 0 };
      }
      if (order.is_completed) {
        dailyStats[date].completed_orders++;
        dailyStats[date].completed_earnings += order.estimated_commission;
      } else {
        dailyStats[date].paid_orders++;
        dailyStats[date].paid_earnings += order.estimated_commission;
      }
    }

    const summary: EarningsSummary = {
      paid_orders: paid.length,
      paid_earnings: paid.reduce((sum, o) => sum + o.estimated_commission, 0),
      completed_orders: completed.length,
      completed_earnings: completed.reduce((sum, o) => sum + o.estimated_commission, 0),
      orders: allOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      daily_stats: dailyStats,
    };

    console.log(`Summary: ${paid.length} paid ($${summary.paid_earnings.toFixed(2)}), ${completed.length} completed ($${summary.completed_earnings.toFixed(2)})`);

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
