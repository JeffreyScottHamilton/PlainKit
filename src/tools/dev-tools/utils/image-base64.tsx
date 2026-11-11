import { useEffect, useState } from 'react';
import { Button, Field, Notice } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { Panes, TextIn, TextOut, useUtilState } from '../kit';
import { arrayBufferToBase64, parseDataUri, RASTER_MIMES, toDataUri, WARN_BYTES } from '../logic/image-base64';

type Encoded = { name: string; mime: string; bytes: number; base64: string; uri: string };

export default function Util() {
  const [s, set] = useUtilState('image-base64', { enc: null as Encoded | null, fileError: '', paste: '' });
  // The file lives only in component memory; the object URL is revoked when the file changes or on unmount.
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pasted = s.paste.trim() ? parseDataUri(s.paste) : null;

  const onFile = async (f: File | undefined) => {
    if (!f) {
      setFile(null);
      set({ enc: null, fileError: '' });
      return;
    }
    if (!(RASTER_MIMES as readonly string[]).includes(f.type)) {
      setFile(null);
      set({ enc: null, fileError: `"${f.name}" is not a supported image type. Use PNG, JPEG, WebP, GIF, AVIF, or BMP. SVG is not allowed.` });
      return;
    }
    try {
      const base64 = arrayBufferToBase64(await f.arrayBuffer());
      setFile(f);
      set({ enc: { name: f.name, mime: f.type, bytes: f.size, base64, uri: toDataUri(f.type, base64) }, fileError: '' });
    } catch {
      setFile(null);
      set({ enc: null, fileError: 'Could not read this file. Try another image.' });
    }
  };

  const enc = s.enc;
  return (
    <div className="pk-stack">
      <p className="muted">Encodes an image as a data URI or Base64. The file is read on this device and never uploaded.</p>
      <Field label="Image file" hint="PNG, JPEG, WebP, GIF, AVIF, or BMP. Stays on this device.">
        {(a) => <input {...a} type="file" accept={RASTER_MIMES.join(',')} onChange={(e) => void onFile(e.target.files?.[0])} />}
      </Field>
      {s.fileError && <Notice kind="error">{s.fileError}</Notice>}
      {enc && enc.bytes > WARN_BYTES && (
        <Notice kind="warn">Over 1 MB ({formatBytes(enc.bytes)}). The Base64 text is about a third larger and can be slow to copy.</Notice>
      )}
      {enc && file && (
        <>
          <p className="muted">
            {enc.name} · {enc.mime} · {formatBytes(enc.bytes)} original
          </p>
          <img className="pk-preview" src={preview} alt={`Preview of ${enc.name}`} style={{ maxWidth: '100%', maxHeight: 240 }} />
          <Panes>
            <TextOut label="Data URI" value={enc.uri} rows={4} />
            <TextOut label="Raw Base64" value={enc.base64} rows={4} />
          </Panes>
        </>
      )}
      <div className="pk-row">
        <Button onClick={() => set({ paste: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' })}>Load example</Button>
        <Button onClick={() => set({ paste: '' })}>Clear pasted URI</Button>
      </div>
      <h3>Reverse: data URI to preview</h3>
      <TextIn
        label="Data URI"
        value={s.paste}
        onChange={(v) => set({ paste: v })}
        rows={4}
        placeholder="data:image/png;base64,..."
        error={pasted && !pasted.ok ? pasted.error : undefined}
      />
      {pasted?.ok && (
        <div className="pk-stack">
          <p className="muted">
            {pasted.mime} · about {formatBytes(pasted.bytes)} decoded
          </p>
          <img className="pk-preview" src={`data:${pasted.mime};base64,${pasted.base64}`} alt="Preview of the pasted data URI" style={{ maxWidth: '100%', maxHeight: 240 }} />
        </div>
      )}
    </div>
  );
}
