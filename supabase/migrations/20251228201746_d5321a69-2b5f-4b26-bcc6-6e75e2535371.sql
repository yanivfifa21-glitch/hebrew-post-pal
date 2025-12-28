-- Drop the old status check constraint
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_status_check;

-- Add new constraint allowing only 'Scheduled' and 'Sent'
ALTER TABLE public.products ADD CONSTRAINT products_status_check CHECK (status IN ('Scheduled', 'Sent'));