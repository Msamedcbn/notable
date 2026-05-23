import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const isDemoMode =
  !supabaseUrl ||
  supabaseUrl.includes('your-supabase-project') ||
  !supabaseAnonKey ||
  supabaseAnonKey.includes('your-anon-key');

if (isDemoMode) {
  console.warn(
    'Running in offline Demo Mode. Data will be saved locally in your browser.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
