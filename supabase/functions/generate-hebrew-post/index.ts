import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string; promptStyle: number; mode: string };
type ApiErr = { success: false; error: string; code?: string };

// Single unified prompt for ALL product posts
// Structure: Headline → Short Description → Key Benefits (bullet points)
// CTA and stats are added automatically by the system

const UNIFIED_PROMPT = `אתה עורך תוכן מקצועי לקבוצות טלגרם ישראליות.
המידע שמתקבל הוא תיאור מוצר בכל שפה. המשימה שלך היא לכתוב פוסט שיווקי בעברית טבעית.

מבנה הפוסט (חובה לעקוב בדיוק):

[אימוג'י אחד + כותרת מוצר קצרה וקליטה בעברית]

[1-2 שורות:
מה זה המוצר ולמה הוא שווה, בשפה פשוטה]

[3-4 יתרונות מרכזיים בפורמט:
✔️ יתרון ראשון
✔️ יתרון שני
✔️ יתרון שלישי
✔️ יתרון רביעי (אופציונלי)]

כללים קריטיים:
- עברית טבעית ופשוטה
- כל יתרון בשורה נפרדת עם ✔️
- משפטים קצרים וברורים
- פורמט טלגרם נקי
- שימוש מינימלי באימוג'י - רק אחד בכותרת
- אסור: מחירים, קישורים, קריאות לפעולה
- אסור לכתוב "לחץ כאן", "להזמנה", "לרכישה" וכד'

** אסור לגמרי **
- אסור משפטי השראה כמו: "שקט נפשי", "חוויה", "תהנו מ...", "תשכחו מ...", "פתחו את הדלת ל..."
- אסור משפטים גנריים כמו: "מתאים לשימוש יומיומי", "איכות מעולה", "מחיר משתלם", "משתלב בצורה חלקה"
- אסור לפתוח משפט עם: "זוהי", "זהו", "הוא", "היא", "מדובר ב"
- אסור לסיים עם משפטי סיכום או עידוד
- לא להוסיף סטטיסטיקות (הזמנות/דירוג) - יתווספו אוטומטית

המטרה: הפוסט צריך להיראות כאילו נכתב ע"י עורך תוכן מקצועי, ברור וסריק.`;

function removeGenericUsageLines(text: string): string {
  const patterns: RegExp[] = [
    /מתאים\/?ה?\s+לשימוש\s+יומיומי[^\n]*/gi,
    /מתאים\/?ה?\s+ל[^\n]*(רכיבה|אופנוע|דיג|טיול|טיולים|קמפינג|טרקים|פעילות\s+חיצונית|ספורט\s+חיצוני)[^\n]*/gi,
    /אידיאלי\s+ל[^\n]*(רכיבה|אופנוע|דיג|טיול|טיולים|קמפינג|טרקים|פעילות\s+חיצונית)[^\n]*/gi,
    /לכל\s+(פעילות|מצב|תנאי)[^\n]*/gi,
  ];

  const lines = text.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    return !patterns.some((re) => re.test(trimmed));
  });
  return kept.join("\n");
}

function trimDanglingEndings(text: string): string {
  let t = text.trim();

  t = t.replace(/\s*(הוא|היא)\s*$/g, "");
  t = t.replace(/\s*(מתאים|מתאימה)\s*$/g, "");
  t = t.replace(/\s*(הוא\s+מתאים|היא\s+מתאימה)\s*$/g, "");

  const endsWithSentencePunct = /[\.!\?…]\s*$/.test(t);
  const endsWithDecimal = /\d\.\s*$/.test(t);
  
  if (!endsWithSentencePunct || endsWithDecimal) {
    let lastValidPunct = -1;
    for (let i = t.length - 1; i >= 0; i--) {
      const char = t[i];
      if (char === '.' || char === '!' || char === '?' || char === '…') {
        if (char === '.' && i > 0 && /\d/.test(t[i - 1])) {
          if (i === t.length - 1 || !/\d/.test(t[i + 1] || '')) {
            const before = t.slice(Math.max(0, i - 15), i);
            if (/דירוג|rating|\d\s*מתוך/i.test(before)) {
              continue;
            }
          }
        }
        lastValidPunct = i;
        break;
      }
    }
    
    if (lastValidPunct > 0) {
      t = t.slice(0, lastValidPunct + 1).trim();
    }
  }

  t = t.replace(/\n[^\n]*דירוג[:\s]*\d+\.\s*$/gi, '');
  t = t.replace(/⭐\s*דירוג[:\s]*\d+\.\s*$/gi, '');

  return t.trim();
}


