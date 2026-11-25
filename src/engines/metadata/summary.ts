import type { MetadataReport } from './read';

/** What the original file carried that a removal takes out, in the terms a person asks about. */
export type RemovalSummary = { gps: boolean; camera: string | null; date: string | null };

function fieldOf(r: MetadataReport, title: string, names: readonly string[]): string | null {
  const group = r.groups.find((g) => g.title === title);
  return group?.fields.find((f) => names.includes(f.name))?.value ?? null;
}

/** "Canon" + "Canon EOS R5" -> "Canon EOS R5": a model that already starts with the make is not repeated. */
function cameraOf(make: string | null, model: string | null): string | null {
  if (make && model) return model.toLowerCase().startsWith(make.toLowerCase()) ? model : `${make} ${model}`;
  return make ?? model;
}

export function removalSummary(r: MetadataReport): RemovalSummary {
  return {
    gps: r.hasLocation,
    camera: cameraOf(fieldOf(r, 'Camera', ['Make']), fieldOf(r, 'Camera', ['Model'])),
    date: fieldOf(r, 'Date and time', ['DateTimeOriginal', 'CreateDate', 'DateTime']),
  };
}

/** One line per file: "Removed: GPS location yes · Camera TestCam · Date none found". */
export function removalText(s: RemovalSummary): string {
  return `Removed from this file: GPS location ${s.gps ? 'yes' : 'no'} · Camera ${s.camera ?? 'none found'} · Date ${s.date ?? 'none found'}`;
}
