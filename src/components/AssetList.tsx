import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, File as FileIcon, X } from 'lucide-react';
import type { SessionAsset } from '@/session/types';
import { assetUrl, removeAsset, sendTo } from '@/session/store';
import { toolsFor } from '@/registry';
import { formatBytes } from '@/lib/format';
import { Button } from './ui';

export function downloadAsset(asset: SessionAsset) {
  const a = document.createElement('a');
  a.href = assetUrl(asset);
  a.download = asset.name;
  document.body.append(a);
  a.click();
  a.remove();
}

/** "Use in…" menu listing only tools that genuinely accept this file. */
export function UseInMenu({ asset, exclude, down }: { asset: SessionAsset; exclude?: string; down?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();
  const tools = toolsFor(asset.mime).filter((t) => t.id !== exclude);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  if (!tools.length) return null;
  return (
    <div className="pk-menu" ref={ref}>
      <Button size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Use in… <span className="sr-only">{asset.name}</span>
      </Button>
      {open && (
        <ul className={`pk-menu__list${down ? ' pk-menu__list--down' : ''}`} role="menu">
          {tools.map((t) => (
            <li key={t.id} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  sendTo(t.id, [asset.id]);
                  setOpen(false);
                  nav(`/tools/${t.id}`);
                }}
              >
                <t.icon aria-hidden /> {t.name} <ArrowRight aria-hidden style={{ marginLeft: 'auto' }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssetThumb({ asset }: { asset: SessionAsset }) {
  return <span className="pk-asset__thumb">{asset.mime.startsWith('image/') ? <img src={assetUrl(asset)} alt="" /> : <FileIcon aria-hidden size={18} />}</span>;
}

type RowProps = { asset: SessionAsset; detail?: ReactNode; exclude?: string; onRemove?: (a: SessionAsset) => void; extra?: ReactNode; menuDown?: boolean };
/** One file: preview, name/type/size, Download, Use in…, Remove. */
export function AssetRow({ asset, detail, exclude, onRemove, extra, menuDown }: RowProps) {
  return (
    <li className="pk-asset">
      <AssetThumb asset={asset} />
      <div className="pk-asset__meta">
        <div className="pk-asset__name" title={asset.name}>
          {asset.name}
        </div>
        <div className="mono muted">
          {asset.mime} · {formatBytes(asset.size)}
          {detail ? <> · {detail}</> : null}
        </div>
      </div>
      <div className="pk-asset__actions">
        {extra}
        <Button size="sm" onClick={() => downloadAsset(asset)}>
          <Download aria-hidden /> Download <span className="sr-only">{asset.name}</span>
        </Button>
        <UseInMenu asset={asset} exclude={exclude} down={menuDown} />
        <Button size="sm" variant="ghost" aria-label={`Remove ${asset.name}`} onClick={() => (onRemove ? onRemove(asset) : removeAsset(asset.id))}>
          <X aria-hidden />
        </Button>
      </div>
    </li>
  );
}

export function AssetList({ assets, exclude, menuDown }: { assets: SessionAsset[]; exclude?: string; menuDown?: boolean }) {
  return (
    <ul className="pk-assets">
      {assets.map((a) => (
        <AssetRow key={a.id} asset={a} exclude={exclude} menuDown={menuDown} />
      ))}
    </ul>
  );
}
