-- Force status values to only be 'Scheduled' / 'Sent' going forward
-- 1) Ensure new rows don't default to an invalid status
ALTER TABLE public.products
  ALTER COLUMN status SET DEFAULT 'Scheduled';

-- 2) Re-apply the exact constraint definition
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_status_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('Scheduled', 'Sent'));