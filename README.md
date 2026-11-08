# MKPHOTO

Drohnenfotografie-Spiel im Cel-Shading-Look an bekannten Orten der Schweiz. Läuft im Browser auf Desktop und Mobile, gebaut mit [three.js](https://threejs.org/).

**Live:** https://trapanotto.github.io/mkphoto/

## Stand

M0 – Grundgerüst: Vite + TypeScript + three.js, Testszene mit Toon-Shading, FPS-Anzeige für Testgeräte, automatisches Deployment auf GitHub Pages.

## Entwicklung

```bash
npm install
npm run dev      # lokaler Server, auch im WLAN erreichbar (Handy-Test)
npm run build    # Typprüfung + Produktions-Build nach dist/
```

Jeder Push auf `main` wird über GitHub Actions gebaut und auf GitHub Pages veröffentlicht.
