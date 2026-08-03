import { createHmac } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  backoffDelay,
  backupToFolder,
  backupToWebhook,
  collectFiles,
  isWebhookDest,
  parseArgs,
  runBackup,
  signBody
} from '../scripts/photos-backup'

let sourceDir: string
let destDir: string

beforeEach(() => {
  sourceDir = mkdtempSync(join(tmpdir(), 'doorcloud-backup-src-'))
  destDir = mkdtempSync(join(tmpdir(), 'doorcloud-backup-dst-'))
})

afterEach(() => {
  rmSync(sourceDir, { force: true, recursive: true })
  rmSync(destDir, { force: true, recursive: true })
  vi.unstubAllGlobals()
})

const seedSource = () => {
  mkdirSync(join(sourceDir, 'Ana-42'), { recursive: true })
  writeFileSync(join(sourceDir, 'Ana-42/selfie-a.jpg'), 'aaa')
  writeFileSync(join(sourceDir, 'Ana-42/selfie-b.jpg'), 'bbbb')
}

describe('parseArgs', () => {
  test('parses --dest, --secret and --dry-run', () => {
    expect(
      parseArgs(['--dest', '/tmp/x', '--secret', 'abc', '--dry-run'])
    ).toEqual({
      dest: '/tmp/x',
      secret: 'abc',
      dryRun: true
    })
  })

  test('supports the --flag=value form', () => {
    expect(parseArgs(['--dest=/tmp/x', '--secret=abc'])).toEqual({
      dest: '/tmp/x',
      secret: 'abc',
      dryRun: false
    })
  })

  test('dry-run defaults to false and flags may be omitted', () => {
    expect(parseArgs([])).toEqual({
      dest: undefined,
      secret: undefined,
      dryRun: false
    })
  })

  test('coerces --dry-run=true into a boolean flag', () => {
    expect(parseArgs(['--dry-run=true'])).toEqual({
      dest: undefined,
      secret: undefined,
      dryRun: true
    })
  })

  test('coerces --dry-run=false into a boolean flag', () => {
    expect(parseArgs(['--dry-run=false'])).toEqual({
      dest: undefined,
      secret: undefined,
      dryRun: false
    })
  })

  test('throws on unknown flags', () => {
    expect(() => parseArgs(['--bogus'])).toThrow()
  })
})

describe('signBody', () => {
  test('returns lowercase hex HMAC-SHA256 covering timestamp and body', () => {
    const sig = signBody(Buffer.from('hello'), 's3cret', 1_728_000_000_000)
    const expected = createHmac('sha256', 's3cret')
      .update('1728000000000.')
      .update(Buffer.from('hello'))
      .digest('hex')

    expect(sig).toBe(expected)
  })

  test('changes when the timestamp changes', () => {
    const body = Buffer.from('hello')

    expect(signBody(body, 's3cret', 1_728_000_000_000)).not.toBe(
      signBody(body, 's3cret', 1_728_000_000_001)
    )
  })
})

describe('isWebhookDest', () => {
  test('detects http(s) URLs as webhook destinations', () => {
    expect(isWebhookDest('https://hooks.example.com/push')).toBe(true)
    expect(isWebhookDest('http://localhost:9000/backup')).toBe(true)
  })

  test('treats plain paths as folder destinations', () => {
    expect(isWebhookDest('/tmp/backup')).toBe(false)
  })
})

describe('collectFiles', () => {
  test('returns POSIX relative paths for a nested tree', () => {
    seedSource()
    mkdirSync(join(sourceDir, 'Ana-42/nested'), { recursive: true })
    writeFileSync(join(sourceDir, 'Ana-42/nested/x.txt'), 'x')

    expect(collectFiles(sourceDir).sort()).toEqual([
      'Ana-42/nested/x.txt',
      'Ana-42/selfie-a.jpg',
      'Ana-42/selfie-b.jpg'
    ])
  })
})

describe('backupToFolder', () => {
  test('copies every file preserving relative paths and returns counts', async () => {
    seedSource()

    const summary = await backupToFolder(sourceDir, destDir)

    expect(summary.files).toBe(2)
    expect(summary.bytes).toBe(7)
    expect(existsSync(join(destDir, 'Ana-42/selfie-a.jpg'))).toBe(true)
    expect(readFileSync(join(destDir, 'Ana-42/selfie-b.jpg'), 'utf-8')).toBe(
      'bbbb'
    )
  })

  test('overwrites existing destination files with current source content', async () => {
    seedSource()
    mkdirSync(join(destDir, 'Ana-42'), { recursive: true })
    writeFileSync(join(destDir, 'Ana-42/selfie-a.jpg'), 'stale')

    await backupToFolder(sourceDir, destDir)

    expect(readFileSync(join(destDir, 'Ana-42/selfie-a.jpg'), 'utf-8')).toBe(
      'aaa'
    )
  })

  test('throws when the destination is inside the source', async () => {
    const nestedDest = join(sourceDir, 'nested')

    await expect(backupToFolder(sourceDir, nestedDest)).rejects.toThrow()
    await expect(backupToFolder(sourceDir, sourceDir)).rejects.toThrow()
  })

  test('dry-run copies nothing', async () => {
    seedSource()

    const summary = await backupToFolder(sourceDir, destDir, true)

    expect(summary.files).toBe(2)
    expect(existsSync(join(destDir, 'Ana-42/selfie-a.jpg'))).toBe(false)
  })
})

