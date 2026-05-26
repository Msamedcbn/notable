-- Some auth providers/sessions may not provide a stable `email` claim in JWT.
-- Enforce membership insert by authenticated user id + notebook capacity only.

DROP POLICY IF EXISTS "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members;

CREATE POLICY "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND public.notebook_has_space(notebook_id)
  );

