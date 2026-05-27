-- Hotfix: make create/join RPC resilient when JWT/session email is missing.
-- Removes strict EMAIL_REQUIRED dependency and stores a safe fallback email.

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
  safe_member_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF trim(coalesce(notebook_name, '')) = '' THEN
    RAISE EXCEPTION 'NOTEBOOK_NAME_REQUIRED';
  END IF;

  safe_member_email := nullif(trim(coalesce(member_email, '')), '');
  IF safe_member_email IS NULL THEN
    safe_member_email := auth.uid()::TEXT || '@local.notable';
  END IF;

  INSERT INTO public.notebooks (name)
  VALUES (trim(notebook_name))
  RETURNING id INTO new_notebook_id;

  INSERT INTO public.notebook_members (notebook_id, user_id, user_email)
  VALUES (new_notebook_id, auth.uid(), safe_member_email);

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
  safe_member_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF trim(coalesce(invite_code_input, '')) = '' THEN
    RAISE EXCEPTION 'INVITE_CODE_REQUIRED';
  END IF;

  safe_member_email := nullif(trim(coalesce(member_email, '')), '');
  IF safe_member_email IS NULL THEN
    safe_member_email := auth.uid()::TEXT || '@local.notable';
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
  VALUES (target_notebook_id, auth.uid(), safe_member_email)
  ON CONFLICT (notebook_id, user_id) DO NOTHING;

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
