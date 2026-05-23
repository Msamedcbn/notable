-- Make storage access notebook-membership based and robust for nested object paths.

CREATE OR REPLACE FUNCTION public.path_notebook_id(object_name TEXT)
RETURNS UUID AS $$
DECLARE
  maybe_uuid TEXT;
BEGIN
  -- Expected path format: <user_id>/<notebook_id>/<filename>
  maybe_uuid := split_part(object_name, '/', 2);
  IF maybe_uuid IS NULL OR maybe_uuid = '' THEN
    RETURN NULL;
  END IF;
  RETURN maybe_uuid::uuid;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

DROP POLICY IF EXISTS "Allow download of images for notebook members" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload of images for members" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete of own images" ON storage.objects;

CREATE POLICY "Allow download of images for notebook members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'notebook-images'
    AND public.is_member_of_notebook(public.path_notebook_id(name))
  );

CREATE POLICY "Allow upload of images for members" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'notebook-images'
    AND owner = auth.uid()
    AND public.is_member_of_notebook(public.path_notebook_id(name))
  );

CREATE POLICY "Allow delete of own images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'notebook-images'
    AND owner = auth.uid()
    AND public.is_member_of_notebook(public.path_notebook_id(name))
  );
