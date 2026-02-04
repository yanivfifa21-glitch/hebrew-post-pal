-- Create manual_queue table for storing manual posts
CREATE TABLE public.manual_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message TEXT,
  media_url TEXT,
  media_type TEXT, -- 'image' or 'video'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sent_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.manual_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own manual queue items"
ON public.manual_queue FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own manual queue items"
ON public.manual_queue FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own manual queue items"
ON public.manual_queue FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own manual queue items"
ON public.manual_queue FOR DELETE
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE TRIGGER update_manual_queue_updated_at
BEFORE UPDATE ON public.manual_queue
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();