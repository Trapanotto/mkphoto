# MKPHOTO

First-Person-Drohnenfotografie über der Schweiz. Three.js, echte Geodaten von swisstopo (geo.admin.ch), Wahrzeichen in Blender modelliert.

## Starten

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse öffnen (Desktop oder Handy im selben WLAN).

## Orte und Aufträge

| Ort | Modell | Aufträge |
|---|---|---|
| Luzern | Kapellbrücke + Wasserturm | Postkarte, Wasserturm-Porträt, Zickzack von oben |
| Aarau | Kettenbrücke (1851) | Seitenansicht, Durchs Tor, Aare-Panorama |
| Bern | Münster + Bundeshaus | Münsterturm, Bundeshaus von der Aare (Flugverbotszone!), Altstadt-Achse |
| Lenzburg | Schloss Lenzburg | Burg auf dem Hügel, Innenhof, Bergfried |
| Veytaux | Château de Chillon | Vom See aus, Gegenlicht, Donjon |
| Zermatt | Hörnlihütte (Matterhorn = echtes Gelände) | Die Ikone, Hörnlihütte, Gipfel nah |

## Bewertung (max. 100)

5 Kriterien zu je 20 Punkten: Motiv sichtbar (Verdeckung per Raycast), Bildaufbau (Füllgrad + Drittel-Regel), Perspektive (Richtung/Höhe/Distanz zum Auftrag), Schärfe (Geschwindigkeit, Drehung, Wind, Zoom), Licht (Gegenlicht). Ab 50 / 70 / 85 Punkten gibt es 1 / 2 / 3 Sterne. Rekorde werden lokal im Browser gespeichert.

## Steuerung

- **Desktop:** Klick = Maus fangen. W A S D fliegen, E/Q Höhe, Maus drehen + Kamera neigen, Mausrad Zoom, Leertaste/Klick Foto, Shift Sport, G Raster, Tab Aufträge, L Landen, Esc Pause
- **Touch:** linker Stick Höhe/Drehen, rechter Stick Fliegen (Mode 2), weisser Knopf Foto, ▲▼ Kamera, +/− Zoom
- **Gamepad:** Sticks wie Fernsteuerung, RT/A Foto, LB/RB Kamera

## Geodaten (gestreamt, keine Downloads)

- Gelände: `ch.swisstopo.terrain.3d` (quantized-mesh, swissALTI3D)
- Luftbild: `ch.swisstopo.swissimage` (WMTS, auf Gelände + als Dach-Atlas für Gebäude)
- Gebäude: `ch.swisstopo.swissbuildings3d.3d` (3D Tiles, Draco). An den Wahrzeichen werden sie per Shader ausgeblendet (`Hide_*`-Boxen im Blender-Modell).

Nutzung gemäss Open-Government-Data-Bedingungen von swisstopo, Quellenangabe «© swisstopo» ist im Spiel eingeblendet.

## Blender-Modelle

Alle Modelle entstehen per Python-Script (Geometrie + prozedurale Texturen), Lage und Masse wurden aus SWISSIMAGE und swissBUILDINGS3D ausgemessen.

```bash
npm run models                 # alle Modelle neu bauen
node tools/build-models.mjs muenster
```

- `tools/blender/lib.py` – Texturen (Mauerwerk, Ziegel, Holz, Sandstein, Kupfer, Fassaden), Bauteile, Export (GLB + Draco)
- `tools/blender/models/*.py` – ein Script pro Wahrzeichen
- `tools/blender/blend/*.blend` – gespeicherte Szenen zum Weiterbearbeiten in Blender

Koordinaten im Modell: x = Ost, y = Nord, z = oben, Ursprung = Ankerpunkt aus `src/levels.js`.

## Werkzeuge

- `node tools/shot.mjs <script.js> <out>` – Spiel headless (Edge) öffnen, Script ausführen, Screenshots
- `node tools/previews.mjs` – Vorschaubilder der Levels neu erzeugen (Dev-Server muss laufen)

## Struktur

```
src/main.js     Spielablauf, Szene, HUD, Auswertung
src/geo.js      swisstopo-Streaming, Koordinaten, Gebäude-Shader
src/drone.js    Flugmodell + Gimbal-Kamera
src/input.js    Tastatur/Maus, Touch, Gamepad
src/photo.js    Foto aufnehmen + bewerten
src/levels.js   Orte, Wahrzeichen, Aufträge
src/sound.js    synthetische Klänge
```

## Neu in Version 2

- **Stabilisierung:** GPS-Positionshaltung mit Windausgleich, 3-Achsen-Gimbal (Horizont immer gerade), Flugmodi Cine / Normal / Sport (Tasten 1/2/3 oder C) und Stativ (T), weiche Stick-Kurven, geglättete Maus.
- **Modelle Detailstufe 2:** echte Fenster mit Rahmen, Simsen und Bögen, Masswerk, Fialen mit Krabben, Strebebögen, Sparren, Geranien, Lukarnen; heutige Kettenbrücke (Pont Neuf, Betonbögen).
- **Fototexturen (CC0, Poly Haven):** 22 Materialsets mit Farbe, Relief und Rauheit, 1K für Desktop, 512 für Handys (`node tools/fetch-textures.mjs` + `node tools/compress-textures.mjs`).
- **Umgebung:** Bäume aus swisstopo-Vegetation, Fassaden-Shader mit Putz/Sandstein, Fenstern und Dachziegelstruktur, spiegelndes Wasser, weiche Kontaktschatten (N8AO), Schatten rund um die Drohne, Tageszeit (Morgen / Mittag / Goldene Stunde).
- **Gameplay:** Flugschule, Zielmarke mit Randpfeil und Geister-Rahmen (H), Minikarte, strengere Bewertung (Sterne ab 55 / 75 / 90), Verfolgeransicht mit Bild-im-Bild (V).
- **Technik:** Qualitätsstufen Niedrig / Mittel / Hoch, installierbar als App (PWA, Offline-Cache), Sprachen DE / FR / IT / EN, Bestenliste.

## Online-Bestenliste (optional, Supabase)

Ohne Konfiguration speichert die Bestenliste lokal im Browser. Für eine gemeinsame Online-Liste:

1. Kostenloses Projekt auf supabase.com anlegen.
2. Im SQL-Editor ausführen:

```sql
create table scores (
  id bigint generated always as identity primary key,
  name text not null check (char_length(name) <= 24),
  level text not null,
  mission text not null,
  score int not null check (score between 0 and 100),
  created_at timestamptz default now()
);
alter table scores enable row level security;
create policy "lesen" on scores for select using (true);
create policy "eintragen" on scores for insert with check (true);
```

3. Datei `.env` anlegen (bzw. als GitHub-Secrets im Workflow setzen):

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```
