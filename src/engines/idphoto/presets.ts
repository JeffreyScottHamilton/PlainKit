/**
 * Document photo presets. Dimensions and head/eye ranges are the values given in the build brief.
 * They were NOT re-checked against the official source during this build (lastChecked is null).
 * The UI tells the user to confirm at the link before printing.
 */
export type Preset = {
  id: string;
  country: string;
  document: string;
  widthMm: number;
  heightMm: number;
  headHeightMm?: [number, number];
  eyeLineFromBottomMm?: [number, number];
  background: string;
  notes: string[];
  sourceName: string;
  /** https link to the issuing source. Empty only for the custom preset, which has no official source. */
  sourceUrl: string;
  lastChecked: string | null;
};

export const PRESETS: Preset[] = [
  {
    id: 'us-passport', country: 'United States', document: 'Passport and visa (2 × 2 in)',
    widthMm: 51, heightMm: 51, headHeightMm: [25, 35], eyeLineFromBottomMm: [28, 35],
    background: 'White or off-white, plain', notes: ['Head is measured crown to chin.', 'No glasses, hats or head coverings unless for religious or medical reasons.'],
    sourceName: 'U.S. Department of State, travel.state.gov', sourceUrl: 'https://travel.state.gov/', lastChecked: null,
  },
  {
    id: 'uk-passport', country: 'United Kingdom', document: 'Passport (35 × 45 mm)',
    widthMm: 35, heightMm: 45, headHeightMm: [29, 34],
    background: 'Plain light grey or cream', notes: ['Face must be centred and looking at the camera.'],
    sourceName: 'GOV.UK, passport photos', sourceUrl: 'https://www.gov.uk/photos-for-passport', lastChecked: null,
  },
  {
    id: 'schengen-visa', country: 'Schengen area / EU', document: 'Visa and ID (35 × 45 mm)',
    widthMm: 35, heightMm: 45, headHeightMm: [32, 36],
    background: 'Light, plain background', notes: ['Based on the ICAO travel document standard. Each country may add rules.'],
    sourceName: 'European Commission, Home Affairs', sourceUrl: 'https://home-affairs.ec.europa.eu/', lastChecked: null,
  },
  {
    id: 'de-passport', country: 'Germany', document: 'Passport (35 × 45 mm)',
    widthMm: 35, heightMm: 45, headHeightMm: [32, 36],
    background: 'Light, plain background', notes: ['Based on the ICAO travel document standard.'],
    sourceName: 'German federal ID portal', sourceUrl: 'https://www.personalausweisportal.de/', lastChecked: null,
  },
  {
    id: 'ca-passport', country: 'Canada', document: 'Passport (50 × 70 mm)',
    widthMm: 50, heightMm: 70, headHeightMm: [31, 36],
    background: 'White or off-white', notes: ['Head must fill the required height range, face forward.'],
    sourceName: 'Government of Canada, passport photos', sourceUrl: 'https://www.canada.ca/', lastChecked: null,
  },
  {
    id: 'au-passport', country: 'Australia', document: 'Passport (35 × 45 mm)',
    widthMm: 35, heightMm: 45, headHeightMm: [32, 36],
    background: 'Plain white or off-white', notes: ['Photo must be taken within the last six months.'],
    sourceName: 'Australian Passport Office', sourceUrl: 'https://www.passports.gov.au/', lastChecked: null,
  },
  {
    id: 'in-passport', country: 'India', document: 'Passport (2 × 2 in)',
    widthMm: 51, heightMm: 51,
    background: 'White or light background', notes: ['Check the current passport authority rules before printing.'],
    sourceName: 'Passport Seva, Ministry of External Affairs', sourceUrl: 'https://passportindia.gov.in/', lastChecked: null,
  },
  {
    id: 'in-oci', country: 'India', document: 'OCI card (2 × 2 in)',
    widthMm: 51, heightMm: 51,
    background: 'White or light background', notes: ['Check the OCI application rules before printing.'],
    sourceName: 'Overseas Citizenship of India portal', sourceUrl: 'https://ocig.gov.in/', lastChecked: null,
  },
  {
    id: 'cn-visa', country: 'China', document: 'Visa (33 × 48 mm)',
    widthMm: 33, heightMm: 48, headHeightMm: [28, 33],
    background: 'White, plain', notes: ['Face must be fully visible, no glasses unless medical.'],
    sourceName: 'Ministry of Foreign Affairs of the People’s Republic of China', sourceUrl: 'https://www.mfa.gov.cn/', lastChecked: null,
  },
  {
    id: 'jp-passport', country: 'Japan', document: 'Passport (35 × 45 mm)',
    widthMm: 35, heightMm: 45, headHeightMm: [32, 36],
    background: 'Plain white or light', notes: ['Based on the Japanese passport photo rules.'],
    sourceName: 'Ministry of Foreign Affairs of Japan', sourceUrl: 'https://www.mofa.go.jp/', lastChecked: null,
  },
  {
    id: 'custom', country: 'Other', document: 'Custom size',
    widthMm: 35, heightMm: 45,
    background: 'Check your authority’s background rule', notes: ['Enter your own width and height. No official source is linked.'],
    sourceName: 'No official source for a custom size', sourceUrl: '', lastChecked: null,
  },
];

export const presetById = (id: string): Preset | undefined => PRESETS.find((p) => p.id === id);