function cleanAiOutput(content: string): string {
  let result = String(content).trim();
  
  // Remove multiple "options" if AI returned them
  if (result.includes('אפשרות 1') || result.includes('**אפשרות')) {
    const optionMatch = result.match(/\*\*אפשרות 1[^*]*\*\*[:\s]*([\s\S]*?)(?=\*\*אפשרות 2|\*\*דגשים|---|$)/i);
    if (optionMatch && optionMatch[1]) {
      result = optionMatch[1].trim();
    } else {
      const firstOptionEnd = result.search(/(\*\*אפשרות 2|\*\*דגשים|^---|דגשים כלליים)/i);
      if (firstOptionEnd > 0) {
        result = result.substring(0, firstOptionEnd).trim();
        result = result.replace(/^\*\*אפשרות 1[^*]*\*\*[:\s]*/i, '');
      }
    }
  }
  
  // Remove dividers
  const dividerIndex = result.indexOf('---');
  if (dividerIndex > 0) {
    result = result.substring(0, dividerIndex).trim();
  }
  
  // Remove meta sections
  result = result.replace(/\*\*דגשים כלליים[^*]*\*\*[\s\S]*/gi, '');
  result = result.replace(/דגשים כלליים[\s\S]*/gi, '');
  result = result.replace(/\* \*\*[^:]+:\*\*[^\n]*/g, '');
  
  // Remove AI preamble
  result = result.replace(/^(בטח|הנה|זה|להלן|בוודאי|כמובן)[,،\.]?\s*(הנה\s*)?(רשימת?\s*)?(יתרונות|תיאור|פוסט)?[^:\n]*[:：]?\s*/i, '');
  result = result.replace(/^(בטח|הנה|זה|להלן|בוודאי|כמובן)[,،]?\s+/i, '');
  
  // Remove placeholders and internal instructions
  result = result.replace(/\s*\|\s*\[.*?\]/g, '');
  result = result.replace(/\[שם המותג.*?\]/gi, '');
  result = result.replace(/\[קישור[^\]]*\]/gi, '');
  result = result.replace(/\[.*?אם יש.*?\]/gi, '');
  result = result.replace(/\[Brand.*?\]/gi, '');
  result = result.replace(/\[כאן יבוא.*?\]/gi, '');
  result = result.replace(/\(כאן יבוא[^)]*\)/gi, '');
  result = result.replace(/\[קישור מוצר\]/gi, '');
  result = result.replace(/\[לינק\]/gi, '');
  result = result.replace(/\*\*[^*]*היכנסו לכאן[^*]*\*\*/gi, '');
  result = result.replace(/היכנסו לכאן[:\s]*/gi, '');
  result = result.replace(/לחצו כאן[:\s]*/gi, '');
  result = result.replace(/\(מתמקד[^\)]*\)/gi, '');
  result = result.replace(/\*\*\(מתמקד[^\)]*\)\*\*/gi, '');
  
  // Remove English-heavy lines
  const lines = result.split(/\r?\n/);
  const hebrewLines = lines.filter((line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const hebrewChars = (trimmed.match(/[\u0590-\u05FF]/g) || []).length;
    const englishChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    return hebrewChars >= englishChars || (hebrewChars === 0 && englishChars === 0);
  });
  result = hebrewLines.join('\n');
  
  // Remove ALL CTA lines and link mentions
  result = result.replace(/https?:\/\/[^\s]+/g, '');
  result = result.replace(/👉[^\n]*/g, '');
  result = result.replace(/🔗[^\n]*/g, '');
  result = result.replace(/👇[^\n]*/g, '');
  result = result.replace(/☝️[^\n]*/g, '');
  result = result.replace(/לרכישה[:\s]*[^\n]*/gi, '');
  result = result.replace(/להזמנה[:\s]*[^\n]*/gi, '');
  result = result.replace(/לחץ כאן[^\n]*/gi, '');
  result = result.replace(/לפרטים נוספים[^\n]*/gi, '');
  result = result.replace(/פרטים והזמנה[^\n]*/gi, '');
  result = result.replace(/רטים והזמנה[^\n]*/gi, '');
  result = result.replace(/לקנייה[:\s]*[^\n]*/gi, '');
  result = result.replace(/לצפייה[:\s]*[^\n]*/gi, '');
  
  // Remove ALL price/money mentions
  result = result.replace(/💰[^\n]*/g, '');
  result = result.replace(/מחיר[^\n]*/gi, '');
  result = result.replace(/₪[\d,\.]+/g, '');
  result = result.replace(/\$[\d,\.]+/g, '');
  result = result.replace(/[\d,\.]+\s*₪/g, '');
  result = result.replace(/[\d,\.]+\s*שקל/gi, '');
  result = result.replace(/[\d,\.]+\s*דולר/gi, '');
  result = result.replace(/רק\s*[\d,\.]+/gi, '');
  result = result.replace(/ב-?\s*[\d,\.]+/gi, '');
  result = result.replace(/USD|ILS|EUR/gi, '');
  
  // Remove coupon lines
  result = result.replace(/🎟️[^\n]*/g, '');
  result = result.replace(/קופון[:\s]*[^\n]*/gi, '');
  result = result.replace(/קוד[:\s]*[A-Z0-9]+[^\n]*/gi, '');
  result = result.replace(/הנחה[^\n]*/gi, '');

  // Remove inspirational phrases and generic expressions
  result = result.replace(/שקט\s+נפשי[^\n]*/gi, '');
  result = result.replace(/פתחו?\s+את\s+הדלת\s+ל[^\n]*/gi, '');
  result = result.replace(/תהנו\s+מ[^\n]*/gi, '');
  result = result.replace(/תשכחו\s+מ[^\n]*/gi, '');
  result = result.replace(/חוויה\s+(בלתי\s+)?נשכחת[^\n]*/gi, '');
  result = result.replace(/משתלב\s+בצורה\s+חלקה[^\n]*/gi, '');
  result = result.replace(/חוויה\s+ידידותית\s+למשתמש[^\n]*/gi, '');
  result = result.replace(/ידידותי\s+למשתמש[^\n]*/gi, '');

  // Remove generic lifestyle/activity lines
  result = removeGenericUsageLines(result);

  // Ensure we don't return a dangling/unfinished ending
  result = trimDanglingEndings(result);
  
  // Clean up extra newlines and spaces
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  result = result.replace(/\s{2,}/g, ' ').trim();
  
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[generate-hebrew-post] Missing authorization header");
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Check if this is a service-role call (internal function-to-function)
    const token = authHeader.replace("Bearer ", "");
    const isServiceRole = token === supabaseServiceKey;
    
    let user: { id: string; email?: string } | null = null;
    
    if (isServiceRole) {
      console.log("[generate-hebrew-post] Service-role internal call accepted");
      // For service-role calls, create a minimal user object
      user = { id: "service-role", email: "internal" };
    } else {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user: authUser }, error: authError } = await supabaseAuth.auth.getUser(token);

      if (authError || !authUser) {
        console.error("[generate-hebrew-post] Auth verification failed:", authError);
        const payload: ApiErr = { success: false, error: "Unauthorized" };
        return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      user = authUser;
    }

    const body = await req.json();
    const { 
      title, 
      ordersCount, 
      rating, 
      userId,
      manualRewrite
    } = body;
    
    const t = String(title || "").trim();

    if (!t) {
      const payload: ApiErr = { success: false, error: "title is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (userId && !isServiceRole && userId !== user!.id) {
      console.error("[generate-hebrew-post] User ID mismatch - potential attack");
      const payload: ApiErr = { success: false, error: "Forbidden: Cannot access other users' data" };
      return new Response(JSON.stringify(payload), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Try to use the user's own API key first (so credits come from their account)
    const effectiveUserId = isServiceRole ? (userId || null) : user!.id;
    let userGeminiKey: string | null = null;
    let userOpenaiKey: string | null = null;

    if (effectiveUserId && effectiveUserId !== "service-role") {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: settings } = await supabaseAdmin
        .from("app_settings")
        .select("gemini_api_key, openai_api_key")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      if (settings?.gemini_api_key) userGeminiKey = settings.gemini_api_key;
      if (settings?.openai_api_key) userOpenaiKey = settings.openai_api_key;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    const useUserGemini = !!userGeminiKey;
    const useUserOpenai = !useUserGemini && !!userOpenaiKey;
    const useLovable = !useUserGemini && !useUserOpenai;

    if (useLovable && !LOVABLE_API_KEY) {
      const payload: ApiErr = { success: false, error: "AI is not configured. Please add your Gemini or OpenAI API key in Settings." };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`[generate-hebrew-post] AI provider: ${useUserGemini ? "user-gemini" : useUserOpenai ? "user-openai" : "lovable-gateway"}`);

    // Choose prompt based on mode
    let systemPrompt: string;
    let userPrompt: string;

    if (manualRewrite) {
      // Manual rewrite mode: rewrite the description, keep prices & coupons exactly
      systemPrompt = `אתה עורך תוכן מקצועי לקבוצות טלגרם ישראליות.
המשימה שלך היא לקחת טקסט של פוסט מוצר ולנסח אותו מחדש בצורה קצרה ומקצועית.
חשוב מאוד: תנסח מחדש את אותו מוצר בדיוק! אל תמציא מוצר אחר.

מבנה הפוסט (חובה לעקוב בדיוק):

[אימוג'י אחד + שם המוצר בעברית]

[3-4 יתרונות מרכזיים ישר אחרי השם:
✔️ יתרון ראשון
✔️ יתרון שני
✔️ יתרון שלישי]

[שורות מחיר וקופון - העתק אותן בדיוק כמו שהן מופיעות בטקסט המקורי, בלי לשנות אותן בכלל]

כללים קריטיים:
- נסח מחדש את אותו מוצר שמתואר בטקסט! אסור להחליף למוצר אחר
- אסור תיאור כללי של המוצר - רק שם + יתרונות
- עברית טבעית ופשוטה
- אסור פתיחות גנריות כמו "מציאה שתשדרג", "דיל שאסור לפספס", "שדרגו את השגרה"
- התחל ישר עם אימוג'י + שם המוצר, ואז ישר יתרונות
- אם יש מידע על מחיר או קופון - העתק אותו בדיוק כמו שהוא, שורה שורה
- אסור: קישורים, קריאות לפעולה כמו "לחץ כאן" או "להזמנה"`;

      userPrompt = `נסח מחדש את הפוסט הבא. שמור על כל מידע של מחיר וקופון בדיוק כמו שהוא. אסור לשנות את המוצר - תתאר את אותו מוצר בדיוק:

${t}`;
      console.log("[generate-hebrew-post] Using manual rewrite prompt");
    } else {
      // Standard unified prompt
      systemPrompt = UNIFIED_PROMPT;
      userPrompt = `מוצר: ${t}

כתוב תיאור מוצר קצר. אסור לציין מחירים, מטבעות, סכומים כספיים, קופונים או קישורים.`;
      console.log("[generate-hebrew-post] Using unified prompt");
    }

    console.log("[generate-hebrew-post] Generating for user:", user.email);

    // Build the AI request based on provider
    let resp: Response;

    if (useUserGemini) {
      // Use user's own Gemini API key directly
      resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${userGeminiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
          ],
        }),
      });
    } else if (useUserOpenai) {
      // Use user's own OpenAI API key directly
      resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userOpenaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } else {
      // Fallback: Lovable AI gateway (owner's credits)
      resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    }

    if (!resp.ok) {
      const txt = await resp.text();
      const errMsg = resp.status === 429 ? "AI rate limit - try again in a minute" 
        : resp.status === 402 ? "AI credits required" 
        : useUserGemini ? "Gemini API error - check your API key" 
        : useUserOpenai ? "OpenAI API error - check your API key" 
        : "AI error";
      const payload: ApiErr = { success: false, error: errMsg, code: String(resp.status) };
      console.error("AI error:", resp.status, txt);
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    
    // Parse response based on provider format
    let content: string | undefined;
    if (useUserGemini) {
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else {
      content = data?.choices?.[0]?.message?.content;
    }

    if (!content) {
      const payload: ApiErr = { success: false, error: "AI returned empty response" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Clean and sanitize the output (skip price/coupon stripping in manual rewrite mode)
    if (manualRewrite) {
      // Light cleaning only: remove AI preamble, options, dividers but keep prices/coupons
      let result = String(content).trim();
      // Remove multiple options
      if (result.includes('אפשרות 1') || result.includes('**אפשרות')) {
        const optionMatch = result.match(/\*\*אפשרות 1[^*]*\*\*[:\s]*([\s\S]*?)(?=\*\*אפשרות 2|\*\*דגשים|---|$)/i);
        if (optionMatch?.[1]) result = optionMatch[1].trim();
      }
      const dividerIndex = result.indexOf('---');
      if (dividerIndex > 0) result = result.substring(0, dividerIndex).trim();
      // Remove AI preamble
      result = result.replace(/^(בטח|הנה|זה|להלן|בוודאי|כמובן)[,،\.]?\s*(הנה\s*)?(רשימת?\s*)?(יתרונות|תיאור|פוסט)?[^:\n]*[:：]?\s*/i, '');
      // Remove CTA lines only
      result = result.replace(/👉[^\n]*/g, '');
      result = result.replace(/👇[^\n]*/g, '');
      result = result.replace(/לרכישה[:\s]*[^\n]*/gi, '');
      result = result.replace(/להזמנה[:\s]*[^\n]*/gi, '');
      result = result.replace(/לחץ כאן[^\n]*/gi, '');
      result = result.replace(/https?:\/\/[^\s]+/g, '');
      result = result.replace(/\n{3,}/g, '\n\n').trim();
      content = result;
    } else {
      content = cleanAiOutput(content);
    }
    
    // Validation: Check if content is too short
    const hebrewContentLength = (content.match(/[\u0590-\u05FF]/g) || []).length;
    if (hebrewContentLength < 20) {
      console.error("[generate-hebrew-post] Content too short, possibly incomplete:", content);
      const payload: ApiErr = { success: false, error: "Generated content too short - try again" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Add statistics if provided (rounded orders and rating)
    const statsLines: string[] = [];
    
    // Add rounded orders count (round up to nearest 100)
    if (ordersCount && Number(ordersCount) > 0) {
      const orders = Number(ordersCount);
      const roundedOrders = Math.ceil(orders / 100) * 100;
      statsLines.push(`👥 מעל ${roundedOrders.toLocaleString()} הזמנות`);
    }
    
    // Add rating if provided
    if (rating && Number(rating) > 0) {
      let r = Number(rating);
      // Normalize from percentage to 5-star scale if needed
      if (r > 5) r = r / 20;
      statsLines.push(`⭐ דירוג: ${r.toFixed(1)} מתוך 5`);
    }
    
    // Append stats to content
    if (statsLines.length > 0) {
      content = content.trim() + "\n\n" + statsLines.join("\n");
    }

    const payload: ApiOk = { 
      success: true, 
      hebrewDescription: content, 
      promptStyle: 1,
      mode: "unified"
    };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
