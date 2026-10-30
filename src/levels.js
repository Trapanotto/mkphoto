// Level-Definitionen. Koordinaten WGS84 (Grad). h = Ellipsoidhöhe des lokalen Ursprungs (≈ Gelände + ~50 m Geoid).
// Aufträge: az = [Kompassrichtung vom Motiv zur Kamera, Toleranz], elev = [min, max] Grad über Motiv,
// fill = [min, max] Anteil der halben Bildbreite/-höhe, dist = [min, max] Meter.

// Sonnenstand je Tageszeit (Azimut ab Nord, Höhe in Grad)
export const TIMES = {
  morning: { az: 105, el: 20 },
  noon: { az: 175, el: 52 },
  evening: { az: 258, el: 8 },
};

export const LEVELS = [
  {
    id: 'luzern',
    name: { de: 'Kapellbrücke', fr: 'Pont de la Chapelle', it: 'Ponte della Cappella', en: 'Chapel Bridge' },
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
      { id: 'lu1', title: { de: "Postkarte", fr: "Carte postale", it: "Cartolina", en: "Postcard" }, desc: { de: "Brücke und Wasserturm zusammen, von der Seeseite (Osten), tief über dem Wasser.", fr: "Le pont et la tour d’eau ensemble, depuis le lac (est), au ras de l’eau.", it: "Ponte e torre dell’acqua insieme, dal lago (est), bassi sull’acqua.", en: "Bridge and water tower together, from the lake side (east), low over the water." }, subject: 'ensemble', az: [100, 45], elev: [2, 22], fill: [0.45, 0.95], coverage: 0.6 },
      { id: 'lu2', title: { de: "Wasserturm-Porträt", fr: "Portrait de la tour", it: "Ritratto della torre", en: "Water tower portrait" }, desc: { de: "Der achteckige Wasserturm bildfüllend. Seite frei wählbar.", fr: "La tour octogonale plein cadre. Côté au choix.", it: "La torre ottagonale a tutto schermo. Lato libero.", en: "The octagonal water tower filling the frame. Any side." }, subject: 'turm', elev: [-5, 30], fill: [0.5, 0.9], dist: [15, 90], coverage: 0.5 },
      { id: 'lu3', title: { de: "Zickzack von oben", fr: "Zigzag vu d’en haut", it: "Zigzag dall’alto", en: "Zigzag from above" }, desc: { de: "Die ganze Brücke senkrecht von oben (Kamera ganz nach unten).", fr: "Tout le pont à la verticale (caméra vers le bas).", it: "Tutto il ponte dall’alto (camera tutta in basso).", en: "The whole bridge straight from above (camera fully down)." }, subject: 'bruecke', elev: [65, 90], fill: [0.5, 0.95], coverage: 0.8 },
    ],
  },
  {
    id: 'aarau',
    name: { de: 'Kettenbrücke', fr: 'Pont suspendu', it: 'Ponte a catene', en: 'Chain Bridge' },
    place: 'Aarau',
    lat: 47.39534, lon: 8.04209, h: 400,
    water: { at: [47.39534, 8.04209], radius: 650, color: 0x3d6b6a },
    sun: { az: 160, el: 40 },
    wind: [1.5, -1.0],
    spawn: { lat: 47.39470, lon: 8.03990, agl: 25, heading: 70 },
    landmarks: [
      { id: 'kettenbruecke', name: 'Kettenbrücke', model: 'models/kettenbruecke.glb', lat: 47.39534, lon: 8.04209, heading: 0, base: 'water' },
    ],
    subjects: [
      { id: 'bruecke', landmark: 'kettenbruecke' },
      { id: 'bogen', landmark: 'kettenbruecke', node: 'Bogen2' },
    ],
    missions: [
      { id: 'aa1', title: { de: "Seitenansicht", fr: "Vue de côté", it: "Vista laterale", en: "Side view" }, desc: { de: "Die ganze Brücke von der Seite, von flussabwärts (Südwesten), knapp über der Aare.", fr: "Tout le pont de côté, depuis l’aval (sud-ouest), juste au-dessus de l’Aar.", it: "Tutto il ponte di lato, da valle (sud-ovest), appena sopra l’Aar.", en: "The whole bridge from the side, from downstream (south-west), just above the Aare." }, subject: 'bruecke', az: [225, 40], elev: [0, 18], fill: [0.5, 0.95], coverage: 0.6 },
      { id: 'aa2', title: { de: 'Bogen-Durchblick', fr: 'À travers l’arche', it: 'Attraverso l’arco', en: 'Through the arch' }, desc: { de: 'Der mittlere Bogen bildfüllend, knapp über dem Wasser von der Seite (Südwesten).', fr: 'L’arche centrale plein cadre, au ras de l’eau, de côté (sud-ouest).', it: 'L’arco centrale a tutto schermo, appena sopra l’acqua, di lato (sud-ovest).', en: 'The middle arch filling the frame, just above the water, from the side (south-west).' }, subject: 'bogen', az: [238, 30], elev: [-6, 8], fill: [0.55, 0.9], dist: [20, 80], coverage: 0.5 },
      { id: 'aa3', title: { de: "Aare-Panorama", fr: "Panorama de l’Aar", it: "Panorama dell’Aar", en: "Aare panorama" }, desc: { de: "Brücke aus der Höhe schräg von oben mit der Altstadt.", fr: "Le pont vu de haut en oblique avec la vieille ville.", it: "Il ponte dall’alto in obliquo con la città vecchia.", en: "The bridge from high up at an angle with the old town." }, subject: 'bruecke', elev: [30, 60], fill: [0.3, 0.7], coverage: 0.6 },
    ],
  },
  {
    id: 'bern',
    name: { de: 'Münster & Bundeshaus', fr: 'Collégiale & Palais fédéral', it: 'Collegiata & Palazzo federale', en: 'Minster & Federal Palace' },
    place: 'Bern',
    lat: 46.94700, lon: 7.44760, h: 590,
    sun: { az: 200, el: 38 },
    wind: [1.0, 1.5],
    spawn: { lat: 46.94540, lon: 7.44760, agl: 60, heading: 0 },
    facade: 'sandstone',
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
      { id: 'be1', title: { de: "Münsterturm", fr: "Tour de la collégiale", it: "Torre della collegiata", en: "Minster tower" }, desc: { de: "Der 100 m hohe Turm, auf Augenhöhe der Turmspitze.", fr: "La tour de 100 m, à hauteur de la flèche.", it: "La torre di 100 m, all’altezza della guglia.", en: "The 100 m tower, at eye level with the spire." }, subject: 'turm', elev: [-15, 15], fill: [0.5, 0.95], coverage: 0.5 },
      { id: 'be2', title: { de: "Bundeshaus von der Aare", fr: "Palais fédéral depuis l’Aar", it: "Palazzo federale dall’Aar", en: "Federal Palace from the Aare" }, desc: { de: "Südfassade mit Kuppel, vom Aareufer her (Süden). Achtung Flugverbotszone!", fr: "Façade sud avec coupole, depuis l’Aar (sud). Attention zone interdite !", it: "Facciata sud con cupola, dall’Aar (sud). Attenzione zona vietata!", en: "South façade with dome, from the Aare (south). Mind the no-fly zone!" }, subject: 'bundeshaus', az: [180, 35], elev: [0, 25], fill: [0.45, 0.95], coverage: 0.55 },
      { id: 'be3', title: { de: "Altstadt-Achse", fr: "Axe de la vieille ville", it: "Asse della città vecchia", en: "Old-town axis" }, desc: { de: "Das Münster schräg von oben aus Osten.", fr: "La collégiale en oblique depuis l’est.", it: "La collegiata in obliquo da est.", en: "The minster from above at an angle, from the east." }, subject: 'muenster', az: [80, 40], elev: [25, 55], fill: [0.4, 0.85], coverage: 0.6 },
    ],
  },
  {
    id: 'lenzburg',
    name: { de: 'Schloss Lenzburg', fr: 'Château de Lenzbourg', it: 'Castello di Lenzburg', en: 'Lenzburg Castle' },
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
      { id: 'le1', title: { de: "Burg auf dem Hügel", fr: "Château sur la colline", it: "Castello sulla collina", en: "Castle on the hill" }, desc: { de: "Das ganze Schloss mit dem Schlosshügel, aus Süden.", fr: "Tout le château avec sa colline, depuis le sud.", it: "Tutto il castello con la collina, da sud.", en: "The whole castle with its hill, from the south." }, subject: 'schloss', az: [190, 40], elev: [-5, 20], fill: [0.35, 0.8], coverage: 0.5 },
      { id: 'le2', title: { de: "Innenhof", fr: "Cour intérieure", it: "Cortile interno", en: "Courtyard" }, desc: { de: "Senkrecht von oben in den Schlosshof.", fr: "À la verticale dans la cour du château.", it: "Dall’alto nel cortile del castello.", en: "Straight down into the castle courtyard." }, subject: 'schloss', elev: [65, 90], fill: [0.5, 0.95], coverage: 0.7 },
      { id: 'le3', title: { de: "Bergfried", fr: "Donjon", it: "Mastio", en: "Keep" }, desc: { de: "Der Bergfried (Hauptturm) bildfüllend.", fr: "Le donjon plein cadre.", it: "Il mastio a tutto schermo.", en: "The keep filling the frame." }, subject: 'bergfried', fill: [0.5, 0.9], dist: [15, 80], coverage: 0.45 },
    ],
  },
  {
    id: 'chillon',
    name: { de: 'Schloss Chillon', fr: 'Château de Chillon', it: 'Castello di Chillon', en: 'Chillon Castle' },
    place: 'Veytaux',
    lat: 46.41412, lon: 6.92742, h: 425,
    tod: 'evening',
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
      { id: 'ch1', title: { de: "Vom See aus", fr: "Depuis le lac", it: "Dal lago", en: "From the lake" }, desc: { de: "Das Schloss vom Genfersee her (Westen), knapp über dem Wasser.", fr: "Le château depuis le Léman (ouest), au ras de l’eau.", it: "Il castello dal Lemano (ovest), appena sopra l’acqua.", en: "The castle from Lake Geneva (west), just above the water." }, subject: 'chillon', az: [260, 40], elev: [0, 12], fill: [0.5, 0.95], coverage: 0.6 },
      { id: 'ch2', title: { de: "Gegenlicht", fr: "Contre-jour", it: "Controluce", en: "Backlight" }, desc: { de: "Schloss als Silhouette vor der Sonne (Gegenlicht erwünscht, am besten Goldene Stunde).", fr: "Le château en silhouette face au soleil (contre-jour voulu, idéal à l’heure dorée).", it: "Il castello in silhouette contro il sole (controluce voluto, ideale all’ora d’oro).", en: "The castle as a silhouette against the sun (backlight wanted, best at golden hour)." }, subject: 'chillon', elev: [0, 20], fill: [0.4, 0.9], coverage: 0.5, backlight: true },
      { id: 'ch3', title: { de: "Donjon", fr: "Donjon", it: "Mastio", en: "Keep" }, desc: { de: "Der mittlere Hauptturm bildfüllend, schräg von oben.", fr: "La tour centrale plein cadre, en oblique.", it: "La torre centrale a tutto schermo, dall’alto.", en: "The central keep filling the frame, from above at an angle." }, subject: 'donjon', elev: [15, 50], fill: [0.45, 0.9], dist: [15, 90], coverage: 0.45 },
    ],
  },
  {
    id: 'matterhorn',
    name: { de: 'Matterhorn', fr: 'Cervin', it: 'Cervino', en: 'Matterhorn' },
    place: 'Zermatt',
    lat: 45.98219, lon: 7.67702, h: 3310,
    tod: 'morning',
    sun: { az: 120, el: 30 },
    wind: [6.0, 2.0],
    spawn: { lat: 45.98330, lon: 7.67900, agl: 30, heading: 240 },
    landmarks: [
      { id: 'hoernli', name: 'Hörnlihütte', model: 'models/hoernlihuette.glb', lat: 45.98219, lon: 7.67702, heading: 0 },
    ],
    // Gipfel als Kegel-Stichproben (kein Modell nötig: echtes swissALTI3D-Gelände)
    peaks: [{ id: 'gipfel', lat: 45.97641, lon: 7.65861, height: 900, radius: 700 }, { id: 'spitze', lat: 45.97641, lon: 7.65861, height: 220, radius: 260 }],
    subjects: [
      { id: 'gipfel', peak: 'gipfel' },
      { id: 'spitze', peak: 'spitze' },
      { id: 'huette', landmark: 'hoernli' },
    ],
    missions: [
      { id: 'ma1', title: { de: "Die Ikone", fr: "L’icône", it: "L’icona", en: "The icon" }, desc: { de: "Das Matterhorn mit Ost- und Nordwand, aus Nordosten (Richtung Zermatt).", fr: "Le Cervin avec faces est et nord, depuis le nord-est (Zermatt).", it: "Il Cervino con pareti est e nord, da nord-est (Zermatt).", en: "The Matterhorn with east and north faces, from the north-east (Zermatt)." }, subject: 'gipfel', az: [45, 30], elev: [-30, 15], fill: [0.4, 0.95], coverage: 0.6 },
      { id: 'ma2', title: { de: "Hörnlihütte", fr: "Cabane du Hörnli", it: "Capanna Hörnli", en: "Hörnli hut" }, desc: { de: "Die Hütte im Vordergrund, Gipfel dahinter.", fr: "La cabane au premier plan, le sommet derrière.", it: "La capanna in primo piano, la vetta dietro.", en: "The hut in the foreground, the summit behind." }, subject: 'huette', az: [60, 40], fill: [0.2, 0.6], coverage: 0.4 },
      { id: 'ma3', title: { de: "Gipfel nah", fr: "Sommet de près", it: "Vetta da vicino", en: "Summit close-up" }, desc: { de: "Gipfelpartie nah und auf Augenhöhe (max. 120 m über Grund!).", fr: "Le sommet de près, à hauteur des yeux (max. 120 m au-dessus du sol !).", it: "La vetta da vicino, all’altezza degli occhi (max. 120 m dal suolo!).", en: "The summit close and at eye level (max. 120 m above ground!)." }, subject: 'spitze', elev: [-15, 10], fill: [0.5, 0.9], dist: [150, 900], coverage: 0.5 },
    ],
  },
];
