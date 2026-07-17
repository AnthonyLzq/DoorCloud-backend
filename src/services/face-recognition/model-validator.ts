import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const REQUIRED_MODELS = [
  // InsightFace buffalo_l (detection + recognition)
  'models/insightface/det_10g.onnx',
  'models/insightface/w600k_r50.onnx',
  
  // InsightFace buffalo_m (detection + recognition)
  'models/insightface/buffalo_m/det_2.5g.onnx',
  'models/insightface/buffalo_m/w600k_r50.onnx',
  
  // InsightFace buffalo_s (detection + recognition)
  'models/insightface/det_500m.onnx',
  'models/insightface/w600k_mbf.onnx',
  
  // MediaPipe FaceMesh
  'models/mediapipe/face_mesh.task',
  
  // dlib face recognition
  'models/dlib/dlib_face_recognition_resnet_model_v1.dat'
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
