-- Add user_id column to products table
ALTER TABLE public.products ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add user_id column to app_settings table  
ALTER TABLE public.app_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster queries
CREATE INDEX idx_products_user_id ON public.products(user_id);
CREATE INDEX idx_app_settings_user_id ON public.app_settings(user_id);

-- Drop old public policies on products
DROP POLICY IF EXISTS "Allow public delete access" ON public.products;
DROP POLICY IF EXISTS "Allow public insert access" ON public.products;
DROP POLICY IF EXISTS "Allow public read access" ON public.products;
DROP POLICY IF EXISTS "Allow public update access" ON public.products;

-- Drop old public policies on app_settings
DROP POLICY IF EXISTS "Allow public insert settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public read settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public update settings" ON public.app_settings;

-- Create new owner-based RLS policies for products
CREATE POLICY "Users can view own products"
ON public.products FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products"
ON public.products FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products"
ON public.products FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products"
ON public.products FOR DELETE
USING (auth.uid() = user_id);

-- Create new owner-based RLS policies for app_settings
CREATE POLICY "Users can view own settings"
ON public.app_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
ON public.app_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
ON public.app_settings FOR UPDATE
USING (auth.uid() = user_id);