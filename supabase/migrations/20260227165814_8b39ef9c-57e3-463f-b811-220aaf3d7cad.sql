
-- Create gold_posts table
CREATE TABLE public.gold_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  message text NOT NULL DEFAULT '',
  media_url text,
  media_type text DEFAULT 'image',
  send_time text NOT NULL DEFAULT '12:00',
  is_active boolean NOT NULL DEFAULT true,
  target_account_ids uuid[] NOT NULL DEFAULT '{}',
  last_sent_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.gold_posts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own gold posts" ON public.gold_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own gold posts" ON public.gold_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own gold posts" ON public.gold_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own gold posts" ON public.gold_posts FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_gold_posts_updated_at
  BEFORE UPDATE ON public.gold_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
