-- Add media_type column to products table for video support
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'image';

-- Add comment
COMMENT ON COLUMN public.products.media_type IS 'Type of media: image or video';