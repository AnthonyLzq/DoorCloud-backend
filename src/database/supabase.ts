import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL as string
const supabaseKey = process.env.SUPABASE_KEY as string
let supabaseClient: SupabaseClient

const supabaseConnection = () => {
  supabaseClient = createClient(supabaseUrl, supabaseKey)
  console.log('Supabase connection established.')
}

export { supabaseConnection, supabaseClient }
