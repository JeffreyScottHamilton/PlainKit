import { serve } from '@/workers/rpc';
import { editClip } from '@/engines/audio-edit/dsp';
import { encodeEdit } from '@/engines/audio-edit/encode';
import type { EditRequest, EditResponse } from '@/engines/audio-edit/messages';

// Edits and encodes one selection. Cancel terminates this worker, so nothing here needs to stop cooperatively.
serve<EditRequest, EditResponse>(async (req) => {
  const { channels, warnings } = editClip(req.channels, req.sampleRate, req.options);
  const { bytes, mime } = await encodeEdit(channels, req.sampleRate, req.format);
  return { result: { bytes, mime, warnings }, transfer: [bytes.buffer as ArrayBuffer] };
});
