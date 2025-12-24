import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Clean and expand AliExpress URL
async function cleanAliExpressUrl(url: string): Promise<string> {
  let cleanUrl = url.trim();
  
  // If it's a short link, try to expand it
  if (cleanUrl.includes('a.aliexpress.com') || cleanUrl.includes('s.click.aliexpress.com')) {
    try {
      const response = await fetch(cleanUrl, {
        method: 'HEAD',
        redirect: 'follow',
      });
      cleanUrl = response.url;
      console.log('Expanded URL:', cleanUrl);
    } catch (e) {
      console.warn('Could not expand short URL:', e);
    }
  }
  
  // Extract product ID from various URL formats
  const productIdMatch = cleanUrl.match(/\/item\/(\d+)\.html/) 
                      || cleanUrl.match(/\/(\d+)\.html/)
                      || cleanUrl.match(/productId[=:](\d+)/i);
  
  if (productIdMatch) {
    const productId = productIdMatch[1];
    // Return clean product URL
    return `https://www.aliexpress.com/item/${productId}.html`;
  }
  
  return cleanUrl;
}

// Extract product data from HTML using regex (basic scraping)
function extractProductData(html: string, originalUrl: string): {
  title: string;
  price: number;
  image_url: string;
  orders_count: number;
  rating: number;
} {
  // Try to extract title
  let title = 'AliExpress Product';
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
                  || html.match(/"subject":"([^"]+)"/i)
                  || html.match(/data-pl="product-title"[^>]*>([^<]+)</i);
  if (titleMatch) {
    title = titleMatch[1].replace(/\s*-\s*AliExpress.*$/i, '').trim();
  }
  
  // Try to extract price
  let price = 0;
  const priceMatch = html.match(/US\s*\$\s*([\d.]+)/i)
                  || html.match(/"formatedActivityPrice":"US \$?([\d.]+)"/i)
                  || html.match(/"minPrice":"?([\d.]+)"?/i)
                  || html.match(/"discountPrice":\{"minPrice":([\d.]+)/);
  if (priceMatch) {
    price = parseFloat(priceMatch[1]);
  }
  
  // Try to extract image
  let image_url = '';
  const imageMatch = html.match(/"imagePathList":\["([^"]+)"/i)
                  || html.match(/class="magnifier-image"[^>]+src="([^"]+)"/i)
                  || html.match(/og:image"[^>]+content="([^"]+)"/i);
  if (imageMatch) {
    image_url = imageMatch[1];
    if (image_url.startsWith('//')) {
      image_url = 'https:' + image_url;
    }
  }
  
  // Try to extract orders count
  let orders_count = 0;
  const ordersMatch = html.match(/(\d+)\+?\s*sold/i)
                   || html.match(/"tradeCount":"?(\d+)"?/i);
  if (ordersMatch) {
    orders_count = parseInt(ordersMatch[1]);
  }
  
  // Try to extract rating
  let rating = 0;
  const ratingMatch = html.match(/"averageStar":"?([\d.]+)"?/i)
                   || html.match(/(\d\.?\d?)\s*\/\s*5/);
  if (ratingMatch) {
    rating = parseFloat(ratingMatch[1]);
  }
  
  return { title, price, image_url, orders_count, rating };
}

serve(async (req) => {
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

    console.log('Original URL:', productUrl);
    
    // Clean the URL
    const cleanUrl = await cleanAliExpressUrl(productUrl);
    console.log('Clean URL:', cleanUrl);

    // Fetch the product page
    const response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch product page: ${response.status}`);
    }

    const html = await response.text();
    console.log('Fetched HTML length:', html.length);

    // Extract product data
    const productData = extractProductData(html, cleanUrl);
    console.log('Extracted data:', JSON.stringify(productData));

    // Return the data
    return new Response(
      JSON.stringify({
        success: true,
        data: productData,
        cleanUrl: cleanUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error fetching product:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
