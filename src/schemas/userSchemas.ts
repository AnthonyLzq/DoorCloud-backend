import { z } from 'zod'

const uploadUserPhotoParamsSchema = z.object({
  folderID: z.string().min(1, 'folderID is required')
})

export { uploadUserPhotoParamsSchema }
