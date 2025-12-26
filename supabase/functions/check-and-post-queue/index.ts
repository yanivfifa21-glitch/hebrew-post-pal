import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type LogLevel = "info" | "warn" | "error";

type AutomationLogInsert = {
  user_id: string;
  run_id: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown> | null;
};

function getJerusalemHHMM(now = new Date()): { hhmm: string; totalMinutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const hhmm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { hhmm, totalMinutes: hour * 60 + minute };
}

function matchPostingTime(currentMinutes: number, postingTimes: string[]): string | null {
  for (const t of postingTimes) {
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) continue;
    const target = h * 60 + m;
    const diff = Math.abs(currentMinutes - target);
    if (diff <= 1 || diff >= 24 * 60 - 1) return t;
  }
  return null;
}

function buildMessage(product: Record<string, unknown>): string {
  const parts: string[] = [];

  if (product.title) parts.push(`🔥 *${product.title}*`);
  if (product.hebrew_description) parts.push(String(product.hebrew_description));

  if (product.price) parts.push(`💰 מחיר: $${product.price}`);
  if (product.rating && Number(product.rating) > 0) parts.push(`⭐ דירוג: ${product.rating}`);
  if (product.orders_count && Number(product.orders_count) > 0) parts.push(`📦 הזמנות: ${product.orders_count}`);

  if (product.affiliate_link) parts.push(`\n🔗 ${product.affiliate_link}`);
  else if (product.original_url) parts.push(`\n🔗 ${product.original_url}`);

  return parts.join("\n\n");
}

async function sendToTelegram(
  botToken: string,
  chatId: string,
  product: Record<string, unknown>,
  message: string,
): Promise<void> {
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  const hasImage = Boolean(product.image_url);
  const response = await fetch(hasImage ? `${baseUrl}/sendPhoto` : `${baseUrl}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(
      hasImage
        ? {
          chat_id: chatId,
          photo: product.image_url,
          caption: message.substring(0, 1024),
          parse_mode: "Markdown",
        }
        : {
          chat_id: chatId,
          text: message,
          parse_mode: "Markdown",
        },
    ),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Telegram API error: ${errText}`);
  }
}

