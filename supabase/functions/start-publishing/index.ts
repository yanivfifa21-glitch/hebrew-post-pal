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

// Escape special HTML characters for Telegram
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, '');
}

const COUPON_CODE_BLACKLIST = /^(USD|ILS|NIS|CODE|COUPON|HTTP|HTTPS|COM|WWW|OFF|NEW|TOP|APP|HOT|BIG|BUY|GET|VIP|PRO|MAX|SALE|FREE|BEST|SHOP|DEAL|LINK)$/i;
const PRODUCT_SCAN_BATCH_SIZE = 50;
const PRODUCT_SCAN_TARGET_COUNT = 10;
const PRODUCT_SCAN_MAX_RECORDS = 1000;

function detectCouponSlots(text: string | null): string[] {
  if (!text?.trim()) return [];

  const slots: string[] = [];
  const lines = text.split('\n');
  const couponKeywords = /(?:קופון|קופונים|הקופון|קוד|הקוד|code|coupon|הנחה|discount|promo)/i;
  const codePattern = /[A-Za-z0-9][A-Za-z0-9_-]{2,24}/g;

  for (const line of lines) {
    if (!couponKeywords.test(line)) continue;

    codePattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codePattern.exec(line)) !== null) {
      const code = match[0].toUpperCase();
      if (COUPON_CODE_BLACKLIST.test(code)) continue;
      if (!slots.includes(code)) slots.push(code);
    }
  }

  return slots.slice(0, 2);
}

function hasCouponInText(text: string | null): boolean {
  if (!text?.trim()) return false;
  const couponKeywords = /(?:קופון|קופונים|הקופון|coupon|promo\s*code)/i;
  if (couponKeywords.test(text)) return true;
  return detectCouponSlots(text).length > 0;
}

function hasPublishableMedia(product: any): boolean {
  return typeof product?.image_url === "string" && product.image_url.trim().length > 0;
}

async function fetchEligibleScheduledProducts(
  supabase: any,
  userId: string,
  sendCouponPosts: boolean,
  desiredCount: number = PRODUCT_SCAN_TARGET_COUNT,
): Promise<{ eligibleProducts: any[]; skippedCouponCount: number }> {
  const eligibleProducts: any[] = [];
  let skippedCouponCount = 0;

  for (let from = 0; from < PRODUCT_SCAN_MAX_RECORDS && eligibleProducts.length < desiredCount; from += PRODUCT_SCAN_BATCH_SIZE) {
    const to = Math.min(from + PRODUCT_SCAN_BATCH_SIZE - 1, PRODUCT_SCAN_MAX_RECORDS - 1);
    const { data: batch, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "Scheduled")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!batch || batch.length === 0) break;

    for (const product of batch) {
      if (!hasPublishableMedia(product)) continue;

      if (product.skip_send) continue;

      if (!sendCouponPosts && hasCouponInText(product.hebrew_description)) {
        skippedCouponCount += 1;
        continue;
      }

      eligibleProducts.push(product);
      if (eligibleProducts.length >= desiredCount) break;
    }

    if (batch.length < PRODUCT_SCAN_BATCH_SIZE) break;
  }

  return { eligibleProducts, skippedCouponCount };
}

function buildTelegramPhotoCandidates(imageUrl: string): string[] {
  const candidates = [imageUrl];

  try {
    const url = new URL(imageUrl);
    const publicPrefix = "/storage/v1/object/public/";

    if (url.pathname.includes(publicPrefix)) {
      const renderedUrl = new URL(url.toString());
      renderedUrl.pathname = url.pathname.replace(publicPrefix, "/storage/v1/render/image/public/");
      renderedUrl.searchParams.set("width", "2400");
      renderedUrl.searchParams.set("height", "2400");
      renderedUrl.searchParams.set("resize", "contain");
      renderedUrl.searchParams.set("quality", "85");
      candidates.unshift(renderedUrl.toString());
    }
  } catch (error) {
    console.log(`[start-publishing] Failed to build rendered image URL: ${error}`);
  }

  return Array.from(new Set(candidates));
}

