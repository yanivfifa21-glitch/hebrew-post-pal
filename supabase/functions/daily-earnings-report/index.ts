import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getIsraelHour(): number {
  const now = new Date();
  const tf = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false
  });
  return parseInt(tf.format(now));
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string) {
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

    // Only run at 9:00 Israel time (cron runs every minute)
    const israelHour = getIsraelHour();
    const now = new Date();
    const tf = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', minute: '2-digit', hour12: false
    });
    const israelMinute = parseInt(tf.format(now));
    
    // Only execute at 9:00 (allow 9:00-9:04 window for cron timing)
    if (israelHour !== 9 || israelMinute > 4) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: `Not 9:00 IST (${israelHour}:${israelMinute})` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all users with daily report enabled
    const { data: notifSettings } = await supabase
      .from("earnings_notification_settings")
      .select("*")
      .eq("is_enabled", true)
      .eq("notify_daily_report", true);

    if (!notifSettings || notifSettings.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No users with daily report enabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const settings of notifSettings) {
      try {
        if (!settings.telegram_chat_id) continue;

        // Get bot token - first try user_credentials, then fall back to messaging_accounts
        let botToken: string | null = null;
        const { data: creds } = await supabase.rpc("get_decrypted_user_credentials", { p_user_id: settings.user_id });
        if (creds && !creds.error && creds.telegram_bot_token) {
          botToken = creds.telegram_bot_token;
        } else {
          // Fall back to first active telegram messaging account
          const { data: accounts } = await supabase
            .from("messaging_accounts")
            .select("id")
            .eq("user_id", settings.user_id)
            .eq("account_type", "telegram")
            .eq("is_active", true)
            .limit(1);
          if (accounts && accounts.length > 0) {
            const { data: accCreds } = await supabase.rpc("get_decrypted_messaging_account_credentials", {
              p_account_id: accounts[0].id,
              p_user_id: settings.user_id,
            });
            if (accCreds && !accCreds.error && accCreds.telegram_bot_token) {
              botToken = accCreds.telegram_bot_token;
            }
          }
        }
        if (!botToken) continue;

        // Get orders from last 24 hours
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const { data: recentOrders } = await supabase
          .from("tracked_orders")
          .select("*")
          .eq("user_id", settings.user_id)
          .gte("created_at", yesterday.toISOString());

        const orderCount = recentOrders?.length || 0;
        const totalCommission = (recentOrders || []).reduce(
          (sum: number, o: any) => sum + (parseFloat(o.estimated_commission) || 0), 0
        );
        const totalAmount = (recentOrders || []).reduce(
          (sum: number, o: any) => sum + (parseFloat(o.paid_amount) || 0), 0
        );

        // Build daily report message
        const dateStr = new Intl.DateTimeFormat('he-IL', {
          timeZone: 'Asia/Jerusalem',
          day: 'numeric', month: 'long', year: 'numeric'
        }).format(now);

        let msg = `📊 <b>דו"ח יומי - ${dateStr}</b>\n\n`;
        msg += `🛒 הזמנות ב-24 שעות אחרונות: <b>${orderCount}</b>\n`;
        msg += `💰 סך סכום: <b>$${totalAmount.toFixed(2)}</b>\n`;
        msg += `💎 סך עמלות: <b>$${totalCommission.toFixed(2)}</b>\n`;

        if (orderCount > 0 && recentOrders) {
          msg += `\n📦 <b>פירוט:</b>\n`;
          for (const o of recentOrders.slice(0, 10)) {
            const title = (o.product_title || "מוצר").substring(0, 40);
            msg += `• ${title} — $${(parseFloat(o.estimated_commission) || 0).toFixed(2)}\n`;
          }
          if (recentOrders.length > 10) {
            msg += `... ועוד ${recentOrders.length - 10} הזמנות\n`;
          }
        } else {
          msg += `\nלא היו הזמנות חדשות ב-24 שעות האחרונות.`;
        }

        await sendTelegramMessage(creds.telegram_bot_token, settings.telegram_chat_id, msg);
        results.push({ user_id: settings.user_id, sent: true, orders: orderCount });
      } catch (userErr) {
        console.error(`Daily report error for ${settings.user_id}:`, userErr);
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
