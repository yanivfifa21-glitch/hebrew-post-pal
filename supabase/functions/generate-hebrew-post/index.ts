import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string };
type ApiErr = { success: false; error: string; code?: string };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, ordersCount, rating } = await req.json();
    const t = String(title || "").trim();
    const orders = Number(ordersCount) || 0;
    const rate = Number(rating) || 0;

    if (!t) {
      const payload: ApiErr = { success: false, error: "title is required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const payload: ApiErr = { success: false, error: "AI is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build social proof context
    let socialProofText = "";
    if (orders > 0 || rate > 0) {
      const parts = [];
      if (rate > 0) {
        const displayRating = rate > 5 ? (rate / 20).toFixed(1) : rate.toFixed(1);
        parts.push(`ציון ${displayRating}/5 כוכבים`);
      }
      if (orders > 0) {
        const ordersText = orders > 500 ? "מאות" : orders > 100 ? "עשרות" : String(orders);
        parts.push(`${ordersText} הזמנות`);
      }
      socialProofText = parts.join(" | ");
    }

    const systemPrompt = `אתה משווק שותפים ישראלי מקצועי. כתוב תיאור שיווקי קצר וממוקד בעברית.

סגנון: פרקטי, נלהב, ישיר. לא פואטי.

מבנה:
1. פתיחה חזקה - שאלה או טענה שקשורה למוצר
2. 2-3 יתרונות טכניים/פרקטיים
3. הוכחה חברתית (אם יש מידע)

כללים קריטיים:
- אל תוסיף קישור או "לחץ כאן" או "לרכישה" - האפליקציה תוסיף את זה
- אל תסיים עם קריאה לפעולה שכוללת קישור
- התמקד רק בתיאור המוצר והיתרונות
- 4-6 שורות בלבד
- אל תציין מחיר
- אל תשתמש בביטויים כמו: "משנה את כללי המשחק", "הרפתקה", "חלום"`;

    const userPrompt = `מוצר: ${t}${socialProofText ? `\nהוכחה חברתית: ${socialProofText}` : ""}

כתוב תיאור שיווקי קצר. בלי קישור בסוף.`;

    console.log("[generate-hebrew-post] Generating description only, no link");

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

    // Clean up - remove any links or CTAs the AI might have added anyway
    content = String(content).trim();
    content = content.replace(/https?:\/\/[^\s]+/g, '');
    content = content.replace(/👉[^\n]*/g, '');
    content = content.replace(/🛒[^\n]*/g, '');
    content = content.replace(/🔗[^\n]*/g, '');
    content = content.replace(/לרכישה[:\s]*/gi, '');
    content = content.replace(/לחץ כאן[^\n]*/gi, '');
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    const payload: ApiOk = { success: true, hebrewDescription: content };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
