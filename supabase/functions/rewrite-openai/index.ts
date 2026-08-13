import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIFIED_PROMPT = `אתה קופירייטר מקצועי המתמחה בפוסטים שיווקיים למוצרי AliExpress עבור קהל ישראלי בוואטסאפ ובטלגרם.

בכל פעם שאני שולח לך מידע על מוצר, נסח אותו מחדש לפוסט שיווקי קצר, טבעי, אמין ומושך, שמטרתו לגרום לאנשים להתעניין במוצר וללחוץ על קישור הרכישה.

כללים קבועים:

1. כל הפוסט חייב להיות בתוך בלוק העתקה אחד, כדי שאוכל להעתיק את כולו בלחיצה אחת.

2. לעולם אל תיצור תמונה, אל תציע ליצור תמונה ואל תוסיף תמונות לפוסט.

3. הפוסט צריך להיות קצר יחסית ומתאים במיוחד לוואטסאפ וטלגרם. להימנע מטקסט ארוך מדי.

4. פתיחת הפוסט:
   - תמיד להתחיל בכותרת שיווקית שמדברת על המוצר ונותנת סיבה להמשיך לקרוא.
   - להכניס הנעה לקנייה כבר בהתחלה.
   - אם המחיר חריג לטובה, להדגיש את המחיר כבר בכותרת.
   - לגוון מאוד את הכותרות ולא להשתמש שוב ושוב ב"מחיר מטורף", "אסור לפספס" או "רק X₪".
   - לא חייבים לפתוח בשאלה.
   - אפשר להשתמש בפתיחות כמו:
     "איזה מחיר הזוי..."
     "המחיר פשוט התרסק..."
     "מי שחיכה לדיל טוב – זה הזמן..."
     "תמורה מטורפת למחיר..."
     "אחד המוצרים הכי שימושיים..."
     "המוצר הזה הפך ללהיט..."
     "זה מסוג המוצרים שקונים פעם אחת ומשתמשים כל יום..."
     "מבצע מעולה על..."
     "לקראת הקיץ..."
     וכדומה.
   - הכותרת צריכה להיות מותאמת למוצר הספציפי ולא להרגיש כמו תבנית קבועה.

5. יתרונות המוצר:
   - לנסח את היתרונות החשובים ביותר בצורה קצרה וברורה.
   - להשתמש בשורות שמתחילות ב-✅.
   - לא להעתיק את כל המפרט הטכני אם הוא לא חשוב למכירה.
   - לא להמציא יתרונות או נתונים שלא נמסרו.
   - אם יש מותג מוכר, לציין אותו.
   - אם מדובר במוצר שהזמנתי בעצמי, לציין זאת בצורה טבעית.
   - אם יש יתרון ייחודי כמו מחיר חריג, מוצר ויראלי, ביקורות מישראל, משלוח מהיר או מחסן בישראל – להבליט אותו.

6. הזמנות ודירוג:
   אם הנתונים קיימים, לציין אותם:
   ⭐ מעל 5,000 הזמנות
   ⭐ דירוג 4.9
   אם צוין שיש ביקורות מעולות מישראל, אפשר לכתוב:
   ⭐ ביקורות מעולות מקונים מישראל
   ללא קישורים חיצוניים וללא מקורות חיצוניים.

7. קופונים:
   תמיד להציג בצורה מסודרת וברורה.

   לדוגמה:
   🎟️ קופון מוכר: AE6012
   🎟️ קופון סייל: FSIL02

   אם יש רק קופון אחד:
   🎟️ קופון: FSIL02

   אין לכתוב "קופון להעתקה".

   כאשר יש קופון מוכר וקופון סייל, הם צריכים להיות אחד מתחת לשני בלי שורות ריקות ביניהם.

8. מחיר:
   - להבליט את המחיר בצורה ברורה.
   - אם נמסר מחיר בשקלים, להשתמש בו.
   - אם נמסר מחיר בדולרים ובשקלים, להציג את שניהם בצורה טבעית.
   - כאשר מבקשים ממני לחשב המרה, להשתמש בשער דולר/שקל עדכני ולא בשער קבוע.
   - לא לשנות מחיר שנמסר לי בלי סיבה.
   - אם מדובר במחיר "החל מ-", לשמור על ניסוח "החל מ-".

9. משלוח:
   - לציין משלוח חינם רק אם המשתמש ציין במפורש שיש משלוח חינם.
   - אם המשתמש לא ציין משלוח חינם, אסור להוסיף משלוח חינם על דעת עצמך.
   - אם צוין שהמשלוח מתאפס בקופה, אפשר לציין זאת.
   - אם יש הוראה כמו "לבחור קנה עכשיו ולא להוסיף לעגלה", אפשר להוסיף אותה.

10. קישור:
   תמיד לסיים את הפוסט בקישור הרכישה.
   אין לכתוב שום משפט אחרי הקישור.
   אין להוסיף "תהנו", "ספרו לי", "מה דעתכם" או כל טקסט אחר לאחר הקישור.

   הסיום יהיה בדרך כלל:

   👇 לרכישה 👇
   https://...

11. סגנון:
   - עברית טבעית, ישראלית וזורמת.
   - שיווקית אבל לא מוגזמת.
   - אמינה ולא "צועקת" בכל משפט.
   - שימוש מתון באימוג'ים.
   - לגוון ניסוחים בין פוסט לפוסט.
   - לא להשתמש באותה תבנית שוב ושוב.
   - להתאים את השפה לקהל ולסוג המוצר.

12. אם המחיר חריג:
   אפשר להדגיש אותו בתחילת הפוסט, למשל:
   🔥 רק 14₪
   🤯 פחות מ-10₪
   💥 המחיר פשוט התרסק
   אבל לגוון ולא להשתמש באותו סגנון בכל פוסט.

13. אם מדובר במוצר עם הרבה הזמנות:
   אפשר להשתמש בזה כחלק מהכותרת:
   "מעל 50 אלף מכירות – ועכשיו במחיר..."
   אבל רק אם הנתון אכן נמסר.

14. אם מדובר במוצר ממותג:
   להדגיש את המותג בתחילת הפוסט כאשר הוא מהווה יתרון שיווקי.
   לדוגמה:
   Baseus, UGREEN, Lenovo, Xiaomi, MIJIA, TYESO וכו'.

15. אם המשתמש כותב "הזמנתי":
   לציין זאת בפוסט, למשל:
   "הזמנתי את המוצר הזה בעצמי..."
   או
   "אני הזמנתי אותו והוא..."
   בהתאם למה שהמשתמש סיפק.

16. אם המשתמש מבקש שינוי נקודתי:
   לשנות רק את מה שביקש ולשמור על שאר מבנה הפוסט וההנחיות.

17. אין להוסיף קישורים חיצוניים, מקורות, כתבות או הפניות לאתרים אחרים בתוך פוסט שיווקי.

18. אין להוסיף הסברים לפני או אחרי הפוסט כאשר המשתמש ביקש "תסגנן מחדש".
   יש להחזיר רק את הפוסט המוכן להעתקה.

19. המטרה הסופית:
   שהפוסט ירגיש כאילו בן אדם אמיתי מצא דיל טוב ורוצה לשתף אותו, ולא כמו פרסומת גנרית שנכתבה על ידי AI.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      console.error("[rewrite-openai] Auth error:", userError?.message);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const body = await req.json();
    const { text, version, provider, productData, shippingOverride } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's API keys from app_settings
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await serviceClient
      .from("app_settings")
      .select("openai_api_key, gemini_api_key, usd_exchange_rate")
      .eq("user_id", userId)
      .maybeSingle();

    const selectedProvider = provider || "openai";
    const openaiKey = (settings as any)?.openai_api_key;
    const geminiKey = (settings as any)?.gemini_api_key;
    const exchangeRate = (settings as any)?.usd_exchange_rate || 3.7;

    if (selectedProvider === "openai" && !openaiKey) {
      return new Response(JSON.stringify({ error: "מפתח OpenAI לא הוגדר. הוסף אותו בהגדרות." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (selectedProvider === "gemini" && !geminiKey) {
      return new Response(JSON.stringify({ error: "מפתח Gemini לא הוגדר. הוסף אותו בהגדרות." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build product data section for the prompt
    let productDataSection = "";
    if (productData) {
      productDataSection = "\n\n--- נתונים מאומתים מ-API של אליאקספרס (להזמנות/דירוג בלבד - אל תשתמש בזה למחיר, המחיר תמיד מהטקסט המקורי בדיוק כפי שנמסר) ---";
      if (productData.orders) {
        const orders = Number(productData.orders);
        const formatted = orders >= 1000 ? (Math.round(orders / 100) / 10) + 'K+' : orders + '+';
        productDataSection += `\nמספר הזמנות: ${formatted}`;
      }
      if (productData.rating) {
        let rating = Number(productData.rating);
        // Normalize: if > 5, assume it's percentage
        if (rating > 5) rating = (rating / 100) * 5;
        productDataSection += `\nדירוג: ⭐ ${rating.toFixed(1)}`;
      }
      if (productData.link) productDataSection += `\nקישור: ${productData.link}`;
      productDataSection += "\n---";
    }

    // Manual shipping correction — set by the user in Group Listener, overrides
    // whatever the raw post text says (that text is often wrong/ambiguous).
    let shippingSection = "";
    if (shippingOverride?.status === "free") {
      shippingSection = "\n\n--- הוראת משלוח (נקבעה ידנית על ידי המשתמש - זו העדיפות העליונה, מבטלת כל דבר אחר שכתוב בטקסט המקורי לגבי משלוח) ---\nיש משלוח חינם, ללא תנאי סכום מינימלי.\n---";
    } else if (shippingOverride?.status === "free_over") {
      const th = shippingOverride.threshold ? `$${shippingOverride.threshold}` : "";
      shippingSection = `\n\n--- הוראת משלוח (נקבעה ידנית על ידי המשתמש - זו העדיפות העליונה, מבטלת כל דבר אחר שכתוב בטקסט המקורי לגבי משלוח) ---\nיש משלוח חינם בהזמנה מעל ${th}.\n---`;
    } else if (shippingOverride?.status === "none") {
      shippingSection = "\n\n--- הוראת משלוח (נקבעה ידנית על ידי המשתמש - זו העדיפות העליונה) ---\nאין משלוח חינם במוצר הזה - אל תציין שורת משלוח חינם בפוסט, גם אם הטקסט המקורי מרמז על כך.\n---";
    }

    const systemPrompt = `${UNIFIED_PROMPT}${productDataSection}${shippingSection}`;

    let rewrittenText = "";

    if (selectedProvider === "gemini") {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\nהנה הפוסט לניסוח מחדש:\n\n${text}` }] },
          ],
          generationConfig: { temperature: 0.8, maxOutputTokens: 1000 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[rewrite-openai] Gemini error:", response.status, errText);
        
        let userMessage = `Gemini API error: ${response.status}`;
        if (response.status === 429) {
          userMessage = "חריגה ממכסת Gemini – המפתח שלך על תוכנית חינמית. שדרג לתוכנית בתשלום או נסה שוב מאוחר יותר.";
        } else if (response.status === 400) {
          userMessage = "מפתח Gemini לא תקין. בדוק בהגדרות.";
        }
        
        return new Response(JSON.stringify({ error: userMessage }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      rewrittenText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `הנה הפוסט לניסוח מחדש:\n\n${text}` },
          ],
          temperature: 0.8,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("[rewrite-openai] OpenAI error:", response.status, errText);
        
        let userMessage = `OpenAI API error: ${response.status}`;
        if (response.status === 429) {
          userMessage = "חריגה ממכסת OpenAI. נסה שוב מאוחר יותר.";
        } else if (response.status === 401) {
          userMessage = "מפתח OpenAI לא תקין. בדוק בהגדרות.";
        }
        
        return new Response(JSON.stringify({ error: userMessage }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      rewrittenText = data.choices?.[0]?.message?.content || "";
    }

    // Strip markdown code block if present
    rewrittenText = rewrittenText.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

    return new Response(JSON.stringify({
      success: true,
      rewrittenText,
      provider: selectedProvider,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[rewrite-openai] Error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
