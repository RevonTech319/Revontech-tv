-- Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
    id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    whatsapp_url text DEFAULT 'https://wa.me/message/CUK76S7UKL2GI1',
    youtube_url text DEFAULT 'https://www.youtube.com/@RevonTechTeam',
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Turn on Row Level Security
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read stats
CREATE POLICY "Public can view settings"
ON public.settings FOR SELECT
TO public
USING (true);

-- Admin can update settings
CREATE POLICY "Admin can update settings"
ON public.settings FOR UPDATE
TO public
USING (true);

-- Auto-update timestamp trigger
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial row
INSERT INTO public.settings (id, whatsapp_url, youtube_url)
VALUES (1, 'https://wa.me/message/CUK76S7UKL2GI1', 'https://youtube.com/@RevonTechTeam')
ON CONFLICT (id) DO NOTHING;
