import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ISRAEL TIME LOGIC ---
function getIsraelTimeInfo(): { hours: number; minutes: number; timeStr: string } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  const timeParts = timeFormatter.formatToParts(now);
  const hours = parseInt(timeParts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(timeParts.find(p => p.type === 'minute')?.value || '0');
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  
  return { hours, minutes, timeStr };
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isWithinIntervalTimeRange(currentTimeStr: string, intervalStartTime: string, intervalEndTime: string): boolean {
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(intervalStartTime);
  const endMinutes = timeToMinutes(intervalEndTime);
  
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

// Escape special Markdown characters for Telegram
function escapeMarkdown(text: string): string {
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`');
}

// Message builder
function buildMessage(product: Record<string, unknown>): string {
  const rawTitle = String(product.title ?? "").trim();
  const title = escapeMarkdown(rawTitle);
  const price = product.price ? `₪${Number(product.price).toFixed(2)}` : "";
  const description = String(product.hebrew_description ?? "").trim();
  const affiliateLink = String(product.affiliate_link ?? "").trim();
  
  const parts: string[] = [];
  if (title) parts.push(`🛒 *${title}*`);
  if (price) parts.push(`💰 ${price}`);
  if (description) parts.push(`\n${description}`);
  if (affiliateLink && !description.includes(affiliateLink)) {
    parts.push(`\n🔗 ${affiliateLink}`);
  }
  return parts.join("\n");
}

// Telegram sender
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

// WhatsApp sender
async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Verify JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ success: false, error: "Invalid JWT" }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const userId = claimsData.claims.sub as string;
    console.log(`[start-publishing] User ${userId} triggered immediate publish`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's settings
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "לא נמצאו הגדרות - אנא הגדר את ההגדרות קודם" 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    const intervalStartTime = settings.interval_start_time || '08:00';
    const intervalEndTime = settings.interval_end_time || '22:00';
    const israelTimeInfo = getIsraelTimeInfo();
    const currentTimeStr = israelTimeInfo.timeStr;

    // Check if within time range
    if (!isWithinIntervalTimeRange(currentTimeStr, intervalStartTime, intervalEndTime)) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `מחוץ לטווח שעות - השעה הנוכחית ${currentTimeStr}, טווח: ${intervalStartTime}-${intervalEndTime}` 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Fetch the OLDEST product with status 'Scheduled'
    const { data: product, error: fetchError } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "Scheduled")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `שגיאה בשליפת מוצר: ${fetchError.message}` 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    if (!product) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: "אין מוצרים בתור - הוסף מוצרים לתור קודם" 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Check if product has affiliate link - if not, generate one
    if (!product.affiliate_link) {
      console.log(`[start-publishing] Product ${product.id} has no affiliate link, generating...`);
      
      // Try to generate affiliate link
      const { data: credentials } = await supabase
        .rpc("get_decrypted_user_credentials", { p_user_id: userId });

      const appKey = credentials?.aliexpress_app_key?.trim();
      const appSecret = credentials?.aliexpress_app_secret?.trim();
      const trackingId = settings.aliexpress_tracking_id?.trim() || "TELEGRAM";

      if (!appKey || !appSecret) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: "נא להגדיר את פרטי ה-API של AliExpress בהגדרות" 
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Generate affiliate link using the API
      const affiliateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-affiliate-link`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          productUrl: product.original_url,
          userId: userId
        })
      });

      const affiliateData = await affiliateResponse.json();
      
      if (!affiliateData.success) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: `שגיאה ביצירת קישור שותף: ${affiliateData.error}` 
        }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }

      // Update product with affiliate link
      await supabase
        .from("products")
        .update({ affiliate_link: affiliateData.affiliateLink })
        .eq("id", product.id);

      product.affiliate_link = affiliateData.affiliateLink;
      console.log(`[start-publishing] Generated affiliate link for product ${product.id}`);
    }

    // Lock product
    const { error: lockError } = await supabase
      .from("products")
      .update({ status: "processing" })
      .eq("id", product.id)
      .eq("status", "Scheduled");

    if (lockError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `שגיאה בנעילת מוצר: ${lockError.message}` 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Fetch active messaging accounts
    const { data: accounts, error: accountsError } = await supabase
      .from("messaging_accounts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (accountsError || !accounts || accounts.length === 0) {
      await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "אין חשבונות הודעות פעילים - הוסף חשבון טלגרם או ווטסאפ" 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Build message and send
    const message = buildMessage(product);
    let sendSuccess = false;
    const sentTo: string[] = [];
    const errors: string[] = [];

    for (const account of accounts) {
      const { data: credentials, error: credError } = await supabase
        .rpc("get_decrypted_messaging_account_credentials", { 
          p_account_id: account.id, 
          p_user_id: userId 
        });

      if (credError || !credentials) {
        errors.push(`${account.account_name}: שגיאה בפענוח credentials`);
        continue;
      }

      if (account.account_type === "telegram") {
        const botToken = credentials.telegram_bot_token;
        const chatId = account.telegram_chat_id;

        if (botToken && chatId) {
          try {
            await sendToTelegram(botToken, chatId, product, message);
            sendSuccess = true;
            sentTo.push(`Telegram: ${account.account_name}`);
          } catch (e) {
            errors.push(`Telegram ${account.account_name}: ${e}`);
          }
        } else {
          errors.push(`Telegram ${account.account_name}: חסר token או chat ID`);
        }
      } else if (account.account_type === "whatsapp") {
        const instanceId = credentials.greenapi_instance_id;
        const apiToken = credentials.greenapi_api_token;
        const chatId = account.whatsapp_chat_id;

        if (instanceId && apiToken && chatId) {
          try {
            await sendToWhatsApp(instanceId, apiToken, chatId, product, message);
            sendSuccess = true;
            sentTo.push(`WhatsApp: ${account.account_name}`);
          } catch (e) {
            errors.push(`WhatsApp ${account.account_name}: ${e}`);
          }
        } else {
          errors.push(`WhatsApp ${account.account_name}: חסר instance ID, token או chat ID`);
        }
      }
    }

    // Final status update
    const finalStatus = sendSuccess ? "Sent" : "Scheduled";
    await supabase.from("products").update({ status: finalStatus }).eq("id", product.id);

    if (sendSuccess) {
      // Enable automation if not already enabled
      await supabase
        .from("app_settings")
        .update({ 
          automation_enabled: true,
          posting_interval_minutes: settings.posting_interval_minutes || 30
        })
        .eq("user_id", userId);

      return new Response(JSON.stringify({ 
        success: true, 
        message: `פרסום בוצע בהצלחה! נשלח ל: ${sentTo.join(", ")}`,
        sentTo,
        productTitle: product.title,
        nextPost: `הפרסום הבא בעוד ${settings.posting_interval_minutes || 30} דקות`
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `שליחה נכשלה: ${errors.join("; ")}` 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

  } catch (e) {
    console.error("[start-publishing] Error:", e);
    return new Response(JSON.stringify({ 
      success: false, 
      error: e instanceof Error ? e.message : "שגיאה לא צפויה" 
    }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
