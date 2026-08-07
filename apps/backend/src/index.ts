import { Server } from './network'
import { validateModels } from './services/face-recognition/model-validator'

// Validate face recognition models before starting the server
validateModels()

const shutdownWithError = (reason: string, error: unknown): void => {
  console.error(`[fatal] ${reason}:`, error)

  // Bounded cleanup: give the server a moment to release sessions and close
  // gracefully, then force-exit regardless.
  const forceExitTimer = setTimeout(() => process.exit(1), 5_000)
  forceExitTimer.unref()

  Server.stop()
    .then(() => process.exit(1))
    .catch(cleanupError => {
      console.error('[fatal] Cleanup failed:', cleanupError)
      process.exit(1)
    })
}

process.on('uncaughtException', error => {
  shutdownWithError('uncaughtException', error)
})

process.on('unhandledRejection', reason => {
  shutdownWithError('unhandledRejection', reason)
})

// CD-2: graceful SIGTERM shutdown. The container orchestrator sends SIGTERM to
// stop the service; drain in-flight work within a grace period, then exit 0.
// A bounded force-exit fallback keeps the process from hanging past the
// container stop timeout.
process.on('SIGTERM', () => {
  const forceExitTimer = setTimeout(() => process.exit(1), 10_000)
  forceExitTimer.unref()

  Server.stop()
    .then(() => process.exit(0))
    .catch(cleanupError => {
      console.error('[fatal] SIGTERM cleanup failed:', cleanupError)
      process.exit(1)
    })
})

Server.start().catch(error => {
  shutdownWithError('server start failed', error)
})
