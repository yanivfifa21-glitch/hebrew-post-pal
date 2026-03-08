
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_campaigns_unique ON public.affiliate_campaigns(user_id, campaign_name);
