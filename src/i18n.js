// Mehrsprachigkeit: Deutsch, Französisch, Italienisch, Englisch
export const LANGS = { de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English' };

const D = {
  tagline: ['Drohnenfotografie über der Schweiz', 'Photographie par drone au-dessus de la Suisse', 'Fotografia con drone sopra la Svizzera', 'Drone photography above Switzerland'],
  play: ['Spielen', 'Jouer', 'Gioca', 'Play'],
  controls: ['Steuerung', 'Commandes', 'Comandi', 'Controls'],
  settings: ['Einstellungen', 'Réglages', 'Impostazioni', 'Settings'],
  flightSchool: ['Flugschule', 'École de pilotage', 'Scuola di volo', 'Flight school'],
  leaderboard: ['Bestenliste', 'Classement', 'Classifica', 'Leaderboard'],
  chooseLocation: ['Ort wählen', 'Choisir un lieu', 'Scegli un luogo', 'Choose a location'],
  takeoff: ['Abheben', 'Décoller', 'Decollare', 'Take off'],
  briefInfo: ['Akku: 6 Minuten · Speicherkarte: 24 Fotos · max. 120 m über Grund', 'Batterie : 6 minutes · Carte mémoire : 24 photos · max. 120 m au-dessus du sol', 'Batteria: 6 minuti · Scheda: 24 foto · max. 120 m dal suolo', 'Battery: 6 minutes · Memory card: 24 photos · max. 120 m above ground'],
  timeOfDay: ['Tageszeit', 'Moment de la journée', 'Ora del giorno', 'Time of day'],
  morning: ['Morgen', 'Matin', 'Mattina', 'Morning'],
  noon: ['Mittag', 'Midi', 'Mezzogiorno', 'Noon'],
  evening: ['Goldene Stunde', 'Heure dorée', 'Ora d’oro', 'Golden hour'],
  missionsN: ['{n} Aufträge', '{n} missions', '{n} incarichi', '{n} missions'],
  loadingGeo: ['Lade Geodaten …', 'Chargement des géodonnées …', 'Caricamento geodati …', 'Loading geodata …'],
  placingModels: ['Platziere Modelle …', 'Placement des modèles …', 'Posizionamento modelli …', 'Placing models …'],
  pause: ['Pause', 'Pause', 'Pausa', 'Pause'],
  resume: ['Weiterfliegen', 'Continuer', 'Riprendi', 'Resume'],
  landEval: ['Landen & auswerten', 'Atterrir & évaluer', 'Atterra e valuta', 'Land & review'],
  abort: ['Abbrechen', 'Abandonner', 'Annulla', 'Quit'],
  results: ['Auswertung', 'Évaluation', 'Valutazione', 'Results'],
  allPhotos: ['Alle Fotos', 'Toutes les photos', 'Tutte le foto', 'All photos'],
  again: ['Nochmals fliegen', 'Voler à nouveau', 'Vola di nuovo', 'Fly again'],
  otherPlaces: ['Andere Orte', 'Autres lieux', 'Altri luoghi', 'Other places'],
  download: ['Herunterladen', 'Télécharger', 'Scarica', 'Download'],
  close: ['Schliessen', 'Fermer', 'Chiudi', 'Close'],
  noFly: ['⚠ Flugverbotszone', '⚠ Zone d’interdiction de vol', '⚠ Zona di divieto di volo', '⚠ No-fly zone'],
  lockHint: ['Klicken zum Steuern · Esc = Pause', 'Cliquer pour piloter · Échap = pause', 'Clicca per pilotare · Esc = pausa', 'Click to fly · Esc = pause'],
  noPhoto: ['Kein Foto', 'Pas de photo', 'Nessuna foto', 'No photo'],
  noPhotos: ['Keine Fotos gemacht.', 'Aucune photo prise.', 'Nessuna foto scattata.', 'No photos taken.'],
  newRecord: ['NEUER REKORD', 'NOUVEAU RECORD', 'NUOVO RECORD', 'NEW RECORD'],
  record: ['Rekord', 'Record', 'Record', 'Best'],
  points: ['Punkte', 'points', 'punti', 'points'],
  noSubject: ['Kein Auftrags-Motiv im Bild', 'Aucun sujet de mission dans l’image', 'Nessun soggetto nell’immagine', 'No mission subject in frame'],
  noMission: ['Kein Auftrag erkannt', 'Aucune mission reconnue', 'Nessun incarico riconosciuto', 'No mission recognised'],
  cardFull: ['Speicherkarte voll – landen mit L', 'Carte pleine – atterrir avec L', 'Scheda piena – atterra con L', 'Card full – land with L'],
  batteryLow: ['Akku schwach – bald landen', 'Batterie faible – atterrissez bientôt', 'Batteria scarica – atterra presto', 'Battery low – land soon'],
  batteryEmpty: ['Akku leer – automatische Landung', 'Batterie vide – atterrissage automatique', 'Batteria vuota – atterraggio automatico', 'Battery empty – auto landing'],
  tip_subject: ['Motiv verdeckt oder nicht ganz im Bild', 'Sujet masqué ou coupé', 'Soggetto coperto o tagliato', 'Subject hidden or cut off'],
  tip_framing: ['Motiv grösser/kleiner oder nach Drittel-Regel platzieren (G)', 'Cadrer plus grand/petit ou selon la règle des tiers (G)', 'Inquadra più grande/piccolo o con la regola dei terzi (G)', 'Frame bigger/smaller or use the rule of thirds (G)'],
  tip_angle: ['Andere Richtung oder Höhe wählen (Zielmarke folgen)', 'Changer de direction ou d’altitude (suivre le repère)', 'Cambia direzione o quota (segui il marcatore)', 'Change direction or height (follow the marker)'],
  tip_sharp: ['Verwackelt – vor dem Auslösen stillhalten (Cine-Modus: 1)', 'Flou – restez immobile avant de déclencher (mode Cine : 1)', 'Mosso – resta fermo prima di scattare (modalità Cine: 1)', 'Blurry – hold still before shooting (Cine mode: 1)'],
  tip_light: ['Gegenlicht – Sonne in den Rücken nehmen', 'Contre-jour – mettez le soleil dans votre dos', 'Controluce – metti il sole alle spalle', 'Backlight – keep the sun behind you'],
  c_subject: ['Motiv sichtbar', 'Sujet visible', 'Soggetto visibile', 'Subject visible'],
  c_framing: ['Bildaufbau', 'Composition', 'Composizione', 'Composition'],
  c_angle: ['Perspektive', 'Perspective', 'Prospettiva', 'Perspective'],
  c_sharp: ['Schärfe', 'Netteté', 'Nitidezza', 'Sharpness'],
  c_light: ['Licht', 'Lumière', 'Luce', 'Light'],
  attrib: ['Geodaten © swisstopo · Texturen CC0 Poly Haven', 'Géodonnées © swisstopo · Textures CC0 Poly Haven', 'Geodati © swisstopo · Texture CC0 Poly Haven', 'Geodata © swisstopo · Textures CC0 Poly Haven'],
  mode_tripod: ['Stativ', 'Trépied', 'Treppiede', 'Tripod'],
  mode_cine: ['Cine', 'Ciné', 'Cine', 'Cine'],
  mode_normal: ['Normal', 'Normal', 'Normale', 'Normal'],
  mode_sport: ['Sport', 'Sport', 'Sport', 'Sport'],
  view: ['Ansicht', 'Vue', 'Vista', 'View'],
  mode: ['Modus', 'Mode', 'Modalità', 'Mode'],
  camera: ['Kamera', 'Caméra', 'Camera', 'Camera'],
  stickL: ['Höhe / Drehen', 'Altitude / Rotation', 'Quota / Rotazione', 'Height / Turn'],
  stickR: ['Fliegen', 'Voler', 'Volare', 'Fly'],
  quality: ['Grafikqualität', 'Qualité graphique', 'Qualità grafica', 'Graphics quality'],
  q_low: ['Niedrig', 'Basse', 'Bassa', 'Low'],
  q_medium: ['Mittel', 'Moyenne', 'Media', 'Medium'],
  q_high: ['Hoch', 'Haute', 'Alta', 'High'],
  language: ['Sprache', 'Langue', 'Lingua', 'Language'],
  playerName: ['Pilotenname', 'Nom du pilote', 'Nome del pilota', 'Pilot name'],
  wind: ['Wind', 'Vent', 'Vento', 'Wind'],
  on: ['an', 'activé', 'attivo', 'on'],
  off: ['aus', 'désactivé', 'spento', 'off'],
  missionHelp: ['Auftragshilfe (Zielmarke, H)', 'Aide de mission (repère, H)', 'Aiuto incarico (marcatore, H)', 'Mission help (marker, H)'],
  save: ['Speichern', 'Enregistrer', 'Salva', 'Save'],
  reloadNote: ['Grafikqualität wird beim nächsten Start angewendet.', 'La qualité s’applique au prochain lancement.', 'La qualità si applica al prossimo avvio.', 'Quality applies on next start.'],
  target: ['Ziel', 'Cible', 'Obiettivo', 'Target'],
  onTarget: ['Position passt – Bild ausrichten und auslösen', 'Bonne position – cadrez et déclenchez', 'Posizione giusta – inquadra e scatta', 'Good position – frame and shoot'],
  skip: ['Überspringen', 'Passer', 'Salta', 'Skip'],
  tutDone: ['Flugschule abgeschlossen! Viel Spass beim Fotografieren.', 'École terminée ! Bonnes photos.', 'Scuola completata! Buone foto.', 'Flight school complete! Happy shooting.'],
  tut1: ['Fliege vorwärts: W (Tastatur) oder rechter Stick nach oben.', 'Avancez : W (clavier) ou stick droit vers le haut.', 'Vola avanti: W (tastiera) o stick destro in alto.', 'Fly forward: W (keyboard) or right stick up.'],
  tut2: ['Steige 10 m höher: E oder linker Stick nach oben.', 'Montez de 10 m : E ou stick gauche vers le haut.', 'Sali di 10 m: E o stick sinistro in alto.', 'Climb 10 m: E or left stick up.'],
  tut3: ['Drehe dich: Maus/Pfeiltasten oder linker Stick seitlich.', 'Tournez : souris/flèches ou stick gauche latéral.', 'Ruota: mouse/frecce o stick sinistro di lato.', 'Turn: mouse/arrow keys or left stick sideways.'],
  tut4: ['Neige die Kamera: Maus, R/F oder ▲▼.', 'Inclinez la caméra : souris, R/F ou ▲▼.', 'Inclina la camera: mouse, R/F o ▲▼.', 'Tilt the camera: mouse, R/F or ▲▼.'],
  tut5: ['Wechsle in den ruhigen Cine-Modus: Taste 1 oder «Modus».', 'Passez en mode Ciné : touche 1 ou « Mode ».', 'Passa alla modalità Cine: tasto 1 o «Modalità».', 'Switch to smooth Cine mode: key 1 or “Mode”.'],
  tut6: ['Folge der gelben Zielmarke und mache ein Foto: Leertaste oder weisser Knopf.', 'Suivez le repère jaune et prenez une photo : Espace ou bouton blanc.', 'Segui il marcatore giallo e scatta: Spazio o pulsante bianco.', 'Follow the yellow marker and take a photo: Space or white button.'],
  lbLocal: ['Lokale Bestenliste (auf diesem Gerät)', 'Classement local (sur cet appareil)', 'Classifica locale (su questo dispositivo)', 'Local leaderboard (this device)'],
  lbOnline: ['Online-Bestenliste', 'Classement en ligne', 'Classifica online', 'Online leaderboard'],
  lbEmpty: ['Noch keine Einträge.', 'Aucune entrée.', 'Nessuna voce.', 'No entries yet.'],
  stars: ['Sterne', 'étoiles', 'stelle', 'stars'],
  install: ['Als App installieren', 'Installer l’app', 'Installa come app', 'Install as app'],
  help_kb: ['Tastatur & Maus', 'Clavier & souris', 'Tastiera e mouse', 'Keyboard & mouse'],
  help_score: ['Bewertung', 'Évaluation', 'Valutazione', 'Scoring'],
  help_score_txt: ['Jedes Foto bekommt bis 100 Punkte: Motiv sichtbar, Bildaufbau, Perspektive, Schärfe (stillhalten!) und Licht. Ab 55 / 75 / 90 Punkten gibt es 1 / 2 / 3 Sterne.', 'Chaque photo vaut jusqu’à 100 points : sujet visible, composition, perspective, netteté et lumière. 1 / 2 / 3 étoiles dès 55 / 75 / 90 points.', 'Ogni foto vale fino a 100 punti: soggetto visibile, composizione, prospettiva, nitidezza e luce. 1 / 2 / 3 stelle da 55 / 75 / 90 punti.', 'Each photo scores up to 100 points: subject visible, composition, perspective, sharpness and light. 1 / 2 / 3 stars from 55 / 75 / 90 points.'],
};

const IDX = { de: 0, fr: 1, it: 2, en: 3 };
let lang = 'de';

export function setLang(l) { if (IDX[l] !== undefined) lang = l; document.documentElement.lang = lang; }
export function getLang() { return lang; }
export function detectLang() {
  const n = (navigator.language || 'de').slice(0, 2);
  return IDX[n] !== undefined ? n : 'de';
}

export function t(key, vars) {
  const row = D[key];
  let s = row ? row[IDX[lang]] ?? row[0] : key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// Text aus {de, fr, it, en}-Objekt oder String
export function tx(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  return v[lang] ?? v.de;
}

// Alle Elemente mit data-i18n übersetzen
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
}
