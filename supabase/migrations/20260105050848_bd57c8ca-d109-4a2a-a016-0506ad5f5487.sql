-- ============================================
-- COMPREHENSIVE SECURITY & DATA INTEGRITY FIX
-- ============================================

-- 1. ALTER COLUMNS TO TEXT TO PREVENT TRUNCATION
-- ============================================

ALTER TABLE public.products 
  ALTER COLUMN title TYPE TEXT,
  ALTER COLUMN hebrew_description TYPE TEXT;

-- 2. DROP ALL EXISTING RLS POLICIES AND RECREATE SECURELY
-- ============================================

DROP POLICY IF EXISTS "Users can delete own products" ON public.products;
DROP POLICY IF EXISTS "Users can insert own products" ON public.products;
DROP POLICY IF EXISTS "Users can update own products" ON public.products;
DROP POLICY IF EXISTS "Users can view own products" ON public.products;

DROP POLICY IF EXISTS "Users can delete own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.app_settings;
DROP POLICY IF EXISTS "Users can view own settings" ON public.app_settings;

-- 3. RECREATE STRICT RLS POLICIES (user_id based)
-- ============================================

CREATE POLICY "Users can view own products" 
ON public.products FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own products" 
ON public.products FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own products" 
ON public.products FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own products" 
ON public.products FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can view own settings" 
ON public.app_settings FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings" 
ON public.app_settings FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings" 
ON public.app_settings FOR UPDATE 
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own settings" 
ON public.app_settings FOR DELETE 
TO authenticated
USING (auth.uid() = user_id);

-- 4. CREATE ADMIN EMAIL VERIFICATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.is_admin_email()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() ->> 'email') = 'yanivfifa21@gmail.com'
$$;

-- 5. ENSURE USER_ID NOT NULL FOR SECURITY
-- ============================================

ALTER TABLE public.products 
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE public.app_settings 
  ALTER COLUMN user_id SET NOT NULL;