describe('backoffDelay', () => {
  test('doubles the base delay per failed attempt', () => {
    expect(backoffDelay(0)).toBe(500)
    expect(backoffDelay(1)).toBe(1_000)
    expect(backoffDelay(2)).toBe(2_000)
  })

  test('honors a custom base delay', () => {
    expect(backoffDelay(0, 100)).toBe(100)
    expect(backoffDelay(2, 100)).toBe(400)
  })
})

describe('backupToWebhook', () => {
  test('POSTs raw bytes with signature and timestamp headers', async () => {
    seedSource()
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))

    const summary = await backupToWebhook(
      sourceDir,
      'https://hooks.example.com/push',
      's3cret',
      false,
      fetchMock
    )

    expect(summary.files).toBe(2)
    expect(summary.bytes).toBe(7)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://hooks.example.com/push')
    expect(url).toContain('path=Ana-42%2Fselfie-a.jpg')
    expect(init.method).toBe('POST')
    expect(init.body).toEqual(Buffer.from('aaa'))
    const timestamp = Number(init.headers['X-DoorCloud-Timestamp'])
    const expectedSig = createHmac('sha256', 's3cret')
      .update(`${timestamp}.`)
      .update(Buffer.from('aaa'))
      .digest('hex')
    expect(init.headers['X-DoorCloud-Signature']).toBe(expectedSig)
    expect(timestamp).toBeGreaterThan(0)
  })

  test('dry-run does not call fetch', async () => {
    seedSource()
    const fetchMock = vi.fn()

    const summary = await backupToWebhook(
      sourceDir,
      'https://hooks.example.com/push',
      's3cret',
      true,
      fetchMock
    )

    expect(summary.files).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('retries network errors with backoff before succeeding', async () => {
    seedSource()
    let call = 0
    const fetchMock = vi.fn(async () => {
      call++
      if (call % 3 !== 0) throw new Error('ECONNRESET')
      return new Response('ok', { status: 200 })
    })

    const summary = await backupToWebhook(
      sourceDir,
      'https://hooks.example.com/push',
      's3cret',
      false,
      fetchMock,
      { baseDelayMs: 0 }
    )

    expect(summary.files).toBe(2)
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  test('fails after exhausting retries on persistent network errors', async () => {
    seedSource()
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    await expect(
      backupToWebhook(
        sourceDir,
        'https://hooks.example.com/push',
        's3cret',
        false,
        fetchMock,
        { baseDelayMs: 0, maxRetries: 2 }
      )
    ).rejects.toThrow('ECONNRESET')

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  test('passes an abort signal to fetch so calls can time out', async () => {
    seedSource()
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))

    await backupToWebhook(
      sourceDir,
      'https://hooks.example.com/push',
      's3cret',
      false,
      fetchMock,
      { timeoutMs: 5_000 }
    )

    const [, init] = fetchMock.mock.calls[0]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('runBackup', () => {
  test('returns 0 when the folder backup succeeds', async () => {
    seedSource()

    const code = await runBackup({
      source: sourceDir,
      dest: destDir,
      dryRun: false
    })

    expect(code).toBe(0)
    expect(existsSync(join(destDir, 'Ana-42/selfie-a.jpg'))).toBe(true)
  })

  test('returns 1 when PHOTOS_DIR does not exist', async () => {
    const code = await runBackup({
      source: join(destDir, 'missing'),
      dest: destDir,
      dryRun: false
    })

    expect(code).toBe(1)
  })

  test('returns 1 when the destination is not writable', async () => {
    seedSource()
    const blocker = join(destDir, 'blocker')
    writeFileSync(blocker, 'file')
    const badDest = join(blocker, 'sub')

    const code = await runBackup({
      source: sourceDir,
      dest: badDest,
      dryRun: false
    })

    expect(code).toBe(1)
  })

  test('returns 1 when the destination is inside the source', async () => {
    seedSource()

    const code = await runBackup({
      source: sourceDir,
      dest: join(sourceDir, 'nested'),
      dryRun: false
    })

    expect(code).toBe(1)
  })

  test('returns 1 when a webhook responds non-2xx', async () => {
    seedSource()
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    const code = await runBackup({
      source: sourceDir,
      dest: 'https://hooks.example.com/push',
      secret: 's3cret',
      dryRun: false
    })

    expect(code).toBe(1)
  })

  test('returns 0 when a webhook accepts every file', async () => {
    seedSource()
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const code = await runBackup({
      source: sourceDir,
      dest: 'https://hooks.example.com/push',
      secret: 's3cret',
      dryRun: false
    })

    expect(code).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('returns 1 when a webhook destination has no secret', async () => {
    seedSource()
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const code = await runBackup({
      source: sourceDir,
      dest: 'https://hooks.example.com/push',
      dryRun: false
    })

    expect(code).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
