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
