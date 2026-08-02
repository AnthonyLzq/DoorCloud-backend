import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DATA_DIR = resolve(process.cwd(), 'data')
const DEFAULT_DB_PATH = resolve(DATA_DIR, 'app-state.db')

let sharedUserState: UserState | null = null

/**
 * Shared process-wide state connection.
 *
 * One SQLite connection per process, created lazily on first use. The MQTT
 * photo handler and HTTP routes construct a `UserServices` per message or
 * request; without a shared connection each construction would open (and
 * leak) a new `DatabaseSync` handle plus a CREATE TABLE write. The optional
 * `dbPath` lets callers point the shared state at a configured
 * `STATE_DB_PATH` (e.g. a mounted volume in Docker).
 */
export function getUserState(dbPath?: string): UserState {
  if (!sharedUserState) sharedUserState = new UserState(dbPath)

  return sharedUserState
}

/**
 * Drop the shared connection so the next `getUserState()` call opens a fresh
 * one. Used by tests to isolate cases; harmless in production where the state
 * connection is meant to live for the whole process.
 */
export function resetUserState(): void {
  if (sharedUserState) {
    sharedUserState.close()
    sharedUserState = null
  }
}

/**
 * SQLite-backed persistence for the single user's last-message timestamp.
 *
 * Mirrors the `data/benchmarks.db` precedent (`src/services/benchmark/storage.ts`)
 * so the value survives restarts like the old Supabase `users.lastMessage` row.
 */
export class UserState {
  private db: DatabaseSync
  private closed = false

  constructor(dbPath?: string) {
    const path = dbPath ?? DEFAULT_DB_PATH

    mkdirSync(dirname(path), { recursive: true })

    this.db = new DatabaseSync(path)
    this.migrate()
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  getLastMessage(id: string): Date | null {
    const row = this.db
      .prepare('SELECT last_message_at FROM user_state WHERE id = ?')
      .get(id) as { last_message_at: string | null } | undefined

    if (!row?.last_message_at) return null

    return new Date(row.last_message_at)
  }

  setLastMessage(id: string, lastMessageAt: Date): void {
    this.db
      .prepare(
        `INSERT INTO user_state (id, last_message_at) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET last_message_at = excluded.last_message_at`
      )
      .run(id, lastMessageAt.toISOString())
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_state (
        id              TEXT PRIMARY KEY,
        last_message_at TEXT NOT NULL
      )
    `)
  }
}
