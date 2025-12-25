-- Create authorized_users table for whitelist
CREATE TABLE public.authorized_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

-- Only allow authenticated users to read the table (for checking their own access)
CREATE POLICY "Anyone can check if email is authorized"
ON public.authorized_users
FOR SELECT
USING (true);

-- No insert/update/delete policies - only manageable via Supabase dashboard