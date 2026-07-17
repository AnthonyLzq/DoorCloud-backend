import { Server } from './network'
import { validateModels } from './services/face-recognition/model-validator'

// Validate face recognition models before starting the server
validateModels()

Server.start().catch(error => {
  console.error(error)
  process.exit(1)
})
