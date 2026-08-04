import { z } from 'zod'

// PA-2: non-empty, no path separators. '.'/'..' rejection is enforced at
// the route layer (M3) on top of this regex.
const personName = z
  .string()
  .trim()
  .min(1)
  .regex(/^[^/\\]+$/)

// PA-4: DELETE requires confirm as the literal string 'true'.
const deleteQuery = z.object({ confirm: z.literal('true').optional() })

const personItem = z.object({
  name: personName,
  photoCount: z.number()
})

// PA-5: photo listing entries carry a signed URL.
const photoItem = z.object({
  filename: z.string(),
  url: z.string().url()
})

// PA-6: promote targets an existing person folder.
const promoteBody = z.object({
  person: personName
})

export type PersonItem = z.infer<typeof personItem>
export type PhotoItem = z.infer<typeof photoItem>

export { deleteQuery, personItem, personName, photoItem, promoteBody }
