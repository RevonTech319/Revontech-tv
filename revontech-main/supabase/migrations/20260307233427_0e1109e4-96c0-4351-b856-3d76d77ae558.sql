
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================
-- PROFILES TABLE
-- =====================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- =====================
-- CHANNELS TABLE
-- =====================
CREATE TABLE public.channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'hls' CHECK (type IN ('hls', 'dash')),
  url TEXT NOT NULL,
  kid TEXT,
  key TEXT,
  img_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channels viewable by all authenticated" ON public.channels FOR SELECT TO authenticated USING (true);
CREATE POLICY "Channels viewable by anonymous" ON public.channels FOR SELECT TO anon USING (true);

-- =====================
-- SLIDER IMAGES TABLE
-- =====================
CREATE TABLE public.slider_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  img_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.slider_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Slider images viewable by all" ON public.slider_images FOR SELECT USING (true);

-- =====================
-- TOKENS TABLE
-- =====================
CREATE TABLE public.tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tokens viewable by all authenticated" ON public.tokens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Tokens viewable by anonymous" ON public.tokens FOR SELECT TO anon USING (true);

-- Insert a default empty token row
INSERT INTO public.tokens (value) VALUES ('');

-- =====================
-- NOTIFICATIONS TABLE
-- =====================
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications viewable by all authenticated" ON public.notifications FOR SELECT TO authenticated USING (true);

-- =====================
-- USER NOTIFICATIONS TABLE
-- =====================
CREATE TABLE public.user_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, notification_id)
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own user_notifications" ON public.user_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own user_notifications" ON public.user_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own user_notifications" ON public.user_notifications FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================
-- STORAGE BUCKETS
-- =====================
INSERT INTO storage.buckets (id, name, public) VALUES ('channel-images', 'channel-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('slider-images', 'slider-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Channel images are public" ON storage.objects FOR SELECT USING (bucket_id = 'channel-images');
CREATE POLICY "Avatars are public" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Slider images are public" ON storage.objects FOR SELECT USING (bucket_id = 'slider-images');
CREATE POLICY "Authenticated users can upload channel images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'channel-images');
CREATE POLICY "Authenticated users can upload slider images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'slider-images');
CREATE POLICY "Users can upload own avatar" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update own avatar" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Authenticated users can update channel images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'channel-images');
CREATE POLICY "Authenticated users can update slider images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'slider-images');
CREATE POLICY "Authenticated users can delete channel images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'channel-images');
CREATE POLICY "Authenticated users can delete slider images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'slider-images');

-- =====================
-- TIMESTAMPS TRIGGER
-- =====================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON public.channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
