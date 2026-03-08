
-- Affiliate campaigns table - stores campaign data from AliExpress
CREATE TABLE public.affiliate_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  campaign_name text NOT NULL,
  campaign_id text,
  commission_rate numeric DEFAULT 0,
  promo_desc text,
  landing_page_url text,
  banner_url text,
  source text DEFAULT 'featured',
  is_active boolean DEFAULT true,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.affiliate_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own campaigns" ON public.affiliate_campaigns FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own campaigns" ON public.affiliate_campaigns FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own campaigns" ON public.affiliate_campaigns FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own campaigns" ON public.affiliate_campaigns FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Ad center products table - caches products from AliExpress API
CREATE TABLE public.ad_center_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  title text NOT NULL,
  image_url text,
  price numeric DEFAULT 0,
  original_price numeric DEFAULT 0,
  affiliate_link text,
  category text,
  source text DEFAULT 'hot',
  campaign_id uuid REFERENCES public.affiliate_campaigns(id) ON DELETE SET NULL,
  sales_count integer DEFAULT 0,
  rating numeric DEFAULT 0,
  commission_rate numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  product_url text,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ad_center_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products" ON public.ad_center_products FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON public.ad_center_products FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON public.ad_center_products FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON public.ad_center_products FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_ad_center_products_user_source ON public.ad_center_products(user_id, source);
CREATE INDEX idx_ad_center_products_user_campaign ON public.ad_center_products(user_id, campaign_id);
CREATE INDEX idx_affiliate_campaigns_user ON public.affiliate_campaigns(user_id);
CREATE UNIQUE INDEX idx_ad_center_products_unique ON public.ad_center_products(user_id, product_id, source);
