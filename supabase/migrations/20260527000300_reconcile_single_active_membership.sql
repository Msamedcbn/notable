-- Reconcile notebook membership policies and RPC flows under single-active-membership model.

-- Final INSERT policy (self + notebook capacity).
DROP POLICY IF EXISTS "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members;
DROP POLICY IF EXISTS "Allow user to join notebook with space (< 2 members)" ON public.notebook_members;

CREATE POLICY "Allow user to add themselves to notebook with space (< 2 members)" ON public.notebook_members
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
    AND public.notebook_has_space(notebook_id)
  );

-- Final DELETE policy (user can remove only own membership rows).
DROP POLICY IF EXISTS "Allow user to leave notebook (delete own membership)" ON public.notebook_members;

CREATE POLICY "Allow user to leave notebook (delete own membership)" ON public.notebook_members
  FOR DELETE TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.create_notebook_with_owner(
  notebook_name TEXT,
  member_email TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_notebook_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF trim(coalesce(notebook_name, '')) = '' THEN
    RAISE EXCEPTION 'NOTEBOOK_NAME_REQUIRED';
  END IF;

  IF trim(coalesce(member_email, '')) = '' THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED';
  END IF;

  INSERT INTO public.notebooks (name)
  VALUES (trim(notebook_name))
  RETURNING id INTO new_notebook_id;

  INSERT INTO public.notebook_members (notebook_id, user_id, user_email)
  VALUES (new_notebook_id, auth.uid(), trim(member_email));

  -- Single active membership: keep only the newest membership for this user.
  DELETE FROM public.notebook_members
  WHERE user_id = auth.uid()
    AND notebook_id <> new_notebook_id;

  RETURN new_notebook_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notebook_with_owner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_notebook_with_owner(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_notebook_by_invite(
  invite_code_input TEXT,
  member_email TEXT
)
RETURNS TABLE (
  notebook_id UUID,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_notebook_id UUID;
  members_count INT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF trim(coalesce(invite_code_input, '')) = '' THEN
    RAISE EXCEPTION 'INVITE_CODE_REQUIRED';
  END IF;

  IF trim(coalesce(member_email, '')) = '' THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED';
  END IF;

  SELECT n.id
  INTO target_notebook_id
  FROM public.notebooks n
  WHERE lower(n.invite_code) = lower(trim(invite_code_input))
  LIMIT 1;

  IF target_notebook_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVITE_CODE';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notebook_members m
    WHERE m.notebook_id = target_notebook_id
      AND m.user_id = auth.uid()
  ) THEN
    -- Single active membership: keep this notebook and drop others.
    DELETE FROM public.notebook_members
    WHERE user_id = auth.uid()
      AND notebook_id <> target_notebook_id;

    notebook_id := target_notebook_id;
    status := 'already_member';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*)::INT
  INTO members_count
  FROM public.notebook_members m
  WHERE m.notebook_id = target_notebook_id;

  IF members_count >= 2 THEN
    RAISE EXCEPTION 'NOTEBOOK_FULL';
  END IF;

  INSERT INTO public.notebook_members (notebook_id, user_id, user_email)
  VALUES (target_notebook_id, auth.uid(), trim(member_email))
  ON CONFLICT (notebook_id, user_id) DO NOTHING;

  -- Single active membership: keep this notebook and drop others.
  DELETE FROM public.notebook_members
  WHERE user_id = auth.uid()
    AND notebook_id <> target_notebook_id;

  notebook_id := target_notebook_id;
  status := 'joined';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.join_notebook_by_invite(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_notebook_by_invite(TEXT, TEXT) TO authenticated;
