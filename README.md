# MKPHOTO

Drohnenfotografie-Spiel im Cel-Shading-Look an bekannten Orten der Schweiz. Läuft im Browser auf Desktop und Mobile, gebaut mit [three.js](https://threejs.org/).

**Live:** https://trapanotto.github.io/mkphoto/

## Stand

- **M0 Grundgerüst:** Vite + TypeScript + three.js, automatisches Deployment auf GitHub Pages
- **M1 Fliegen:** Flugmodell mit Assist- und Pro-Modus, Follow-Kamera, Akku (12 min, Laden auf dem Startplatz), Wind mit Böen, Flugverbot über 120 m und ausserhalb des Gebiets
- **M3 Erstes Motiv:** echtes Gelände von Luzern aus swisstopo-Daten (swissALTI3D, swissSURFACE3D, VECTOR25, Höhenprofile für Pilatus und Rigi), Kapellbrücke und Wasserturm als Modelle, Kameramodus mit 24–72 mm, Gimbal und Raster, Fotos in 1800×1200 px, Album mit Download und Teilen
- **M2 Look:** Toon-Shading, Konturlinien (Post-Process mit Tiefen- und Normalenkanten, auf schwachen Geräten Inverted Hull), Himmel mit Tageszeit-Paletten (Morgen, Mittag, Abend, Nacht mit Sternen und leuchtenden Fenstern), Nebel, Wolken, Bäume, Häuser; automatische Grafikstufen (Ziel 60 fps Desktop, 30 fps Mobile)

## Steuerung

| | Tastatur | Gamepad | Touch |
| --- | --- | --- | --- |
| Bewegen | W A S D | Linker Stick | Linker Stick |
| Drehen | Q E / ← → | Rechter Stick | Rechter Stick links/rechts |
| Steigen / Sinken | Leertaste / Shift | RT / LT | Rechter Stick hoch/runter |
| Kamera neigen | – | Rechter Stick hoch/runter | – |
| Assist / Pro | P | Y | Taste „Assist/Pro“ |
| Zurück zum Start | R | B | Taste „Start“ |
| Kameramodus | C | LB | Taste „Kamera“ |
| Auslösen (im Kameramodus) | Leertaste | A | runder Auslöser |
| Neigen / Zoomen (Kamera) | W S / + − oder Mausrad | Rechter Stick / RT LT | rechter / linker Daumen |
| Raster (Kamera) | F | Y | Taste „Raster“ |
| Album | Tab | Menü | Taste „Album“ |
| Tageszeit weiter | T | X | Taste „Zeit“ |
| Grafikstufe (Auto/Hoch/Mittel/Niedrig) | G | View | Taste „Grafik“ |
| Zoom | Mausrad | – | – |

## Entwicklung

```bash
npm install
npm run dev      # lokaler Server, auch im WLAN erreichbar (Handy-Test)
npm run build    # Typprüfung + Produktions-Build nach dist/
```

## Geodaten neu importieren

```bash
node tools/import-luzern.mjs
```

Lädt Gelände, Oberflächenmodell, Gebäude und Fernsicht von geo.admin.ch und schreibt sie nach `public/data/luzern/`. Daten: © swisstopo.

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht.
