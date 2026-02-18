
-- Zones table: each zone has independent scheduling
CREATE TABLE public.zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  interval_minutes INTEGER NOT NULL DEFAULT 60,
  interval_start_time TEXT NOT NULL DEFAULT '08:00',
  interval_end_time TEXT NOT NULL DEFAULT '22:00',
  publishing_days INTEGER[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  last_posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own zones" ON public.zones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own zones" ON public.zones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own zones" ON public.zones FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own zones" ON public.zones FOR DELETE USING (auth.uid() = user_id);

-- Zone-Account mapping: which messaging accounts each zone sends to
CREATE TABLE public.zone_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.messaging_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(zone_id, account_id)
);

ALTER TABLE public.zone_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own zone accounts" ON public.zone_accounts FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_accounts.zone_id AND zones.user_id = auth.uid()));
CREATE POLICY "Users can insert own zone accounts" ON public.zone_accounts FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_accounts.zone_id AND zones.user_id = auth.uid()));
CREATE POLICY "Users can delete own zone accounts" ON public.zone_accounts FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_accounts.zone_id AND zones.user_id = auth.uid()));

-- Zone-Product mapping: products assigned to zones with independent status
CREATE TABLE public.zone_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  zone_id UUID NOT NULL REFERENCES public.zones(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'Scheduled',
  scheduled_time TIMESTAMP WITH TIME ZONE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(zone_id, product_id)
);

ALTER TABLE public.zone_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own zone products" ON public.zone_products FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_products.zone_id AND zones.user_id = auth.uid()));
CREATE POLICY "Users can insert own zone products" ON public.zone_products FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_products.zone_id AND zones.user_id = auth.uid()));
CREATE POLICY "Users can update own zone products" ON public.zone_products FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_products.zone_id AND zones.user_id = auth.uid()));
CREATE POLICY "Users can delete own zone products" ON public.zone_products FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.zones WHERE zones.id = zone_products.zone_id AND zones.user_id = auth.uid()));

-- Trigger for zones updated_at
CREATE TRIGGER update_zones_updated_at
  BEFORE UPDATE ON public.zones
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
