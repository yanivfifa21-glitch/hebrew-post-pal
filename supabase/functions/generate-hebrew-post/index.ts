import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string };
type ApiErr = { success: false; error: string; code?: string };

// Default prompt - product description only, no prices/coupons/links
const DEFAULT_SYSTEM_PROMPT = `אתה משווק שותפים ישראלי. כתוב תיאור מוצר קצר וממוקד בעברית.

מבנה חובה:
1. שורת כותרת: [אימוג'י מתאים] *[שם המוצר באנגלית/מותג]* – [תכונה עיקרית בעברית]
2. תיאור: 2-3 שורות בעברית שמסבירים מה המוצר, למה הוא טוב, ויתרונות עיקריים
3. נתונים: ⭐ [דירוג כוכבים] | [כמות הזמנות] הזמנות (רק אם יש מידע)

כללים קריטיים:
- שם המוצר/מותג יישאר באנגלית
- כל השאר בעברית בלבד
- אסור להוסיף מחיר או קופון - המידע הזה יתווסף אוטומטית
- אסור להוסיף קישור או "לחץ כאן" או "להזמנה"
- התמקד בתיאור ויתרונות בלבד`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const payload: ApiErr = { success: false, error: "AI is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch user's custom prompt if userId provided
    let systemPrompt = DEFAULT_SYSTEM_PROMPT;
    
    if (userId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const { data: settings } = await supabase
        .from("app_settings")
        .select("custom_ai_prompt")
        .eq("user_id", userId)
        .maybeSingle();

      if (settings?.custom_ai_prompt?.trim()) {
        systemPrompt = settings.custom_ai_prompt.trim();
        console.log("[generate-hebrew-post] Using custom prompt for user:", userId);
      }
    }

    // Build product context - only title, orders, and rating
    const productDetails: string[] = [];
    
    // Add social proof data from API
    if (rate > 0) {
      const displayRating = rate > 5 ? (rate / 20).toFixed(1) : rate.toFixed(1);
      productDetails.push(`ציון: ${displayRating}/5 כוכבים`);
    }
    if (orders > 0) {
      const ordersText = orders > 10000 ? `${Math.round(orders/1000)}K+` : orders > 1000 ? `${(orders/1000).toFixed(1)}K` : String(orders);
      productDetails.push(`הזמנות: ${ordersText}`);
    }

    const userPrompt = `מוצר: ${t}
${productDetails.length > 0 ? `\nנתונים מה-API:\n${productDetails.join("\n")}` : ""}

כתוב תיאור מוצר קצר. בלי מחיר, בלי קופון, בלי קישור.`;

    console.log("[generate-hebrew-post] Generating description:", {
      title: t,
      ordersCount: orders,
      rating: rate,
      userId: userId || "none"
    });

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
    // Clean up extra newlines
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    const payload: ApiOk = { success: true, hebrewDescription: content };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    console.error("[generate-hebrew-post] Error:", e);
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
