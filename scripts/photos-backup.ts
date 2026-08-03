import { createHmac } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import yargs, { type Argv } from 'yargs'

type BackupArgs = {
  dest?: string
  secret?: string
  dryRun: boolean
}

type BackupSummary = {
  files: number
  bytes: number
}

type RunBackupOptions = {
  source?: string
  dest?: string
  secret?: string
  dryRun?: boolean
}

const DEFAULT_WEBHOOK_TIMEOUT_MS = 30_000
const DEFAULT_WEBHOOK_MAX_RETRIES = 3
const DEFAULT_WEBHOOK_BASE_DELAY_MS = 500

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Computes the exponential backoff delay for a retry attempt
 *
 * @param attempt - Zero-based attempt index that just failed
 * @param baseDelayMs - Base delay in milliseconds
 * @returns Delay in milliseconds before the next attempt
 */
export const backoffDelay = (
  attempt: number,
  baseDelayMs = DEFAULT_WEBHOOK_BASE_DELAY_MS
): number => baseDelayMs * 2 ** attempt

/**
 * Determines whether a destination string is a webhook URL
 *
 * @param dest - Destination as passed via --dest or BACKUP_DEST
 * @returns True when the destination starts with http:// or https://
 */
export const isWebhookDest = (dest: string): boolean =>
  /^https?:\/\//i.test(dest)

/**
 * Signs a webhook payload with HMAC-SHA256 for the receiver
 *
 * The signature covers the timestamp and the raw body, so an on-path attacker
 * cannot rewrite `X-DoorCloud-Timestamp` (e.g. to extend the freshness
 * window) without invalidating the signature. The receiver should verify the
 * signature and check the timestamp before trusting the payload.
 *
 * @param body - Raw backup payload bytes
 * @param secret - Shared webhook secret (BACKUP_SECRET / --secret)
 * @param timestamp - Unix milliseconds covered by the signature (defaults to now)
 * @returns Hex-encoded HMAC-SHA256 digest
 */
export const signBody = (
  body: Buffer,
  secret: string,
  timestamp: number = Date.now()
): string =>
  createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex')

/**
 * Builds the yargs options shared by the `door-cloud backup` CLI command and
 * the testable parseArgs helper, so option definitions cannot drift.
 *
 * @param cli - yargs instance to attach the backup options to
 * @returns The same instance with the backup options registered
 */
export const backupCliOptions = (cli: Argv): Argv<BackupArgs> =>
  cli
    .option('dest', {
      type: 'string',
      describe: 'Destination folder or webhook URL'
    })
    .option('secret', {
      type: 'string',
      describe: 'Webhook signing secret (HMAC-SHA256)'
    })
    .option('dry-run', {
      type: 'boolean',
      default: false,
      describe: 'Report what would happen without writing anything'
    }) as unknown as Argv<BackupArgs>

/**
 * Parses CLI arguments with yargs
 *
 * Supports `--dest`, `--secret` and `--dry-run`; strict mode rejects unknown
 * flags and prints usage on failure.
 *
 * @param argv - Raw argument vector (typically process.argv.slice(2))
 * @returns Normalized backup arguments
 */
export const parseArgs = (argv: string[]): BackupArgs => {
  const parsed = backupCliOptions(yargs(argv))
    .scriptName('photos-backup')
    .usage('Copy PHOTOS_DIR to a local folder or a signed webhook')
    .strict()
    .help()
    .fail((msg, err) => {
      if (err) throw err
      throw new Error(msg)
    })
    .parseSync()

  return {
    dest: parsed.dest,
    secret: parsed.secret,
    dryRun: parsed.dryRun
  }
}

/**
 * Recursively collects every file path under root, as forward-slash
 * relative paths
 *
 * @param root - Directory to walk
 * @returns Relative file paths, e.g. ["john-1/selfie.jpg"]
 */
export const collectFiles = (root: string): string[] => {
  const files: string[] = []

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)

      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        files.push(relative(root, full).split(sep).join('/'))
      }
    }
  }

  walk(root)
  return files
}

/**
 * Checks whether one path is inside another
 *
 * @param parent - Candidate parent directory
 * @param child - Candidate child path
 * @returns True when child resolves inside parent
 */
const isInside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Appends the relative file path as a query parameter to a webhook URL
 *
 * @param base - Webhook destination URL
 * @param rel - Relative file path
 * @returns URL with a `path` query parameter
 */
const buildWebhookUrl = (base: string, rel: string): string =>
  `${base}${base.includes('?') ? '&' : '?'}path=${encodeURIComponent(rel)}`

/**
 * Backs up PHOTOS_DIR into a local destination folder
 *
 * Rejects destinations inside the source directory to avoid recursive
 * self-copies. In dry-run mode only counts files and bytes.
 *
 * @param source - Source photos directory
 * @param dest - Destination folder
 * @param dryRun - Count only, do not write
 * @returns Number of files and total bytes that would be / were copied
 */
