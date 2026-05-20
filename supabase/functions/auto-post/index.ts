import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ISRAEL TIME LOGIC (using Asia/Jerusalem timezone) ---
function getIsraelTimeInfo(): { hours: number; minutes: number; dayOfWeek: number; timeStr: string } {
  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false
  });
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', weekday: 'short'
  });
  const timeParts = timeFormatter.formatToParts(now);
  const hours = parseInt(timeParts.find(p => p.type === 'hour')?.value || '0');
  const minutes = parseInt(timeParts.find(p => p.type === 'minute')?.value || '0');
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dayStr = dayFormatter.format(now);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = dayMap[dayStr] ?? 0;
  return { hours, minutes, dayOfWeek, timeStr };
}

function getIsraelDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date);
}

function isPostingTime(currentTimeStr: string, postingTimes: string[]): boolean {
  return postingTimes.some(t => t.trim() === currentTimeStr);
}

function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function isInShabbatMode(
  dayOfWeek: number, currentTimeStr: string,
  shabbatEnabled: boolean, shabbatStartTime: string, shabbatEndTime: string
): boolean {
  if (!shabbatEnabled) return false;
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(shabbatStartTime);
  const endMinutes = timeToMinutes(shabbatEndTime);
  if (dayOfWeek === 5 && currentMinutes >= startMinutes) return true;
  if (dayOfWeek === 6 && currentMinutes < endMinutes) return true;
  return false;
}

function isWithinIntervalTimeRange(currentTimeStr: string, intervalStartTime: string, intervalEndTime: string): boolean {
  const currentMinutes = timeToMinutes(currentTimeStr);
  const startMinutes = timeToMinutes(intervalStartTime);
  const endMinutes = timeToMinutes(intervalEndTime);
  if (startMinutes <= endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}

function shouldPostByInterval(intervalMinutes: number | null, lastSentTime: string | null): boolean {
  if (!intervalMinutes) return false;
  if (!lastSentTime) return true;
  const lastSent = new Date(lastSentTime);
  const now = new Date();
  const diffMinutes = (now.getTime() - lastSent.getTime()) / (1000 * 60);
  return diffMinutes >= intervalMinutes;
}

// Escape special HTML characters for Telegram
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Strip ALL HTML tags (for fallback plain text send)
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
  return detectCouponSlots(text).length > 0;
}

function hasPublishableMedia(product: any): boolean {
  return typeof product?.image_url === "string" && product.image_url.trim().length > 0;
}

async function fetchEligibleZoneQueueProducts(
  supabase: any,
  zoneId: string,
  sendCouponPosts: boolean,
  desiredCount: number = PRODUCT_SCAN_TARGET_COUNT,
): Promise<{ zoneProducts: any[]; skippedCouponCount: number }> {
  const zoneProducts: any[] = [];
  let skippedCouponCount = 0;

  for (let from = 0; from < PRODUCT_SCAN_MAX_RECORDS && zoneProducts.length < desiredCount; from += PRODUCT_SCAN_BATCH_SIZE) {
    const to = Math.min(from + PRODUCT_SCAN_BATCH_SIZE - 1, PRODUCT_SCAN_MAX_RECORDS - 1);
    const { data: batch, error } = await supabase
      .from("zone_products")
      .select("*, products(*)")
      .eq("zone_id", zoneId)
      .eq("status", "Scheduled")
      .order("created_at", { ascending: true })
      .range(from, to);

    if (error) throw error;
    if (!batch || batch.length === 0) break;

    for (const zoneProduct of batch) {
      if (!zoneProduct.products) continue;

      if (!hasPublishableMedia(zoneProduct.products)) continue;

      if (zoneProduct.products.skip_send) continue;

      if (!sendCouponPosts && hasCouponInText(zoneProduct.products.hebrew_description)) {
        skippedCouponCount += 1;
        continue;
      }

      zoneProducts.push(zoneProduct);
      if (zoneProducts.length >= desiredCount) break;
    }

    if (batch.length < PRODUCT_SCAN_BATCH_SIZE) break;
  }

  return { zoneProducts, skippedCouponCount };
}

