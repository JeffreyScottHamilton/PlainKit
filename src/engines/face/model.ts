// The one face-detection model Redact ships (YuNet 2023mar). See docs/models.md for why.
export const FACE_MODEL = {
  id: 'yunet',
  name: 'YuNet',
  url: '/models/yunet/model.onnx',
  /** Exact byte size of the committed file. */
  bytes: 232_589,
  sha256: '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
  licence: 'MIT',
  licenceUrl: '/models/yunet/LICENSE',
  inputName: 'input',
  /** Fixed 1 x 3 x 640 x 640 input (checked with onnxruntime-web: other shapes are rejected). */
  size: 640,
  strides: [8, 16, 32],
  /** Faces scoring below this are dropped. OpenCV's default is 0.6; Redact prefers recall, a person reviews every box. */
  scoreThreshold: 0.5,
  nmsThreshold: 0.3,
  /** Each side of a detected box grows by this fraction of its width/height before it becomes a region. */
  padding: 0.15,
} as const;

/** Largest input accepted: 40 megapixels (same cap as Cutout). */
export const MAX_PIXELS = 40_000_000;
