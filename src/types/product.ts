export interface Product {
  id: string;
  original_url: string;
  affiliate_link: string | null;
  image_url: string | null;
  title: string;
  hebrew_description: string | null;
  price: number | null;
  orders_count: number;
  rating: number;
  status: 'draft' | 'queued' | 'scheduled' | 'sent';
  scheduled_time: string | null;
  channels: string[];
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  id: string;
  telegram_enabled: boolean;
  whatsapp_enabled: boolean;
  posting_times: string[];
  created_at: string;
  updated_at: string;
}

export interface FetchedProductData {
  image_url: string;
  title: string;
  price: number;
  orders_count: number;
  rating: number;
  affiliateLink?: string;
}
