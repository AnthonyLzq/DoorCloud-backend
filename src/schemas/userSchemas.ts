import { z } from 'zod'

const userSchema = z.object({
  name: z.string().min(1, 'name is required'),
  phone: z.string().min(1, 'phone is required')
})

const userResponseSchema = z.object({
  name: z.string(),
  phone: z.string(),
  idFolder: z.string()
})

const uploadUserPhotoParamsSchema = z.object({
  folderID: z.string().min(1, 'folderID is required')
})

type UserRequest = z.infer<typeof userSchema>
type UserResponse = z.infer<typeof userResponseSchema>

export { uploadUserPhotoParamsSchema, userSchema, userResponseSchema }
export type { UserRequest, UserResponse }
