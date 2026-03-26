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

function parseOrder(o: any) {
  const rawPaid = parseFloat(o.paid_amount || o.order_amount || "0");
  const rawCommission = parseFloat(o.estimated_paid_commission || o.estimated_commission || o.new_buyer_bonus_commission || "0");
  return {
    order_id: String(o.order_id || o.order_number || ""),
    product_id: String(o.product_id || ""),
    product_title: o.product_title || o.sub_order_title || "",
    order_status: o.order_status || "unknown",
    paid_amount: rawPaid / 100,
    estimated_commission: rawCommission / 100,
    created_at: o.created_time || o.order_create_time || "",
  };
}

async function fetchRecentOrders(
  appKey: string, appSecret: string, trackingId: string,
  startTime: string, endTime: string
) {
  const allOrders: any[] = [];

  for (const status of ["Payment Completed", "Completed"]) {
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
      page_no: "1",
    };
    params.sign = await generateMd5Signature(params, appSecret);

    const qs = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
    const apiUrl = `https://api-sg.aliexpress.com/sync?${qs}`;

    try {
      const resp = await fetch(apiUrl);
      const data = await resp.json();
      const respBody = data?.aliexpress_affiliate_order_listbyindex_response;
      if (respBody?.resp_result?.resp_code === 200) {
        const orders = respBody.resp_result.result?.orders?.order || [];
        for (const o of orders) {
          allOrders.push(parseOrder(o));
        }
      }
    } catch (e) {
      console.error(`Error fetching ${status}:`, e);
    }
  }

  return allOrders;
}

async function sendTelegramNotification(botToken: string, chatId: string, message: string) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: "HTML",
    }),
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

    // Check auth - support both cron (Bearer anon/service key) and user calls
    const authHeader = req.headers.get("authorization") || "";
    const apiKey = req.headers.get("apikey") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    let isCron = false;
    let targetUserId: string | null = null;

    // If called from cron or service key
    const token = authHeader.replace("Bearer ", "");
    if (token === anonKey || token === supabaseServiceKey || apiKey === anonKey) {
      isCron = true;
    } else {
      // User call
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

    // Get all users with enabled notifications (or specific user)
    let query = supabase.from("earnings_notification_settings").select("*").eq("is_enabled", true);
    if (targetUserId) {
      query = query.eq("user_id", targetUserId);
    }
    const { data: notifSettings } = await query;

    if (!notifSettings || notifSettings.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No users with enabled notifications" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const settings of notifSettings) {
      try {
        // Get user credentials
        const { data: creds } = await supabase.rpc("get_decrypted_user_credentials", { p_user_id: settings.user_id });
        if (!creds || creds.error || !creds.aliexpress_app_key || !creds.aliexpress_app_secret) {
          console.log(`User ${settings.user_id}: missing API credentials`);
          continue;
        }

        // Get tracking ID
        const { data: appSettings } = await supabase
          .from("app_settings")
          .select("aliexpress_tracking_id")
          .eq("user_id", settings.user_id)
          .maybeSingle();
        const trackingId = appSettings?.aliexpress_tracking_id || "";
        if (!trackingId) continue;

        // Fetch orders from last 3 days (AliExpress has ~2 day delay)
        const now = new Date();
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        const startTime = threeDaysAgo.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
        const endTime = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");

        const orders = await fetchRecentOrders(
          creds.aliexpress_app_key, creds.aliexpress_app_secret,
          trackingId, startTime, endTime
        );

        if (orders.length === 0) {
          results.push({ user_id: settings.user_id, new_orders: 0 });
          continue;
        }

        // Check which orders are new
        const { data: existingOrders } = await supabase
          .from("tracked_orders")
          .select("order_id, product_id")
          .eq("user_id", settings.user_id);

        const existingSet = new Set(
          (existingOrders || []).map((e: any) => `${e.order_id}_${e.product_id}`)
        );

        const newOrders = orders.filter(
          (o: any) => !existingSet.has(`${o.order_id}_${o.product_id}`)
        );

        if (newOrders.length > 0) {
          // Insert new orders
          const rows = newOrders.map((o: any) => ({
            user_id: settings.user_id,
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
          if (settings.notify_per_order && settings.telegram_chat_id) {
            // Get bot token from user credentials
            const botToken = creds.telegram_bot_token;
            if (botToken) {
              for (const order of newOrders) {
                const msg = `🛒 <b>הזמנה חדשה!</b>\n\n` +
                  `📦 ${order.product_title || "מוצר"}\n` +
                  `💰 סכום: $${order.paid_amount.toFixed(2)}\n` +
                  `💎 עמלה: $${order.estimated_commission.toFixed(2)}\n` +
                  `📋 סטטוס: ${order.order_status}\n` +
                  `🔢 מזהה: ${order.order_id}`;
                await sendTelegramNotification(botToken, settings.telegram_chat_id, msg);
              }
            }
          }
        }

        // Update last sync time
        await supabase
          .from("earnings_notification_settings")
          .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("user_id", settings.user_id);

        results.push({ user_id: settings.user_id, new_orders: newOrders.length, total_fetched: orders.length });
      } catch (userErr) {
        console.error(`Error for user ${settings.user_id}:`, userErr);
        results.push({ user_id: settings.user_id, error: userErr.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
