-- Allow a user to leave a notebook by deleting only their own membership row.
DROP POLICY IF EXISTS "Allow user to leave notebook (delete own membership)" ON public.notebook_members;

CREATE POLICY "Allow user to leave notebook (delete own membership)" ON public.notebook_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

