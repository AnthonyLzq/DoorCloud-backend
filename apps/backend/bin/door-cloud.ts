#!/usr/bin/env tsx
import 'dotenv/config'
import { resolve } from 'node:path'
import yargs from 'yargs'

import { sendPhoto } from '../scripts/photo-send'
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

type PhotoSendCliArgs = {
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
    .command<PhotoSendCliArgs>(
      ['photos:send <source>', 'photo:send <source>'],
      'Publish a photo to doorcloud/v1/photo/send for face verification',
      yargs =>
        yargs
          .positional('source', {
            type: 'string',
            describe: 'Local image path or http(s) URL of the photo to send'
          })
          .option('dry-run', {
            type: 'boolean',
            default: false,
            describe: 'Print the payload without connecting or publishing'
          }),
      async args => {
        try {
          const result = await sendPhoto(args.source, { dryRun: args.dryRun })

          const action = args.dryRun ? 'Would publish' : 'Published'
          const { format, photo } = result.payload
          console.log(
            `[door-cloud] ${action} ${format} photo (${photo.length} chars) to ${result.topic}`
          )

          if (args.dryRun) {
            console.log(
              `[door-cloud] Payload: ${JSON.stringify(result.payload)}`
            )
          }

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
      'Run a command. Try `door-cloud backup --help`, `door-cloud photos:setup --help` or `door-cloud photos:send --help`.'
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
