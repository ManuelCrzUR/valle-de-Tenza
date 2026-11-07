import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null
export const authConfigurado = supabase !== null
