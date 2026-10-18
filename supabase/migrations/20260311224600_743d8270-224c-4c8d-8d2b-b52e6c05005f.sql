
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
