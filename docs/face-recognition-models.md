# Face Recognition Models - Technical Analysis

## Modelos de Frontera - Detalles Técnicos

### 1. InsightFace/ArcFace (State-of-the-art)
**Técnicas internas:**
- **ArcFace Loss**: Additive Angular Margin Loss - agrega margen angular en el espacio de features
- **Backbone**: IResNet (Improved ResNet) con 50/100/152 capas
- **Face Detection**: RetinaFace (single-stage detector con multi-level features)
- **Face Alignment**: 2D106 landmarks (106 puntos faciales)
- **Embedding**: 512-dimensional feature vector
- **Pipeline completo**: Detection → Alignment → Recognition

**Por qué es bueno:**
- Normaliza features en hypersphere (mejor separabilidad)
- Robusto a variaciones de pose, iluminación, expresión
- Muy rápido en inference (~20ms por imagen en CPU)

**Repo:** https://github.com/deepinsight/insightface
**Package:** `insightface` (Python)

---

### 2. AdaFace (Adaptive Margin)
**Técnicas internas:**
- **Adaptive Margin**: Ajusta el margen según la calidad de la imagen
- **Quality-aware**: Usa image quality assessment para adaptar el loss
- **Backbone**: ResNet con attention mechanisms
- **Face Landmarks**: 68 puntos (estándar Dlib)
- **Embedding**: 512-dimensional

**Por qué es bueno:**
- Mejor para imágenes de baja calidad (blur, baja resolución)
- Adapta el threshold según confianza
- Robusto a variaciones de calidad

**Paper:** AdaFace: Quality Adaptive Margin for Face Recognition (CVPR 2022)

---

### 3. MagFace (Magnitude-aware)
**Técnicas internas:**
- **Magnitude-aware Loss**: Considera magnitud del feature vector
- **Quality Assessment**: Predice calidad de imagen durante inference
- **Backbone**: ResNet + SE blocks (Squeeze-and-Excitation)
- **Face Detection**: SCRFD (Sample and Computation Redistribution)
- **Embedding**: 512-dimensional con quality score

**Por qué es bueno:**
- Considera calidad de imagen en el matching
- Mejor para datasets con ruido
- Uncertainty estimation

**Paper:** MagFace: A Universal Representation for Face Recognition (CVPR 2021)

---

### 4. Partial FC (Escalabilidad)
**Técnicas internas:**
- **Partial Softmax**: Solo calcula subset de clases (no todas)
- **Sample Distribution**: Muestreo inteligente de negatives
- **Backbone**: IResNet-100
- **Face Landmarks**: 106 puntos
- **Training**: Permite entrenar con 10M+ identidades

**Por qué es bueno:**
- Escala a millones de identidades
- Eficiente en memoria
- State-of-the-art en MegaFace

**Paper:** Partial FC: Training 10 Million Identities on a Single Machine (CVPR 2022)

---

### 5. MediaPipe Face (Google, ultra-liviano)
**Técnicas internas:**
- **BlazeFace**: Detector optimizado para mobile
- **Face Mesh**: 468 landmarks 3D
- **Iris Tracking**: Seguimiento de iris en tiempo real
- **Embedding**: 128-dimensional (compacto)
- **Pipeline**: Single-shot detection + landmark regression

**Por qué es bueno:**
- Ultra rápido (~5ms en CPU)
- 468 landmarks (el más detallado)
- Funciona en mobile/edge devices
- Bajo consumo de recursos

**Package:** `mediapipe` (Python)

---

### 6. FaceNet (Google, clásico)
**Técnicas internas:**
- **Triplet Loss**: Anchor-positive-negative triplets
- **Inception ResNet**: Arquitectura Inception con skip connections
- **L2 Normalization**: Features normalizados
- **Embedding**: 128/256-dimensional
- **Face Alignment**: MTCNN (Multi-task Cascaded CNN)

**Por qué es bueno:**
- Bien documentado, mucho material educativo
- Buen baseline para comparación
- Estable y confiable

**Package:** `facenet-pytorch` (Python)

---

### 7. dlib (Clásico, HOG-based)
**Técnicas internas:**
- **HOG + Linear SVM**: Histogram of Oriented Gradients
- **Shape Predictor**: 68 landmarks via regression trees
- **ResNet**: Para embedding (más moderno)
- **Face Detection**: HOG-based (no deep learning)
- **Embedding**: 128-dimensional

**Por qué es bueno:**
- Muy ligero (~25MB)
- No requiere GPU
- Bueno para dispositivos limitados
- 68 landmarks robustos

**Package:** `dlib` (Python/C++)

---

### 8. OpenFace (Carnegie Mellon)
**Técnicas internas:**
- **Triplet Loss**: Similar a FaceNet
- **NN4**: Neural network architecture
- **Face Alignment**: dlib 68 landmarks
- **Pose Estimation**: Head pose estimation
- **Embedding**: 128-dimensional

**Por qué es bueno:**
- Bien documentado
- Incluye pose estimation
- Bueno para research

---

### 9. CosFace (Large Margin)
**Técnicas internas:**
- **CosFace Loss**: Large Margin Cosine Loss
- **SphereFace**: Normalización en hypersphere
- **Backbone**: ResNet-64
- **Embedding**: 512-dimensional

**Por qué es bueno:**
- Simple pero efectivo
- Buen balance accuracy/speed
- Fácil de implementar

**Paper:** CosFace: Large Margin Cosine Loss for Deep Face Recognition (CVPR 2018)