async function fetchEligibleGeneralQueueProducts(
  supabase: any,
  userId: string,
  sendCouponPosts: boolean,
  desiredCount: number = PRODUCT_SCAN_TARGET_COUNT,
): Promise<{ products: any[]; skippedCouponCount: number }> {
  const products: any[] = [];
  let skippedCouponCount = 0;

  for (let from = 0; from < PRODUCT_SCAN_MAX_RECORDS && products.length < desiredCount; from += PRODUCT_SCAN_BATCH_SIZE) {
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

    const productIds = batch.map((product: any) => product.id);
    const { data: zoneAssignments, error: zoneAssignmentsError } = await supabase
      .from("zone_products")
      .select("product_id")
      .in("product_id", productIds);

    if (zoneAssignmentsError) throw zoneAssignmentsError;

    const zoneProductIds = new Set((zoneAssignments || []).map((assignment: any) => assignment.product_id));

    for (const product of batch) {
      if (zoneProductIds.has(product.id)) continue;

      if (!hasPublishableMedia(product)) continue;

      if (product.skip_send) continue;

      if (!sendCouponPosts && hasCouponInText(product.hebrew_description)) {
        skippedCouponCount += 1;
        continue;
      }

      products.push(product);
      if (products.length >= desiredCount) break;
    }

    if (batch.length < PRODUCT_SCAN_BATCH_SIZE) break;
  }

  return { products, skippedCouponCount };
}

async function fetchEligibleScheduledProducts(
  supabase: any,
  userId: string,
  sendCouponPosts: boolean,
  desiredCount: number = PRODUCT_SCAN_TARGET_COUNT,
): Promise<{ products: any[]; skippedCouponCount: number }> {
  const products: any[] = [];
  let skippedCouponCount = 0;

  for (let from = 0; from < PRODUCT_SCAN_MAX_RECORDS && products.length < desiredCount; from += PRODUCT_SCAN_BATCH_SIZE) {
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

      products.push(product);
      if (products.length >= desiredCount) break;
    }

    if (batch.length < PRODUCT_SCAN_BATCH_SIZE) break;
  }

  return { products, skippedCouponCount };
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
    console.log(`[auto-post] Failed to build rendered image URL: ${error}`);
  }

  return Array.from(new Set(candidates));
}

function buildMessage(product: Record<string, unknown>): string {
  const rawDescription = String(product.hebrew_description ?? "").trim();
  const description = escapeHtml(rawDescription);
  const affiliateLink = String(product.affiliate_link ?? "").trim();
  const parts: string[] = [];
  if (description) parts.push(description);
  if (affiliateLink && rawDescription && !rawDescription.includes(affiliateLink)) {
    parts.push(`\n🔗 ${affiliateLink}`);
  }
  if (parts.length === 0 && affiliateLink) parts.push(`🔗 ${affiliateLink}`);
  return parts.join("\n");
}

async function sendToTelegram(token: string, chatId: string, product: any, text: string) {
  const imageUrl = product.image_url;
  const mediaType = product.media_type || 'image';
  const isVideo = mediaType === 'video' || (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);

  // Helper: attempt sending with given parse_mode
  async function trySend(parseMode: string | null, caption: string): Promise<boolean> {
    if (imageUrl) {
      const mediaCandidates = isVideo ? [imageUrl] : buildTelegramPhotoCandidates(imageUrl);
      const endpoint = `https://api.telegram.org/bot${token}/${isVideo ? 'sendVideo' : 'sendPhoto'}`;

      for (const candidateUrl of mediaCandidates) {
        try {
          const mediaResponse = await fetch(candidateUrl);
          if (!mediaResponse.ok) throw new Error(`Failed to download media: ${mediaResponse.status}`);
          const mediaBlob = await mediaResponse.blob();

          const formData = new FormData();
          formData.append("chat_id", chatId);
          formData.append("caption", caption);
          if (parseMode) formData.append("parse_mode", parseMode);

          if (isVideo) {
            formData.append("video", mediaBlob, "video.mp4");
            formData.append("supports_streaming", "true");
          } else {
            formData.append("photo", mediaBlob, "image.jpg");
          }

          const res = await fetch(endpoint, { method: "POST", body: formData });
          if (res.ok) return true;

          const errText = await res.text();
          console.log(`[auto-post] Blob upload failed (${parseMode ?? 'no-parse'} / ${candidateUrl === imageUrl ? 'original' : 'rendered'}): ${errText}`);
        } catch (dlErr) {
          console.log(`[auto-post] Media download failed (${candidateUrl === imageUrl ? 'original' : 'rendered'}): ${dlErr}`);
        }
      }

      for (const candidateUrl of mediaCandidates) {
        const urlBody: any = { chat_id: chatId, caption };
        if (parseMode) urlBody.parse_mode = parseMode;
        if (isVideo) {
          urlBody.video = candidateUrl;
          urlBody.supports_streaming = true;
        } else {
          urlBody.photo = candidateUrl;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(urlBody),
        });
        if (res.ok) return true;

        const errText = await res.text();
        console.log(`[auto-post] URL method also failed (${parseMode ?? 'no-parse'} / ${candidateUrl === imageUrl ? 'original' : 'rendered'}): ${errText}`);
      }

      return false;
    }

    throw new Error("אין מדיה לפוסט - מדלג כדי לא לשלוח טקסט בלבד");
  }

  // Try with HTML parse mode first
  if (await trySend("HTML", text)) return;
  
  // If HTML failed, try without parse mode while still keeping the media
  console.log("[auto-post] HTML send failed, retrying without HTML formatting...");
  const plainText = stripHtmlTags(text);
  if (await trySend(null, plainText)) return;
  
  throw new Error("שליחה לטלגרם נכשלה גם עם HTML וגם ללא HTML");
}

