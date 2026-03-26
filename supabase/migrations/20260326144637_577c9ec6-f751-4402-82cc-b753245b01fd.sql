
-- Table for earnings notification settings per user
CREATE TABLE public.earnings_notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  telegram_chat_id text,
  notify_per_order boolean NOT NULL DEFAULT true,
  notify_daily_report boolean NOT NULL DEFAULT true,
  is_enabled boolean NOT NULL DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.earnings_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification settings" ON public.earnings_notification_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own notification settings" ON public.earnings_notification_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notification settings" ON public.earnings_notification_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Table for tracked orders to detect new ones
CREATE TABLE public.tracked_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id text NOT NULL,
  product_id text,
  product_title text,
  paid_amount numeric DEFAULT 0,
  estimated_commission numeric DEFAULT 0,
  order_status text,
  order_created_at text,
  notified_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, order_id, product_id)
);

ALTER TABLE public.tracked_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracked orders" ON public.tracked_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access tracked orders" ON public.tracked_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
