import { describe, expect, test } from 'vitest'
import {
  deleteQuery,
  personItem,
  personName,
  photoItem,
  promoteBody
} from '../src/index'

describe('personName (PA-2)', () => {
  test('accepts a trimmed multi-word name', () => {
    expect(personName.parse('Bryan Ramos')).toBe('Bryan Ramos')
  })

  test('trims surrounding whitespace', () => {
    expect(personName.parse('  Ana  ')).toBe('Ana')
  })

  test('rejects an empty string', () => {
    expect(personName.safeParse('').success).toBe(false)
  })

  test('rejects whitespace-only names after trim', () => {
    expect(personName.safeParse('   ').success).toBe(false)
  })

  test('rejects a forward-slash separator', () => {
    expect(personName.safeParse('a/b').success).toBe(false)
  })

  test('rejects a backslash separator', () => {
    expect(personName.safeParse('a\\b').success).toBe(false)
  })
})

describe('deleteQuery (PA-4 confirm)', () => {
  test('accepts an empty query object', () => {
    expect(deleteQuery.parse({})).toEqual({})
  })

  test('accepts confirm as the literal string true', () => {
    expect(deleteQuery.parse({ confirm: 'true' })).toEqual({
      confirm: 'true'
    })
  })

  test('rejects confirm as the literal string false', () => {
    expect(deleteQuery.safeParse({ confirm: 'false' }).success).toBe(false)
  })

  test('rejects confirm as a boolean', () => {
    expect(deleteQuery.safeParse({ confirm: true }).success).toBe(false)
  })
})

describe('personItem', () => {
  test('accepts a person with zero photos', () => {
    expect(personItem.parse({ name: 'Ana', photoCount: 0 })).toEqual({
      name: 'Ana',
      photoCount: 0
    })
  })

  test('accepts a person with photos', () => {
    expect(personItem.parse({ name: 'Bryan Ramos', photoCount: 12 })).toEqual({
      name: 'Bryan Ramos',
      photoCount: 12
    })
  })

  test('rejects an invalid person name inside the item', () => {
    expect(personItem.safeParse({ name: 'a/b', photoCount: 1 }).success).toBe(
      false
    )
  })

  test('rejects a non-numeric photo count', () => {
    expect(personItem.safeParse({ name: 'Ana', photoCount: '3' }).success).toBe(
      false
    )
  })
})

describe('photoItem (PA-5 signed url)', () => {
  test('accepts a filename with a valid URL', () => {
    const url = 'http://localhost:1996/photos/Ana/selfie.jpg'
    const result = photoItem.parse({ filename: 'selfie.jpg', url })

    expect(result).toEqual({ filename: 'selfie.jpg', url })
  })

  test('rejects a non-URL string', () => {
    expect(
      photoItem.safeParse({ filename: 'selfie.jpg', url: 'not-a-url' }).success
    ).toBe(false)
  })
})

describe('promoteBody (PA-6)', () => {
  test('accepts a valid target person', () => {
    expect(promoteBody.parse({ person: 'Bryan' })).toEqual({
      person: 'Bryan'
    })
  })

  test('rejects an empty target person', () => {
    expect(promoteBody.safeParse({ person: '' }).success).toBe(false)
  })

  test('rejects a separator in the target person', () => {
    expect(promoteBody.safeParse({ person: 'a/b' }).success).toBe(false)
  })
})
