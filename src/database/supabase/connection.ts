import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { FastifyBaseLogger } from 'fastify'

const supabaseUrl = process.env.SUPABASE_URL as string
const supabaseKey = process.env.SUPABASE_KEY as string

declare global {
  // eslint-disable-next-line no-var
  var __supabaseClient__: SupabaseClient
}

const supabaseConnection = (log?: FastifyBaseLogger) => {
  if (!global.__supabaseClient__) {
    global.__supabaseClient__ = createClient(supabaseUrl, supabaseKey)
    log?.info('Supabase connection established.')
  }

  return global.__supabaseClient__
}

export { supabaseConnection }
