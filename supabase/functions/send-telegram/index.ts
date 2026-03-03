import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

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
  userId: string;
  accountId?: string;
  mediaType?: 'image' | 'video';
  albumUrls?: string[];
}

function replaceWithCustomEmoji(text: string, emojiMap: Record<string, string>): string {
  for (const [emoji, id] of Object.entries(emojiMap)) {
    text = text.replaceAll(emoji, `<tg-emoji emoji-id="${id}">${emoji}</tg-emoji>`);
  }
  return text;
}

function stripCustomEmojiTags(text: string): string {
  return text.replace(/<tg-emoji emoji-id="[^"]*">([^<]*)<\/tg-emoji>/g, '$1');
}

function escapeHtmlForTelegram(text: string): string {
  // First, protect existing valid HTML tags we want to keep (bold, italic, links, tg-emoji)
  const protectedTags: [string, string][] = [];
  let idx = 0;
  
  // Protect tg-emoji tags
  text = text.replace(/<tg-emoji emoji-id="[^"]*">[^<]*<\/tg-emoji>/g, (match) => {
    const placeholder = `__PROTECTED_${idx}__`;
    protectedTags.push([placeholder, match]);
    idx++;
    return placeholder;
  });
  
  // Protect <b>, <i>, <a>, <code>, <pre>, <u>, <s>, <strike> tags
  text = text.replace(/<\/?(?:b|i|u|s|strike|code|pre|a(?:\s[^>]*)?)>/g, (match) => {
    const placeholder = `__PROTECTED_${idx}__`;
    protectedTags.push([placeholder, match]);
    idx++;
    return placeholder;
  });
  
  // Escape remaining < and > that are not part of valid HTML
  text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Restore protected tags
  for (const [placeholder, original] of protectedTags) {
    text = text.replace(placeholder, original);
  }
  
  return text;
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  caption: string,
  imageUrl: string | null,
  mediaType: string | undefined
): Promise<any> {
  if (imageUrl) {
    const isVideo = mediaType === 'video' || 
      imageUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null;
    
    if (isVideo) {
      console.log("[send-telegram] Downloading video for upload...");
      try {
        const videoResponse = await fetch(imageUrl);
        if (!videoResponse.ok) throw new Error(`Failed to download video: ${videoResponse.status}`);
        const videoBlob = await videoResponse.blob();
        console.log("[send-telegram] Video downloaded, size:", videoBlob.size);

        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", caption);
        formData.append("parse_mode", "HTML");
        formData.append("video", videoBlob, "video.mp4");
        formData.append("supports_streaming", "true");

        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendVideo`,
          { method: "POST", body: formData }
        );
        return await response.json();
      } catch (downloadErr) {
        console.error("[send-telegram] Video download failed, trying URL method:", downloadErr);
        const response = await fetch(
          `https://api.telegram.org/bot${botToken}/sendVideo`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, video: imageUrl, caption, parse_mode: "HTML", supports_streaming: true }),
          }
        );
        return await response.json();
      }
    } else {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, photo: imageUrl, caption, parse_mode: "HTML" }),
        }
      );
      return await response.json();
    }
  } else {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: caption, parse_mode: "HTML" }),
      }
    );
    return await response.json();
  }
}

