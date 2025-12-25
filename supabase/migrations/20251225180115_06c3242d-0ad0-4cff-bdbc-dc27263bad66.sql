-- Create automation logs table
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_id uuid NOT NULL,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  context jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (users can read their own logs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'automation_logs'
      AND policyname = 'Users can view own automation logs'
  ) THEN
    CREATE POLICY "Users can view own automation logs"
    ON public.automation_logs
    FOR SELECT
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'automation_logs'
      AND policyname = 'Users can insert own automation logs'
  ) THEN
    CREATE POLICY "Users can insert own automation logs"
    ON public.automation_logs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_created_at
  ON public.automation_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_logs_run_id
  ON public.automation_logs (run_id);
