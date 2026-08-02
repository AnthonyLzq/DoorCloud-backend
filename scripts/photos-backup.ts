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
import yargs from 'yargs'

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

/**
 * Determines whether a destination string is a webhook URL
 *
 * @param dest - Destination as passed via --dest or BACKUP_DEST
 * @returns True when the destination starts with http:// or https://
 */
export const isWebhookDest = (dest: string): boolean =>
  /^https?:\/\//i.test(dest)

/**
 * Signs a request body with HMAC-SHA256 for the webhook receiver
 *
 * The receiver should verify this signature before trusting the payload.
 *
 * @param body - Raw backup payload bytes
 * @param secret - Shared webhook secret (BACKUP_SECRET / --secret)
 * @returns Hex-encoded HMAC-SHA256 digest
 */
export const signBody = (body: Buffer, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('hex')

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
  const parsed = yargs(argv)
    .scriptName('photos-backup')
    .usage('Copy PHOTOS_DIR to a local folder or a signed webhook')
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
    })
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
 * timestamp; the destination URL carries the relative path. Non-2xx responses
 * fail the backup.
 *
 * @param source - Source photos directory
 * @param dest - Webhook destination URL
 * @param secret - Shared secret used to sign each body
 * @param dryRun - Count only, do not send
 * @param fetchImpl - Fetch implementation (injected for tests)
 * @returns Number of files and total bytes that would be / were sent
 */
export const backupToWebhook = async (
  source: string,
  dest: string,
  secret: string,
  dryRun: boolean,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<BackupSummary> => {
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

    const response = await fetchImpl(buildWebhookUrl(dest, rel), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-DoorCloud-Signature': signBody(body, secret),
        'X-DoorCloud-Timestamp': String(Date.now())
      },
      body
    })

    if (!response.ok) {
      throw new Error(`Webhook rejected ${rel}: HTTP ${response.status}`)
    }
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

/**
 * CLI entry point: parses args, resolves env fallbacks, runs the backup
 *
 * @returns Promise that resolves after setting the process exit code
 */
const main = async (): Promise<void> => {
  let args: BackupArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(
      `[photos-backup] ${error instanceof Error ? error.message : String(error)}`
    )
    process.exitCode = 1
    return
  }

  const source = process.env.PHOTOS_DIR
  const dest = args.dest ?? process.env.BACKUP_DEST
  const secret = args.secret ?? process.env.BACKUP_SECRET

  process.exitCode = await runBackup({
    source,
    dest,
    secret,
    dryRun: args.dryRun
  })
}

/**
 * Detects whether this module was run directly as a CLI
 *
 * Allows importing the backup functions from tests without triggering main().
 *
 * @returns True when the entry script resolves to this file
 */
const isEntryPoint = (): boolean => {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return resolve(entry) === resolve(__filename)
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  main().catch(error => {
    console.error(
      `[photos-backup] ${error instanceof Error ? error.message : String(error)}`
    )
    process.exitCode = 1
  })
}
