-- Create products table for affiliate automation
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_url TEXT NOT NULL,
  affiliate_link TEXT,
  image_url TEXT,
  title TEXT NOT NULL,
  hebrew_description TEXT,
  price DECIMAL(10, 2),
  orders_count INTEGER DEFAULT 0,
  rating DECIMAL(3, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'scheduled', 'sent')),
  scheduled_time TIMESTAMP WITH TIME ZONE,
  channels TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security (public access for now, can add auth later)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth required for MVP)
CREATE POLICY "Allow public read access" 
ON public.products 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert access" 
ON public.products 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update access" 
ON public.products 
FOR UPDATE 
USING (true);

CREATE POLICY "Allow public delete access" 
ON public.products 
FOR DELETE 
USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create settings table for app configuration
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_enabled BOOLEAN DEFAULT false,
  whatsapp_enabled BOOLEAN DEFAULT false,
  posting_times TEXT[] DEFAULT ARRAY['10:00', '14:00', '20:00']::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Public access policies for settings
CREATE POLICY "Allow public read settings" 
ON public.app_settings 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public insert settings" 
ON public.app_settings 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public update settings" 
ON public.app_settings 
FOR UPDATE 
USING (true);

-- Insert default settings
INSERT INTO public.app_settings (telegram_enabled, whatsapp_enabled, posting_times) 
VALUES (false, false, ARRAY['10:00', '14:00', '20:00']);