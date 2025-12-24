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
    const { title, priceUsd } = await req.json();
    const t = String(title || "").trim();
    const p = Number(priceUsd);

    if (!t || !Number.isFinite(p)) {
      const payload: ApiErr = { success: false, error: "title and priceUsd are required" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ils = Math.round(p * 3.7);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      const payload: ApiErr = { success: false, error: "AI is not configured" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const systemPrompt = `אתה קופירייטר שמייצר פוסט קצר לשיווק מוצר בעברית לוואטסאפ.\nכללים:\n- כתוב בעברית בלבד\n- שמור על 6-10 שורות\n- תכלול מחיר בשקלים\n- תכלול 3-5 נקודות מכירה קצרות\n- סיים בקריאה לפעולה`;

    const userPrompt = `מוצר: ${t}\nמחיר משוער: ₪${ils}\nצור פוסט שיווקי.`;

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
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      const payload: ApiErr = { success: false, error: "AI returned empty response" };
      return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const payload: ApiOk = { success: true, hebrewDescription: String(content).trim() };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: unknown) {
    const payload: ApiErr = { success: false, error: e instanceof Error ? e.message : "Unknown error" };
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
