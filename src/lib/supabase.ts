import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Sin variables de entorno la app funciona sin backend, con el JSON local.
export const supabase = url && llave ? createClient(url, llave) : null