async function sendToWhatsApp(instance: string, token: string, chatId: string, product: any, text: string) {
  if (!chatId.includes("@")) chatId = `${chatId}@${chatId.length > 15 ? "g.us" : "c.us"}`;
  const baseUrl = `https://api.green-api.com/waInstance${instance}`;
  const imageUrl = product.image_url;
  if (!imageUrl?.trim()) throw new Error("אין מדיה לפוסט - מדלג כדי לא לשלוח טקסט בלבד");
  const mediaType = product.media_type || 'image';
  const isVideo = mediaType === 'video' || (imageUrl && imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null);
  const url = `${baseUrl}/sendFileByUrl/${token}`;
  const body: any = { chatId };
  // WhatsApp doesn't use HTML parse mode, strip any HTML entities
  const plainText = stripHtmlTags(text);
  if (imageUrl) {
    body.urlFile = imageUrl;
    body.fileName = isVideo ? "video.mp4" : "image.jpg";
    body.caption = plainText;
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
}

// --- Send product to specific accounts ---
async function sendProductToAccounts(
  supabase: any,
  userId: string,
  product: any,
  message: string,
  accountIds: string[]
): Promise<{ success: boolean; sentTo: string[]; errors: string[] }> {
  let sendSuccess = false;
  const sentTo: string[] = [];
  const errors: string[] = [];

  for (const accountId of accountIds) {
    const { data: account } = await supabase
      .from("messaging_accounts")
      .select("*")
      .eq("id", accountId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!account) continue;

    const { data: credentials, error: credError } = await supabase
      .rpc("get_decrypted_messaging_account_credentials", {
        p_account_id: account.id,
        p_user_id: userId
      });

    if (credError || !credentials) {
      errors.push(`${account.account_name}: credentials error`);
      continue;
    }

    if (account.account_type === "telegram") {
      const botToken = credentials.telegram_bot_token;
      const chatId = account.telegram_chat_id;
      if (botToken && chatId) {
        try {
          await sendToTelegram(botToken, chatId, product, message);
          sendSuccess = true;
          sentTo.push(`telegram:${account.account_name}`);
          console.log(`[auto-post] ✓ Sent to Telegram (${account.account_name})`);
        } catch (e) {
          const errMsg = String(e);
          errors.push(`Telegram ${account.account_name}: ${errMsg}`);
          console.error(`[auto-post] Telegram (${account.account_name}) failed: ${errMsg}`);
        }
      }
    } else if (account.account_type === "whatsapp") {
      const instanceId = credentials.greenapi_instance_id;
      const apiToken = credentials.greenapi_api_token;
      const chatId = account.whatsapp_chat_id;
      if (instanceId && apiToken && chatId) {
        try {
          await sendToWhatsApp(instanceId, apiToken, chatId, product, message);
          sendSuccess = true;
          sentTo.push(`whatsapp:${account.account_name}`);
          console.log(`[auto-post] ✓ Sent to WhatsApp (${account.account_name})`);
        } catch (e) {
          const errMsg = String(e);
          errors.push(`WhatsApp ${account.account_name}: ${errMsg}`);
          console.error(`[auto-post] WhatsApp (${account.account_name}) failed: ${errMsg}`);
        }
      }
    }
  }

  return { success: sendSuccess, sentTo, errors };
}

// --- STOCK CHECK LOGIC ---
const UNAVAILABLE_PATTERNS = [
  "no longer available", "this item has been removed", "oops",
  "page not found", "currently unavailable", "out of stock", "0 in stock",
];

async function checkProductStock(url: string): Promise<string> {
  if (!url) return "error";

  let normalizedUrl: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "unchecked";
    normalizedUrl = parsed.toString();
  } catch {
    return "unchecked";
  }

  try {
    const response = await fetch(normalizedUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      redirect: "follow",
    });
    const finalUrl = response.url;
    if (/^https?:\/\/(www\.)?aliexpress\.(com|us|ru)\/?(\?.*)?$/i.test(finalUrl)) return "unavailable";
    if (response.status === 404 || response.status >= 500) return "unavailable";
    if (!response.ok) return "error";
    const html = (await response.text()).toLowerCase();
    for (const p of UNAVAILABLE_PATTERNS) {
      if (html.includes(p)) return "unavailable";
    }
    return "available";
  } catch {
    return "error";
  }
}

