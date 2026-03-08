export interface Product {
  id: string;
  original_url: string;
  affiliate_link: string | null;
  image_url: string | null;
  media_type?: 'image' | 'video';
  title: string;
  hebrew_description: string | null;
  price: number | null;
  orders_count: number;
  rating: number;
  status: 'Scheduled' | 'Sent' | 'processing';
  sent_via: 'auto' | 'manual' | null;
  scheduled_time: string | null;
  channels: string[];
  created_at: string;
  updated_at: string;
  // Stock check fields
  stock_status?: 'unchecked' | 'available' | 'unavailable' | 'error';
  last_stock_check?: string | null;
  stock_check_count?: number;
  auto_disabled?: boolean;
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
  hebrewDescription?: string;
}

export interface CapturedPost {
  id: string;
  user_id: string;
  source_group_id: string | null;
  original_text: string | null;
  modified_text: string | null;
  original_url: string | null;
  modified_url: string | null;
  image_url: string | null;
  status: 'pending_review' | 'approved' | 'rejected' | 'queued';
  product_id: string | null;
  captured_at: string;
  reviewed_at: string | null;
  // Joined
  relay_groups?: RelayGroup;
}

export interface RelayGroup {
  id: string;
  user_id: string;
  group_name: string;
  telegram_group_id: string;
  bot_token: string | null;
  is_active: boolean;
  auto_approve: boolean;
  text_template_prepend: string | null;
  text_template_append: string | null;
  webhook_active: boolean;
  captured_count: number;
  rewrite_mode: 'link_only' | 'full_rewrite';
  created_at: string;
  updated_at?: string;
}

// Keep backward compat alias
export type ListenedGroup = RelayGroup;
