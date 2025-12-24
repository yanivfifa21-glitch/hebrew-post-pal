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
      socialProof += `\n- כמות הזמנות: ${orders > 500 ? "למעלה מ-500" : orders}`;
    }
    if (rate > 0) {
      const displayRating = rate > 5 ? (rate / 20).toFixed(1) : rate.toFixed(1);
      socialProof += `\n- דירוג: ${displayRating} מתוך 5`;
    }

    const systemPrompt = `אתה משווק שותפים ישראלי מוביל. צור פוסט קצר, קליט ואנושי בעברית.

כללים:
- טון ידידותי ואישי, לא מכירתי או אגרסיבי
- אל תציין מחיר בכלל
- מבנה הפוסט:
  1. משפט פתיחה קליט וסקרני
  2. שתי נקודות קצרות למה המוצר מעולה
  3. הוכחה חברתית (הזמנות/דירוג אם יש)
  4. קריאה לפעולה עם הקישור בסוף בלבד

חשוב מאוד:
- הקישור לרכישה מופיע פעם אחת בלבד בסוף הפוסט
- השתמש באימוג'י 🛒 או 🔗 לפני הקישור
- שמור על 5-8 שורות בסך הכל`;

    const userPrompt = `מוצר: ${t}${socialProof}

קישור לרכישה: ${link || "[לינק]"}

צור פוסט שיווקי קצר וקליט.`;

    console.log("[generate-hebrew-post] Generating with social proof:", socialProof);

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

    // Ensure affiliate link appears exactly once at the end
    if (link) {
      // Remove any existing instances of the link
      content = content.replace(new RegExp(link.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
      // Remove placeholder text
      content = content.replace(/\[לינק\]/g, '').replace(/\[לינק לרכישה\]/g, '');
      // Clean up any double line breaks
      content = content.replace(/\n{3,}/g, '\n\n').trim();
      // Add link at the end if not present
      if (!content.includes(link)) {
        content += `\n\n🛒 לרכישה: ${link}`;
      }
    }

    const payload: ApiOk = { success: true, hebrewDescription: content };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
