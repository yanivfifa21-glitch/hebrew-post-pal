import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string; promptStyle: number };
type ApiErr = { success: false; error: string; code?: string };

// 3 prompt styles - randomly selected each time
// CRITICAL: No prices, currencies, or monetary conversions in any output
// CRITICAL: No philosophical/aspirational closing sentences - focus on product only
const PROMPT_TEMPLATES = [
  // Prompt 1: Clear and trustworthy Telegram post - NO CTA
  `צור פוסט טלגרם קצר וברור בעברית מלאה.

כלול כותרת מושכת עם אימוג'י אחד בלבד ושם המוצר.
הוסף תיאור של 2–3 שורות על היתרונות הטכניים של המוצר.

חוקים קריטיים:
- אסור לפתוח עם "זוהי", "זהו", "הוא", "היא", "מדובר ב" - התחל ישירות עם שם המוצר או היתרון.
- אל תכתוב משפטים כלליים/סגנון-חיים כמו "מתאים לשימוש יומיומי..." או רשימות פעילויות (רכיבה, דיג, טיולים וכד').
- סיים רק במשפט שלם (עם נקודה/סימן סיום). אסור להשאיר סיום תלוי כמו "היא מתאימה".
- אסור לציין מחירים, מטבעות או סכומים כספיים.
- אסור לכלול קריאה לפעולה, קישורים או הנחיות להזמנה.
- אסור להוסיף משפטי השראה או מוטיבציה בסוף.
- רק עובדות על המוצר עצמו.`,

  // Prompt 2: Recommendation style - NO CTA
  `כתוב פוסט טלגרם בעברית בסגנון המלצה.

כלול כותרת עם אימוג'י ושם המוצר.
הוסף 2–3 שורות יתרונות טכניים בשפה פשוטה.

חוקים קריטיים:
- אסור לפתוח עם "זוהי", "זהו", "הוא", "היא", "מדובר ב" - התחל ישירות עם תיאור היתרון או התכונה.
- אל תכתוב משפטים כלליים כמו "מתאים לשימוש יומיומי" או רשימות תחביבים/פעילויות (אופנוע, דיג, טיולים וכו').
- סיים רק במשפט שלם. אל תשאיר סוף פתוח כמו "הוא מתאים"/"היא מתאימה".
- אסור לציין מחירים או מטבעות.
- אסור לכלול קישורים או קריאה לפעולה.
- אסור לסיים עם משפטי השראה כמו "תהנו", "תשכחו", "שקט נפשי".
- רק עובדות על המוצר.`,

  // Prompt 3: Template style - short and readable - NO CTA
  `צור פוסט קצר לטלגרם למוצר.

כלול כותרת עם אימוג'י אחד ושם המוצר.
הוסף תיאור של עד 3 שורות בעברית טבעית על היתרונות.

חוקים קריטיים:
- לעולם אל תפתח עם "זוהי", "זהו", "הוא", "היא", "מדובר ב" - התחל ישירות עם התכונה או היתרון.
- בלי משפטים כלליים כמו "מתאים לשימוש יומיומי" או פירוט פעילויות (רכיבה/דיג/טיולים/פעילות חיצונית וכו').
- סיום חייב להיות משפט שלם בלבד (עם נקודה/סימן סיום), בלי "היא מתאימה" בסוף.
- אין מחירים, קישורים או הנחיות רכישה.
- אין משפטי השראה או מוטיבציה בסוף.
- רק תיאור טכני של המוצר.`
];

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

  // Remove common dangling fragments at the very end
  t = t.replace(/\s*(הוא|היא)\s*$/g, "");
  t = t.replace(/\s*(מתאים|מתאימה)\s*$/g, "");
  t = t.replace(/\s*(הוא\s+מתאים|היא\s+מתאימה)\s*$/g, "");

  // Check if text ends with proper punctuation (not a decimal point like "4.")
  // A decimal point is one that's preceded by a digit and followed by nothing or more digits
  const endsWithSentencePunct = /[\.!\?…]\s*$/.test(t);
  const endsWithDecimal = /\d\.\s*$/.test(t); // e.g., "4." at the end
  
  if (!endsWithSentencePunct || endsWithDecimal) {
    // Find the last REAL sentence-ending punctuation (not a decimal point)
    // Look for punctuation that's NOT preceded by a digit (to avoid decimals)
    let lastValidPunct = -1;
    for (let i = t.length - 1; i >= 0; i--) {
      const char = t[i];
      if (char === '.' || char === '!' || char === '?' || char === '…') {
        // Check if this is NOT a decimal point (digit before the dot)
        if (char === '.' && i > 0 && /\d/.test(t[i - 1])) {
          // This might be a decimal - check if it's followed by a digit
          // If it's at the end or followed by non-digit, it could be sentence end
          // But "4." at end is likely incomplete decimal, so skip
          if (i === t.length - 1 || !/\d/.test(t[i + 1] || '')) {
            // Check if this looks like a rating that got cut off (e.g., "דירוג: 4.")
            const before = t.slice(Math.max(0, i - 15), i);
            if (/דירוג|rating|\d\s*מתוך/i.test(before)) {
              continue; // Skip this - it's an incomplete rating
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

  // Final cleanup: if we end with an incomplete rating like "דירוג: 4." remove that line
  t = t.replace(/\n[^\n]*דירוג[:\s]*\d+\.\s*$/gi, '');
  t = t.replace(/⭐\s*דירוג[:\s]*\d+\.\s*$/gi, '');

  return t.trim();
}

// Pure random rotation - each call gets one of the 3 prompts randomly
function getPromptIndex(): number {
  return Math.floor(Math.random() * 3);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // SECURITY: Verify the user from JWT token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("[generate-hebrew-post] Missing authorization header");
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify user with anon key
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      console.error("[generate-hebrew-post] Auth verification failed:", authError);
      const payload: ApiErr = { success: false, error: "Unauthorized" };
      return new Response(JSON.stringify(payload), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { 
      title, 
      ordersCount, 
      rating, 
      userId
    } = body;
    
    const t = String(title || "").trim();
    const orders = Number(ordersCount) || 0;
    const rate = Number(rating) || 0;

    if (!t) {
      const payload: ApiErr = { success: false, error: "title is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SECURITY: Verify the userId matches the authenticated user
    if (userId && userId !== user.id) {
      console.error("[generate-hebrew-post] User ID mismatch - potential attack");
      const payload: ApiErr = { success: false, error: "Forbidden: Cannot access other users' data" };
      return new Response(JSON.stringify(payload), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const payload: ApiErr = { success: false, error: "AI is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Custom prompt only affects the first style
    const { data: settings } = await supabase
      .from("app_settings")
      .select("custom_ai_prompt")
      .eq("user_id", user.id)
      .maybeSingle();

    const customPrompt = settings?.custom_ai_prompt?.trim() || "";
    const effectiveTemplates = [
      customPrompt || PROMPT_TEMPLATES[0],
      PROMPT_TEMPLATES[1],
      PROMPT_TEMPLATES[2],
    ];

    // Select random prompt for variety (1 of 3)
    const promptIndex = getPromptIndex();
    const systemPrompt = effectiveTemplates[promptIndex];
    console.log(
      `[generate-hebrew-post] Using prompt style ${promptIndex + 1} of 3${promptIndex === 0 && customPrompt ? " (custom)" : ""}`,
    );

    // Build product context - title only, no prices
    const userPrompt = `מוצר: ${t}

כתוב תיאור מוצר קצר. אסור לציין מחירים, מטבעות, סכומים כספיים, קופונים או קישורים.`;

    console.log("[generate-hebrew-post] Generating for user:", user.email);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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

    if (!resp.ok) {
      const txt = await resp.text();
      const payload: ApiErr = {
        success: false,
        error: resp.status === 429 ? "AI rate limit - try again in a minute" : resp.status === 402 ? "AI credits required" : "AI error",
        code: String(resp.status),
      };
      console.error("AI gateway error:", resp.status, txt);
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

  const data = await resp.json();
  let content = data?.choices?.[0]?.message?.content;

  if (!content) {
    const payload: ApiErr = { success: false, error: "AI returned empty response" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Clean up - remove any links, prices, or CTAs the AI might have added
  content = String(content).trim();
  
  // CRITICAL FIX: If AI returned multiple "options", extract only the first one
  // Look for patterns like "אפשרות 1", "אפשרות 2", "דגשים כלליים", "---" separators
  if (content.includes('אפשרות 1') || content.includes('**אפשרות')) {
    // Split by option markers and take the first real content block
    const optionMatch = content.match(/\*\*אפשרות 1[^*]*\*\*[:\s]*([\s\S]*?)(?=\*\*אפשרות 2|\*\*דגשים|---|$)/i);
    if (optionMatch && optionMatch[1]) {
      content = optionMatch[1].trim();
    } else {
      // Fallback: take everything before "אפשרות 2" or "---"
      const firstOptionEnd = content.search(/(\*\*אפשרות 2|\*\*דגשים|^---|דגשים כלליים)/i);
      if (firstOptionEnd > 0) {
        content = content.substring(0, firstOptionEnd).trim();
        // Remove the "אפשרות 1" header if it exists
        content = content.replace(/^\*\*אפשרות 1[^*]*\*\*[:\s]*/i, '');
      }
    }
  }
  
  // Remove any "---" dividers and everything after
  const dividerIndex = content.indexOf('---');
  if (dividerIndex > 0) {
    content = content.substring(0, dividerIndex).trim();
  }
  
  // Remove "דגשים כלליים" sections and any meta-commentary
  content = content.replace(/\*\*דגשים כלליים[^*]*\*\*[\s\S]*/gi, '');
  content = content.replace(/דגשים כלליים[\s\S]*/gi, '');
  content = content.replace(/\* \*\*[^:]+:\*\*[^\n]*/g, ''); // Remove bullet meta-notes like "* **כותרת:**"
  
  // Remove AI preamble text like "בטח, הנה רשימת יתרונות..."
  content = content.replace(/^(בטח|הנה|זה|להלן|בוודאי|כמובן)[,،\.]?\s*(הנה\s*)?(רשימת?\s*)?(יתרונות|תיאור|פוסט)?[^:\n]*[:：]?\s*/i, '');
  content = content.replace(/^(בטח|הנה|זה|להלן|בוודאי|כמובן)[,،]?\s+/i, '');
  
  // AGGRESSIVE: Remove ALL placeholder brackets and internal instructions
  content = content.replace(/\s*\|\s*\[.*?\]/g, '');
  content = content.replace(/\[שם המותג.*?\]/gi, '');
  content = content.replace(/\[קישור[^\]]*\]/gi, '');
  content = content.replace(/\[.*?אם יש.*?\]/gi, '');
  content = content.replace(/\[Brand.*?\]/gi, '');
  content = content.replace(/\[כאן יבוא.*?\]/gi, '');
  content = content.replace(/\(כאן יבוא[^)]*\)/gi, '');
  content = content.replace(/\[קישור מוצר\]/gi, '');
  content = content.replace(/\[לינק\]/gi, '');
  content = content.replace(/\*\*[^*]*היכנסו לכאן[^*]*\*\*/gi, '');
  content = content.replace(/היכנסו לכאן[:\s]*/gi, '');
  content = content.replace(/לחצו כאן[:\s]*/gi, '');
  
  // Remove any meta text about the post structure
  content = content.replace(/\(מתמקד[^\)]*\)/gi, '');
  content = content.replace(/\*\*\(מתמקד[^\)]*\)\*\*/gi, '');
  
  // Remove English sentences - look for lines that are mostly English
  const lines = content.split(/\r?\n/);
  const hebrewLines = lines.filter((line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const hebrewChars = (trimmed.match(/[\u0590-\u05FF]/g) || []).length;
    const englishChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    return hebrewChars >= englishChars || (hebrewChars === 0 && englishChars === 0);
  });
  content = hebrewLines.join('\n');
  
  // AGGRESSIVE: Remove ALL CTA lines and link mentions
  content = content.replace(/https?:\/\/[^\s]+/g, '');
  content = content.replace(/👉[^\n]*/g, '');
  content = content.replace(/🔗[^\n]*/g, '');
  content = content.replace(/👇[^\n]*/g, '');
  content = content.replace(/☝️[^\n]*/g, '');
  content = content.replace(/לרכישה[:\s]*[^\n]*/gi, '');
  content = content.replace(/להזמנה[:\s]*[^\n]*/gi, '');
  content = content.replace(/לחץ כאן[^\n]*/gi, '');
  content = content.replace(/לפרטים נוספים[^\n]*/gi, '');
  content = content.replace(/פרטים והזמנה[^\n]*/gi, '');
  content = content.replace(/רטים והזמנה[^\n]*/gi, '');
  content = content.replace(/לקנייה[:\s]*[^\n]*/gi, '');
  content = content.replace(/לצפייה[:\s]*[^\n]*/gi, '');
  
  // AGGRESSIVE: Remove ALL price/money mentions
  content = content.replace(/💰[^\n]*/g, '');
  content = content.replace(/מחיר[^\n]*/gi, '');
  content = content.replace(/₪[\d,\.]+/g, '');
  content = content.replace(/\$[\d,\.]+/g, '');
  content = content.replace(/[\d,\.]+\s*₪/g, '');
  content = content.replace(/[\d,\.]+\s*שקל/gi, '');
  content = content.replace(/[\d,\.]+\s*דולר/gi, '');
  content = content.replace(/רק\s*[\d,\.]+/gi, '');
  content = content.replace(/ב-?\s*[\d,\.]+/gi, '');
  content = content.replace(/USD|ILS|EUR/gi, '');
  
  // Remove coupon lines
  content = content.replace(/🎟️[^\n]*/g, '');
  content = content.replace(/קופון[:\s]*[^\n]*/gi, '');
  content = content.replace(/קוד[:\s]*[A-Z0-9]+[^\n]*/gi, '');
  content = content.replace(/הנחה[^\n]*/gi, '');

  // Remove generic lifestyle/activity lines the user doesn't want
  content = removeGenericUsageLines(content);

  // Ensure we don't return a dangling/unfinished ending (e.g., "היא מתאימה")
  content = trimDanglingEndings(content);
  
  // Clean up extra newlines and spaces
  content = content.replace(/\n{3,}/g, '\n\n').trim();
  content = content.replace(/\s{2,}/g, ' ').trim();
  
  // Validation: Check if content is too short (incomplete generation)
  const hebrewContentLength = (content.match(/[\u0590-\u05FF]/g) || []).length;
  if (hebrewContentLength < 20) {
    console.error("[generate-hebrew-post] Content too short, possibly incomplete:", content);
    // Try to regenerate or return error
    const payload: ApiErr = { success: false, error: "Generated content too short - try again" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const payload: ApiOk = { success: true, hebrewDescription: content, promptStyle: promptIndex + 1 };
  return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
