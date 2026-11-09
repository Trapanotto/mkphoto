# MKPHOTO

Drohnenfotografie-Spiel im Cel-Shading-Look an bekannten Orten der Schweiz. Läuft im Browser auf Desktop und Mobile, gebaut mit [three.js](https://threejs.org/).

**Live:** https://trapanotto.github.io/mkphoto/

## Stand

- **M0 Grundgerüst:** Vite + TypeScript + three.js, automatisches Deployment auf GitHub Pages
- **M1 Fliegen:** Flugmodell mit Assist- und Pro-Modus, Follow-Kamera, Akku (12 min, Laden auf dem Startplatz), Wind mit Böen, Flugverbot über 120 m und ausserhalb des Gebiets
- **Detail-Durchgang 2:** Bodenbedeckung aus der swisstopo-Basiskarte (Wald, Felder, Gärten, Reben, Obstgärten, Friedhöfe, Sportplätze, Parkplätze, Fels, Gletscher), Flüsse als echte Wasserflächen mit Uferschaum, Seeufer nach Bodenbedeckung; Häuser mit Sockel, Gesimsen, Türen, Fensterbänken, Ziegelreihen, Kaminen und Solaranlagen; Wahrzeichen aus Sandstein mit Lanzettfenstern, Fialen und glasiertem Rautendach (Berner Münster) bzw. Burgmauerwerk (Chillon, Lenzburg); Lauben in der Berner Altstadt; Strassen mit Markierungen, Pflaster, Platten und Kies
- **Regionen Château de Chillon, Landwasserviadukt, Berner Münster, Aarau Kettenbrücke, Schloss Lenzburg:** generischer Import (`tools/regions/<id>.json`) mit Gelände, Strassen, Bahnlinien (Viadukte, Züge), Flüssen (Aare, Landwasser) und Bäumen aus swisstopo, Strassenbrücken über Täler und Flüsse, je drei Aufträge; Wechsel im Menü unter „Region wechseln“ oder mit `?region=<id>`
- **Region Matterhorn:** Riffelsee, Gornergrat und Matterhorn aus swisstopo-Höhendaten (vier Raster von 10 m bis 250 m), Gebäude aus swissBUILDINGS3D, Wanderwege aus swissTLM3D, alpine Farben, Alpendohlen, fünf eigene Aufträge; Region wechseln im Menü oder mit `?region=zermatt`
- **Detail-Durchgang:** Gebäude aus swissBUILDINGS3D (2830 Gebäude mit echten Dachformen, Fenster und Nachtlicht), Strassen, Wege und Brückenplatten aus swissTLM3D mit Gehwegen, 2725 Bäume an echten Standorten, Passanten, Autos und Busse, Schwäne, Enten, Möwen, Dampfschiff und Motorboote, detaillierte Kapellbrücke und Wasserturm, gezeichnetes Wasser mit Uferschaum und Wellenlinien
- **M5 Aufträge & Menü:** Hauptmenü mit Logo (Kameraflug über die Brücke im Hintergrund), Intro, Studio mit Auftragsliste, 6 Aufträge als JSON-Daten (`public/data/luzern/assignments.json`), Honorar in CHF und Ruf mit 5 Stufen, die neue Aufträge freischalten, Spielstand in IndexedDB
- **M4 Foto-Bewertung:** Messpunkte an Kapellbrücke und Wasserturm, Sicht- und Verdeckungstest, Teilnoten für Motiv, Komposition (Drittel, Horizont), Licht (Tageszeit, Gegenlicht), Kundenwunsch und Technik (Wind, Drehung), Bonus für besondere Perspektiven, 0–5 Sterne mit Kundenkommentar; Testauftrag „Postkarte: Kapellbrücke mit Wasserturm“, Motiv-Markierung im Sucher
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
| Zurück zum Start | R | B | Menü → Zurück zum Start |
| Kameramodus | C | LB | runder Kamera-Knopf unten |
| Auslösen (im Kameramodus) | Leertaste | A | runder Auslöser |
| Ausrichten / Zoomen (Kamera) | Maus ziehen, W S / + − oder Mausrad | Rechter Stick / RT LT | Ziehen, zwei Finger, Tasten 1× 2× 3× |
| Raster (Kamera) | F | Y | Taste „Raster“ |
| Hoch-/Querformat (Kamera) | V | RB | Taste „Hoch/Quer“ |
| Album | Tab | View | Menü → Fotoalbum |
| Studio (Aufträge) | M | – | Menü → Studio |
| Menü | Esc | Start | ☰ oben links |
| Hilfe ein/aus | H | – | – |
| Grafikstufe (Auto/Hoch/Mittel/Niedrig) | G | – | Menü → Optionen |
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

Lädt Gelände, Oberflächenmodell, Strassen, Bäume und Fernsicht von geo.admin.ch und schreibt sie nach `public/data/luzern/`.

```bash
node tools/import-buildings3d.mjs
node tools/import-zermatt.mjs
node tools/import-buildings3d.mjs zermatt
```

Weitere Regionen (chillon, landwasser, bern, aarau, lenzburg) laufen über den generischen Import mit der Konfiguration in `tools/regions/<id>.json`:

```bash
node tools/import-region.mjs bern
node tools/import-buildings3d.mjs bern
node tools/import-landcover.mjs bern
```

`import-landcover.mjs` liest die Vektorkacheln der swisstopo-Basiskarte (Bodenbedeckung, Landnutzung, Gewässerflächen) und schreibt pro Region ein Klassenraster (`landcover-*.bin.gz`).

Lädt swissBUILDINGS3D (DXF) und schreibt die Gebäude als komprimierte Dreiecksliste. Daten: © swisstopo.

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht.
