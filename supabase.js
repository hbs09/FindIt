import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 1. COLOCA AQUI O TEU URL (Começa por https://...)
const supabaseUrl = 'https://iogbyguazcrpooguggue.supabase.co';

// 2. COLOCA AQUI A TUA ANON KEY (É aquele texto gigante que começa por eyJ...)
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZ2J5Z3VhemNycG9vZ3VnZ3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MDQ0NTYsImV4cCI6MjA4MzQ4MDQ1Nn0.9OZpwo8DNNNR2LpgYEpZjupT9CYSMyOynA9d0TxJETY';

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});