
-- Create relay_groups table (replacing listened_groups)
CREATE TABLE public.relay_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_name text NOT NULL,
  telegram_group_id text NOT NULL,
  bot_token text,
  is_active boolean NOT NULL DEFAULT true,
  auto_approve boolean NOT NULL DEFAULT false,
  text_template_prepend text,
  text_template_append text,
  webhook_active boolean NOT NULL DEFAULT false,
  captured_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.relay_groups ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own relay groups" ON public.relay_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own relay groups" ON public.relay_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own relay groups" ON public.relay_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own relay groups" ON public.relay_groups FOR DELETE USING (auth.uid() = user_id);

-- Migrate data from listened_groups to relay_groups
INSERT INTO public.relay_groups (id, user_id, group_name, telegram_group_id, is_active, auto_approve, text_template_prepend, text_template_append, captured_count, created_at, updated_at)
SELECT id, user_id, group_name, telegram_group_id, is_active, auto_approve, text_template_prepend, text_template_append, captured_count, created_at, updated_at
FROM public.listened_groups;

-- Update captured_posts FK to point to relay_groups
ALTER TABLE public.captured_posts DROP CONSTRAINT IF EXISTS captured_posts_source_group_id_fkey;
ALTER TABLE public.captured_posts ADD CONSTRAINT captured_posts_source_group_id_fkey FOREIGN KEY (source_group_id) REFERENCES public.relay_groups(id) ON DELETE SET NULL;

-- Enable realtime for relay_groups
ALTER PUBLICATION supabase_realtime ADD TABLE public.relay_groups;

-- Drop old table
DROP TABLE IF EXISTS public.listened_groups;
