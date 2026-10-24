
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
