// Level-Definitionen. Koordinaten WGS84 (Grad). h = Ellipsoidhöhe des lokalen Ursprungs (≈ Gelände + ~50 m Geoid).
// Aufträge: az = [Kompassrichtung vom Motiv zur Kamera, Toleranz], elev = [min, max] Grad über Motiv,
// fill = [min, max] Anteil der halben Bildbreite/-höhe, dist = [min, max] Meter.

export const LEVELS = [
  {
    id: 'luzern',
    name: 'Kapellbrücke',
    place: 'Luzern',
    lat: 47.05165, lon: 8.30755, h: 485,
    sun: { az: 215, el: 34 },
    wind: [2.0, 0.5],
    water: { at: [47.0525, 8.3105], radius: 1600, color: 0x2f5d62 },
    spawn: { lat: 47.05135, lon: 8.31130, agl: 35, heading: 280 },
    landmarks: [
      { id: 'kapellbruecke', name: 'Kapellbrücke & Wasserturm', model: 'models/kapellbruecke.glb', lat: 47.05165, lon: 8.30755, heading: 0 },
    ],
    subjects: [
      { id: 'bruecke', landmark: 'kapellbruecke', node: 'Bruecke' },
      { id: 'turm', landmark: 'kapellbruecke', node: 'Wasserturm' },
      { id: 'ensemble', landmark: 'kapellbruecke' },
    ],
    missions: [
      { id: 'lu1', title: 'Postkarte', desc: 'Brücke und Wasserturm zusammen, von der Seeseite (Osten), tief über dem Wasser.', subject: 'ensemble', az: [100, 45], elev: [2, 22], fill: [0.45, 0.95], coverage: 0.6 },
      { id: 'lu2', title: 'Wasserturm-Porträt', desc: 'Der achteckige Wasserturm bildfüllend. Seite frei wählbar.', subject: 'turm', elev: [-5, 30], fill: [0.5, 0.9], dist: [15, 90], coverage: 0.5 },
      { id: 'lu3', title: 'Zickzack von oben', desc: 'Die ganze Brücke senkrecht von oben (Kamera ganz nach unten).', subject: 'bruecke', elev: [65, 90], fill: [0.5, 0.95], coverage: 0.8 },
    ],
  },
  {
    id: 'aarau',
    name: 'Kettenbrücke',
    place: 'Aarau',
    lat: 47.39534, lon: 8.04209, h: 400,
    sun: { az: 160, el: 40 },
    wind: [1.5, -1.0],
    spawn: { lat: 47.39470, lon: 8.03990, agl: 25, heading: 70 },
    landmarks: [
      { id: 'kettenbruecke', name: 'Kettenbrücke (1851)', model: 'models/kettenbruecke.glb', lat: 47.39534, lon: 8.04209, heading: 0 },
    ],
    subjects: [
      { id: 'bruecke', landmark: 'kettenbruecke' },
      { id: 'portal', landmark: 'kettenbruecke', node: 'PortalSued' },
    ],
    missions: [
      { id: 'aa1', title: 'Seitenansicht', desc: 'Die ganze Brücke von der Seite, von flussabwärts (Südwesten), knapp über der Aare.', subject: 'bruecke', az: [225, 40], elev: [0, 18], fill: [0.5, 0.95], coverage: 0.6 },
      { id: 'aa2', title: 'Durchs Tor', desc: 'Das Südportal frontal, Blick von der Altstadt entlang der Fahrbahn.', subject: 'portal', az: [145, 25], elev: [-5, 20], fill: [0.4, 0.9], dist: [12, 80], coverage: 0.5 },
      { id: 'aa3', title: 'Aare-Panorama', desc: 'Brücke aus der Höhe schräg von oben mit der Altstadt.', subject: 'bruecke', elev: [30, 60], fill: [0.3, 0.7], coverage: 0.6 },
    ],
  },
  {
    id: 'bern',
    name: 'Münster & Bundeshaus',
    place: 'Bern',
    lat: 46.94700, lon: 7.44760, h: 590,
    sun: { az: 200, el: 38 },
    wind: [1.0, 1.5],
    spawn: { lat: 46.94540, lon: 7.44760, agl: 60, heading: 0 },
    noFly: [{ lat: 46.94661, lon: 7.44399, radius: 55, name: 'Bundeshaus' }],
    landmarks: [
      { id: 'muenster', name: 'Berner Münster', model: 'models/muenster.glb', lat: 46.94738, lon: 7.45114, heading: 0 },
      { id: 'bundeshaus', name: 'Bundeshaus', model: 'models/bundeshaus.glb', lat: 46.94661, lon: 7.44399, heading: 0 },
    ],
    subjects: [
      { id: 'muenster', landmark: 'muenster' },
      { id: 'turm', landmark: 'muenster', node: 'Turm' },
      { id: 'bundeshaus', landmark: 'bundeshaus' },
    ],
    missions: [
      { id: 'be1', title: 'Münsterturm', desc: 'Der 100 m hohe Turm, auf Augenhöhe der Turmspitze.', subject: 'turm', elev: [-15, 15], fill: [0.5, 0.95], coverage: 0.5 },
      { id: 'be2', title: 'Bundeshaus von der Aare', desc: 'Südfassade mit Kuppel, vom Aareufer her (Süden). Achtung Flugverbotszone!', subject: 'bundeshaus', az: [180, 35], elev: [0, 25], fill: [0.45, 0.95], coverage: 0.55 },
      { id: 'be3', title: 'Altstadt-Achse', desc: 'Das Münster schräg von oben aus Osten.', subject: 'muenster', az: [80, 40], elev: [25, 55], fill: [0.4, 0.85], coverage: 0.6 },
    ],
  },
  {
    id: 'lenzburg',
    name: 'Schloss Lenzburg',
    place: 'Lenzburg',
    lat: 47.38725, lon: 8.18534, h: 555,
    sun: { az: 230, el: 30 },
    wind: [2.5, 0.8],
    spawn: { lat: 47.38560, lon: 8.18290, agl: 40, heading: 40 },
    landmarks: [
      { id: 'schloss', name: 'Schloss Lenzburg', model: 'models/lenzburg.glb', lat: 47.38725, lon: 8.18534, heading: 0 },
    ],
    subjects: [
      { id: 'schloss', landmark: 'schloss' },
      { id: 'bergfried', landmark: 'schloss', node: 'Bergfried' },
    ],
    missions: [
      { id: 'le1', title: 'Burg auf dem Hügel', desc: 'Das ganze Schloss mit dem Schlosshügel, aus Süden.', subject: 'schloss', az: [190, 40], elev: [-5, 20], fill: [0.35, 0.8], coverage: 0.5 },
      { id: 'le2', title: 'Innenhof', desc: 'Senkrecht von oben in den Schlosshof.', subject: 'schloss', elev: [65, 90], fill: [0.5, 0.95], coverage: 0.7 },
      { id: 'le3', title: 'Bergfried', desc: 'Der Bergfried (Hauptturm) bildfüllend.', subject: 'bergfried', fill: [0.5, 0.9], dist: [15, 80], coverage: 0.45 },
    ],
  },
  {
    id: 'chillon',
    name: 'Château de Chillon',
    place: 'Veytaux',
    lat: 46.41412, lon: 6.92742, h: 425,
    sun: { az: 250, el: 22 },
    wind: [3.0, -1.2],
    water: { at: [46.4128, 6.9240], radius: 9000, color: 0x2c5a6e },
    spawn: { lat: 46.41300, lon: 6.92350, agl: 25, heading: 60 },
    landmarks: [
      { id: 'chillon', name: 'Schloss Chillon', model: 'models/chillon.glb', lat: 46.41412, lon: 6.92742, heading: 0, base: 'water' },
    ],
    subjects: [
      { id: 'chillon', landmark: 'chillon' },
      { id: 'donjon', landmark: 'chillon', node: 'Donjon' },
    ],
    missions: [
      { id: 'ch1', title: 'Vom See aus', desc: 'Das Schloss vom Genfersee her (Westen), knapp über dem Wasser.', subject: 'chillon', az: [260, 40], elev: [0, 12], fill: [0.5, 0.95], coverage: 0.6 },
      { id: 'ch2', title: 'Gegenlicht am Abend', desc: 'Schloss als Silhouette vor der Abendsonne (Gegenlicht erwünscht).', subject: 'chillon', elev: [0, 20], fill: [0.4, 0.9], coverage: 0.5, backlight: true },
      { id: 'ch3', title: 'Donjon', desc: 'Der mittlere Hauptturm bildfüllend, schräg von oben.', subject: 'donjon', elev: [15, 50], fill: [0.45, 0.9], dist: [15, 90], coverage: 0.45 },
    ],
  },
  {
    id: 'matterhorn',
    name: 'Matterhorn',
    place: 'Zermatt',
    lat: 45.98219, lon: 7.67702, h: 3310,
    sun: { az: 120, el: 30 },
    wind: [6.0, 2.0],
    spawn: { lat: 45.98330, lon: 7.67900, agl: 30, heading: 240 },
    landmarks: [
      { id: 'hoernli', name: 'Hörnlihütte', model: 'models/hoernlihuette.glb', lat: 45.98219, lon: 7.67702, heading: 0 },
    ],
    // Gipfel als Kegel-Stichproben (kein Modell nötig: echtes swissALTI3D-Gelände)
    peaks: [{ id: 'gipfel', lat: 45.97641, lon: 7.65861, height: 900, radius: 700 }],
    subjects: [
      { id: 'gipfel', peak: 'gipfel' },
      { id: 'huette', landmark: 'hoernli' },
    ],
    missions: [
      { id: 'ma1', title: 'Die Ikone', desc: 'Das Matterhorn mit Ost- und Nordwand, aus Nordosten (Richtung Zermatt).', subject: 'gipfel', az: [45, 30], elev: [-30, 15], fill: [0.4, 0.95], coverage: 0.6 },
      { id: 'ma2', title: 'Hörnlihütte', desc: 'Die Hütte im Vordergrund, Gipfel dahinter.', subject: 'huette', az: [60, 40], fill: [0.2, 0.6], coverage: 0.4 },
      { id: 'ma3', title: 'Gipfel nah', desc: 'Gipfelpartie nah und auf Augenhöhe (max. 120 m über Grund!).', subject: 'gipfel', elev: [-10, 10], fill: [0.6, 1.0], dist: [100, 1500], coverage: 0.35 },
    ],
  },
];
