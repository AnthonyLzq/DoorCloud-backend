import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(1, 'name is required'),
  phone: z.string().min(1, 'phone is required')
})

const uploadUserPhotoParamsSchema = z.object({
  folderID: z.string().min(1, 'folderID is required')
})

type UserRequest = z.infer<typeof userSchema>

export type { UserRequest }
export { uploadUserPhotoParamsSchema, userSchema }
