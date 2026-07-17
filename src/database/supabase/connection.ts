import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getEnv } from 'config/env'
import type { FastifyBaseLogger } from 'fastify'

declare global {
  var __supabaseClient__: SupabaseClient
}

const supabaseConnection = (log?: FastifyBaseLogger) => {
  if (!global.__supabaseClient__) {
    const { SUPABASE_URL, SUPABASE_KEY } = getEnv()

    global.__supabaseClient__ = createClient(SUPABASE_URL, SUPABASE_KEY)
    log?.info('Supabase connection established.')
  }

  return global.__supabaseClient__
}

export { supabaseConnection }
