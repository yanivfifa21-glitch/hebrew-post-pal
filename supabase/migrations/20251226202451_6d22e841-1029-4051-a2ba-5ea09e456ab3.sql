-- Drop existing constraint and recreate with all required statuses
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('draft', 'queued', 'pending', 'processing', 'scheduled', 'sent'));