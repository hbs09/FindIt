import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iogbyguazcrpooguggue.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvZ2J5Z3VhemNycG9vZ3VnZ3VlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MDQ0NTYsImV4cCI6MjA4MzQ4MDQ1Nn0.9OZpwo8DNNNR2LpgYEpZjupT9CYSMyOynA9d0TxJETY'

export const supabase = createClient(supabaseUrl, supabaseKey)