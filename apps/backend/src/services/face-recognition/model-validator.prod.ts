import { existsSync } from 'node:fs'
import { resolveModelPath } from 'config/paths'

const REQUIRED_MODELS_PROD = [
  // InsightFace buffalo_s (detection + recognition), production set
  'models/insightface/det_500m.onnx',
  'models/insightface/w600k_mbf.onnx'
]

export const validateModelsProd = (): void => {
  const missingModels: string[] = []

  for (const modelPath of REQUIRED_MODELS_PROD) {
    const absolutePath = resolveModelPath(modelPath)
    if (!existsSync(absolutePath)) {
      missingModels.push(modelPath)
    }
  }

  if (missingModels.length > 0) {
    const errorMessage = [
      'Face recognition models not found!',
      '',
      'The following required models are missing:',
      ...missingModels.map(m => `  - ${m}`),
      '',
      'Please run the following command to download the models:',
      '',
      '  pnpm models:download:prod',
      '',
      'This will download ~130MB of ONNX models to apps/backend/models/.',
      'The application cannot start without these models.'
    ].join('\n')

    throw new Error(errorMessage)
  }
}
