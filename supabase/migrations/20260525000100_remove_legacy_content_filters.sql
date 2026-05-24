-- Remove legacy/moderation rules that can block encrypted notebook messages.
-- Some older deployments may still contain custom CHECK constraints or triggers
-- returning errors like "mesaj icerigi uygun degildir" on notebook_entries.content.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Drop all user-defined CHECK constraints on notebook_entries.
  -- We keep NOT NULL and FK guarantees (these are not CHECK constraints).
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.notebook_entries'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.notebook_entries DROP CONSTRAINT IF EXISTS %I',
      rec.conname
    );
  END LOOP;

  -- Drop all non-internal triggers on notebook_entries.
  -- This clears legacy content-moderation triggers that may reject ciphertext.
  FOR rec IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.notebook_entries'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON public.notebook_entries',
      rec.tgname
    );
  END LOOP;
END $$;

