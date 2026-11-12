import { serve } from '@/workers/rpc';
import { encodeWav16 } from './wav';
import type { EncodeRequest, EncodeResponse } from './messages';

// WAV encoding only. The channel buffers arrive transferred (the sender made copies); the bytes go back transferred.
serve<EncodeRequest, EncodeResponse>(async (req) => {
  const bytes = encodeWav16(req.channels, req.sampleRate);
  return { result: { bytes }, transfer: [bytes.buffer as ArrayBuffer] };
});
