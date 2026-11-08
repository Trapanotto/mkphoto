# MKPHOTO

Drohnenfotografie-Spiel im Cel-Shading-Look an bekannten Orten der Schweiz. Läuft im Browser auf Desktop und Mobile, gebaut mit [three.js](https://threejs.org/).

**Live:** https://trapanotto.github.io/mkphoto/

## Stand

- **M0 Grundgerüst:** Vite + TypeScript + three.js, automatisches Deployment auf GitHub Pages
- **M1 Fliegen:** Flugmodell mit Assist- und Pro-Modus, Follow-Kamera, Akku (12 min, Laden auf dem Startplatz), Wind mit Böen, Flugverbot über 120 m und ausserhalb des Gebiets
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
| Tageszeit weiter | T | X | Taste „Zeit“ |
| Grafikstufe (Auto/Hoch/Mittel/Niedrig) | G | View | Taste „Grafik“ |
| Zoom | Mausrad | – | – |

## Entwicklung

```bash
npm install
npm run dev      # lokaler Server, auch im WLAN erreichbar (Handy-Test)
npm run build    # Typprüfung + Produktions-Build nach dist/
```

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht.
