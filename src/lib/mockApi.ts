import { FetchedProductData } from "@/types/product";

// Mock function to simulate fetching product data from AliExpress
// Replace this with actual API/scraping logic later
export const fetchAliExpressProduct = async (url: string): Promise<FetchedProductData> => {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Validate URL format (basic check)
  if (!url.includes('aliexpress') && !url.includes('ali')) {
    throw new Error('Please enter a valid AliExpress URL');
  }

  // Return mock product data
  const mockProducts: FetchedProductData[] = [
    {
      image_url: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400",
      title: "Wireless Bluetooth Earbuds TWS 5.0 Sport Headphones with Charging Case",
      price: 29.99,
      orders_count: 15420,
      rating: 4.8,
    },
    {
      image_url: "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400",
      title: "Smart Watch 2024 Fitness Tracker Heart Rate Monitor Waterproof",
      price: 45.99,
      orders_count: 8932,
      rating: 4.6,
    },
    {
      image_url: "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=400",
      title: "Portable Power Bank 20000mAh Fast Charging USB-C PD QC3.0",
      price: 35.50,
      orders_count: 22150,
      rating: 4.9,
    },
    {
      image_url: "https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400",
      title: "LED Ring Light 10 inch with Tripod Stand Phone Holder for Streaming",
      price: 18.99,
      orders_count: 31200,
      rating: 4.7,
    },
  ];

  // Return random mock product
  return mockProducts[Math.floor(Math.random() * mockProducts.length)];
};

// Mock function to simulate AI-generated Hebrew marketing content
export const generateHebrewContent = async (title: string, price: number): Promise<string> => {
  // Simulate AI processing delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  const templates = [
    `🔥 מבצע חם! 🔥\n\n${title}\n\n✨ מחיר מטורף: ₪${(price * 3.7).toFixed(0)} בלבד!\n\n⭐ איכות מעולה\n📦 משלוח מהיר\n💯 אחריות מלאה\n\n👇 קנו עכשיו לפני שנגמר! 👇`,
    `🚀 הגיע לישראל! 🚀\n\n${title}\n\n💰 מחיר בלעדי: ₪${(price * 3.7).toFixed(0)}\n\n🌟 הכי נמכר באלי!\n🎁 מתנה לכל הזמנה\n⚡ משלוח אקספרס\n\n🛒 הזמינו עכשיו! 🛒`,
    `💎 פריט חובה! 💎\n\n${title}\n\n🏷️ רק ₪${(price * 3.7).toFixed(0)}!\n\n✅ מקורי 100%\n✅ החזרה חינם\n✅ אחריות שנתית\n\n⬇️ לחצו להזמנה ⬇️`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
};

// Mock function to simulate sending to Telegram
export const sendToTelegram = async (product: { title: string; image_url: string | null; hebrew_description: string | null; affiliate_link: string | null }): Promise<boolean> => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('Telegram: Sending product', product.title);
  return true;
};

// Mock function to simulate sending to WhatsApp
export const sendToWhatsApp = async (product: { title: string; image_url: string | null; hebrew_description: string | null; affiliate_link: string | null }): Promise<boolean> => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('WhatsApp: Sending product', product.title);
  return true;
};
