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
- Keep all original info (price, rating, orders, link)`,

  `Rewrite in another style:
- Short, persuasive, slightly more energetic
- Use different wording and flow
- Keep emojis, all info intact`,
];

const COMMON_RULES = `
Rules:
- Preserve price (if exists), rating, number of orders, and link exactly as they appear
- Only return the rewritten text
- Output in Hebrew
- Do NOT add any explanation or metadata
- Output inside a Markdown code block ready for copy`;

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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { text, version } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's OpenAI API key from app_settings
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await serviceClient
      .from("app_settings")
      .select("openai_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    const apiKey = (settings as any)?.openai_api_key;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured. Please add it in Settings." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const versionIndex = ((version || 1) - 1) % 3;
    const versionPrompt = VERSION_PROMPTS[versionIndex];

    const systemPrompt = `You are an expert Israeli marketing copywriter for Telegram deal channels.
${versionPrompt}
${COMMON_RULES}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
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
      return new Response(JSON.stringify({ error: `OpenAI API error: ${response.status}` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let rewrittenText = data.choices?.[0]?.message?.content || "";

    // Strip markdown code block if present
    rewrittenText = rewrittenText.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "").trim();

    return new Response(JSON.stringify({
      success: true,
      rewrittenText,
      version: versionIndex + 1,
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
