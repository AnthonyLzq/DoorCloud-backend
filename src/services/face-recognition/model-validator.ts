import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REQUIRED_MODELS = [
  'models/insightface/buffalo_l.onnx',
  'models/insightface/buffalo_m.onnx',
  'models/insightface/buffalo_s.onnx',
  'models/mediapipe/face_mesh.onnx',
  'models/dlib/face_recognition.onnx'
]

export const validateModels = (): void => {
  const missingModels: string[] = []

  for (const modelPath of REQUIRED_MODELS) {
    const absolutePath = resolve(process.cwd(), modelPath)
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
      '  ./scripts/download-models.sh',
      '',
      'This will download ~500MB of ONNX models to the models/ directory.',
      'The application cannot start without these models.'
    ].join('\n')

    throw new Error(errorMessage)
  }
}
