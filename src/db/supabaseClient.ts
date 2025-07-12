import { createClient } from '@supabase/supabase-js'
import '@std/dotenv'


const supabaseUrl = Deno.env.get("SUPABASE_URL") as string
const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") as string


export const supabase = createClient(supabaseUrl, supabaseKey)




