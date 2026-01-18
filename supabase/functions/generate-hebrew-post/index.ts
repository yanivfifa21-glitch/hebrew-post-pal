import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string };
type ApiErr = { success: false; error: string; code?: string };

// Default prompt - translate Product Desc (English) into a Hebrew affiliate post format
const DEFAULT_SYSTEM_PROMPT = `אתה משווק שותפים ישראלי. המידע שמתקבל הוא Product Desc באנגלית.

מטרה: כתוב פוסט שיווקי בעברית בלבד (מותר להשאיר שם מותג באנגלית אם חייב).

מבנה חובה:
[אימוג'י פתיחה + שם המוצר בעברית | Brand באנגלית אם יש]

[2–3 שורות תיאור קצרות בעברית:
מה זה המוצר,
למה הוא שימושי,
ומה היתרון המרכזי שלו]

⭐ דירוג: [X.X] מתוך 5
👥 מעל [כמות הזמנות] הזמנות

כללים קריטיים:
- אל תוסיף מחיר או קופון
- אל תוסיף קישור (הקישור יתווסף אחר כך)
- אל תכתוב משפטי CTA כמו "לחץ כאן"`;

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

    // Fetch user's custom prompt using verified user.id
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: settings } = await supabase
      .from("app_settings")
      .select("custom_ai_prompt")
      .eq("user_id", user.id) // Use verified user.id
      .maybeSingle();

    if (settings?.custom_ai_prompt?.trim()) {
      systemPrompt = settings.custom_ai_prompt.trim();
      console.log("[generate-hebrew-post] Using custom prompt for user:", user.email);
    }

    // Build product context - title + social proof
    const productDetails: string[] = [];

    // rating can arrive as 0-5 or as a percentage (0-100)
    if (rate > 0) {
      if (rate > 5) {
        const percent = Math.round(rate);
        const displayRating = (rate / 20).toFixed(1);
        productDetails.push(`אחוז חיובי: ${percent}%`);
        productDetails.push(`דירוג משוער: ${displayRating}/5`);
      } else {
        productDetails.push(`דירוג: ${rate.toFixed(1)}/5`);
      }
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

    const userPrompt = `מוצר: ${t}
${productDetails.length > 0 ? `\nנתונים מה-API:\n${productDetails.join("\n")}` : ""}

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

    const payload: ApiOk = { success: true, hebrewDescription: content };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