async function sendToWhatsApp(
  instanceId: string,
  apiToken: string,
  chatId: string,
  product: Record<string, unknown>,
  message: string,
): Promise<void> {
  let formattedChatId = chatId;
  if (chatId && !chatId.includes("@")) {
    formattedChatId = chatId.includes("-") ? `${chatId}@g.us` : `${chatId}@c.us`;
  }

  const baseUrl = `https://api.green-api.com/waInstance${instanceId}`;
  const hasImage = Boolean(product.image_url);

  const response = await fetch(
    hasImage ? `${baseUrl}/sendFileByUrl/${apiToken}` : `${baseUrl}/sendMessage/${apiToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        hasImage
          ? {
            chatId: formattedChatId,
            urlFile: product.image_url,
            fileName: "deal.jpg",
            caption: message,
          }
          : {
            chatId: formattedChatId,
            message,
          },
      ),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`WhatsApp API error: ${errText}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const runId = crypto.randomUUID();
  const { hhmm, totalMinutes } = getJerusalemHHMM();

  console.log(`[check-and-post-queue] Cron tick. Israel time: ${hhmm}. runId=${runId}`);

  try {
    const { data: settings, error: settingsErr } = await supabase
      .from("app_settings")
      .select("*")
      .eq("automation_enabled", true)
      .not("user_id", "is", null);

    if (settingsErr) {
      console.error("[check-and-post-queue] Settings error:", settingsErr);
      return new Response(JSON.stringify({ success: false, error: settingsErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: unknown[] = [];

    for (const userSettings of settings ?? []) {
      const userId = String(userSettings.user_id);
      const postingTimes: string[] = userSettings.posting_times || [];
      const matchedTime = matchPostingTime(totalMinutes, postingTimes);

      const logs: AutomationLogInsert[] = [];
      const pushLog = (message: string, level: LogLevel, context?: Record<string, unknown>) => {
        logs.push({
          user_id: userId,
          run_id: runId,
          level,
          message,
          context: context ?? null,
        });
      };

      pushLog("Checking Queue", "info", { currentTime: hhmm, postingTimes });

      if (!matchedTime) {
        pushLog("No Post Scheduled", "info", { reason: "Not posting time", currentTime: hhmm });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, status: "skipped", reason: "Not posting time", currentTime: hhmm });
        continue;
      }

      pushLog("Posting slot matched", "info", { matchedTime, currentTime: hhmm });

      // SEQUENTIAL: fetch ONE product only using .single() + error handling for 0 rows
      let product: Record<string, unknown> | null = null;
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("user_id", userId)
          .in("status", ["queued", "scheduled"])
          .order("created_at", { ascending: true })
          .limit(1)
          .single();
        if (error) throw error;
        product = data as unknown as Record<string, unknown>;
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err?.code === "PGRST116" || String(err?.message ?? "").toLowerCase().includes("0 rows")) {
          pushLog("Checking Queue", "info", { result: "No queued post found" });
          await supabase.from("automation_logs").insert(logs);
          results.push({ userId, status: "skipped", reason: "No queued post" });
          continue;
        }
        pushLog("Checking Queue", "error", { errorMessage: err?.message ?? String(e) });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, status: "error", error: err?.message ?? String(e) });
        continue;
      }

      if (!product) {
        pushLog("Checking Queue", "info", { result: "No queued post found" });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, status: "skipped", reason: "No queued post" });
        continue;
      }

      // IMMEDIATE LOCK: mark as sent before sending
      const { data: locked, error: lockErr } = await supabase
        .from("products")
        .update({ status: "sent" })
        .eq("id", String(product.id))
        .in("status", ["queued", "scheduled"])
        .select("*")
        .maybeSingle();

      if (lockErr) {
        pushLog("Lock failed", "error", { productId: product.id, errorMessage: lockErr.message });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, productId: product.id, status: "error", error: lockErr.message });
        continue;
      }

      if (!locked) {
        pushLog("Already locked by another run", "info", { productId: product.id });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, status: "skipped", reason: "Already locked" });
        continue;
      }

      product = locked as unknown as Record<string, unknown>;

      const action = `Sending Post #${product.id}`;
      pushLog(action, "info", { productId: product.id, title: product.title });

      const { data: accounts, error: accountsErr } = await supabase
        .from("messaging_accounts")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (accountsErr) {
        pushLog("Loading accounts", "error", { errorMessage: accountsErr.message });
      }

      const message = buildMessage(product);
      const sendOps: Promise<{ channel: string; ok: boolean; error?: string }>[] = [];

      for (const a of accounts ?? []) {
        if (a.account_type === "telegram" && a.telegram_bot_token && a.telegram_chat_id) {
          sendOps.push(
            sendToTelegram(a.telegram_bot_token, a.telegram_chat_id, product, message)
              .then(() => ({ channel: `telegram:${a.account_name}`, ok: true }))
              .catch((e) => ({ channel: `telegram:${a.account_name}`, ok: false, error: String(e) })),
          );
        }

        if (a.account_type === "whatsapp" && a.greenapi_instance_id && a.greenapi_api_token && a.greenapi_chat_id) {
          sendOps.push(
            sendToWhatsApp(a.greenapi_instance_id, a.greenapi_api_token, a.greenapi_chat_id, product, message)
              .then(() => ({ channel: `whatsapp:${a.account_name}`, ok: true }))
              .catch((e) => ({ channel: `whatsapp:${a.account_name}`, ok: false, error: String(e) })),
          );
        }
      }

      if (sendOps.length === 0) {
        // Revert to queued
        await supabase.from("products").update({ status: "queued" }).eq("id", String(product.id));
        pushLog(action, "error", { errorMessage: "No active accounts – reverted to queued" });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, productId: product.id, status: "failed", error: "No active accounts" });
        continue;
      }

      const settled = await Promise.allSettled(sendOps);
      const ok: string[] = [];
      const failed: string[] = [];

      for (const s of settled) {
        if (s.status === "fulfilled") {
          if (s.value.ok) ok.push(s.value.channel);
          else failed.push(`${s.value.channel}: ${s.value.error}`);
        } else {
          failed.push(`unknown: ${String(s.reason)}`);
        }
      }

      if (ok.length > 0) {
        // Already sent – update channels only
        await supabase.from("products").update({ channels: ok }).eq("id", String(product.id));
        pushLog(`Post #${product.id} SENT`, "info", { channels: ok, failedChannels: failed });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, productId: product.id, status: "sent", channels: ok, failed });
      } else {
        // Revert to queued
        await supabase.from("products").update({ status: "queued" }).eq("id", String(product.id));
        pushLog(action, "error", { errorMessage: failed.join(" | ") + " – reverted to queued" });
        await supabase.from("automation_logs").insert(logs);
        results.push({ userId, productId: product.id, status: "failed", errors: failed });
      }
    }

    return new Response(
      JSON.stringify({ success: true, runId, israelTime: hhmm, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[check-and-post-queue] Fatal error:", e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
