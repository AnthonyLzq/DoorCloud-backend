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
- **Format**: Images at root level + `cfp_ff_pair.txt`
- **Status**: Downloaded and extracted
- **Website**: http://www.cfpw.io/

### AgeDB-30 ✅
- **Size**: 12,240 images, 570 subjects, 6,000 pairs
- **Purpose**: Age-invariant face verification
- **Format**: Images at root level + `agedb_30_pair.txt`
- **Status**: Downloaded and extracted
- **Website**: https://ibug.doc.ic.ac.uk/resources/agedb/

### CALFW (Cross-Age LFW) ✅
- **Size**: 13,233 images, 5,749 subjects, 6,000 pairs
- **Purpose**: Cross-age face verification
- **Format**: Images at root level + `calfw_pair.txt`
- **Status**: Downloaded and extracted
- **Website**: http://www.calfw.org/

### CASIA-WebFace (Training Dataset) ✅
- **Size**: ~500K images, 10K subjects
- **Purpose**: Training dataset for face recognition models
- **Format**: Directory structure with subject IDs as folders
- **Status**: Downloaded and extracted
- **Website**: http://www.cbsr.ia.ac.cn/english/casia-webface.html

## Dataset Structure

All validation datasets follow a consistent structure:
```
datasets/
├── lfw/
│   ├── [person_name]/
│   │   ├── [person_name]_0001.jpg
│   │   └── ...
│   └── pairs.txt
├── cfp-fp/
│   ├── 00001.jpg
│   ├── 00002.jpg
│   └── cfp_ff_pair.txt
├── agedb-30/
│   ├── 00001.jpg
│   ├── 00002.jpg
│   └── agedb_30_pair.txt
├── calfw/
│   ├── 00001.jpg
│   ├── 00002.jpg
│   └── calfw_pair.txt
└── casia-webface/
    ├── 000000/
    │   ├── 000001.jpg
    │   └── ...
    └── ...
```

## Notes

- Datasets are not included in the git repository (gitignored)
- All datasets are pre-processed to 96x96 resolution
- Pair files are already formatted for benchmarking
- Total size: ~1.6GB extracted
- Source: [TVConv](https://github.com/JierunChen/TVConv/blob/master/README.MD) - manually downloaded and extracted
