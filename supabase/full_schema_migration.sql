
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

-- Allow admin to do all operations on channels, slider_images, tokens, notifications
-- Protected at app level by admin password

CREATE POLICY "Admin can insert channels"
  ON public.channels FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update channels"
  ON public.channels FOR UPDATE USING (true);

CREATE POLICY "Admin can delete channels"
  ON public.channels FOR DELETE USING (true);

CREATE POLICY "Admin can insert slider_images"
  ON public.slider_images FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update slider_images"
  ON public.slider_images FOR UPDATE USING (true);

CREATE POLICY "Admin can delete slider_images"
  ON public.slider_images FOR DELETE USING (true);

CREATE POLICY "Admin can insert tokens"
  ON public.tokens FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update tokens"
  ON public.tokens FOR UPDATE USING (true);

CREATE POLICY "Admin can delete tokens"
  ON public.tokens FOR DELETE USING (true);

CREATE POLICY "Admin can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Admin can update notifications"
  ON public.notifications FOR UPDATE USING (true);

CREATE POLICY "Admin can delete notifications"
  ON public.notifications FOR DELETE USING (true);

-- Storage policies for channel-images and slider-images buckets
CREATE POLICY "Public read channel-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'channel-images');

CREATE POLICY "Anyone can upload channel-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'channel-images');

CREATE POLICY "Anyone can update channel-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'channel-images');

CREATE POLICY "Anyone can delete channel-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'channel-images');

CREATE POLICY "Public read slider-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'slider-images');

CREATE POLICY "Anyone can upload slider-images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'slider-images');

CREATE POLICY "Anyone can update slider-images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'slider-images');

CREATE POLICY "Anyone can delete slider-images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'slider-images');

-- Avatars storage policies
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars');

-- Add phone column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Update handle_new_user trigger to also save phone from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$function$;

-- Re-create trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  order_id TEXT,
  phone TEXT,
  starts_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admin full access subscriptions"
  ON public.subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add is_active to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Policy to allow admin to view all profiles
CREATE POLICY "Admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

-- Policy to allow admin to update all profiles  
CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (true);

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

-- Drop restrictive SELECT policies on profiles and recreate as permissive
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by owner" ON public.profiles;

-- Permissive: authenticated users can view all profiles (admin needs this)
CREATE POLICY "Profiles viewable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Anon users can only see their own (just in case)
CREATE POLICY "Profiles viewable by owner anon"
  ON public.profiles FOR SELECT
  TO anon
  USING (auth.uid() = user_id);

-- Allow anon (admin panel uses anon role) to view all profiles
DROP POLICY IF EXISTS "Profiles viewable by owner anon" ON public.profiles;

CREATE POLICY "Profiles viewable by anon"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);

-- Also allow anon to view all subscriptions (for admin users page)
DROP POLICY IF EXISTS "Anon can view all subscriptions" ON public.subscriptions;

CREATE POLICY "Anon can view all subscriptions"
  ON public.subscriptions FOR SELECT
  TO anon
  USING (true);

-- Drop ALL existing SELECT policies on profiles and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by anon" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable by owner anon" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow anon users to view profiles" ON public.profiles;

-- Create PERMISSIVE policies (default is PERMISSIVE)
CREATE POLICY "Profiles select by anon"
  ON public.profiles AS PERMISSIVE FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Profiles select by authenticated"
  ON public.profiles AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (true);

-- Also fix subscriptions SELECT policies
DROP POLICY IF EXISTS "Anon can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can view own subscriptions" ON public.subscriptions;

CREATE POLICY "Subscriptions select by anon"
  ON public.subscriptions AS PERMISSIVE FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Subscriptions select by authenticated"
  ON public.subscriptions AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create the missing trigger that creates a profile when a user signs up
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
-- Migration to add category column to channels table
ALTER TABLE channels ADD COLUMN category TEXT DEFAULT 'General';

-- Update existing channels with some default categories (optional but helpful)
UPDATE channels SET category = 'Sports' WHERE name ILIKE '%sport%';
UPDATE channels SET category = 'News' WHERE name ILIKE '%news%';
UPDATE channels SET category = 'Movies' WHERE name ILIKE '%movie%';
UPDATE channels SET category = 'Music' WHERE name ILIKE '%music%';
