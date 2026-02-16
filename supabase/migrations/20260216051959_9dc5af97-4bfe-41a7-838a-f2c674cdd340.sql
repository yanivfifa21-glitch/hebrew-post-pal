
-- Add sent_via column to track how a product was sent
ALTER TABLE public.products ADD COLUMN sent_via text DEFAULT 'auto';

-- Update existing sent products to 'auto' by default
UPDATE public.products SET sent_via = 'auto' WHERE status = 'Sent' AND sent_via IS NULL;
