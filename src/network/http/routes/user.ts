import { FastifyInstance } from 'fastify'
import { UserServices } from '../../../services'
import { $ref } from '../../../schemas'
export async function User(server: FastifyInstance) {
  server.route({
    method: 'POST',
    url: '/user',
    schema: {
      body: $ref('userSchema')
    },
    handler: UserServices.createUserSupabase
  })
  server.route({
    method: 'POST',
    url: '/user/:idFolder/upload',
    handler: UserServices.uploadPhotosSupabase
  })
}
