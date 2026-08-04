import { describe, expect, test } from 'vitest'
import { envelopeSchema } from '../src/index'

describe('envelopeSchema (PA-1)', () => {
  test('accepts a success envelope with an object message', () => {
    const envelope = { error: false, message: { configured: true } }

    expect(envelopeSchema.parse(envelope)).toEqual(envelope)
  })

  test('accepts a failure envelope with a string message', () => {
    const envelope = { error: true, message: 'Invalid setup token' }

    expect(envelopeSchema.parse(envelope)).toEqual(envelope)
  })

  test('rejects a non-boolean error flag', () => {
    expect(envelopeSchema.safeParse({ error: 'no', message: {} }).success).toBe(
      false
    )
  })

  test('rejects a missing message field', () => {
    expect(envelopeSchema.safeParse({ error: false }).success).toBe(false)
  })
})
