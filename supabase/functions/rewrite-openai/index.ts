import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UNIFIED_PROMPT = `You are an expert Israeli marketing copywriter for Telegram deal channels.

Rewrite the following post in Hebrew using this structure:

[אימוג'י פתיחה + כותרת מושכת]

[2–3 שורות תיאור קצרות עם יתרונות]

[שורת מחיר - רק אם מחיר מופיע במפורש בנתונים!]
[שורת קופון - רק אם קוד קופון מופיע במפורש!]

[שורת הזמנות ודירוג - רק אם נתונים מופיעים!]

🔗 להזמנה >> [קישור]

ABSOLUTE RULES - FOLLOW EXACTLY:

PRICES:
- **NEVER INVENT, GUESS, OR MAKE UP PRICES.** This is the #1 rule.
- If the ORIGINAL TEXT contains a price (a number next to $ or ₪), use EXACTLY that price. Do NOT replace it with a different price from PRODUCT DATA or anywhere else.
- If the original text says "16₪" or "$5.17", write EXACTLY those numbers. Do NOT substitute with API prices.
- If NO actual price number appears in the original text AND no price is in the PRODUCT DATA section, COMPLETELY OMIT any price line. No 💰 line at all.
- Marketing phrases like "מחיר כזה" or "מחיר משתלם" are NOT prices - ignore them.
- Format: "💰 רק [exact original price] בלבד!" - keep both ₪ and $ if both appear in original.

SHIPPING:
- If the original text mentions free shipping (משלוח חינם), ALWAYS include it in the rewrite.
- Keep the exact shipping condition (e.g. "בקנייה מעל 12$", "מעל 10$", etc.)
- Format: "🚚 משלוח חינם [condition if any]!"

COUPONS:
- If a specific coupon CODE exists (e.g. "SAVE5", "CODE123"), include: "עם קופון [CODE]"
- If NO specific coupon code exists, OMIT the coupon line entirely. Do NOT write "עם קופון" without a code.

ORDERS & RATING:
- PRIORITY: Use numbers from the ORIGINAL TEXT first. Only use PRODUCT DATA numbers if the original text has none.
- Format: "⭐ מעל [X] הזמנות בציון [Y]"
- If no data available from either source, OMIT the ⭐ line entirely. Do NOT invent numbers.

OTHER RULES:
- Only return the rewritten text
- Output in Hebrew
- Do NOT add any explanation or metadata
- Do NOT wrap in markdown code blocks
- Use different emojis and wording each time for variety
- Round orders: 1000+ → "1K+", 5400 → "5.4K+", etc.
- Rating should be on a 5-star scale (e.g. 4.9)`;

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
    const { text, version, provider, productData } = body;

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
      productDataSection = "\n\n--- PRODUCT DATA (use these exact numbers) ---";
      if (productData.price) {
        const priceILS = productData.priceILS || Math.round(productData.price * exchangeRate);
        productDataSection += `\nמחיר: $${productData.price} ~ כ-${priceILS}₪`;
      }
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

    const systemPrompt = `${UNIFIED_PROMPT}${productDataSection}`;

    let rewrittenText = "";

    if (selectedProvider === "gemini") {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: `${systemPrompt}\n\nHere is the post to rewrite:\n\n${text}` }] },
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
            { role: "user", content: `Here is the post to rewrite:\n\n${text}` },
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