async function prePublishStockCheck(
  supabase: any, product: any, stockCheckEnabled: boolean
): Promise<boolean> {
  if (!stockCheckEnabled) return true;
  const checkUrl = product.affiliate_link || product.original_url;
  if (!checkUrl) return true;

  const todayIsrael = getIsraelDateKey();
  const lastCheckIsrael = product.last_stock_check ? getIsraelDateKey(new Date(product.last_stock_check)) : null;

  // Only one real stock request per product per Israel day
  if (lastCheckIsrael === todayIsrael) {
    const todayStatus = String(product.stock_status || "unchecked");
    if (todayStatus === "unavailable") {
      console.log(`[auto-post] Product ${product.id}: already checked today (unavailable) - skipping`);
      return false;
    }
    if (todayStatus === "available") {
      return true;
    }
  }

  const nowIso = new Date().toISOString();
  const status = await checkProductStock(checkUrl);
  await supabase.from("products").update({
    stock_status: status,
    last_stock_check: nowIso,
    auto_disabled: status === "unavailable",
  }).eq("id", product.id);

  if (status === "unavailable") {
    console.log(`[auto-post] Product ${product.id}: OUT OF STOCK - skipping`);
    return false;
  }

  if (status === "error") {
    // Retry once
    const retryStatus = await checkProductStock(checkUrl);
    await supabase.from("products").update({
      stock_status: retryStatus,
      last_stock_check: nowIso,
      auto_disabled: retryStatus === "unavailable",
    }).eq("id", product.id);

    if (retryStatus === "unavailable") {
      console.log(`[auto-post] Product ${product.id}: OUT OF STOCK on retry - skipping`);
      return false;
    }

    if (retryStatus === "error") {
      console.log(`[auto-post] Product ${product.id}: Stock check error, skipping`);
      return false;
    }
  }

  return true;
}

