-- Add status column to authorized_users table
ALTER TABLE public.authorized_users 
ADD COLUMN status text NOT NULL DEFAULT 'approved';

-- Update existing users to be approved
UPDATE public.authorized_users SET status = 'approved';

-- Update RLS policy to allow anyone to insert pending requests
DROP POLICY IF EXISTS "Anyone can check if email is authorized" ON public.authorized_users;

CREATE POLICY "Anyone can check if email is authorized" 
ON public.authorized_users 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert pending request" 
ON public.authorized_users 
FOR INSERT 
WITH CHECK (status = 'pending');

CREATE POLICY "Admin can update status" 
ON public.authorized_users 
FOR UPDATE 
USING (auth.jwt() ->> 'email' = 'yanivfifa21@gmail.com');

CREATE POLICY "Admin can delete users" 
ON public.authorized_users 
FOR DELETE 
USING (auth.jwt() ->> 'email' = 'yanivfifa21@gmail.com');