---

### 10. Sub-Center ArcFace (Ruido)
**Técnicas internas:**
- **Sub-center Learning**: Múltiples centros por identidad
- **Noisy Web Faces**: Robusto a labels incorrectos
- **Progressive Learning**: Entrena con data ruidosa
- **Backbone**: IResNet-100

**Por qué es bueno:**
- Robusto a datos ruidosos
- Bueno para datasets reales (no perfectos)
- Tolerante a variaciones intra-clase

**Paper:** Sub-center ArcFace: Boosting Face Recognition by Large-scale Noisy Web Faces (ECCV 2020)

---

## Datasets para Benchmark

### Estándar académico:
1. **LFW** (Labeled Faces in the Wild) - 13,000 imágenes, 5,749 personas
2. **CFP-FP** (Celebrities in Frontal-Profile) - 500 sujetos, frontal vs perfil
3. **AgeDB-30** - Envejecimiento, mismo sujeto diferentes edades
4. **CALFW** - Variaciones de iluminación
5. **CPLFW** - Variaciones de pose

### Para tu caso (DoorCloud):
- **CASIA-WebFace** - 500K imágenes, diverso
- **VGGFace2** - 3.3M imágenes, muy diverso
- **MS-Celeb-1M** - 10M imágenes (muy grande)

---

## Métricas de Evaluación

### Accuracy:
- **TAR@FAR=0.001**: True Accept Rate @ False Accept Rate = 0.001
- **AUC**: Area Under ROC Curve
- **EER**: Equal Error Rate (donde FAR = FRR)
- **Rank-1 Accuracy**: % de identificaciones correctas en primer lugar

### Performance:
- **Latencia**: ms por imagen
- **Throughput**: imágenes/segundo
- **Uso de memoria**: MB en RAM
- **Tiempo de carga**: tiempo para cargar modelo

### Recursos:
- **CPU usage**: % durante inference
- **RAM usage**: MB totales
- **Model size**: MB del modelo

---

## Hardware Requirements

### Para correr 8 modelos:
- **RAM**: 8-16GB (cada modelo ~300-500MB en memoria)
- **CPU**: 4+ cores (para paralelizar)
- **Storage**: ~5GB (modelos + datasets)
- **GPU**: opcional pero recomendado (10x más rápido)

### En Raspberry Pi:
- Podés correr 2-3 modelos simultáneamente
- Benchmark en CPU será lento pero factible
- Para producción, considerar GPU o server dedicado

---

## Comparación de Técnicas

| Modelo | Técnica Principal | Landmarks | Embedding | Velocidad CPU | Mejor Para |
|--------|------------------|-----------|-----------|---------------|------------|
| InsightFace | ArcFace Loss | 106 | 512D | ~20ms | General purpose |
| AdaFace | Adaptive Margin | 68 | 512D | ~25ms | Baja calidad |
| MagFace | Magnitude-aware | 68 | 512D | ~30ms | Ruido |
| MediaPipe | BlazeFace | 468 | 128D | ~5ms | Mobile/Edge |
| FaceNet | Triplet Loss | 68 | 128D | ~40ms | Baseline |
| dlib | HOG + SVM | 68 | 128D | ~50ms | Dispositivos limitados |
| OpenFace | Triplet Loss | 68 | 128D | ~45ms | Research |
| CosFace | Large Margin | 68 | 512D | ~25ms | Balance |
| Sub-Center ArcFace | Sub-centers | 106 | 512D | ~20ms | Datos ruidosos |
| Partial FC | Partial Softmax | 106 | 512D | ~20ms | Escalabilidad |

---

## Recomendaciones para DoorCloud

### Top 5 modelos a benchmarkear:
1. **InsightFace** - State-of-the-art, tu baseline principal
2. **MediaPipe** - Ultra rápido, ideal para Raspberry Pi
3. **AdaFace** - Robusto a baja calidad (fotos de seguridad)
4. **dlib** - Ligero, buen fallback
5. **MagFace** - Considera calidad de imagen

### Datasets recomendados:
1. **LFW** - Benchmark estándar
2. **CFP-FP** - Prueba robustez a pose
3. **AgeDB-30** - Prueba envejecimiento
4. **CASIA-WebFace** - Dataset diverso para testing real

### Métricas clave:
- TAR@FAR=0.001 (accuracy en seguridad)
- Latencia (tiempo real)
- Uso de memoria (Raspberry Pi constraints)
- EER (balance FAR/FRR)

---

## Notas de Implementación

### Integración con Node.js:
- **Opción 1**: ONNX Runtime para Node.js (sin Python)
- **Opción 2**: gRPC service en Python
- **Opción 3**: HTTP API en Python (FastAPI)
- **Opción 4**: Python como child process

### Recomendación:
Usar **ONNX Runtime para Node.js** si es posible, así mantenés todo en Node.js. Si no, **gRPC** es más eficiente que HTTP para comunicación inter-process.

---

## Referencias

- InsightFace: https://github.com/deepinsight/insightface
- ArcFace Paper: https://arxiv.org/abs/1801.07698
- AdaFace Paper: https://arxiv.org/abs/2204.00964
- MagFace Paper: https://arxiv.org/abs/2003.13980
- MediaPipe: https://google.github.io/mediapipe/
- FaceNet Paper: https://arxiv.org/abs/1503.03832
- dlib: http://dlib.net/
- ONNX Runtime: https://onnxruntime.ai/
