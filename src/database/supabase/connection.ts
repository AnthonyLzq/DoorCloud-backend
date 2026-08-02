import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FastifyBaseLogger } from 'fastify'

declare global {
  var __supabaseClient__: SupabaseClient
}

const supabaseConnection = (log?: FastifyBaseLogger) => {
  if (!global.__supabaseClient__) {
    const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
    const SUPABASE_KEY = process.env.SUPABASE_KEY ?? ''

    global.__supabaseClient__ = createClient(SUPABASE_URL, SUPABASE_KEY)
    log?.info('Supabase connection established.')
  }

  return global.__supabaseClient__
}

export { supabaseConnection }
