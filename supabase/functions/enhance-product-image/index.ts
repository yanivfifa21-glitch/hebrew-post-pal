import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnhanceRequest {
  productId?: string;
  imageUrl: string;
  userId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const googleApiKey = Deno.env.get("GOOGLE_AI_KEY");

    if (!googleApiKey) {
      return new Response(
        JSON.stringify({ 
          error: "Google AI API key not configured",
          quotaExceeded: true,
          hebrewMessage: "מפתח Google AI לא מוגדר. שדרוג תמונות לא זמין."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { productId, imageUrl, userId }: EnhanceRequest = await req.json();

    if (!imageUrl || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: imageUrl, userId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user owns this product
    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[enhance-product-image] Enhancing image for product ${productId}: ${imageUrl}`);

    // Fetch the original image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch original image: ${imageResponse.status}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = btoa(
      new Uint8Array(imageBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
    );

    // Determine mime type from URL or default to jpeg
    const mimeType = imageUrl.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

    const prompt =
      "Transform this product image into a high-end, professional marketing shot. Use cinematic lighting, a clean commercial background, and vibrant colors. Keep the original product shape and details intact but make the overall composition eye-catching and premium. Return only the enhanced image.";

    // Try models that support image generation
    const candidateModels = [
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ];

    let geminiResponse: Response | null = null;
    let lastErrorText: string | null = null;
    let quotaExceeded = false;

    for (const model of candidateModels) {
      console.log(`[enhance-product-image] Trying model: ${model}`);
      
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: mimeType,
                      data: base64Image,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
            },
          }),
        }
      );

      if (resp.ok) {
        geminiResponse = resp;
        break;
      }

      lastErrorText = await resp.text();
      console.error(`[enhance-product-image] Model ${model} failed (${resp.status}):`, lastErrorText);

      // Check for quota exceeded (429)
      if (resp.status === 429) {
        quotaExceeded = true;
        break;
      }

      // If model doesn't exist / not enabled, try the next one.
      if (resp.status === 404) continue;
      
      // For other failures (400/401/500), stop early.
      break;
    }

    // Handle quota exceeded gracefully - return original image with message
    if (quotaExceeded) {
      console.log("[enhance-product-image] Quota exceeded, returning original image");
      return new Response(
        JSON.stringify({ 
          success: false, 
          productId,
          imageUrl: imageUrl,
          quotaExceeded: true,
          hebrewMessage: "חרגת ממכסת השימוש החינמית ב-Google AI. שדרוג התמונה לא זמין כרגע. נסה שוב מאוחר יותר או הפעל חיוב בחשבון Google Cloud."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!geminiResponse) {
      console.error("[enhance-product-image] All models failed:", lastErrorText);
      return new Response(
        JSON.stringify({ 
          success: false, 
          productId,
          imageUrl: imageUrl,
          hebrewMessage: "שדרוג התמונה נכשל. מוחזרת התמונה המקורית."
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiResult = await geminiResponse.json();
    console.log("[enhance-product-image] Gemini response received");

    // Extract the generated image from the response
    let enhancedImageBase64: string | null = null;
    
    if (geminiResult?.candidates?.[0]?.content?.parts) {
      for (const part of geminiResult.candidates[0].content.parts) {
        const data = part?.inlineData?.data ?? part?.inline_data?.data;
        if (data) {
          enhancedImageBase64 = data;
          break;
        }
      }
    }

    if (!enhancedImageBase64) {
      // If no image was generated, return the original
      console.log("[enhance-product-image] No enhanced image generated, keeping original");
      return new Response(
        JSON.stringify({ 
          success: true, 
          productId,
          imageUrl: imageUrl,
          hebrewMessage: "לא ניתן היה לשדרג את התמונה. מוחזרת התמונה המקורית."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload enhanced image to Supabase Storage
    const fileName = `enhanced_${productId || 'temp'}_${Date.now()}.jpg`;
    const imageBytes = Uint8Array.from(atob(enhancedImageBase64), c => c.charCodeAt(0));
    
    // Check if bucket exists, create if not
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === "product-images");
    
    if (!bucketExists) {
      await supabase.storage.createBucket("product-images", {
        public: true,
        fileSizeLimit: 10485760, // 10MB
      });
    }

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, imageBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[enhance-product-image] Upload error:", uploadError);
      throw new Error(`Failed to upload enhanced image: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from("product-images")
      .getPublicUrl(fileName);

    // Update product in database (only when we already have a productId)
    if (productId) {
      const { error: updateError } = await supabase
        .from("products")
        .update({ image_url: publicUrl })
        .eq("id", productId)
        .eq("user_id", userId);

      if (updateError) {
        console.error("[enhance-product-image] Update error:", updateError);
        throw new Error(`Failed to update product: ${updateError.message}`);
      }
    }

    console.log(`[enhance-product-image] Successfully enhanced image for product ${productId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        productId,
        imageUrl: publicUrl,
        hebrewMessage: "התמונה שודרגה בהצלחה!"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[enhance-product-image] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to enhance image";
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        hebrewMessage: "אירעה שגיאה בשדרוג התמונה. נסה שוב מאוחר יותר."
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
