import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Period = "last_week" | "current_month" | "last_month";

interface SubOrder {
  order_number: string;
  parent_order_number?: string;
  product_title: string;
  product_id: string;
  paid_amount: number;
  estimated_paid_commission: number;
  estimated_finished_commission: number;
  order_status: string;
  created_time: string;
  item_count: number;
}

interface ParentOrder {
  order_number: string;
  product_title: string;
  product_id: string;
  paid_amount: number;
  commission: number;
  finished_commission: number;
  status: string;
  created_time: string;
  item_count: number;
}

// ── Helpers ──

function getPstNow(): Date {
  // PST = UTC-8
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs - 8 * 3600_000);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}

function getTimeRange(period: Period): { start: string; end: string } {
  const pst = getPstNow();
  // API has 2-day delay
  const endDate = new Date(pst.getFullYear(), pst.getMonth(), pst.getDate() - 2, 23, 59, 59);

  let startDate: Date;
  if (period === "last_week") {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() - 6, 0, 0, 0);
  } else if (period === "current_month") {
    startDate = new Date(pst.getFullYear(), pst.getMonth(), 1, 0, 0, 0);
  } else {
    // last_month
    startDate = new Date(pst.getFullYear(), pst.getMonth() - 1, 1, 0, 0, 0);
    const lastDay = new Date(pst.getFullYear(), pst.getMonth(), 0);
    endDate.setFullYear(lastDay.getFullYear());
    endDate.setMonth(lastDay.getMonth());
    endDate.setDate(lastDay.getDate());
    endDate.setHours(23, 59, 59);
  }

  return { start: formatDate(startDate), end: formatDate(endDate) };
}

async function hmacSha256Sign(params: Record<string, string>, appSecret: string): Promise<string> {
  const sortedKeys = Object.keys(params).sort();
  let signStr = appSecret;
  for (const key of sortedKeys) signStr += key + params[key];
  signStr += appSecret;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(signStr));
  return Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function parseSubOrder(o: any): SubOrder {
  return {
    order_number: String(o.order_number || o.order_id || ""),
    parent_order_number: o.parent_order_number ? String(o.parent_order_number) : undefined,
    product_title: o.product_title || o.sub_order_title || "",
    product_id: String(o.product_id || ""),
    paid_amount: parseFloat(o.paid_amount || "0") / 100,
    estimated_paid_commission: parseFloat(o.estimated_paid_commission || "0") / 100,
    estimated_finished_commission: parseFloat(o.estimated_finished_commission || "0") / 100,
    order_status: o.order_status || "unknown",
    created_time: o.created_time || o.order_create_time || "",
    item_count: parseInt(o.item_count || "1", 10),
  };
}

const COMPLETED_STATUSES = ["Buyer Confirmed Receipt", "Completed", "success"];

function isCompletedStatus(status: string): boolean {
  return COMPLETED_STATUSES.some((s) => status.toLowerCase().includes(s.toLowerCase()));
}

// Pick "most advanced" status
function pickAdvancedStatus(statuses: string[]): string {
  for (const s of statuses) {
    if (isCompletedStatus(s)) return s;
  }
  return statuses[0] || "unknown";
}

async function fetchOrdersByStatus(
  appKey: string,
  appSecret: string,
  trackingId: string,
  startTime: string,
  endTime: string,
  status: string
): Promise<SubOrder[]> {
  const allOrders: SubOrder[] = [];
  let pageNo = 1;

  while (pageNo <= 50) {
    const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

    const params: Record<string, string> = {
      method: "aliexpress.affiliate.order.list",
      app_key: appKey,
      sign_method: "hmac-sha256",
      timestamp,
      format: "json",
      v: "2.0",
      start_time: startTime,
      end_time: endTime,
      fields:
        "order_number,paid_amount,estimated_paid_commission,estimated_finished_commission,order_status,created_time,product_title,product_id,is_new_buyer,item_count,paid_time,completed_time,effect_status,settled_currency,parent_order_number",
      page_no: String(pageNo),
      page_size: "50",
      time_type: "payment_time",
      status,
    };

    if (trackingId) {
      params.tracking_id = trackingId;
    }

    params.sign = await hmacSha256Sign(params, appSecret);

    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    console.log(`[${status}] Fetching page ${pageNo}...`);
    const resp = await fetch(apiUrl);
    const apiData = await resp.json();

    const respBody = apiData?.aliexpress_affiliate_order_list_response;
    if (!respBody || respBody.resp_result?.resp_code !== 200) {
      console.log(`[${status}] API error page ${pageNo}:`, JSON.stringify(apiData).substring(0, 500));
      break;
    }

    const result = respBody.resp_result?.result;
    const orders = result?.orders?.order || [];

    if (orders.length === 0) break;

    if (pageNo === 1) {
      console.log(`[${status}] Sample:`, JSON.stringify(orders[0]).substring(0, 400));
      console.log(`[${status}] total_record_count:`, result?.total_record_count);
    }

    for (const o of orders) {
      allOrders.push(parseSubOrder(o));
    }

    console.log(`[${status}] Page ${pageNo}: ${orders.length} sub-orders`);

    const total = result?.total_record_count || 0;
    if (allOrders.length >= total) break;

    pageNo++;
  }

  return allOrders;
}

