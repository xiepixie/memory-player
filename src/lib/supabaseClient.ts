import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseSingleton: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient | null => {
  if (supabaseSingleton) return supabaseSingleton;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  if (!url || !key) {
    return null;
  }

  if (typeof window !== 'undefined') {
    const anyWindow = window as any;
    if (anyWindow.__MP_SUPABASE_CLIENT__) {
      supabaseSingleton = anyWindow.__MP_SUPABASE_CLIENT__ as SupabaseClient;
      return supabaseSingleton;
    }
    supabaseSingleton = createClient(url, key);
    anyWindow.__MP_SUPABASE_CLIENT__ = supabaseSingleton;
    return supabaseSingleton;
  }

  supabaseSingleton = createClient(url, key);
  return supabaseSingleton;
};
