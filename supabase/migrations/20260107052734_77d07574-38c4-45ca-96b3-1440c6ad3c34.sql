-- Add explicit DENY policies for UPDATE and DELETE on automation_logs to preserve audit trail integrity
CREATE POLICY "No update allowed"
ON public.automation_logs
FOR UPDATE
USING (false);

CREATE POLICY "No delete allowed"
ON public.automation_logs
FOR DELETE
USING (false);