import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

function getPstNow(): Date {
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

interface LiveOrder {
  order_id: string;
  product_id: string;
  product_title: string;
  order_status: string;
  paid_amount: number;
  estimated_commission: number;
  created_at: string;
}

function parseOrder(o: any): LiveOrder {
  return {
    order_id: String(o.order_number || o.order_id || ""),
    product_id: String(o.product_id || ""),
    product_title: o.product_title || o.sub_order_title || "",
    order_status: o.order_status || "unknown",
    paid_amount: parseFloat(o.paid_amount || "0") / 100,
    estimated_commission: parseFloat(o.estimated_paid_commission || o.estimated_commission || "0") / 100,
    created_at: o.created_time || o.paid_time || "",
  };
}

async function fetchRecentOrders(appKey: string, appSecret: string): Promise<LiveOrder[]> {
  const allOrders: LiveOrder[] = [];
  const pst = getPstNow();
  
  // Fetch last 3 days in PST (AliExpress API uses PST timezone)
  const endDate = new Date(pst.getFullYear(), pst.getMonth(), pst.getDate(), pst.getHours(), pst.getMinutes(), pst.getSeconds());
  const startDate = new Date(endDate.getTime() - 3 * 24 * 60 * 60 * 1000);
  
  const startTime = formatDate(startDate);
  const endTime = formatDate(endDate);
  
  console.log(`[sync-live-orders] Fetching orders from ${startTime} to ${endTime} (PST)`);

  for (const status of ["Payment Completed", "Buyer Confirmed Receipt"]) {
    let pageNo = 1;
    while (pageNo <= 20) {
      const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
      const params: Record<string, string> = {
        method: "aliexpress.affiliate.order.list",
        app_key: appKey,
        sign_method: "md5",
        timestamp,
        format: "json",
        v: "2.0",
        start_time: startTime,
        end_time: endTime,
        fields: "order_number,paid_amount,estimated_paid_commission,order_status,created_time,product_title,product_id,paid_time,parent_order_number",
        page_no: String(pageNo),
        page_size: "50",
        time_type: "payment_time",
        status,
      };
      // Don't pass tracking_id - fetch ALL orders like the earnings dashboard
      params.sign = await generateMd5Signature(params, appSecret);

      const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

      try {
        const resp = await fetch(apiUrl);
        const data = await resp.json();
        const respBody = data?.aliexpress_affiliate_order_list_response;
        if (!respBody || respBody.resp_result?.resp_code !== 200) {
          console.log(`[sync-live-orders] [${status}] No more data at page ${pageNo}`);
          break;
        }
        const orders = respBody.resp_result.result?.orders?.order || [];
        console.log(`[sync-live-orders] [${status}] Page ${pageNo}: ${orders.length} orders`);
        for (const o of orders) {
          allOrders.push(parseOrder(o));
        }
        if (orders.length < 50) break;
        pageNo++;
      } catch (e) {
        console.error(`[sync-live-orders] Error fetching ${status} page ${pageNo}:`, e);
        break;
      }
    }
  }

  // Deduplicate by order_id + product_id
  const seen = new Set<string>();
  return allOrders.filter(o => {
    const key = `${o.order_id}_${o.product_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function sendTelegramNotification(botToken: string, chatId: string, message: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = req.headers.get("apikey") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    let isCron = false;
    let targetUserId: string | null = null;

    const token = authHeader.replace("Bearer ", "");
    if (token === anonKey || token === supabaseServiceKey || apiKey === anonKey) {
      isCron = true;
    } else {
      const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetUserId = user.id;
    }

    // For manual user calls - always sync for that user, regardless of notification settings
    // For cron - only sync users with enabled notifications
    let userIds: string[] = [];

    if (targetUserId) {
      // Manual call - always sync
      userIds = [targetUserId];
    } else {
      // Cron call - get users with enabled notifications
      const { data: notifSettings } = await supabase
        .from("earnings_notification_settings")
        .select("user_id")
        .eq("is_enabled", true);
      userIds = (notifSettings || []).map((s: any) => s.user_id);
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No users to sync" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const userId of userIds) {
      try {
        // Get user credentials
        const { data: creds } = await supabase.rpc("get_decrypted_user_credentials", { p_user_id: userId });
        if (!creds || creds.error || !creds.aliexpress_app_key || !creds.aliexpress_app_secret) {
          console.log(`[sync-live-orders] User ${userId}: missing API credentials`);
          results.push({ user_id: userId, error: "missing_credentials" });
          continue;
        }

        // Fetch orders using the same API method as get-affiliate-earnings
        const orders = await fetchRecentOrders(creds.aliexpress_app_key, creds.aliexpress_app_secret);
        console.log(`[sync-live-orders] User ${userId}: fetched ${orders.length} total orders`);

        if (orders.length === 0) {
          results.push({ user_id: userId, new_orders: 0, total_fetched: 0 });
          continue;
        }

        // Check which orders are new
        const { data: existingOrders } = await supabase
          .from("tracked_orders")
          .select("order_id, product_id")
          .eq("user_id", userId);

        const existingSet = new Set(
          (existingOrders || []).map((e: any) => `${e.order_id}_${e.product_id}`)
        );

        const newOrders = orders.filter(o => !existingSet.has(`${o.order_id}_${o.product_id}`));
        console.log(`[sync-live-orders] User ${userId}: ${newOrders.length} new orders`);

        if (newOrders.length > 0) {
          // Insert new orders
          const rows = newOrders.map(o => ({
            user_id: userId,
            order_id: o.order_id,
            product_id: o.product_id,
            product_title: o.product_title,
            paid_amount: o.paid_amount,
            estimated_commission: o.estimated_commission,
            order_status: o.order_status,
            order_created_at: o.created_at,
          }));

          await supabase.from("tracked_orders").upsert(rows, {
            onConflict: "user_id,order_id,product_id",
          });

          // Send Telegram notifications if enabled
          const { data: notifData } = await supabase
            .from("earnings_notification_settings")
            .select("*")
            .eq("user_id", userId)
            .maybeSingle();

          if (notifData?.is_enabled && notifData?.notify_per_order && notifData?.telegram_chat_id) {
            // Get bot token - first try user_credentials, then fall back to messaging_accounts
            let notifBotToken: string | null = creds.telegram_bot_token || null;
            if (!notifBotToken) {
              const { data: tgAccounts } = await supabase
                .from("messaging_accounts")
                .select("id")
                .eq("user_id", userId)
                .eq("account_type", "telegram")
                .eq("is_active", true)
                .limit(1);
              if (tgAccounts && tgAccounts.length > 0) {
                const { data: accCreds } = await supabase.rpc("get_decrypted_messaging_account_credentials", {
                  p_account_id: tgAccounts[0].id,
                  p_user_id: userId,
                });
                if (accCreds && !accCreds.error && accCreds.telegram_bot_token) {
                  notifBotToken = accCreds.telegram_bot_token;
                }
              }
            }
            if (notifBotToken) {
              for (const order of newOrders) {
                const msg = `🛒 <b>הזמנה חדשה!</b>\n\n` +
                  `📦 ${order.product_title || "מוצר"}\n` +
                  `💰 סכום: $${order.paid_amount.toFixed(2)}\n` +
                  `💎 עמלה: $${order.estimated_commission.toFixed(2)}\n` +
                  `📋 סטטוס: ${order.order_status}\n` +
                  `🔢 מזהה: ${order.order_id}`;
                await sendTelegramNotification(notifBotToken, notifData.telegram_chat_id, msg);
              }
            }
          }
        }

        // Update last sync time if settings exist
        await supabase
          .from("earnings_notification_settings")
          .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("user_id", userId);

        results.push({ user_id: userId, new_orders: newOrders.length, total_fetched: orders.length });
      } catch (userErr) {
        console.error(`[sync-live-orders] Error for user ${userId}:`, userErr);
        results.push({ user_id: userId, error: userErr.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[sync-live-orders] Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
