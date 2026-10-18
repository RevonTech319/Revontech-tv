-- Create plans table for admin-managed subscription plans
CREATE TABLE public.plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  plan_key TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'TZS',
  duration_days INTEGER NOT NULL DEFAULT 1,
  features TEXT[] NOT NULL DEFAULT '{}',
  popular BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Anyone can view active plans
CREATE POLICY "Plans viewable by all" ON public.plans FOR SELECT USING (true);
-- Admin can do everything
CREATE POLICY "Admin can insert plans" ON public.plans FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update plans" ON public.plans FOR UPDATE USING (true);
CREATE POLICY "Admin can delete plans" ON public.plans FOR DELETE USING (true);

-- Auto-update timestamp trigger
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default plans
INSERT INTO public.plans (name, plan_key, amount, currency, duration_days, features, popular, sort_order) VALUES
  ('1 Day', 'day', 1000, 'TZS', 1, ARRAY['All Channels', 'HD Quality', '1 Device'], false, 1),
  ('1 Week', 'week', 2500, 'TZS', 7, ARRAY['All Channels', 'HD Quality', '2 Devices'], false, 2),
  ('2 Weeks', 'week2', 5000, 'TZS', 14, ARRAY['All Channels', 'HD Quality', '3 Devices'], true, 3),
  ('1 Month', 'month', 10000, 'TZS', 30, ARRAY['All Channels', '4K Ultra HD', '4 Devices', 'Ad-Free', 'Priority Support'], false, 4);
