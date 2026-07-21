# Face Recognition Benchmark Datasets

This directory contains datasets used for benchmarking face recognition models.

## Datasets

### LFW (Labeled Faces in the Wild)
- **Size**: 13,233 images, 6,000 pairs
- **Purpose**: Unrestricted face verification benchmark
- **Format**: Directory structure with person names as folders
- **Pairs file**: `lfw/pairs.txt` contains 6,000 verification pairs
- **Website**: http://vis-www.cs.umass.edu/lfw/

### CFP-FP (Celebrities Frontal-Profile)
- **Size**: 500 subjects, 100 images per subject
- **Purpose**: Frontal-profile face verification
- **Format**: Directory structure with person IDs
- **Website**: http://www.cfpw.io/

### AgeDB-30
- **Size**: 12,240 images, 600 subjects
- **Purpose**: Age-invariant face verification
- **Format**: Directory structure with age groups
- **Website**: https://ibug.doc.ic.ac.uk/resources/agedb/

## Download

Run the download script:

```bash
./scripts/download-datasets.sh
```

This will download approximately 2GB of data.

## Usage

These datasets are used by the benchmark system to evaluate face recognition models:

```typescript
import { FaceRecognitionService } from './services/face-recognition'
import { BenchmarkSystem } from './services/benchmark'

const service = new FaceRecognitionService()
await service.init()

const benchmark = new BenchmarkSystem(service)
const results = await benchmark.runBenchmark({
  dataset: 'lfw',
  models: ['insightface-buffalo-l', 'dlib']
})
```

## Notes

- Datasets are not included in the git repository
- Download them manually or use the provided script
- Some datasets may require registration on their websites
- Respect the terms of use for each dataset
