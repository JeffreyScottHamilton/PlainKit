import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

export type NetworkMode = 'on-device' | 'peer' | 'network';
export type Maturity = 'planned' | 'experimental' | 'working' | 'verified' | 'unsupported';

export type ToolDef = {
  id: string;
  /** Plain sidebar label. */
  name: string;
  /** Page heading. */
  title: string;
  description: string;
  /** Old reference names and brainstorm labels: hidden search aliases only, never shown as names. */
  aliases: string[];
  keywords: string[];
  /** Internal only (search/filter). Never rendered as accordion navigation. */
  category: 'image' | 'document' | 'media' | 'text' | 'data' | 'device' | 'network';
  /** MIME patterns the tool takes from the session tray, e.g. "image/*". Empty = no file input. */
  accepts: string[];
  produces: string[];
  icon: LucideIcon;
  load: () => Promise<{ default: ComponentType }>;
  capabilities: string[];
  network: NetworkMode;
  /** Shown beside the mode label when part of the tool behaves differently. */
  networkNote?: string;
  /** Extra engine/model bytes fetched on first use (0 = none beyond the tool chunk). */
  assetDownloadBytes: number;
  maturity: Maturity;
  limitations: string[];
};
