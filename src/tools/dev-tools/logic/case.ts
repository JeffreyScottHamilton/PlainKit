export type CaseStyle = 'camel' | 'pascal' | 'snake' | 'kebab' | 'constant' | 'title' | 'sentence' | 'upper' | 'lower';
export const CASE_STYLES: { value: CaseStyle; label: string }[] = [
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
  { value: 'title', label: 'Title Case' },
  { value: 'sentence', label: 'Sentence case' },
  { value: 'upper', label: 'UPPER' },
  { value: 'lower', label: 'lower' },
];

// Token rules: an uppercase run before Upper+lower splits ("HTTPServer" -> HTTP, Server);
// letters and digits split apart; anything else (space, _, -, punctuation) separates words.
const TOKEN = /\p{Lu}+(?=\p{Lu}[\p{Ll}\p{M}])|\p{Lu}?[\p{Ll}\p{M}]+|\p{Lu}+|\p{N}+|[\p{L}\p{M}]+/gu;

export function splitWords(input: string): string[] {
  return Array.from(input.matchAll(TOKEN), (m) => m[0]);
}

function capitalize(w: string): string {
  const chars = Array.from(w);
  return chars[0] ? chars[0].toUpperCase() + chars.slice(1).join('').toLowerCase() : '';
}

export function convertCase(input: string, style: CaseStyle): string {
  if (style === 'upper') return input.toUpperCase();
  if (style === 'lower') return input.toLowerCase();
  const words = splitWords(input);
  switch (style) {
    case 'camel':
      return words.map((w, i) => (i === 0 ? w.toLowerCase() : capitalize(w))).join('');
    case 'pascal':
      return words.map(capitalize).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'title':
      return words.map(capitalize).join(' ');
    case 'sentence':
      return words.map((w, i) => (i === 0 ? capitalize(w) : w.toLowerCase())).join(' ');
  }
}