export const backupToFolder = async (
  source: string,
  dest: string,
  dryRun = false
): Promise<BackupSummary> => {
  const sourceRoot = resolve(source)
  const destRoot = resolve(dest)

  if (!existsSync(sourceRoot)) {
    throw new Error(`PHOTOS_DIR ${source} does not exist`)
  }

  if (isInside(sourceRoot, destRoot)) {
    throw new Error(`Destination ${dest} is inside PHOTOS_DIR ${source}`)
  }

  const files = collectFiles(sourceRoot)
  let bytes = 0

  for (const rel of files) {
    const size = statSync(join(sourceRoot, rel)).size
    bytes += size

    if (!dryRun) {
      const target = join(destRoot, rel)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, readFileSync(join(sourceRoot, rel)))
    }
  }

  return { files: files.length, bytes }
}

/**
 * Backs up PHOTOS_DIR to a webhook URL with per-file POSTs
 *
 * Each file is sent as an octet-stream body with a HMAC-SHA256 signature and
 * timestamp; the destination URL carries the relative path. Network failures
 * and timeouts are retried with exponential backoff; non-2xx responses fail
 * the backup immediately.
 *
 * @param source - Source photos directory
 * @param dest - Webhook destination URL
 * @param secret - Shared secret used to sign each body
 * @param dryRun - Count only, do not send
 * @param fetchImpl - Fetch implementation (injected for tests)
 * @param retry - Optional retry tuning (timeout, attempts, backoff base)
 * @returns Number of files and total bytes that would be / were sent
 */
export const backupToWebhook = async (
  source: string,
  dest: string,
  secret: string,
  dryRun: boolean,
  fetchImpl: typeof fetch = globalThis.fetch,
  retry: {
    timeoutMs?: number
    maxRetries?: number
    baseDelayMs?: number
  } = {}
): Promise<BackupSummary> => {
  const {
    timeoutMs = DEFAULT_WEBHOOK_TIMEOUT_MS,
    maxRetries = DEFAULT_WEBHOOK_MAX_RETRIES,
    baseDelayMs = DEFAULT_WEBHOOK_BASE_DELAY_MS
  } = retry
  const sourceRoot = resolve(source)

  if (!existsSync(sourceRoot)) {
    throw new Error(`PHOTOS_DIR ${source} does not exist`)
  }

  const files = collectFiles(sourceRoot)
  let bytes = 0

  for (const rel of files) {
    const body = readFileSync(join(sourceRoot, rel))
    bytes += body.length

    if (dryRun) continue

    const timestamp = Date.now()
    const url = buildWebhookUrl(dest, rel)

    let lastError: unknown
    let attempt = 0

    while (attempt <= maxRetries) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      let response: Response | undefined
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-DoorCloud-Signature': signBody(body, secret, timestamp),
            'X-DoorCloud-Timestamp': String(timestamp)
          },
          body,
          signal: controller.signal
        })
      } catch (error) {
        // Network error or timeout: retryable with backoff.
        lastError = error
        attempt++

        const delay =
          attempt <= maxRetries ? backoffDelay(attempt - 1, baseDelayMs) : 0
        console.warn(
          `[photos-backup] Network error sending ${rel} (attempt ${attempt}/${maxRetries + 1}): ${error instanceof Error ? error.message : String(error)}${delay > 0 ? `, retrying in ${delay}ms` : ', giving up'}`
        )

        if (attempt <= maxRetries) {
          await sleep(delay)
        }

        continue
      } finally {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        // A rejected webhook is a definitive answer: fail immediately, do
        // not retry (matches the documented contract). Log the status so
        // transient receiver failures (5xx/429) are distinguishable from
        // permanent configuration errors (4xx) in the operational record.
        throw new Error(
          `Webhook rejected ${rel}: HTTP ${response.status} ${response.statusText} (not retried; receiver returned a non-2xx response)`
        )
      }

      lastError = undefined
      break
    }

    if (lastError) throw lastError
  }

  return { files: files.length, bytes }
}

/**
 * Runs a backup with the given options and returns a process exit code
 *
 * Resolves the destination type (webhook vs folder), validates inputs, and
 * prints a human-readable summary. Returns 0 on success and 1 on any
 * configuration or I/O failure.
 *
 * @param opts - Source, destination, optional secret and dry-run flag
 * @returns Process exit code (0 success, 1 failure)
 */
export const runBackup = async (opts: RunBackupOptions): Promise<number> => {
  const { source, dest, secret, dryRun = false } = opts

  if (!source) {
    console.error('[photos-backup] PHOTOS_DIR is not set')
    return 1
  }

  if (!dest) {
    console.error(
      '[photos-backup] Missing destination: pass --dest or set BACKUP_DEST'
    )
    return 1
  }

  if (!existsSync(source)) {
    console.error(`[photos-backup] PHOTOS_DIR ${source} does not exist`)
    return 1
  }

  try {
    let summary: BackupSummary

    if (isWebhookDest(dest)) {
      if (!secret) {
        console.error(
          '[photos-backup] Webhook destination requires --secret or BACKUP_SECRET'
        )
        return 1
      }
      summary = await backupToWebhook(source, dest, secret, dryRun)
    } else {
      summary = await backupToFolder(source, dest, dryRun)
    }

    const action = dryRun ? 'Would back up' : 'Backed up'
    console.log(
      `[photos-backup] ${action} ${summary.files} file(s) (${summary.bytes} bytes) to ${dest}`
    )
    return 0
  } catch (error) {
    console.error(
      `[photos-backup] ${error instanceof Error ? error.message : String(error)}`
    )
    return 1
  }
}
