import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate MD5 signature for AliExpress API (with secret wrapping)
async function generateSignature(params: Record<string, string>, appSecret: string): Promise<string> {
  // Sort parameters alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  
  // Build string: secret + key1value1key2value2... + secret
  let signStr = appSecret;
  for (const key of sortedKeys) {
    signStr += key + params[key];
  }
  signStr += appSecret;
  
  console.log('Sign string (first 100 chars):', signStr.substring(0, 100));
  
  // Calculate MD5 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(signStr);
  const hashBuffer = await crypto.subtle.digest('MD5', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { productUrl } = await req.json();

    if (!productUrl) {
      return new Response(
        JSON.stringify({ success: false, error: 'Product URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appKey = Deno.env.get('ALIEXPRESS_APP_KEY');
    const appSecret = Deno.env.get('ALIEXPRESS_APP_SECRET');
    const trackingId = Deno.env.get('ALIEXPRESS_TRACKING_ID');

    if (!appKey || !appSecret || !trackingId) {
      console.error('Missing AliExpress API credentials');
      return new Response(
        JSON.stringify({ success: false, error: 'AliExpress API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Timestamp in milliseconds
    const timestamp = Date.now().toString();
    
    // API parameters for link generation (using MD5 sign method)
    const params: Record<string, string> = {
      app_key: appKey,
      method: 'aliexpress.affiliate.link.generate',
      promotion_link_type: '0',
      sign_method: 'md5',
      source_values: productUrl,
      timestamp: timestamp,
      tracking_id: 'TELEGRAM',
      v: '2.0',
    };

    console.log('Params before signing:', JSON.stringify(params));

    // Generate signature
    const sign = await generateSignature(params, appSecret);
    
    console.log('Generated signature:', sign);

    // Build URL with all params including sign
    const allParams = { ...params, sign };
    const queryString = Object.entries(allParams)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const apiUrl = `https://api-sg.aliexpress.com/sync?${queryString}`;
    
    console.log('Calling AliExpress API for URL:', productUrl);

    const response = await fetch(apiUrl, {
      method: 'GET',
    });

    const data = await response.json();
    console.log('AliExpress API response:', JSON.stringify(data));

    // Parse response - check multiple possible structures
    const result = data.aliexpress_affiliate_link_generate_response?.resp_result 
                || data.aliexpress_affiliate_link_generate_response;
    
    if (result?.resp_code === 200 && result?.result?.promotion_links?.length > 0) {
      const affiliateLink = result.result.promotion_links[0].promotion_link;
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          affiliateLink,
          originalUrl: productUrl 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle API errors
    if (data.error_response) {
      console.error('AliExpress API error:', data.error_response);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: data.error_response.msg || 'API error',
          code: data.error_response.code 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fallback - log full response for debugging
    console.warn('Unexpected response structure:', JSON.stringify(data));
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Unexpected API response format',
        debug: data
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error generating affiliate link:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
