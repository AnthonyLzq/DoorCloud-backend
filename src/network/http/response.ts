import type { FastifyReply } from 'fastify'

type ResponseReply = Pick<FastifyReply, 'code' | 'send'>

const response = ({
  error,
  message,
  reply,
  status
}: {
  error: boolean
  message: unknown
  reply: ResponseReply
  status: number
}): void => {
  reply.code(status).send({ error, message })
}

export { response }
