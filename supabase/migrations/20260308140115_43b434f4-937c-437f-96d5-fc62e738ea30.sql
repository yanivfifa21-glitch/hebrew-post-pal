
-- Feature 1: Add stock check columns to products table
ALTER TABLE public.products 
  ADD COLUMN IF NOT EXISTS stock_status text NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS last_stock_check timestamptz,
  ADD COLUMN IF NOT EXISTS stock_check_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS auto_disabled boolean NOT NULL DEFAULT false;

-- Feature 1: Add stock check settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS stock_check_before_publish boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_check_scheduled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_check_interval_hours integer NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS last_bulk_stock_check timestamptz;

-- Feature 2: Create listened_groups table
CREATE TABLE public.listened_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_name text NOT NULL,
  telegram_group_id text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  auto_approve boolean NOT NULL DEFAULT false,
  text_template_prepend text,
  text_template_append text,
  captured_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.listened_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listened groups" ON public.listened_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own listened groups" ON public.listened_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own listened groups" ON public.listened_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own listened groups" ON public.listened_groups FOR DELETE USING (auth.uid() = user_id);

-- Feature 2: Create captured_posts table
CREATE TABLE public.captured_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_group_id uuid REFERENCES public.listened_groups(id) ON DELETE SET NULL,
  original_text text,
  modified_text text,
  original_url text,
  modified_url text,
  image_url text,
  status text NOT NULL DEFAULT 'pending_review',
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE public.captured_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own captured posts" ON public.captured_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own captured posts" ON public.captured_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own captured posts" ON public.captured_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own captured posts" ON public.captured_posts FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for captured_posts
ALTER PUBLICATION supabase_realtime ADD TABLE public.captured_posts;

-- Feature 2: Add listener settings to app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS affiliate_params jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS listener_api_url text,
  ADD COLUMN IF NOT EXISTS default_auto_approve boolean NOT NULL DEFAULT false;
