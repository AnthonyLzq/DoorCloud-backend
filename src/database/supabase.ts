import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL as string
const supabaseKey = process.env.SUPABASE_KEY as string

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient__: SupabaseClient
}

const supabaseConnection = () => {
  if (!global.__supabaseClient__) {
    global.__supabaseClient__ = createClient(supabaseUrl, supabaseKey)
    console.log('Supabase connection established.')
  }

  return global.__supabaseClient__
}

export { supabaseConnection }
