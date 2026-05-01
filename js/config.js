export const SUPABASE_URL = 'https://wfksxakigndwppnurkby.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_2er8v8QuLHHMLcGYdFptTQ_V6pUjkUA';

export const CATEGORY_COLORS = {
  work: '#3b82f6',
  personal: '#22c55e',
  urgent: '#ef4444',
  focus: '#a855f7',
  travel: '#f59e0b',
};

export const CATEGORIES = Object.keys(CATEGORY_COLORS);

export const BUILT_IN_TAGS = CATEGORIES.map((id) => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  color: CATEGORY_COLORS[id],
  builtIn: true,
}));
