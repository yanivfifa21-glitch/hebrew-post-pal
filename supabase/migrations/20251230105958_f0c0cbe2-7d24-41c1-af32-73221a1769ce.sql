-- Drop the old constraint that only allows Scheduled and Sent
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

-- Add new constraint that also allows 'processing' status for automation locking
ALTER TABLE public.products ADD CONSTRAINT products_status_check 
CHECK (status = ANY (ARRAY['Scheduled'::text, 'Sent'::text, 'processing'::text]));