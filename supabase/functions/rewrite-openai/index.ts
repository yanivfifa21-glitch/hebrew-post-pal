import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VERSION_PROMPTS = [
  `Rewrite the following post **exactly in the style of an Israeli Telegram deals channel**:
- Short, 2–3 lines description
- Include emojis
- Clear marketing style
- Always keep the structure:
  [אימוג'י פתיחה + כותרת מושכת]
  [2–3 שורות תיאור קצרות עם יתרונות]
  💰 רק [מחיר בדולרים] ~ כ-[מחיר בשקלים] בלבד!
  [שורת אמינות: דירוג / מספר הזמנות / מבצע]
  🔗 להזמנה >> [קישור]`,

  `Rewrite in a different style:
- Short, catchy Hebrew
- Fun and casual
- Use emojis
- Always keep the structure:
  [אימוג'י פתיחה + כותרת מושכת]
  [2–3 שורות תיאור קצרות עם יתרונות]
  💰 רק [מחיר בדולרים] ~ כ-[מחיר בשקלים] בלבד!
  [שורת אמינות: דירוג / מספר הזמנות / מבצע]
  🔗 להזמנה >> [קישור]`,

  `Rewrite in another style:
- Short, persuasive, slightly more energetic
- Use different wording and flow
- Keep emojis
- Always keep the structure:
  [אימוג'י פתיחה + כותרת מושכת]
  [2–3 שורות תיאור קצרות עם יתרונות]
  💰 רק [מחיר בדולרים] ~ כ-[מחיר בשקלים] בלבד!
  [שורת אמינות: דירוג / מספר הזמנות / מבצע]
  🔗 להזמנה >> [קישור]`,
];

const COMMON_RULES = `
Rules:
- Preserve price (if exists), rating, number of orders, and link exactly as they appear
- If product data is provided below, USE THE EXACT numbers for price, orders, rating and link
- Only return the rewritten text
- Output in Hebrew
- Do NOT add any explanation or metadata
- Do NOT wrap in markdown code blocks`;

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
    // productData: { price?, orders?, rating?, link?, priceILS? }

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

    const versionIndex = ((version || 1) - 1) % 3;
    const versionPrompt = VERSION_PROMPTS[versionIndex];

    // Build product data section for the prompt
    let productDataSection = "";
    if (productData) {
      productDataSection = "\n\n--- PRODUCT DATA (use these exact numbers) ---";
      if (productData.price) {
        const priceILS = productData.priceILS || Math.round(productData.price * exchangeRate);
        productDataSection += `\nמחיר: $${productData.price} ~ כ-${priceILS}₪`;
      }
      if (productData.orders) productDataSection += `\nמספר הזמנות: ${productData.orders >= 1000 ? Math.round(productData.orders / 100) / 10 + 'K+' : productData.orders + '+'}`;
      if (productData.rating) productDataSection += `\nדירוג: ⭐ ${productData.rating}`;
      if (productData.link) productDataSection += `\nקישור: ${productData.link}`;
      productDataSection += "\n---";
    }

    const systemPrompt = `You are an expert Israeli marketing copywriter for Telegram deal channels.
${versionPrompt}
${COMMON_RULES}${productDataSection}`;

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
        
        // Parse error for better user message
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
      version: versionIndex + 1,
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
