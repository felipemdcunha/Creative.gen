import { createClient } from '@supabase/supabase-js';

// Using provided keys from instructions
const SUPABASE_URL = 'https://tmtcwrorauigdxlkzdwt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_AUgz7bruPuFk16xfuWVThA_UPhikdzL';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);