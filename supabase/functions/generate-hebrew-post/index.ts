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
    const { title, ordersCount, rating, affiliateLink } = await req.json();
    const t = String(title || "").trim();
    const orders = Number(ordersCount) || 0;
    const rate = Number(rating) || 0;
    const link = String(affiliateLink || "").trim();

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
    let socialProof = "";
    if (orders > 0) {
      socialProof += `\nכמות הזמנות: ${orders > 500 ? "מעל 500" : orders}`;
    }
    if (rate > 0) {
      const displayRating = rate > 5 ? (rate / 20).toFixed(1) : rate.toFixed(1);
      socialProof += `\nדירוג: ${displayRating}/5`;
    }

    const systemPrompt = `אתה משווק שותפים ישראלי מקצועי. כתוב פוסט שיווקי קצר וממוקד בעברית.

סגנון: פרקטי, נלהב, ישיר לעניין. לא פואטי, לא מתחכם.

מבנה הפוסט:
1. פתיחה חזקה - שאלה או טענה שקשורה ישירות לקטגוריית המוצר (לא "הרפתקה" או "חלום")
2. 2-3 יתרונות טכניים/פרקטיים של המוצר (סוללה, תכונות, איכות)
3. הוכחה חברתית - הזמנות ודירוג אם יש
4. קריאה לפעולה עם הקישור

כללים קריטיים:
- אל תשתמש בביטויים כמו: "משנה את כללי המשחק", "הרפתקה", "חלום שהתגשם", "קסם"
- התמקד בערך האמיתי: מה המוצר עושה ולמה הוא שווה
- הקישור מופיע פעם אחת בלבד בסוף
- 5-7 שורות בסך הכל
- אל תציין מחיר`;

    const userPrompt = `מוצר: ${t}${socialProof ? "\n" + socialProof : ""}

כתוב פוסט שיווקי קצר וממוקד. הקישור לרכישה: ${link}`;

    console.log("[generate-hebrew-post] Generating with context:", { title: t, orders, rate });

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

    content = String(content).trim();

    // Clean up the content - remove any existing links and duplicates
    if (link) {
      const escapedLink = link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Remove all instances of the link
      content = content.replace(new RegExp(escapedLink, 'g'), '');
      // Remove placeholder patterns
      content = content.replace(/\[לינק[^\]]*\]/g, '');
      // Remove orphaned emojis before empty lines (like lone 🛒)
      content = content.replace(/^[🛒🔗]\s*$/gm, '');
      // Clean multiple line breaks
      content = content.replace(/\n{3,}/g, '\n\n').trim();
      // Remove trailing colons or "לרכישה:" without link
      content = content.replace(/לרכישה:\s*$/gm, '').trim();
      // Add the link once at the end
      content += `\n\n👉 לרכישה: ${link}`;
    }

    const payload: ApiOk = { success: true, hebrewDescription: content };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
