
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
