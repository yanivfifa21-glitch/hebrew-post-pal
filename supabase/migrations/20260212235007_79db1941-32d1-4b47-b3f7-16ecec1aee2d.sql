
-- Add use_custom_emoji toggle to app_settings
ALTER TABLE public.app_settings ADD COLUMN use_custom_emoji boolean DEFAULT true;

-- Create custom emoji mappings table
CREATE TABLE public.custom_emoji_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  custom_emoji_id text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_emoji_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own emoji mappings" ON public.custom_emoji_mappings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own emoji mappings" ON public.custom_emoji_mappings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own emoji mappings" ON public.custom_emoji_mappings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own emoji mappings" ON public.custom_emoji_mappings FOR DELETE USING (auth.uid() = user_id);

-- Unique constraint per user per emoji
CREATE UNIQUE INDEX idx_custom_emoji_user_emoji ON public.custom_emoji_mappings (user_id, emoji);
