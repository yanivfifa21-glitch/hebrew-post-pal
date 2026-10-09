CREATE INDEX IF NOT EXISTS idx_captured_dup ON public.captured_posts (user_id, original_url, captured_at);
CREATE INDEX IF NOT EXISTS idx_captured_group_time ON public.captured_posts (source_group_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_captured_status_time ON public.captured_posts (user_id, status, captured_at DESC);