function groupByParentOrder(subOrders: SubOrder[]): ParentOrder[] {
  const map = new Map<string, SubOrder[]>();

  for (const so of subOrders) {
    const key = so.parent_order_number || so.order_number;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(so);
  }

  const results: ParentOrder[] = [];
  for (const [parentId, subs] of map) {
    const totalPaid = subs.reduce((s, o) => s + o.paid_amount, 0);
    const totalCommission = subs.reduce((s, o) => s + o.estimated_paid_commission, 0);
    const totalFinished = subs.reduce((s, o) => s + o.estimated_finished_commission, 0);
    const totalItems = subs.reduce((s, o) => s + o.item_count, 0);
    const statuses = subs.map((o) => o.order_status);
    const status = pickAdvancedStatus(statuses);
    // Use first sub-order for display info
    const first = subs[0];

    results.push({
      order_number: parentId,
      product_title: first.product_title,
      product_id: first.product_id,
      paid_amount: totalPaid,
      commission: totalCommission,
      finished_commission: totalFinished,
      status,
      created_time: first.created_time,
      item_count: totalItems,
    });
  }

  return results.sort((a, b) => (b.created_time || "").localeCompare(a.created_time || ""));
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
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: creds, error: credsError } = await supabaseAdmin.rpc(
      "get_decrypted_user_credentials",
      { p_user_id: user.id }
    );
    if (credsError || !creds || creds.error) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing API credentials. Configure in Settings." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const appKey = creds.aliexpress_app_key;
    const appSecret = creds.aliexpress_app_secret;
    if (!appKey || !appSecret) {
      return new Response(
        JSON.stringify({ success: false, error: "AliExpress API keys not configured." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: settingsData } = await supabaseAdmin
      .from("app_settings")
      .select("aliexpress_tracking_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const trackingId = settingsData?.aliexpress_tracking_id || "";

    const body = await req.json();
    const period: Period = body.period || "last_week";
    const { start, end } = getTimeRange(period);

    console.log(`Period: ${period}, Range: ${start} → ${end}`);

    // Fetch both statuses in parallel
    const [paidSubs, completedSubs] = await Promise.all([
      fetchOrdersByStatus(appKey, appSecret, trackingId, start, end, "Payment Completed"),
      fetchOrdersByStatus(appKey, appSecret, trackingId, start, end, "Buyer Confirmed Receipt"),
    ]);

    // Merge (dedup by order_number + product_id, completed takes priority)
    const allSubMap = new Map<string, SubOrder>();
    for (const o of paidSubs) {
      allSubMap.set(`${o.order_number}_${o.product_id}`, o);
    }
    for (const o of completedSubs) {
      allSubMap.set(`${o.order_number}_${o.product_id}`, o);
    }

    const allSubs = Array.from(allSubMap.values());
    const parentOrders = groupByParentOrder(allSubs);

    const paidOrders = parentOrders.length;
    const paidEarnings = parentOrders.reduce((s, o) => s + o.commission, 0);
    const completedParents = parentOrders.filter((o) => isCompletedStatus(o.status));
    const completedOrders = completedParents.length;
    const completedEarnings = completedParents.reduce(
      (s, o) => s + (o.finished_commission > 0 ? o.finished_commission : o.commission),
      0
    );

    console.log(
      `Summary: ${paidOrders} paid ($${paidEarnings.toFixed(2)}), ${completedOrders} completed ($${completedEarnings.toFixed(2)})`
    );

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          paid_orders: paidOrders,
          paid_earnings: Math.round(paidEarnings * 100) / 100,
          completed_orders: completedOrders,
          completed_earnings: Math.round(completedEarnings * 100) / 100,
        },
        orders: parentOrders,
        period: { start, end, label: period },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
