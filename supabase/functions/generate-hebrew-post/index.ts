import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string; promptStyle: number };
type ApiErr = { success: false; error: string; code?: string };

// 4 different prompt styles that rotate
// NOTE: style #1 may be overridden by user's custom prompt, while styles #2-#4 remain fixed.
const PROMPT_TEMPLATES = [
  // Style 1: Original structured format
  `אתה משווק שותפים ישראלי. המידע שמתקבל הוא Product Desc באנגלית.

מטרה: כתוב פוסט שיווקי בעברית בלבד (מותר להשאיר שם מותג באנגלית אם חייב).

מבנה חובה:
[אימוג'י פתיחה + שם המוצר בעברית | Brand באנגלית אם יש]

[2–3 שורות תיאור קצרות בעברית:
מה זה המוצר,
למה הוא שימושי,
ומה היתרון המרכזי שלו]

⭐ דירוג מעולה: [X.X] מתוך 5
👥 מעל [כמות הזמנות] הזמנות

כללים קריטיים:
- אל תוסיף מחיר או קופון
- אל תוסיף קישור (הקישור יתווסף אחר כך)
- אל תכתוב משפטי CTA כמו "לחץ כאן"`,

  // Style 2: Short marketing description
  `כתוב תיאור קצר בעברית למוצר מאליאקספרס.

מבנה:
- 2–3 שורות בלבד
- סגנון שיווקי ומושך
- יתרון עיקרי ברור

ציין:
1. מה המוצר
2. למה הוא כדאי
3. מה היתרון הבולט שלו

הוסף אימוג'י אחד מתאים בתחילת הפוסט.

כללים קריטיים:
- התחל ישירות עם התוכן, בלי משפט פתיחה כמו "בטח", "הנה", "זה המוצר" וכו'
- אין לכלול מחיר או המרה לשקלים
- אין לכלול קישור (יתווסף אחר כך)
- אין לכלול דירוג, אחוז חיובי, כוכבים או מספר הזמנות
- אין לכתוב "לחץ כאן" או CTA דומה`,

  // Style 3: Price drop style
  `צור פוסט קצר בעברית לפרסום מוצר מאליאקספרס בטלגרם או וואטסאפ.

מבנה חובה:
1. 🔥 ירידת מחיר! כותרת מושכת עם אימוג'י
2. 2–3 שורות תיאור קצרות וממוקדות על המוצר
3. משפט סיום קצר שמעודד רכישה

כללים קריטיים:
- התחל ישירות עם התוכן, בלי משפט פתיחה כמו "בטח", "הנה", "זה המוצר" וכו'
- אין לכלול מחיר או המרה לשקלים
- אין לכתוב "לחץ כאן" או לכלול קישור (יתווסף אחר כך)
- אין לכלול דירוג, אחוז חיובי, כוכבים או מספר הזמנות
- הפוסט צריך להיות קצר וקולע`,

  // Style 4: Benefits list
  `כתוב רשימת יתרונות בעברית למוצר מאליאקספרס.

מבנה:
- 3–5 נקודות יתרון
- כל נקודה קצרה וברורה
- סגנון: "מה המוצר עושה", "למה כדאי לקנות", "יתרון עיקרי"

הוסף אימוג'י מתאים לכל יתרון (בתחילת כל שורה).

כללים קריטיים:
- התחל ישירות עם רשימת היתרונות, בלי משפט פתיחה כמו "בטח", "הנה רשימה", "זה המוצר" וכו'
- אין לכלול מחיר
- אין לכלול קישור (יתווסף אחר כך)
- אין לכלול דירוג, אחוז חיובי, כוכבים או מספר הזמנות
- אין לכתוב משפטי CTA`
];

