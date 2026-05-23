-- Fix RLS issues around notebook membership creation/join.
-- This keeps membership writes strict while allowing invite-code based joins.

-- Helper checks run as definer to avoid policy self-blocking edge cases.
CREATE OR REPLACE FUNCTION public.notebook_has_space(target_notebook_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.notebooks n
    WHERE n.id = target_notebook_id
  ) AND (
    SELECT count(*)
    FROM public.notebook_members m
    WHERE m.notebook_id = target_notebook_id
  ) < 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow authenticated users to resolve notebook by invite code (needed before membership exists).
DROP POLICY IF EXISTS "Allow authenticated to lookup notebook by invite code" ON public.notebooks;
CREATE POLICY "Allow authenticated to lookup notebook by invite code" ON public.notebooks
  FOR SELECT TO authenticated
  USING (true);

-- Replace insert policy with stricter checks tied to JWT/user identity.
DROP POLICY IF EXISTS "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members;
CREATE POLICY "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND user_email = (auth.jwt() ->> 'email')
    AND public.notebook_has_space(notebook_id)
  );
