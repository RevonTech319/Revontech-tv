
-- Create ads table
CREATE TABLE public.ads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_url text NOT NULL,
  link text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- Anyone can view active ads
CREATE POLICY "Ads viewable by all" ON public.ads FOR SELECT USING (true);
-- Admin can do everything
CREATE POLICY "Admin can insert ads" ON public.ads FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update ads" ON public.ads FOR UPDATE USING (true);
CREATE POLICY "Admin can delete ads" ON public.ads FOR DELETE USING (true);

-- Add is_free column to channels
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