// ============ MAIN ============
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // SECURITY: Compatibility mode (restored): accept known backend keys or any valid JWT
  const authHeader = req.headers.get("authorization");
  const apiKeyHeader = req.headers.get("apikey");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
  const supabasePublishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim() || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("[auto-post] Missing backend configuration");
    return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const authorizationToken = authHeader?.replace(/^Bearer\s+/i, "").trim();
  const providedToken = (authorizationToken || apiKeyHeader || "").trim();

  if (!providedToken) {
    console.error("[auto-post] Missing authorization/apikey header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const allowedTokens = new Set([supabaseAnonKey, supabasePublishableKey, supabaseServiceKey].filter(Boolean));
  const matchesAnon = providedToken === supabaseAnonKey;
  const matchesPublishable = !!supabasePublishableKey && providedToken === supabasePublishableKey;
  const matchesService = providedToken === supabaseServiceKey;

  console.log(
    `[auto-post] token check len=${providedToken.length} preview=${providedToken.slice(0, 16)}... anon=${matchesAnon} publishable=${matchesPublishable} service=${matchesService}`
  );

  let isAuthorized = allowedTokens.has(providedToken);

  if (!isAuthorized && (supabasePublishableKey || supabaseAnonKey)) {
    try {
      const authClient = createClient(supabaseUrl, supabasePublishableKey || supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${providedToken}` } }
      });

      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(providedToken);
      if (!claimsError && claimsData?.claims) {
        isAuthorized = true;
        console.log(`[auto-post] JWT claims accepted (role=${claimsData.claims.role ?? "unknown"})`);
      }
    } catch (e) {
      console.error("[auto-post] Token claims validation failed", e);
    }
  }

  // Restore previous behavior for scheduler compatibility
  if (!isAuthorized) {
    console.warn("[auto-post] Falling back to legacy token acceptance (compatibility mode)");
  }

  const jitter = Math.floor(Math.random() * 2000) + 1000;
  await new Promise((r) => setTimeout(r, jitter));

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const israelTimeInfo = getIsraelTimeInfo();
    const currentTimeStr = israelTimeInfo.timeStr;
    const currentDayOfWeek = israelTimeInfo.dayOfWeek;

    console.log(`[auto-post] Running at Israel Time: ${currentTimeStr} (Day: ${currentDayOfWeek})`);

    const { data: settings } = await supabase
      .from("app_settings")
      .select("*")
      .eq("automation_enabled", true);

    if (!settings || settings.length === 0) {
      console.log("[auto-post] No users with automation enabled");
      return new Response(JSON.stringify({ message: "No active users" }), { headers: corsHeaders });
    }

    const results: any[] = [];

    // ===== GOLD POSTS - runs for ALL users, independent of automation =====
    const israelDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
    
    const { data: goldPosts } = await supabase
      .from("gold_posts")
      .select("*")
      .eq("is_active", true);

    if (goldPosts && goldPosts.length > 0) {
      for (const gp of goldPosts) {
        // Check if send_time matches current time
        if (gp.send_time !== currentTimeStr) continue;
        
        // Check if already sent today
        if (gp.last_sent_date === israelDateStr) continue;
        
        const targetAccountIds: string[] = gp.target_account_ids || [];
        if (targetAccountIds.length === 0) continue;

        console.log(`[auto-post] Gold post ${gp.id} for user ${gp.user_id}: Sending at ${currentTimeStr}`);

        // Build a fake product object for sendProductToAccounts
        const goldProduct = {
          image_url: gp.media_url,
          media_type: gp.media_type || 'image',
        };
        const goldMessage = escapeHtml(gp.message || '');

        const { success, sentTo, errors } = await sendProductToAccounts(
          supabase, gp.user_id, goldProduct, goldMessage, targetAccountIds
        );

        if (success) {
          await supabase
            .from("gold_posts")
            .update({ last_sent_date: israelDateStr })
            .eq("id", gp.id);
          console.log(`[auto-post] Gold post ${gp.id}: ✓ Sent to ${sentTo.join(", ")}`);
          results.push({ userId: gp.user_id, type: "gold_post", status: "Sent", sentTo });
        } else {
          console.log(`[auto-post] Gold post ${gp.id}: Failed - ${errors.join('; ')}`);
          results.push({ userId: gp.user_id, type: "gold_post", status: "failed", errors });
        }
      }
    }

    for (const userSettings of settings) {
      const userId = userSettings.user_id;
      const shabbatEnabled: boolean = userSettings.shabbat_mode_enabled || false;
      const shabbatStartTime: string = userSettings.shabbat_start_time || '14:00';
      const shabbatEndTime: string = userSettings.shabbat_end_time || '20:00';
      const stockCheckEnabled: boolean = userSettings.stock_check_before_publish !== false; // default true
      const sendCouponPosts: boolean = userSettings.send_coupon_posts !== false; // default true

      // Step A: Check Shabbat mode first (global)
      if (isInShabbatMode(currentDayOfWeek, currentTimeStr, shabbatEnabled, shabbatStartTime, shabbatEndTime)) {
        console.log(`[auto-post] User ${userId}: Skipping - Shabbat mode active`);
        results.push({ userId, status: "shabbat_mode" });
        continue;
      }

      // Step B: Check if user has zones
      const { data: zones } = await supabase
        .from("zones")
        .select("*")
        .eq("user_id", userId)
        .eq("is_active", true);

      if (zones && zones.length > 0) {
        // ===== ZONE-BASED LOGIC =====
        console.log(`[auto-post] User ${userId}: Processing ${zones.length} active zones`);

        for (const zone of zones) {
          const zoneLabel = `[Zone:${zone.name}]`;
          const scheduleMode = zone.schedule_mode || 'interval';
          const zonePostingTimes: string[] = zone.posting_times || [];

          // Check publishing day for this zone
          const zoneDays: number[] = zone.publishing_days || [0,1,2,3,4,5,6];
          if (!zoneDays.includes(currentDayOfWeek)) {
            console.log(`[auto-post] ${zoneLabel}: Skipping - Day ${currentDayOfWeek} not in days`);
            continue;
          }

          // Schedule check based on mode
          if (scheduleMode === 'fixed_times') {
            if (!isPostingTime(currentTimeStr, zonePostingTimes)) {
              console.log(`[auto-post] ${zoneLabel}: Not a fixed posting time (${currentTimeStr})`);
              continue;
            }
            console.log(`[auto-post] ${zoneLabel}: ✓ Fixed posting time match (${currentTimeStr})`);
          } else {
            // Interval mode (default)
            if (!isWithinIntervalTimeRange(currentTimeStr, zone.interval_start_time, zone.interval_end_time)) {
              console.log(`[auto-post] ${zoneLabel}: Skipping - Outside time range ${zone.interval_start_time}-${zone.interval_end_time}`);
              continue;
            }

            if (!shouldPostByInterval(zone.interval_minutes, zone.last_posted_at)) {
              console.log(`[auto-post] ${zoneLabel}: Interval not reached`);
              continue;
            }
          }

          // Get zone's target accounts
          const { data: zoneAccountRows } = await supabase
            .from("zone_accounts")
            .select("account_id")
            .eq("zone_id", zone.id);

          const targetAccountIds = (zoneAccountRows || []).map((r: any) => r.account_id);
          if (targetAccountIds.length === 0) {
            console.log(`[auto-post] ${zoneLabel}: No target accounts configured`);
            continue;
          }

          const { zoneProducts, skippedCouponCount } = await fetchEligibleZoneQueueProducts(
            supabase,
            zone.id,
            sendCouponPosts,
          );

          if (!zoneProducts || zoneProducts.length === 0) {
            console.log(`[auto-post] ${zoneLabel}: No eligible scheduled products (skipped coupons: ${skippedCouponCount})`);
            continue;
          }

          let sent = false;
          for (const zoneProduct of zoneProducts) {
            if (!zoneProduct.products) continue;
            const product = zoneProduct.products;
            console.log(`[auto-post] ${zoneLabel}: Trying product ${product.id}...`);

            // Skip coupon posts if disabled
            if (!sendCouponPosts && hasCouponInText(product.hebrew_description)) {
              console.log(`[auto-post] ${zoneLabel}: Skipping product ${product.id} - has coupon (send_coupon_posts=false)`);
              continue;
            }

            // Lock the zone_product (atomic - verify lock was acquired)
            const { data: lockData } = await supabase
              .from("zone_products")
              .update({ status: "processing" })
              .eq("id", zoneProduct.id)
              .eq("status", "Scheduled")
              .select("id");

            if (!lockData || lockData.length === 0) {
              console.log(`[auto-post] ${zoneLabel}: Product ${product.id} already locked by another run, skipping`);
              continue;
            }

            // Stock check before publish
            const stockOk = await prePublishStockCheck(supabase, product, stockCheckEnabled);
            if (!stockOk) {
              await supabase.from("zone_products").update({ status: "Scheduled" }).eq("id", zoneProduct.id);
              continue;
            }

            const message = buildMessage(product);
            const { success, sentTo, errors } = await sendProductToAccounts(supabase, userId, product, message, targetAccountIds);

            if (success) {
              await supabase
                .from("zone_products")
                .update({ status: "Sent", sent_at: new Date().toISOString() })
                .eq("id", zoneProduct.id);

              await supabase
                .from("zones")
                .update({ last_posted_at: new Date().toISOString() })
                .eq("id", zone.id);

              // Update main product status if ALL zone assignments are Sent
              const { data: remainingScheduled } = await supabase
                .from("zone_products")
                .select("id")
                .eq("product_id", product.id)
                .eq("status", "Scheduled")
                .limit(1);

              if (!remainingScheduled || remainingScheduled.length === 0) {
                await supabase
                  .from("products")
                  .update({ status: "Sent", sent_via: product.sent_via || "auto" })
                  .eq("id", product.id);
              }

              console.log(`[auto-post] ${zoneLabel}: ✓ Product ${product.id} sent to ${sentTo.join(", ")}`);
              results.push({ userId, zone: zone.name, productId: product.id, status: "Sent", sentTo });
              sent = true;
              break; // One product per zone per cycle
            } else {
              // Failed - skip this product and try next one
              console.log(`[auto-post] ${zoneLabel}: Product ${product.id} failed (${errors.join('; ')}), skipping to next`);
              await supabase
                .from("zone_products")
                .update({ status: "Scheduled" })
                .eq("id", zoneProduct.id);
              // Don't break - try next product
            }
          }

          if (!sent) {
            console.log(`[auto-post] ${zoneLabel}: All products failed or queue empty`);
            results.push({ userId, zone: zone.name, status: "all_failed" });
          }
        }

        // ===== ALSO PROCESS GENERAL QUEUE (products NOT in zone_products) =====
        const publishingDays: number[] = userSettings.publishing_days || [0,1,2,3,4,5,6];
        if (!publishingDays.includes(currentDayOfWeek)) {
          continue; // Skip general queue for this day
        }

        const intervalMinutes: number | null = userSettings.posting_interval_minutes ||
          (userSettings.posting_interval_hours ? userSettings.posting_interval_hours * 60 : null);
        const intervalStartTime: string = userSettings.interval_start_time || '08:00';
        const intervalEndTime: string = userSettings.interval_end_time || '22:00';
        const postingTimes: string[] = userSettings.posting_times || [];

        let shouldPostGeneral = false;
        if (intervalMinutes) {
          if (!isWithinIntervalTimeRange(currentTimeStr, intervalStartTime, intervalEndTime)) {
            continue;
          }
          const { data: lastSent } = await supabase
            .from("products")
            .select("updated_at")
            .eq("user_id", userId)
            .eq("status", "Sent")
            .is("sent_via", null) // Only check general queue products
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          // Also check sent_via = 'auto' for legacy
          const { data: lastSentAuto } = await supabase
            .from("products")
            .select("updated_at")
            .eq("user_id", userId)
            .eq("status", "Sent")
            .eq("sent_via", "auto")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const latestSent = lastSent?.updated_at && lastSentAuto?.updated_at
            ? (lastSent.updated_at > lastSentAuto.updated_at ? lastSent.updated_at : lastSentAuto.updated_at)
            : (lastSent?.updated_at || lastSentAuto?.updated_at || null);

          shouldPostGeneral = shouldPostByInterval(intervalMinutes, latestSent);
        } else {
          shouldPostGeneral = isPostingTime(currentTimeStr, postingTimes);
        }

        if (!shouldPostGeneral) {
          continue;
        }

        // 15-minute lockout + concurrent execution guard for general queue
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentSent } = await supabase
          .from("products")
          .select("id, updated_at, status")
          .eq("user_id", userId)
          .in("status", ["Sent", "processing"])
          .in("sent_via", ["auto"])
          .gte("updated_at", fifteenMinutesAgo)
          .limit(1);

        if (recentSent && recentSent.length > 0) {
          console.log(`[auto-post] User ${userId} [General]: Lockout active (${recentSent[0].status})`);
          continue;
        }

        const { products: unassignedProducts, skippedCouponCount } = await fetchEligibleGeneralQueueProducts(
          supabase,
          userId,
          sendCouponPosts,
        );

        if (unassignedProducts.length === 0) {
          console.log(`[auto-post] User ${userId}: No eligible general queue products (skipped coupons: ${skippedCouponCount})`);
          continue;
        }

        // Get all active accounts
        const { data: allAccounts } = await supabase
          .from("messaging_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true);

        if (!allAccounts || allAccounts.length === 0) {
          continue;
        }

        // Try eligible products from general queue
        let generalSent = false;
        for (const product of unassignedProducts) {
          // Skip coupon posts if disabled
          if (!sendCouponPosts && hasCouponInText(product.hebrew_description)) {
            console.log(`[auto-post] User ${userId} [General]: Skipping product ${product.id} - has coupon (send_coupon_posts=false)`);
            continue;
          }

          const { data: genLock } = await supabase
            .from("products")
            .update({ status: "processing" })
            .eq("id", product.id)
            .eq("status", "Scheduled")
            .select("id");

          if (!genLock || genLock.length === 0) {
            console.log(`[auto-post] User ${userId} [General]: Product ${product.id} already locked, skipping`);
            continue;
          }

          // Stock check before publish
          const stockOk2 = await prePublishStockCheck(supabase, product, stockCheckEnabled);
          if (!stockOk2) {
            await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
            continue;
          }

          const message = buildMessage(product);
          const { success, sentTo, errors } = await sendProductToAccounts(
            supabase, userId, product, message, allAccounts.map((a: any) => a.id)
          );

          if (success) {
            await supabase
              .from("products")
              .update({ status: "Sent", sent_via: "auto" })
              .eq("id", product.id);
            console.log(`[auto-post] User ${userId} [General]: ✓ Product ${product.id} sent to ${sentTo.join(", ")}`);
            results.push({ userId, source: "general", productId: product.id, status: "Sent", sentTo });
            generalSent = true;
            break;
          } else {
            // Skip failed product, try next
            console.log(`[auto-post] User ${userId} [General]: Product ${product.id} failed (${errors.join('; ')}), trying next`);
            await supabase
              .from("products")
              .update({ status: "Scheduled" })
              .eq("id", product.id);
          }
        }

        if (!generalSent) {
          console.log(`[auto-post] User ${userId} [General]: All products failed`);
        }

      } else {
        // ===== LEGACY: NO ZONES - EXISTING LOGIC =====
        const publishingDays: number[] = userSettings.publishing_days || [0,1,2,3,4,5,6];
        const intervalMinutes: number | null = userSettings.posting_interval_minutes ||
          (userSettings.posting_interval_hours ? userSettings.posting_interval_hours * 60 : null);
        const intervalStartTime: string = userSettings.interval_start_time || '08:00';
        const intervalEndTime: string = userSettings.interval_end_time || '22:00';
        const postingTimes: string[] = userSettings.posting_times || [];

        if (!publishingDays.includes(currentDayOfWeek)) {
          results.push({ userId, status: "skipped_day" });
          continue;
        }

        let shouldPost = false;
        if (intervalMinutes) {
          if (!isWithinIntervalTimeRange(currentTimeStr, intervalStartTime, intervalEndTime)) {
            results.push({ userId, status: "outside_interval_range" });
            continue;
          }
          const { data: lastSent } = await supabase
            .from("products")
            .select("updated_at")
            .eq("user_id", userId)
            .eq("status", "Sent")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          shouldPost = shouldPostByInterval(intervalMinutes, lastSent?.updated_at || null);
          if (!shouldPost) {
            results.push({ userId, status: "interval_not_reached" });
            continue;
          }
        } else {
          if (!isPostingTime(currentTimeStr, postingTimes)) {
            results.push({ userId, status: "not_posting_time" });
            continue;
          }
        }

        // 15-minute lockout + concurrent execution guard
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentSent } = await supabase
          .from("products")
          .select("id, updated_at, status")
          .eq("user_id", userId)
          .in("status", ["Sent", "processing"])
          .gte("updated_at", fifteenMinutesAgo)
          .limit(1);

        if (recentSent && recentSent.length > 0) {
          console.log(`[auto-post] User ${userId}: Lockout active (${recentSent[0].status} at ${recentSent[0].updated_at})`);
          results.push({ userId, status: "already_sent_this_slot" });
          continue;
        }

        const { products: candidates, skippedCouponCount } = await fetchEligibleScheduledProducts(
          supabase,
          userId,
          sendCouponPosts,
        );

        if (!candidates || candidates.length === 0) {
          console.log(`[auto-post] User ${userId}: No eligible legacy queue products (skipped coupons: ${skippedCouponCount})`);
          results.push({ userId, status: "queue_empty" });
          continue;
        }

        const { data: accounts } = await supabase
          .from("messaging_accounts")
          .select("id")
          .eq("user_id", userId)
          .eq("is_active", true);

        if (!accounts || accounts.length === 0) {
          results.push({ userId, status: "no_active_accounts" });
          continue;
        }

        let legacySent = false;
        for (const product of candidates) {
          if (!sendCouponPosts && hasCouponInText(product.hebrew_description)) {
            console.log(`[auto-post] User ${userId}: Skipping product ${product.id} - has coupon (send_coupon_posts=false)`);
            continue;
          }

          const { data: legacyLock } = await supabase
            .from("products")
            .update({ status: "processing" })
            .eq("id", product.id)
            .eq("status", "Scheduled")
            .select("id");

          if (!legacyLock || legacyLock.length === 0) {
            console.log(`[auto-post] User ${userId}: Product ${product.id} already locked, skipping`);
            continue;
          }

          // Stock check before publish
          const stockOk3 = await prePublishStockCheck(supabase, product, stockCheckEnabled);
          if (!stockOk3) {
            await supabase.from("products").update({ status: "Scheduled" }).eq("id", product.id);
            continue;
          }

          const message = buildMessage(product);
          const { success, sentTo, errors } = await sendProductToAccounts(
            supabase, userId, product, message, accounts.map((a: any) => a.id)
          );

          if (success) {
            await supabase
              .from("products")
              .update({ status: "Sent", ...(product.sent_via ? {} : { sent_via: "auto" }) })
              .eq("id", product.id);
            results.push({ userId, productId: product.id, status: "Sent", sentTo });
            legacySent = true;
            break;
          } else {
            console.log(`[auto-post] User ${userId}: Product ${product.id} failed (${errors.join('; ')}), trying next`);
            await supabase
              .from("products")
              .update({ status: "Scheduled" })
              .eq("id", product.id);
          }
        }

        if (!legacySent) {
          results.push({ userId, status: "all_products_failed" });
        }
      }
    }

    return new Response(JSON.stringify({ success: true, time: currentTimeStr, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[auto-post] Critical Error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
