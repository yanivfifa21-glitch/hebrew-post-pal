import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  title: string;
  hebrewDescription: string;
  price: number;
  imageUrl: string | null;
  affiliateLink: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { title, hebrewDescription, price, imageUrl, affiliateLink }: WhatsAppRequest = await req.json();

    const instanceId = Deno.env.get("GREENAPI_INSTANCE_ID");
    const apiToken = Deno.env.get("GREENAPI_API_TOKEN");
    const chatId = Deno.env.get("GREENAPI_CHAT_ID");

    if (!instanceId || !apiToken || !chatId) {
      console.error("Missing GreenAPI credentials");
      return new Response(
        JSON.stringify({ success: false, error: "GreenAPI credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format the message with emojis and structure
    const message = `${hebrewDescription}

💰 מחיר: ₪${price}

🔗 לרכישה: ${affiliateLink || "קישור לא זמין"}`;

    console.log("Sending WhatsApp message to:", chatId);
    console.log("Message preview:", message.substring(0, 100) + "...");

    // If there's an image, send image with caption
    if (imageUrl) {
      const imageResponse = await fetch(
        `https://api.greenapi.com/waInstance${instanceId}/sendFileByUrl/${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatId,
            urlFile: imageUrl,
            fileName: "product.jpg",
            caption: message,
          }),
        }
      );

      const imageResult = await imageResponse.json();
      console.log("GreenAPI image response:", imageResult);

      if (imageResult.idMessage) {
        return new Response(
          JSON.stringify({ success: true, messageId: imageResult.idMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(imageResult.message || "Failed to send image");
      }
    } else {
      // Send text only
      const textResponse = await fetch(
        `https://api.greenapi.com/waInstance${instanceId}/sendMessage/${apiToken}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: chatId,
            message: message,
          }),
        }
      );

      const textResult = await textResponse.json();
      console.log("GreenAPI text response:", textResult);

      if (textResult.idMessage) {
        return new Response(
          JSON.stringify({ success: true, messageId: textResult.idMessage }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(textResult.message || "Failed to send message");
      }
    }
  } catch (error: unknown) {
    console.error("Error sending WhatsApp:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
