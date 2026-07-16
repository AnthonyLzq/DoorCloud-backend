import { Server } from './network'

Server.start().catch(error => {
  console.error(error)
  process.exit(1)
})
