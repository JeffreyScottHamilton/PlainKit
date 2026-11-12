/** Typed worker messages. The decode step stays on the main thread (AudioContext is not in workers). */
export type EncodeRequest = { type: 'encode'; channels: Float32Array[]; sampleRate: number };
export type EncodeResponse = { bytes: Uint8Array };