// Send album (media group) via Telegram
async function sendTelegramAlbum(
  botToken: string,
  chatId: string,
  caption: string,
  albumUrls: string[]
): Promise<any> {
  const media = albumUrls.map((url, idx) => ({
    type: "photo" as const,
    media: url,
    ...(idx === 0 ? { caption, parse_mode: "HTML" } : {}),
  }));

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, media }),
    }
  );
  return await response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { title, hebrewDescription, price, imageUrl, affiliateLink, userId, accountId, mediaType, albumUrls }: TelegramRequest = await req.json();

    if (userId !== user.id) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Cannot access other users' data" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let botToken: string | null = null;
    let chatId: string | null = null;

    if (accountId) {
      const { data: credentials, error: credError } = await supabase
        .rpc("get_decrypted_messaging_account_credentials", { 
          p_account_id: accountId, p_user_id: user.id
        });

      if (credError || credentials?.error) {
        return new Response(
          JSON.stringify({ success: false, error: credentials?.error || "Failed to fetch account credentials" }),
          { status: credentials?.error === "Account not found" ? 404 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      botToken = credentials?.telegram_bot_token?.trim() || null;
      chatId = credentials?.telegram_chat_id?.trim() || null;
    } else {
      const { data: credentials, error: credentialsError } = await supabase
        .rpc("get_decrypted_user_credentials", { p_user_id: user.id });

      if (credentialsError || credentials?.error) {
        return new Response(
          JSON.stringify({ success: false, error: "Failed to fetch user credentials" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      botToken = credentials?.telegram_bot_token?.trim() || null;
      chatId = credentials?.telegram_chat_id?.trim() || null;
    }

    if (!botToken || !chatId) {
      return new Response(
        JSON.stringify({ success: false, error: "הגדר Bot Token ו-Chat ID בהגדרות הטלגרם" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch user's custom emoji settings
    const { data: settingsData } = await supabase
      .from("app_settings")
      .select("use_custom_emoji")
      .eq("user_id", user.id)
      .maybeSingle();

    const useCustomEmoji = settingsData?.use_custom_emoji !== false; // default true

    let caption = escapeHtmlForTelegram(hebrewDescription);
    let usedCustomEmoji = false;

    if (useCustomEmoji) {
      // Fetch emoji mappings for this user
      const { data: emojiMappings } = await supabase
        .from("custom_emoji_mappings")
        .select("emoji, custom_emoji_id")
        .eq("user_id", user.id);

      if (emojiMappings && emojiMappings.length > 0) {
        const emojiMap: Record<string, string> = {};
        for (const m of emojiMappings) {
          emojiMap[m.emoji] = m.custom_emoji_id;
        }
        caption = replaceWithCustomEmoji(caption, emojiMap);
        usedCustomEmoji = true;
        console.log("[send-telegram] Applied custom emoji replacements");
      }
    }

    console.log("[send-telegram] Sending for user:", user.email);

    let result: any;

    // Album mode: sendMediaGroup
    if (albumUrls && albumUrls.length > 1) {
      console.log(`[send-telegram] Sending album with ${albumUrls.length} photos`);
      result = await sendTelegramAlbum(botToken, chatId, caption, albumUrls);
      console.log("[send-telegram] Album response:", JSON.stringify(result));

      // sendMediaGroup returns array on success
      if (Array.isArray(result.result) || result.ok) {
        return new Response(
          JSON.stringify({ success: true, messageId: result.result?.[0]?.message_id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If custom emoji caused failure, retry without them
      if (usedCustomEmoji && result.error_code === 400) {
        console.log("[send-telegram] Album: Custom emoji failed, retrying plain...");
        const plainCaption = stripCustomEmojiTags(caption);
        result = await sendTelegramAlbum(botToken, chatId, plainCaption, albumUrls);
      }
    } else {
      // Single media or text
      result = await sendTelegramMessage(botToken, chatId, caption, imageUrl, mediaType);
      console.log("[send-telegram] Response:", JSON.stringify(result));

      // If custom emoji caused a 400 error, retry without them
      if (!result.ok && usedCustomEmoji && result.error_code === 400) {
        console.log("[send-telegram] Custom emoji failed, retrying with plain text...");
        const plainCaption = stripCustomEmojiTags(caption);
        result = await sendTelegramMessage(botToken, chatId, plainCaption, imageUrl, mediaType);
        console.log("[send-telegram] Retry response:", JSON.stringify(result));
      }
    }

    if (result.ok || (Array.isArray(result.result))) {
      return new Response(
        JSON.stringify({ success: true, messageId: result.result?.message_id || result.result?.[0]?.message_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      console.error("[send-telegram] Telegram API error:", result);
      return new Response(
        JSON.stringify({ success: false, error: result.description || "Failed to send message", code: result.error_code }),
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
