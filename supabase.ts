import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Bağlantı bilgilerinin eksik olup olmadığını kontrol eden güvenlik adımı
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL veya Anon Key eksik. Lütfen .env dosyanızı kontrol edin.');
}

// Uygulamanın her yerinden erişebileceğimiz ana bağlantı objesi
export const supabase = createClient(supabaseUrl, supabaseAnonKey);