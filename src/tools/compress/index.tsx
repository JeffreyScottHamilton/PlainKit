import { useKindTabs, isImage, isMedia, isPdf, type Kind } from '@/components/KindTabs';
import { MediaPanel } from '@/components/media/MediaPanel';
import { ImageCompress } from './ImageCompress';
import { PdfCompress } from './PdfCompress';

type K = 'image' | 'media' | 'pdf';
const KINDS: Kind<K>[] = [
  { id: 'image', label: 'Images', match: isImage },
  { id: 'media', label: 'Audio & video', match: isMedia },
  { id: 'pdf', label: 'PDF', match: isPdf },
];

export default function Compress() {
  const { kind, tabs } = useKindTabs('compress', KINDS);
  if (kind === 'media') return <MediaPanel toolId="compress" mode="compress" tabs={tabs} />;
  if (kind === 'pdf') return <PdfCompress tabs={tabs} />;
  return <ImageCompress tabs={tabs} />;
}
