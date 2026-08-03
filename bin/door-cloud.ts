#!/usr/bin/env tsx
import 'dotenv/config'
import { resolve } from 'node:path'
import yargs from 'yargs'

import { backupCliOptions, runBackup } from '../scripts/photos-backup'
import { setupPhotos } from '../scripts/photos-setup'

type BackupCliArgs = {
  dest?: string
  secret?: string
  dryRun: boolean
}

type SetupCliArgs = {
  source: string
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
    .command<SetupCliArgs>(
      'photos:setup',
      'Register reference photos from a local folder into PHOTOS_DIR/{USER_NAME}',
      yargs =>
        yargs
          .option('source', {
            type: 'string',
            demandOption: true,
            describe: 'Folder containing the reference photos'
          })
          .option('dry-run', {
            type: 'boolean',
            default: false,
            describe: 'Report what would be copied without writing anything'
          }),
      async args => {
        const photosDir = process.env.PHOTOS_DIR
        const userName = process.env.USER_NAME

        if (!photosDir || !userName) {
          console.error(
            '[door-cloud] PHOTOS_DIR and USER_NAME must be set to register photos'
          )
          process.exitCode = 1

          return
        }

        try {
          const summary = await setupPhotos(
            args.source,
            resolve(photosDir, userName),
            { dryRun: args.dryRun }
          )

          const action = args.dryRun ? 'Would register' : 'Registered'
          console.log(
            `[door-cloud] ${action} ${summary.files.length} reference photo(s) in ${summary.folder}`
          )
          process.exitCode = 0
        } catch (error) {
          console.error(
            `[door-cloud] ${error instanceof Error ? error.message : String(error)}`
          )
          process.exitCode = 1
        }
      }
    )
    .demandCommand(
      1,
      'Run a command. Try `door-cloud backup --help` or `door-cloud photos:setup --help`.'
    )
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
