import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { getUserState, resetUserState, UserState } from '../src/storage/state'

let tmpDir: string
let dbPath: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'doorcloud-state-'))
  dbPath = join(tmpDir, 'app-state.db')
  resetUserState()
})

afterEach(() => {
  rmSync(tmpDir, { force: true, recursive: true })
})

describe('UserState', () => {
  describe('getLastMessage', () => {
    it('returns null when no last message is stored', () => {
      const state = new UserState(dbPath)

      try {
        expect(state.getLastMessage()).toBeNull()
      } finally {
        state.close()
      }
    })

    it('returns the stored last_message_at value', () => {
      const state = new UserState(dbPath)

      try {
        state.setLastMessage(new Date('2026-08-01T12:00:00.000Z'))

        expect(state.getLastMessage()?.toISOString()).toBe(
          '2026-08-01T12:00:00.000Z'
        )
      } finally {
        state.close()
      }
    })
  })

  describe('setLastMessage', () => {
    it('upserts the single local user row', () => {
      const state = new UserState(dbPath)

      try {
        state.setLastMessage(new Date('2026-08-01T10:00:00.000Z'))
        state.setLastMessage(new Date('2026-08-01T11:00:00.000Z'))

        expect(state.getLastMessage()?.toISOString()).toBe(
          '2026-08-01T11:00:00.000Z'
        )
      } finally {
        state.close()
      }
    })
  })

  describe('restart survival', () => {
    it('persists last_message_at across instances on the same file', () => {
      const first = new UserState(dbPath)
      first.setLastMessage(new Date('2026-08-01T12:00:00.000Z'))
      first.close()

      const second = new UserState(dbPath)

      try {
        expect(second.getLastMessage()?.toISOString()).toBe(
          '2026-08-01T12:00:00.000Z'
        )
      } finally {
        second.close()
      }
    })
  })

  describe('close', () => {
    it('does not throw when closing', () => {
      const state = new UserState(dbPath)

      expect(() => state.close()).not.toThrow()
    })
  })

  describe('getUserState', () => {
    it('returns the same shared instance on repeated calls', () => {
      expect(getUserState(dbPath)).toBe(getUserState(dbPath))
    })

    it('persists through the shared instance at the provided path', () => {
      const shared = getUserState(dbPath)

      try {
        shared.setLastMessage(new Date('2026-08-01T12:00:00.000Z'))

        expect(shared.getLastMessage()?.toISOString()).toBe(
          '2026-08-01T12:00:00.000Z'
        )
      } finally {
        shared.close()
      }
    })
  })
})
