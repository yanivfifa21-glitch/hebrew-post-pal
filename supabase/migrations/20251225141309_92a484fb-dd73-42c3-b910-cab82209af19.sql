-- Add DELETE policy for app_settings (matching other policies)
CREATE POLICY "Users can delete own settings"
ON public.app_settings FOR DELETE
USING (auth.uid() = user_id);