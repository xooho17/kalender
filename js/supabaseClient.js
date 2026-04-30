import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.4';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

const AUTH_STORAGE_KEY = 'shared-calendar-auth-v2';
const LEGACY_AUTH_STORAGE_KEYS = [
  'shared-calendar-auth-v1',
  'sb-wpcycaqvzxujyxablnkp-auth-token',
];

if (typeof window !== 'undefined' && !window.localStorage.getItem(AUTH_STORAGE_KEY)) {
  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: AUTH_STORAGE_KEY,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
