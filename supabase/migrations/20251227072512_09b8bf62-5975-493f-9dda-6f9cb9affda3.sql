-- Step 1: Drop the check constraint first
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

-- Step 2: Update all non-Sent products to 'Scheduled' (normalize case and unify statuses)
UPDATE public.products SET status = 'Scheduled' WHERE status NOT IN ('sent', 'Sent');
UPDATE public.products SET status = 'Sent' WHERE status IN ('sent');

-- Step 3: Add new constraint with unified statuses
ALTER TABLE public.products ADD CONSTRAINT products_status_check 
  CHECK (status IN ('Scheduled', 'Sent', 'processing'));