import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ScrapedProduct = {
  product_id: string;
  title: string;
  price: number;
  original_price: number;
  image_url: string;
  product_url: string;
  discount_percent?: number;
};

type ApiOk = { success: true; products: ScrapedProduct[]; source: string };
type ApiErr = { success: false; error: string; fallback?: boolean };

// Extract products from AliExpress page HTML using regex patterns
function extractProductsFromHtml(html: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  try {
    // Try to find runParams or similar JSON data embedded in the page
    const runParamsPatterns = [
      /window\.runParams\s*=\s*({[\s\S]*?});/,
      /data:\s*({[\s\S]*?})\s*,\s*csrfToken/,
      /"itemList"\s*:\s*(\[[\s\S]*?\])/,
      /"products"\s*:\s*(\[[\s\S]*?\])/,
    ];

    for (const pattern of runParamsPatterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        try {
          const data = JSON.parse(match[1]);
          const items = data?.itemList || data?.products || data?.data?.products || [];
          
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              const product = parseProductItem(item);
              if (product) products.push(product);
            }
            if (products.length > 0) return products;
          }
        } catch {
          // Continue trying other patterns
        }
      }
    }

    // Fallback: Extract from script tags containing product data
    const scriptPattern = /<script[^>]*>[\s\S]*?(\{[\s\S]*?"productId"[\s\S]*?\})[\s\S]*?<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      try {
        // Clean and parse the JSON
        const jsonStr = scriptMatch[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
        const data = JSON.parse(jsonStr);
        const product = parseProductItem(data);
        if (product) products.push(product);
      } catch {
        // Skip invalid JSON
      }
    }

    // Alternative: Look for structured data (JSON-LD)
    const ldJsonPattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi;
    let ldMatch;
    while ((ldMatch = ldJsonPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(ldMatch[1]);
        if (data["@type"] === "Product") {
          const product: ScrapedProduct = {
            product_id: extractProductIdFromUrl(data.url || ""),
            title: data.name || "",
            price: parseFloat(data.offers?.price || data.offers?.lowPrice || "0"),
            original_price: parseFloat(data.offers?.highPrice || data.offers?.price || "0"),
            image_url: data.image || "",
            product_url: data.url || "",
          };
          if (product.product_id && product.title) {
            products.push(product);
          }
        }
      } catch {
        // Skip invalid JSON-LD
      }
    }

  } catch (e) {
    console.error("[scrape-ali-deals] Error extracting products:", e);
  }

  return products;
}

function parseProductItem(item: any): ScrapedProduct | null {
  if (!item) return null;

  const productId = String(
    item.productId || item.product_id || item.id || item.itemId || ""
  );
  
  const title = String(
    item.title || item.productTitle || item.name || item.subject || ""
  );

  if (!productId || !title) return null;

  const price = parseFloat(
    item.price || item.salePrice || item.minPrice || item.promotionPrice || "0"
  );
  
  const originalPrice = parseFloat(
    item.originalPrice || item.oriPrice || item.maxPrice || item.price || "0"
  );

  const imageUrl = String(
    item.imageUrl || item.image || item.productImage || item.imgUrl || ""
  ).replace(/^\/\//, "https://");

  const productUrl = item.productUrl || item.productDetailUrl || item.url ||
    `https://www.aliexpress.com/item/${productId}.html`;

  let discountPercent: number | undefined;
  if (item.discount || item.discountPercent) {
    discountPercent = parseInt(String(item.discount || item.discountPercent).replace(/[-%]/g, ""));
  } else if (originalPrice > price && price > 0) {
    discountPercent = Math.round((1 - price / originalPrice) * 100);
  }

  return {
    product_id: productId,
    title,
    price: price || 0,
    original_price: originalPrice || price || 0,
    image_url: imageUrl,
    product_url: productUrl,
    discount_percent: discountPercent,
  };
}

function extractProductIdFromUrl(url: string): string {
  const patterns = [
    /\/item\/(\d+)\.html/i,
    /\/(\d{10,})\.html/i,
    /productId[=:](\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

// Generate mock data for demonstration when scraping fails
function generateMockDeals(): ScrapedProduct[] {
  return [
    {
      product_id: "1005006123456789",
      title: "Wireless Bluetooth Earbuds TWS Headphones",
      price: 12.99,
      original_price: 29.99,
      image_url: "https://ae-pic-a1.aliexpress-media.com/kf/S0b8a12345678.jpg",
      product_url: "https://www.aliexpress.com/item/1005006123456789.html",
      discount_percent: 57,
    },
    {
      product_id: "1005006234567890",
      title: "Smart Watch Fitness Tracker Heart Rate Monitor",
      price: 19.99,
      original_price: 49.99,
      image_url: "https://ae-pic-a1.aliexpress-media.com/kf/S0b8a23456789.jpg",
      product_url: "https://www.aliexpress.com/item/1005006234567890.html",
      discount_percent: 60,
    },
    {
      product_id: "1005006345678901",
      title: "USB C Hub Multiport Adapter 7 in 1",
      price: 15.49,
      original_price: 35.00,
      image_url: "https://ae-pic-a1.aliexpress-media.com/kf/S0b8a34567890.jpg",
      product_url: "https://www.aliexpress.com/item/1005006345678901.html",
      discount_percent: 56,
    },
  ];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUrl = String(body?.url || "").trim();
    
    // Default to SuperDeals page if no URL provided
    const scrapeUrl = targetUrl || "https://www.aliexpress.com/gcp/300000512/fHdJSJVp1K";

    console.log("[scrape-ali-deals] Fetching URL:", scrapeUrl);

    // Try to fetch the page with browser-like headers
    const response = await fetch(scrapeUrl, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!response.ok) {
      console.error("[scrape-ali-deals] HTTP error:", response.status);
      
      // Return mock data as fallback
      const payload: ApiOk = { 
        success: true, 
        products: generateMockDeals(),
        source: "demo"
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const html = await response.text();
    console.log("[scrape-ali-deals] Received HTML length:", html.length);

    const products = extractProductsFromHtml(html);
    console.log("[scrape-ali-deals] Extracted products:", products.length);

    if (products.length === 0) {
      // Return fallback message suggesting manual input
      const payload: ApiErr = { 
        success: false, 
        error: "Could not extract products from page. AliExpress may be blocking automated access.",
        fallback: true
      };
      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload: ApiOk = { success: true, products, source: "scraped" };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: unknown) {
    console.error("[scrape-ali-deals] Error:", e);
    
    // Return friendly error with fallback flag
    const payload: ApiErr = { 
      success: false, 
      error: e instanceof Error ? e.message : "Failed to scrape deals",
      fallback: true
    };
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
