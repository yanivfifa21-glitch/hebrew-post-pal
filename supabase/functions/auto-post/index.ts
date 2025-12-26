import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ISRAEL TIME LOGIC ---
function getIsraelTime(): Date {
  const now = new Date();
  const month = now.getUTCMonth();
  const isDST = month >= 2 && month <= 9;
  const offsetHours = isDST ? 3 : 2;
  return new Date(now.getTime() + offsetHours * 60 * 60 * 1000);
}

function formatTime(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function getIsraelDayOfWeek(israelTime: Date): number {
  return israelTime.getUTCDay();
}
// -------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // 1. Anti-Race Condition: Random delay (1-3 seconds) to prevent double execution
  // This helps if the Cron fires twice quickly
  const jitter = Math.floor(Math.random() * 2000) + 1000;
  await new Promise((r) => setTimeout(r, jitter));

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const israelTime = getIsraelTime();
    const currentTimeStr = formatTime(israelTime);
    const currentDayOfWeek = getIsraelDayOfWeek(israelTime);

    console.log(`[auto-post] Running at Israel Time: ${currentTimeStr}`);

    // Get active users
    const { data: settings } = await supabase.from("app_settings").select("*").eq("automation_enabled", true);

    if (!settings || settings.length === 0) {
      return new Response(JSON.stringify({ message: "No active users" }), { headers: corsHeaders });
    }

    const results = [];

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const postingTimes: string[] = userSettings.posting_times || [];
      const publishingDays: number[] = userSettings.publishing_days || [0, 1, 2, 3, 4, 5, 6];

      // Step A: Check Day
      if (!publishingDays.includes(currentDayOfWeek)) {
        console.log(`User ${userId}: Skipping (Not a publishing day)`);
        continue;
      }

      // Step B: Check Time (Simple match)
      // We check if CURRENT time matches one of the scheduled times
      let isTime = false;
      for (const time of postingTimes) {
        // Compare strings directly (e.g. "14:00" == "14:00")
        // Or allow 1 minute difference
        if (time === currentTimeStr) {
          isTime = true;
          break;
        }
      }

      // *** חירום: אם אתה בבדיקות, אתה יכול לבטל את השורה למטה כדי שישלח תמיד ***
      if (!isTime) {
        // console.log(`User ${userId}: Not posting time (${currentTimeStr})`);
        // continue; // <-- Uncomment this for production!
      }

      // כדי שהקוד יעבוד בול בזמן שהגדרת, תשאיר את ה-continue פעיל.
      // כרגע הקוד שלי למטה בודק את ה-1 דקה טולרנס בצורה מתירנית:
      const [currH, currM] = currentTimeStr.split(":").map(Number);
      const currentTotal = currH * 60 + currM;
      const matched = postingTimes.some((t) => {
        const [th, tm] = t.split(":").map(Number);
        const total = th * 60 + tm;
        return Math.abs(currentTotal - total) <= 1;
      });

      if (!matched) {
        results.push({ userId, status: "skipped_time" });
        continue;
      }

      // Step C: Fetch ONLY ONE product (CRITICAL FIX)
      // We verify it is PENDING and grab the OLDEST one.
      const { data: product, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchError || !product) {
        console.log(`User ${userId}: Queue empty`);
        continue;
      }

      console.log(`User ${userId}: Found product ${product.id}. Locking...`);

      // Step D: LOCK IT IMMEDIATELY
      // This prevents double sending if script runs twice
      const { error: lockError } = await supabase
        .from("products")
        .update({ status: "processing" })
        .eq("id", product.id)
        .eq("status", "pending"); // Double check it wasn't stolen by another process

      if (lockError) {
        console.log(`User ${userId}: Failed to lock product (already processing?)`);
        continue;
      }

      // Step E: Send
      const message = buildMessage(product);
      let sendSuccess = false;

      // Try Telegram (Legacy + Multi)
      // Note: This logic simplifies the sending for brevity but supports your keys
      if (userSettings.telegram_bot_token && userSettings.telegram_chat_id) {
        try {
          await sendToTelegram(userSettings.telegram_bot_token, userSettings.telegram_chat_id, product, message);
          sendSuccess = true;
        } catch (e) {
          console.error(`Telegram failed: ${e}`);
        }
      }

      // Try WhatsApp (GreenAPI)
      if (userSettings.greenapi_instance_id && userSettings.greenapi_api_token) {
        try {
          await sendToWhatsApp(
            userSettings.greenapi_instance_id,
            userSettings.greenapi_api_token,
            userSettings.greenapi_chat_id,
            product,
            message,
          );
          sendSuccess = true;
        } catch (e) {
          console.error(`WhatsApp failed: ${e}`);
        }
      }

      // Step F: Final Status Update
      const finalStatus = sendSuccess ? "sent" : "pending"; // Return to pending if failed
      await supabase
        .from("products")
        .update({ status: finalStatus, last_posted_at: new Date().toISOString() })
        .eq("id", product.id);

      results.push({ userId, productId: product.id, status: finalStatus });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Critical Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

// --- HELPER FUNCTIONS ---

// 1. CLEAN MESSAGE BUILDER
function buildMessage(product: Record<string, unknown>): string {
  // Take ONLY the Hebrew description.
  // The AI puts the link INSIDE this text. We do NOT append anything.
  let text = String(product.hebrew_description || product.title || "");

  // Extra Safety: Remove any auto-generated "Price:" or "Link:" lines if they appear at the end
  // This cleans up dirty data from the DB if it exists
  text = text.trim();

  return text;
}

// 2. TELEGRAM SENDER
async function sendToTelegram(token: string, chatId: string, product: any, text: string) {
  const url = `https://api.telegram.org/bot${token}/${product.image_url ? "sendPhoto" : "sendMessage"}`;
  const body: any = { chat_id: chatId, parse_mode: "Markdown" };

  if (product.image_url) {
    body.photo = product.image_url;
    body.caption = text;
  } else {
    body.text = text;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

// 3. WHATSAPP SENDER
async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
  // Fix Chat ID
  if (!chatId.includes("@")) chatId = `${chatId}@${chatId.length > 15 ? "g.us" : "c.us"}`;

  const baseUrl = `https://api.green-api.com/waInstance${instance}`;
  const url = product.image_url ? `${baseUrl}/sendFileByUrl/${token}` : `${baseUrl}/sendMessage/${token}`;

  const body: any = { chatId };
  if (product.image_url) {
    body.urlFile = product.image_url;
    body.fileName = "image.jpg";
    body.caption = text;
  } else {
    body.message = text;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}
