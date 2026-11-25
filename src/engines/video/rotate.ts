// Pure helpers for the Rotate option. No mediabunny import here so they stay unit-testable.

/** Clockwise turn applied on top of the source's own rotation. */
export type Turn = 0 | 90 | 180 | 270;
export type TurnChoice = '0' | '90' | '180' | '270';

export const TURN_OPTIONS: { value: TurnChoice; label: string }[] = [
  { value: '0', label: 'None' },
  { value: '90', label: '90° clockwise' },
  { value: '180', label: '180°' },
  { value: '270', label: '90° counter-clockwise' },
];

export function turnOf(choice: TurnChoice): Turn {
  return Number(choice) as Turn;
}

/** The rotation the output track should report: the source's rotation plus the requested clockwise turn, modulo 360. */
export function expectedRotation(sourceDeg: number, turn: Turn): number {
  return (((sourceDeg + turn) % 360) + 360) % 360;
}

/** Output file suffix. A rotated file names its turn so it is never confused with the plain trim. */
export function rotatedSuffix(base: string, turn: Turn): string {
  return turn === 0 ? base : `${base}-rotated-${turn}`;
}
