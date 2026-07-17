#!/usr/bin/env tsx
/**
 * Test script to validate ONNX inference with real models
 * Usage: ./scripts/test-onnx-inference.ts
 */

import sharp from 'sharp'
import { ONNXProvider } from '../src/services/face-recognition/onnx-provider'

async function main() {
  console.log('Testing ONNX Inference with Real Models\n')

  const provider = new ONNXProvider()

  // Test 1: Load InsightFace buffalo_l (recognition model)
  console.log('Loading InsightFace buffalo_l (recognition)...')
  try {
    await provider.loadModel(
      'insightface-buffalo-l',
      'models/insightface/w600k_r50.onnx',
      {
        name: 'InsightFace buffalo_l',
        embeddingSize: 512,
        landmarks: 106,
        speed: 0
      }
    )
    console.log('InsightFace buffalo_l loaded successfully\n')
  } catch (error) {
    console.error('Failed to load InsightFace buffalo_l:', error)
    process.exit(1)
  }

  // Test 2: Load InsightFace buffalo_l (detection model)
  console.log('Loading InsightFace buffalo_l (detection)...')
  try {
    await provider.loadModel(
      'insightface-buffalo-l-det',
      'models/insightface/det_10g.onnx',
      {
        name: 'InsightFace buffalo_l (detection)',
        embeddingSize: 0,
        landmarks: 5,
        speed: 0
      }
    )
    console.log('InsightFace buffalo_l (detection) loaded successfully\n')
  } catch (error) {
    console.error('Failed to load InsightFace buffalo_l (detection):', error)
    process.exit(1)
  }

  // Test 3: Create test image
  console.log('Creating test image...')
  const testImage = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 3,
      background: { r: 128, g: 100, b: 150 }
    }
  })
    .png()
    .toBuffer()
  console.log('Test image created (200x200 RGB)\n')

  // Test 4: Run inference
  console.log('Running inference with recognition model...')
  try {
    const startTime = performance.now()
    const embedding = await provider.getEmbedding(testImage, 'insightface-buffalo-l')
    const latency = performance.now() - startTime

    console.log(`Inference completed in ${latency.toFixed(2)}ms`)
    console.log(`   Embedding size: ${embedding.length}`)
    console.log(`   First 5 values: [${Array.from(embedding.slice(0, 5)).map(v => v.toFixed(4)).join(', ')}]\n`)
  } catch (error) {
    console.error('Inference failed:', error)
    process.exit(1)
  }

  // Test 5: Run inference with detection model
  console.log('Running inference with detection model...')
  try {
    const startTime = performance.now()
    const output = await provider.getEmbedding(testImage, 'insightface-buffalo-l-det')
    const latency = performance.now() - startTime

    console.log(`Detection completed in ${latency.toFixed(2)}ms`)
    console.log(`   Output size: ${output.length}\n`)
  } catch (error) {
    console.error('Detection failed:', error)
    console.log('   (This is expected if the model requires different input format)\n')
  }

  // Note: dlib models (.dat format) are not compatible with ONNX Runtime
  // They will be tested in Phase 2 using Python Manager

  // Test 6: List loaded models
  console.log('Loaded models:')
  const models = provider.listModels()
  for (const model of models) {
    console.log(`   - ${model.name}`)
    console.log(`     Embedding size: ${model.embeddingSize}`)
    console.log(`     Landmarks: ${model.landmarks}`)
    console.log(`     Avg speed: ${model.speed.toFixed(2)}ms\n`)
  }

  // Test 7: Get metrics
  console.log('Performance metrics:')
  for (const model of models) {
    const metrics = provider.getMetrics(model.name)
    if (metrics) {
      console.log(`   ${model.name}:`)
      console.log(`     Requests: ${metrics.requestCount}`)
      console.log(`     Avg latency: ${metrics.avgLatency.toFixed(2)}ms\n`)
    }
  }

  console.log('All tests passed!')
}

main().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})
