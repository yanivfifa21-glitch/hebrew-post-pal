import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate HMAC-SHA256 signature for AliExpress API
async function generateSignature(params: Record<string, string>, appSecret: string): Promise<string> {
  // Sort parameters alphabetically
  const sortedKeys = Object.keys(params).sort();
  
  // Concatenate sorted key-value pairs (no secret prefix/suffix for HMAC)
  let signStr = '';
  for (const key of sortedKeys) {
    signStr += key + params[key];
  }
  
  // Create HMAC-SHA256 signature using Web Crypto API
  const encoder = new TextEncoder();
  const keyData = encoder.encode(appSecret);
  const msgData = encoder.encode(signStr);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  const hashArray = Array.from(new Uint8Array(signature));
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

    // Timestamp in milliseconds (as per AliExpress API docs)
    const timestamp = Date.now().toString();
    
    // API parameters for link generation
    const params: Record<string, string> = {
      app_key: appKey,
      method: 'aliexpress.affiliate.link.generate',
      timestamp: timestamp,
      v: '2.0',
      tracking_id: trackingId,
      promotion_link_type: '0',
      source_values: productUrl,
      sign_method: 'sha256',
    };

    // Generate signature
    const sign = await generateSignature(params, appSecret);
    params.sign = sign;

    // Build query string
    const queryString = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const apiUrl = `https://api-sg.aliexpress.com/sync?${queryString}`;
    
    console.log('Calling AliExpress API for URL:', productUrl);
    console.log('Request params:', JSON.stringify(params));

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    console.log('AliExpress API response:', JSON.stringify(data));

    // Parse response
    const result = data.aliexpress_affiliate_link_generate_response?.resp_result;
    
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

    // Fallback
    console.warn('Could not parse affiliate link from response');
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Could not generate affiliate link',
        rawResponse: data
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