// Message builder - sends ONLY the content the user wrote in the Hebrew description box
function buildMessage(product: Record<string, unknown>): string {
  const rawDescription = String(product.hebrew_description ?? "").trim();
  const description = escapeHtml(rawDescription);
  const affiliateLink = String(product.affiliate_link ?? "").trim();

  const parts: string[] = [];
  if (description) parts.push(description);

  if (affiliateLink && rawDescription && !rawDescription.includes(affiliateLink)) {
    parts.push(`\n🔗 ${affiliateLink}`);
  }

  if (parts.length === 0 && affiliateLink) {
    parts.push(`🔗 ${affiliateLink}`);
  }

  return parts.join("\n");
}

async function sendTelegramTextMessage(token: string, chatId: string, htmlText: string) {
  const attempts = [
    { parseMode: "HTML", text: htmlText },
    { parseMode: null, text: stripHtmlTags(htmlText) },
  ];

  let lastError = "Unknown error";

  for (const attempt of attempts) {
    const body: Record<string, string> = {
      chat_id: chatId,
      text: attempt.text,
    };

    if (attempt.parseMode) {
      body.parse_mode = attempt.parseMode;
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) return;

    lastError = await res.text();
    console.log(`[sendToTelegram] Text-only send failed (${attempt.parseMode ?? 'plain'}): ${lastError}`);
  }

  throw new Error(`שליחת טקסט נכשלה: ${lastError}`);
}

// Telegram sender - uses HTML parse mode, supports video, retries once on failure
async function sendToTelegram(token: string, chatId: string, product: any, text: string) {
  const imageUrl = product.image_url;
  const mediaType = product.media_type || 'image';
  const isVideo = mediaType === 'video' ||
    (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);

  if (imageUrl) {
    const candidateUrls = isVideo ? [imageUrl] : buildTelegramPhotoCandidates(imageUrl);
    const endpoint = `https://api.telegram.org/bot${token}/${isVideo ? 'sendVideo' : 'sendPhoto'}`;
    let lastError = 'Unknown Telegram media error';

    for (const candidateUrl of candidateUrls) {
      try {
        const mediaResponse = await fetch(candidateUrl);
        if (!mediaResponse.ok) throw new Error(`Download failed: ${mediaResponse.status}`);
        const mediaBlob = await mediaResponse.blob();

        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", text);
        formData.append("parse_mode", "HTML");

        if (isVideo) {
          formData.append("video", mediaBlob, "video.mp4");
          formData.append("supports_streaming", "true");
        } else {
          formData.append("photo", mediaBlob, "image.jpg");
        }

        const res = await fetch(endpoint, { method: "POST", body: formData });
        if (res.ok) return;

        lastError = await res.text();
        console.log(`[sendToTelegram] Blob upload failed (${candidateUrl === imageUrl ? 'original' : 'rendered'}): ${lastError}`);
      } catch (dlErr) {
        lastError = String(dlErr);
        console.log(`[sendToTelegram] Blob approach failed (${candidateUrl === imageUrl ? 'original' : 'rendered'}): ${dlErr}`);
      }
    }

    for (const candidateUrl of candidateUrls) {
      const urlBody: any = {
        chat_id: chatId,
        parse_mode: "HTML",
        caption: text,
      };

      if (isVideo) {
        urlBody.video = candidateUrl;
        urlBody.supports_streaming = true;
      } else {
        urlBody.photo = candidateUrl;
      }

      let res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(urlBody),
      });

      if (res.ok) return;

      lastError = await res.text();
      console.log(`[sendToTelegram] URL method failed (${candidateUrl === imageUrl ? 'original' : 'rendered'}), retrying in 2s. Error: ${lastError}`);

      await new Promise(resolve => setTimeout(resolve, 2000));

      res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(urlBody),
      });

      if (res.ok) return;

      lastError = await res.text();
    }

    throw new Error(`שליחת ${isVideo ? 'וידאו' : 'תמונה'} נכשלה: ${lastError}`);
  }
  
  throw new Error("אין מדיה לפוסט - מדלג כדי לא לשלוח טקסט בלבד");
}

