export type SessionAsset = {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  origin: 'imported' | 'generated';
  parentIds: string[];
  createdAt: number;
};
