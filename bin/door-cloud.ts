#!/usr/bin/env tsx
import 'dotenv/config'
import yargs from 'yargs'

import { backupCliOptions, runBackup } from '../scripts/photos-backup'

type BackupCliArgs = {
  dest?: string
  secret?: string
  dryRun: boolean
}

const main = async (): Promise<void> => {
  await yargs(process.argv.slice(2))
    .scriptName('door-cloud')
    .usage('DoorCloud backend CLI')
    .command<BackupCliArgs>(
      'backup',
      'Copy PHOTOS_DIR to a local folder or a signed webhook',
      backupCliOptions,
      async args => {
        const dest = args.dest ?? process.env.BACKUP_DEST
        const secret = args.secret ?? process.env.BACKUP_SECRET

        process.exitCode = await runBackup({
          source: process.env.PHOTOS_DIR,
          dest,
          secret,
          dryRun: args.dryRun
        })
      }
    )
    .demandCommand(1, 'Run a command. Try `door-cloud backup --help`.')
    .help()
    .strict()
    .parse()
}

main().catch(error => {
  console.error(
    `[door-cloud] ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
})
