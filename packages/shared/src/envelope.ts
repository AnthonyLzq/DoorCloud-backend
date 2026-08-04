import { z } from 'zod'

// PA-1: every admin/setup response and failure uses { error, message }.
const envelopeSchema = z.object({
  error: z.boolean(),
  message: z.unknown()
})

export type Envelope = z.infer<typeof envelopeSchema>

export { envelopeSchema }