// Pure random rotation - each call gets a random prompt style
function getPromptIndex(): number {
  return Math.floor(Math.random() * PROMPT_TEMPLATES.length);
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

    // Fetch user's custom prompt (if exists). It should affect ONLY style #1.
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
      PROMPT_TEMPLATES[3],
    ];

    // Select random prompt for variety
    const promptIndex = getPromptIndex();
    const systemPrompt = effectiveTemplates[promptIndex];
    console.log(
      `[generate-hebrew-post] Using prompt style ${promptIndex + 1} of ${effectiveTemplates.length}${promptIndex === 0 && customPrompt ? " (custom style 1)" : ""}`,
    );

    // Build product context - title + social proof
    const productDetails: string[] = [];

    // rating can arrive as 0-5 or as a percentage (0-100)
    if (rate > 0) {
      const rating5 = rate > 5 ? rate / 20 : rate;
      const clamped = Math.max(0, Math.min(5, rating5));
      // IMPORTANT: Always express rating in /5 format (no percentages)
      productDetails.push(`דירוג מעולה: ${clamped.toFixed(1)} מתוך 5`);
    }

    if (orders > 0) {
      // Round up to nice numbers: 299 → "מעל 300", 1234 → "מעל 1300"
      const roundUpTo = (n: number, base: number) => Math.ceil(n / base) * base;
      let roundedOrders: number;
      if (orders >= 10000) {
        roundedOrders = roundUpTo(orders, 1000); // Round to nearest 1000
      } else if (orders >= 1000) {
        roundedOrders = roundUpTo(orders, 100); // Round to nearest 100
      } else if (orders >= 100) {
        roundedOrders = roundUpTo(orders, 50); // Round to nearest 50
      } else if (orders >= 10) {
        roundedOrders = roundUpTo(orders, 10); // Round to nearest 10
      } else {
        roundedOrders = orders;
      }
      const ordersText = roundedOrders >= 1000 ? `${(roundedOrders/1000).toFixed(roundedOrders % 1000 === 0 ? 0 : 1)}K+` : String(roundedOrders);
      productDetails.push(`הזמנות: מעל ${ordersText}`);
    }

    // Only include rating/orders context for style #1.
    const includeSocialProof = promptIndex === 0;
    const userPrompt = `מוצר: ${t}
${includeSocialProof && productDetails.length > 0 ? `\nנתונים מה-API:\n${productDetails.join("\n")}` : ""}

כתוב תיאור מוצר קצר. בלי מחיר, בלי קופון, בלי קישור.`;

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
    
    // Remove AI preamble text like "בטח, הנה רשימת יתרונות..."
    content = content.replace(/^(בטח|הנה|זה|להלן)[,،]?\s*(הנה\s*)?(רשימת?\s*)?(יתרונות|תיאור|פוסט)?[^:\n]*[:：]\s*/i, '');
    content = content.replace(/^(בטח|הנה|זה|להלן)[,،]?\s+/i, '');

    // If style is NOT #1, aggressively remove any rating/orders/social-proof lines
    if (promptIndex !== 0) {
      const bannedLine = /(דירוג|כוכב|כוכבים|אחוז\s*חיובי|הזמנות|orders|rating|⭐|👥)/i;
      content = content
        .split(/\r?\n/)
        .filter((line: string) => !bannedLine.test(line))
        .join("\n")
        .trim();
    }
    
    // Remove placeholder brackets from prompt template (e.g., [שם המותג, אם יש], [קישור])
    content = content.replace(/\s*\|\s*\[.*?\]/g, ''); // Remove " | [placeholder]" patterns
    content = content.replace(/\[שם המותג.*?\]/gi, ''); // Specific brand placeholder
    content = content.replace(/\[קישור\]/gi, ''); // Link placeholder
    content = content.replace(/\[.*?אם יש.*?\]/gi, ''); // Any "if exists" placeholders
    content = content.replace(/\[Brand.*?\]/gi, ''); // English brand placeholders
    
    content = content.replace(/https?:\/\/[^\s]+/g, '');
    content = content.replace(/👉[^\n]*/g, '');
    content = content.replace(/🔗[^\n]*/g, '');
    content = content.replace(/לרכישה[:\s]*/gi, '');
    content = content.replace(/לחץ כאן[^\n]*/gi, '');
    // Remove price lines
    content = content.replace(/💰[^\n]*/g, '');
    content = content.replace(/מחיר[:\s]*[\d\.\$₪]+[^\n]*/gi, '');
    // Remove coupon lines
    content = content.replace(/🎟️[^\n]*/g, '');
    content = content.replace(/קופון[:\s]*[^\n]*/gi, '');
    content = content.replace(/קוד[:\s]*[A-Z0-9]+[^\n]*/gi, '');
    // Clean up extra newlines and spaces
    content = content.replace(/\n{3,}/g, '\n\n').trim();
    content = content.replace(/\s{2,}/g, ' ').trim();

    const payload: ApiOk = { success: true, hebrewDescription: content, promptStyle: promptIndex + 1 };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
