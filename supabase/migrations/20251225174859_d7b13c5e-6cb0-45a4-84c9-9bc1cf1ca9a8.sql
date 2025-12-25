-- Create messaging accounts table for multi-account Telegram/WhatsApp support
CREATE TABLE public.messaging_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('telegram', 'whatsapp')),
  account_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Telegram fields
  telegram_bot_token TEXT,
  telegram_chat_id TEXT,
  -- WhatsApp GreenAPI fields
  greenapi_instance_id TEXT,
  greenapi_api_token TEXT,
  greenapi_chat_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messaging_accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own accounts" ON public.messaging_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts" ON public.messaging_accounts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts" ON public.messaging_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts" ON public.messaging_accounts
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_messaging_accounts_updated_at
  BEFORE UPDATE ON public.messaging_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();