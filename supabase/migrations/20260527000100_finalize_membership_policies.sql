-- Finalize notebook_members policies for stable join/leave behavior.

-- 1) INSERT policy: user can only add themselves, max 2 members in notebook.
DROP POLICY IF EXISTS "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members;
DROP POLICY IF EXISTS "Allow user to join notebook with space (< 2 members)" ON public.notebook_members;

CREATE POLICY "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND public.notebook_has_space(notebook_id)
  );

-- 2) DELETE policy: user can leave notebook by deleting only their own membership row.
DROP POLICY IF EXISTS "Allow user to leave notebook (delete own membership)" ON public.notebook_members;

CREATE POLICY "Allow user to leave notebook (delete own membership)" ON public.notebook_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

