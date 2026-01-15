CREATE POLICY "Only admins can view authorized users"
ON public.authorized_users
FOR SELECT
USING (public.is_admin());