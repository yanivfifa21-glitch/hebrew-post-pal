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
        JSON.stringify({ error: "Google AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    console.log(`Enhancing image for product ${productId}: ${imageUrl}`);

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

    // NOTE:
    // - Vertex AI Imagen endpoints require OAuth (service account), not an API key.
    // - The API key we have is for the Google Generative Language API.
    // So we use a Gemini image-generation capable model via :generateContent.
    const prompt =
      "Transform this product image into a high-end, professional marketing shot. Use cinematic lighting, a clean commercial background, and vibrant colors. Keep the original product shape and details intact but make the overall composition eye-catching and premium. Return only the enhanced image.";

    const candidateModels = [
      // More widely available model ids for the API-key based endpoint
      "gemini-2.0-flash-exp",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
    ];

    let geminiResponse: Response | null = null;
    let lastErrorText: string | null = null;

    for (const model of candidateModels) {
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
              // IMPORTANT: do NOT set responseMimeType (it only supports text/JSON/etc)
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
      console.error(`[enhance-product-image] Model ${model} failed:`, lastErrorText);

      // If model doesn't exist / not enabled, try the next one.
      if (resp.status === 404) continue;
      // For other failures (400/401/429/500), stop early.
      break;
    }

    if (!geminiResponse) {
      throw new Error(`Gemini API error: ${lastErrorText ?? "unknown"}`);
    }

    const geminiResult = await geminiResponse.json();
    console.log("Gemini response received");

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
      console.log("No enhanced image generated, keeping original");
      return new Response(
        JSON.stringify({ 
          success: true, 
          productId,
          imageUrl: imageUrl,
          message: "Image could not be enhanced, keeping original"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Upload enhanced image to Supabase Storage
    const fileName = `enhanced_${productId}_${Date.now()}.jpg`;
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
      console.error("Upload error:", uploadError);
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
        console.error("Update error:", updateError);
        throw new Error(`Failed to update product: ${updateError.message}`);
      }
    }

    console.log(`Successfully enhanced image for product ${productId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        productId,
        imageUrl: publicUrl,
        message: "Image enhanced successfully"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error enhancing image:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to enhance image";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
