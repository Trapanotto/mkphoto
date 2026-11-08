/** Photo jobs. M4 has one test job; the full job system follows in M5. */
export interface Assignment {
  id: string;
  client: string;
  contact: string;
  title: string;
  brief: string;
  /** Landmarks that must be in the picture. */
  subjects: string[];
  orientation?: 'landscape' | 'portrait';
  /** Share of the frame the subject should fill. */
  size?: { min: number; max: number };
  /** Compass direction the camera should face, in degrees (0 = north), with a label for the checklist. */
  heading?: { from: number; to: number; label: string };
  /** Horizon must be in the picture. */
  horizon?: boolean;
}

export const TEST_ASSIGNMENT: Assignment = {
  id: 'postkarte-kapellbruecke',
  client: 'Postkartenverlag Seeblick',
  contact: 'Frau Amrein',
  title: 'Postkarte: Kapellbrücke mit Wasserturm',
  brief: 'Kapellbrücke und Wasserturm, quer, beide gut sichtbar. Dahinter bitte die Altstadt.',
  subjects: ['kapellbruecke', 'wasserturm'],
  orientation: 'landscape',
  size: { min: 0.12, max: 0.7 },
  heading: { from: -110, to: 20, label: 'Altstadt im Hintergrund (Blick nach Westen bis Norden)' },
  horizon: true,
};
