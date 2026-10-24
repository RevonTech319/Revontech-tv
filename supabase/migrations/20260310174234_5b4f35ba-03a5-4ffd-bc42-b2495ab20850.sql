
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
