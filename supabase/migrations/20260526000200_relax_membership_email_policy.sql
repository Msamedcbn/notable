-- Make join/create membership resilient to email casing differences in JWT.
-- Some auth providers may return mixed-case emails; app stores normalized lowercase.

DROP POLICY IF EXISTS "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members;

CREATE POLICY "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND lower(coalesce(user_email, '')) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    AND public.notebook_has_space(notebook_id)
  );

