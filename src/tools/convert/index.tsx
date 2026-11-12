import { useKindTabs, isImage, isMedia, isMesh, isPdf, type Kind } from '@/components/KindTabs';
import { MediaPanel } from '@/components/media/MediaPanel';
import { ImageConvert } from './ImageConvert';
import { DocConvert } from './DocConvert';
import { MeshConvert } from './MeshConvert';

type K = 'image' | 'media' | 'document' | 'mesh';
const KINDS: Kind<K>[] = [
  { id: 'image', label: 'Images', match: isImage },
  { id: 'media', label: 'Audio & video', match: isMedia },
  { id: 'document', label: 'Documents', match: isPdf },
  { id: 'mesh', label: '3D models', match: isMesh },
];

export default function Convert() {
  const { kind, tabs } = useKindTabs('convert', KINDS);
  if (kind === 'media') return <MediaPanel toolId="convert" mode="convert" tabs={tabs} />;
  if (kind === 'document') return <DocConvert tabs={tabs} />;
  if (kind === 'mesh') return <MeshConvert tabs={tabs} />;
  return <ImageConvert tabs={tabs} />;
}
