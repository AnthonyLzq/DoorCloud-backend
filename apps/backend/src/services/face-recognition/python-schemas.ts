import { z } from 'zod'

// Schema para respuesta del servidor Python (flexible)
export const PythonResponseSchema = z.object({
  id: z.number(),
  error: z.string().optional(),
  result: z.unknown().optional(),
  success: z.boolean().optional(),
  models: z.array(z.string()).optional(),
  model: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  embedding_size: z.number().optional()
})

// Schema para request al servidor Python
export const PythonRequestSchema = z.object({
  id: z.number(),
  method: z.string(),
  args: z.array(z.unknown())
})

// Tipos inferidos
export type PythonResponse = z.infer<typeof PythonResponseSchema>
export type PythonRequest = z.infer<typeof PythonRequestSchema>
export type PythonErrorResponse = { id: number; error: string }
export type PythonSuccessResponse = {
  id: number
  result?: unknown
  success?: boolean
  models?: string[]
  model?: string
  embedding?: number[]
  embedding_size?: number
}
