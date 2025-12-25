import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApiOk = { success: true; hebrewDescription: string };
type ApiErr = { success: false; error: string; code?: string };

const DEFAULT_SYSTEM_PROMPT = `אתה משווק שותפים ישראלי מקצועי. כתוב פוסט לערוץ דילים בעברית לפי המבנה הבא בדיוק:

מבנה חובה:
1. שורת כותרת: [אימוג'י מתאים] *[שם המוצר] – [תכונה עיקרית]* (הדגש עם כוכביות)
2. תיאור קצר: 1-2 משפטים בטון טבעי ופשוט שמסבירים מה זה ולמה זה דיל טוב
3. שורת מחיר והנחה: 💰 *[מחיר מקורי]* ➜ *[מחיר סופי]* ([אחוז הנחה]% הנחה!) - רק אם יש מידע
4. שורת הוכחה חברתית: ⭐ מעל *[הזמנות] הזמנות* | דירוג *[ציון]* (רק אם יש מידע)
5. יתרונות: 2 נקודות קצרות עם אימוג'ים רלוונטיים (⚡ למהירות, 🔋 לסוללה, 🛡️ לעמידות וכו')
6. שורת קופון (אם יש): 🎟️ יש להזין קופון: *[קוד הקופון]* [פרטי ההנחה אם יש]

כללים קריטיים:
- אסור להוסיף קישור או "לחץ כאן" או "להזמנה" - האפליקציה תוסיף את זה
- אסור להשתמש בביטויים כמו: "שובר שיאים", "כובש מסלולים", "משנה את כללי המשחק", "הרפתקה", "חלום"
- השתמש בשפה ישירה, פשוטה ומועילה
- השתמש בכוכביות (*) להדגשה כמו בדוגמה
- אם יש קופון בלי ערך ספציפי, כתוב: "יש להזין קופון: [קוד]"
- אם יש שני קופונים, כתוב: "יש להזין קופון + קופון"`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { 
      title, 
      ordersCount, 
      rating, 
      userId,
      // New Excel fields
      originalPrice,
      discountPrice,
      discountPercent,
      couponCode,
      couponValue
    } = body;
    
    const t = String(title || "").trim();
    const orders = Number(ordersCount) || 0;
    const rate = Number(rating) || 0;
    const origPrice = Number(originalPrice) || 0;
    const discPrice = Number(discountPrice) || 0;
    const discPct = Number(discountPercent) || 0;
    const coupon = String(couponCode || "").trim();
    const couponVal = String(couponValue || "").trim();

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

    // Build comprehensive product context
    const productDetails: string[] = [];
    
    // Add price info if available
    if (origPrice > 0 && discPrice > 0) {
      productDetails.push(`מחיר מקורי: $${origPrice.toFixed(2)}`);
      productDetails.push(`מחיר סופי: $${discPrice.toFixed(2)}`);
      if (discPct > 0) {
        productDetails.push(`הנחה: ${discPct}%`);
      } else {
        const calculatedDiscount = Math.round(((origPrice - discPrice) / origPrice) * 100);
        if (calculatedDiscount > 0) {
          productDetails.push(`הנחה: ${calculatedDiscount}%`);
        }
      }
    } else if (discPrice > 0) {
      productDetails.push(`מחיר: $${discPrice.toFixed(2)}`);
    }

    // Add social proof
    if (rate > 0) {
      const displayRating = rate > 5 ? (rate / 20).toFixed(1) : rate.toFixed(1);
      productDetails.push(`ציון: ${displayRating}/5 כוכבים`);
    }
    if (orders > 0) {
      const ordersText = orders > 1000 ? `${Math.round(orders/1000)}K+` : orders > 500 ? "מאות" : orders > 100 ? "עשרות" : String(orders);
      productDetails.push(`הזמנות: ${ordersText}`);
    }

    // Add coupon info with smart logic
    if (coupon) {
      if (couponVal) {
        productDetails.push(`קופון: ${coupon} (הנחה: ${couponVal})`);
      } else {
        productDetails.push(`קופון להזנה: ${coupon}`);
      }
    }

    const userPrompt = `מוצר: ${t}
${productDetails.length > 0 ? `\nפרטים:\n${productDetails.join("\n")}` : ""}

כתוב פוסט לערוץ דילים לפי המבנה. בלי קישור.`;

    console.log("[generate-hebrew-post] Generating description with full data:", {
      title: t,
      originalPrice: origPrice,
      discountPrice: discPrice,
      discountPercent: discPct,
      couponCode: coupon,
      couponValue: couponVal,
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
