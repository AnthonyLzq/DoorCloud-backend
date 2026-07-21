# Face Recognition Benchmark Datasets

This directory contains datasets used for benchmarking face recognition models.

## Datasets

### LFW (Labeled Faces in the Wild) ✅
- **Size**: 13,233 images, 5,749 subjects, 6,000 pairs
- **Purpose**: Unrestricted face verification benchmark
- **Format**: Directory structure with person names as folders
- **Pairs file**: `lfw/pairs.txt` contains 6,000 verification pairs
- **Status**: Downloaded and extracted
- **Website**: http://vis-www.cs.umass.edu/lfw/

### CFP-FP (Celebrities Frontal-Profile) ✅
- **Size**: 500 subjects, 7,000 images, 7,000 pairs
- **Purpose**: Frontal-profile face verification
- **Format**: 
  - `Data/` - Images organized by subject
  - `Protocol/` - Verification pairs
- **Status**: Downloaded and extracted
- **Website**: http://www.cfpw.io/

### AgeDB-30 ⏳
- **Size**: 12,240 images, 570 subjects, 6,000 pairs
- **Purpose**: Age-invariant face verification
- **Format**: Directory structure with age groups
- **Status**: Pending manual download
- **Website**: https://ibug.doc.ic.ac.uk/resources/agedb/
- **Note**: Requires email to s.moschoglou@imperial.ac.uk for zip password

## Setup

Run the setup script:

```bash
./scripts/download-datasets.sh
```

This script will:
1. Extract datasets from `datasets/temp/` to their final locations
2. Skip datasets that are already set up
3. Provide instructions for missing datasets

## Manual Download

If the script reports missing datasets, download them manually:

### LFW
1. Visit: http://vis-www.cs.umass.edu/lfw/
2. Download `lfw.tgz` and `pairs.txt`
3. Place in `datasets/temp/`
4. Run script again

### CFP-FP
1. Visit: http://www.cfpw.io/
2. Download the dataset
3. Place `cfp-dataset.zip` in `datasets/temp/`
4. Run script again

### AgeDB-30
1. Visit: https://ibug.doc.ic.ac.uk/resources/agedb/
2. Email: s.moschoglou@imperial.ac.uk for the zip password
3. Download `AgeDB.zip`
4. Place in `datasets/temp/`
5. Run script again

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

- Datasets are not included in the git repository (gitignored)
- Download them manually or use the provided script
- Some datasets may require registration on their websites
- Respect the terms of use for each dataset
- Total size: ~500MB compressed, ~1.5GB extracted
