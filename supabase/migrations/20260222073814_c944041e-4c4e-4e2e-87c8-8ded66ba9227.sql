ALTER TABLE public.zones 
ADD COLUMN IF NOT EXISTS schedule_mode text NOT NULL DEFAULT 'interval',
ADD COLUMN IF NOT EXISTS posting_times text[] DEFAULT ARRAY['10:00', '14:00', '20:00']::text[];