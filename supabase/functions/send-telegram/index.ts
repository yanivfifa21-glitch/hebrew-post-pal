import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TelegramRequest {
  title: string;
  hebrewDescription: string;
  price: number;
  imageUrl: string | null;
  affiliateLink: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, hebrewDescription, price, imageUrl, affiliateLink }: TelegramRequest = await req.json();

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID")?.trim();

    if (!botToken || !chatId) {
      console.error("[send-telegram] Missing credentials");
      return new Response(
        JSON.stringify({ success: false, error: "Telegram credentials not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format the caption with emojis
    const caption = `${hebrewDescription}

💰 מחיר: ₪${price}

🔗 לרכישה: ${affiliateLink || "קישור לא זמין"}`;

    console.log("[send-telegram] Sending to chat:", chatId);
    console.log("[send-telegram] Caption preview:", caption.substring(0, 100) + "...");

    let result;

    // If there's an image, use sendPhoto, otherwise sendMessage
    if (imageUrl) {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: imageUrl,
            caption: caption,
            parse_mode: "HTML",
          }),
        }
      );
      result = await response.json();
      console.log("[send-telegram] sendPhoto response:", JSON.stringify(result));
    } else {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: caption,
            parse_mode: "HTML",
          }),
        }
      );
      result = await response.json();
      console.log("[send-telegram] sendMessage response:", JSON.stringify(result));
    }

    if (result.ok) {
      return new Response(
        JSON.stringify({ success: true, messageId: result.result?.message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("[send-telegram] Telegram API error:", result);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: result.description || "Failed to send message",
          code: result.error_code 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    console.error("[send-telegram] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