// WhatsApp sender - supports video
async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
  if (!chatId.includes("@")) chatId = `${chatId}@${chatId.length > 15 ? "g.us" : "c.us"}`;

  const baseUrl = `https://api.green-api.com/waInstance${instance}`;
  const imageUrl = product.image_url;
  if (!imageUrl?.trim()) throw new Error("אין מדיה לפוסט - מדלג כדי לא לשלוח טקסט בלבד");
  const mediaType = product.media_type || 'image';
  
  // Determine if video based on media_type or file extension
  const isVideo = mediaType === 'video' || 
    (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);
  
  const url = `${baseUrl}/sendFileByUrl/${token}`;

  const body: any = { chatId };
  if (imageUrl) {
    body.urlFile = imageUrl;
    body.fileName = isVideo ? "video.mp4" : "image.jpg";
    body.caption = text;
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

    // Check if coupon posts should be sent
    const sendCouponPosts: boolean = settings.send_coupon_posts !== false;

    let eligibleProducts: any[] = [];
    let skippedCouponCount = 0;

    try {
      ({ eligibleProducts, skippedCouponCount } = await fetchEligibleScheduledProducts(
        supabase,
        userId,
        sendCouponPosts,
      ));
    } catch (fetchError) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: `שגיאה בשליפת מוצר: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    console.log(`[start-publishing] Eligible products found: ${eligibleProducts.length}, skipped coupon products: ${skippedCouponCount}`);

    if (eligibleProducts.length === 0) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: sendCouponPosts
          ? "אין מוצרים בתור - הוסף מוצרים לתור קודם"
          : "אין כרגע פוסטים זמינים בלי קופון בתור"
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
      return new Response(JSON.stringify({ 
        success: false, 
        error: "אין חשבונות הודעות פעילים - הוסף חשבון טלגרם או ווטסאפ" 
      }), { 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Try each eligible product until one succeeds
    const allErrors: string[] = [];

    for (const product of eligibleProducts) {
      console.log(`[start-publishing] Trying product ${product.id}...`);

      // Try to generate affiliate link if missing
      if (!product.affiliate_link) {
        const originalUrl = product.original_url?.trim() || "";
        const isValidAliExpressUrl = originalUrl.includes("aliexpress.com") || 
                                     originalUrl.includes("a.aliexpress.com") || 
                                     originalUrl.includes("s.click.aliexpress.com");
        
        if (isValidAliExpressUrl) {
          console.log(`[start-publishing] Product ${product.id} has no affiliate link, generating...`);
          const { data: credentials } = await supabase.rpc("get_decrypted_user_credentials", { p_user_id: userId });
          const appKey = credentials?.aliexpress_app_key?.trim();
          const appSecret = credentials?.aliexpress_app_secret?.trim();
          if (appKey && appSecret) {
            try {
              const affiliateResponse = await fetch(`${supabaseUrl}/functions/v1/generate-affiliate-link`, {
                method: 'POST',
                headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ productUrl: originalUrl, userId })
              });
              const affiliateData = await affiliateResponse.json();
              if (affiliateData.success) {
                await supabase.from("products").update({ affiliate_link: affiliateData.affiliateLink }).eq("id", product.id);
                product.affiliate_link = affiliateData.affiliateLink;
              }
            } catch (e) {
              console.log(`[start-publishing] Affiliate link generation failed: ${e}`);
            }
          }
        } else {
          console.log(`[start-publishing] Product ${product.id} has non-AliExpress URL, skipping affiliate link generation`);
        }
      }

      // Lock product
      const { data: lockData } = await supabase
        .from("products")
        .update({ status: "processing" })
        .eq("id", product.id)
        .eq("status", "Scheduled")
        .select("id");

      if (!lockData || lockData.length === 0) {
        console.log(`[start-publishing] Product ${product.id} already locked, skipping`);
        continue;
      }

      // Build message and send to all accounts
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

      if (sendSuccess) {
        // Mark product as sent
        await supabase.from("products").update({ status: "Sent" }).eq("id", product.id);

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
        // Unlock product and try next one
        console.log(`[start-publishing] Product ${product.id} failed (${errors.join('; ')}), trying next`);
        await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
        allErrors.push(...errors);
      }
    }

    // All products failed
    return new Response(JSON.stringify({ 
      success: false, 
      error: `כל המוצרים נכשלו: ${allErrors.join("; ")}` 
    }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });

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
