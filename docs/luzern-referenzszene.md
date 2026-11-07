# Referenzszene Luzern

## Bereich und Messung

Erstes Vergleichsgebiet: Kapellbrücke, Wasserturm und die Häuser am
Rathausquai. Geometrie und Positionen werden anhand der vorberechneten
swisstopo-Daten geprüft; Fotos dienen zusätzlich als Ansicht von den Ufern.
Die Datumsstände der Geodaten können von den Fotos abweichen.

Für reproduzierbare Ansichten den Vite-Server starten und ausführen:

```text
MK_URL=http://127.0.0.1:5187/ node tools/luzern-review.mjs high
```

Unter PowerShell wird die Adresse mit `$env:MK_URL = 'http://127.0.0.1:5187/'`
gesetzt. Die drei Bilder und der Messbericht liegen unter `.cache/review/`.
Das Skript misst Frame-Abstände im Headless-Browser; VSync, Testrechner,
Browser und Headless-Betrieb begrenzen die Aussage. Ein Test auf dem
tatsächlichen Desktop und einem Handy ist weiterhin nötig.

## Dokumentierte Quellen

- Das Kulturgueterinventar des Bundes nennt das Rathaus am Kornmarkt 3 und
  LV95 2'665'909 / 1'211'584: [BABS, Kulturgüterschutzinventar Luzern](https://www.babs.admin.ch/dam/en/sd-web/WMvHoEcMACBf/LU.pdf).
- OpenStreetMap enthält getrennte Referenzgrundrisse für das [Rathaus](https://www.openstreetmap.org/way/84983348),
  den [Rathausturm](https://www.openstreetmap.org/way/84983349) und das
  [Zunfthaus zu Pfistern](https://www.openstreetmap.org/way/87220641).
  Die Angaben wurden am 7. November 2026 abgefragt und müssen mit swisstopo
  und Fotos abgeglichen werden. © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), ODbL.
- Das [Luzerner Stadtbildinventar](https://map.stadtluzern.ch/SPL/isos/ISOS_2536.pdf)
  beschreibt die Reussfront als Abfolge verschiedener historischer Häuser.
- [Luzern Tourismus: Rathaus am Kornmarkt](https://www.luzern.com/en/poi/town-hall)
  beschreibt das breite Dach und die offenen Arkaden zur Reuss. Die Seite
  enthält Bilder mit unterschiedlichen Lizenzen; diese einzeln prüfen.
- [W. Bulach, Ansicht von der Kapellbrücke auf das Rathaus](https://commons.wikimedia.org/wiki/File:00_0128_Rathaus_Luzern_-_Luegislandturm_-_Museggmauer.jpg),
  CC BY-SA 4.0, Foto von 2019. Die Bildseite als Referenz verwenden; das Bild
  wird nicht als Spieltextur übernommen.
- [A.Savin, Wikipedia: Altes Rathaus, 2022](https://commons.wikimedia.org/wiki/File:Luzern_asv2022-10_Rathaus_img1.jpg),
  Free Art License. Referenz für Steinmaterial, die zwei unterschiedlichen
  Fensterreihen, Arkaden und Dachgauben; nicht als Textur übernommen.
- [Ymblanter, Rathausquai](https://commons.wikimedia.org/wiki/File:Lucerne_Rathausquai.jpg),
  CC BY-SA 4.0, Foto von 2020; Referenz für die Häuserzeile.
- Die [Zunft zu Pfistern](https://zunft-zu-pfistern.ch/Geschichte-Zunfthaus-Pfistern-Luzern/Fassaden/)
  beschreibt die Bemalung der Reussfassade. Ihre Bilder sind nicht pauschal
  zur Übernahme freigegeben und werden nur als Referenz herangezogen.
- [WES1947, Zunftaus zur Pfistern, 2011](https://commons.wikimedia.org/wiki/File:Zunftaus_zur_Pfistern,_Luzern_IMG_4917.jpg),
  CC BY-SA 3.0. Vorlage für die Fassadenstudie unter `assets/luzern/` und für
  Proportionen des ersten Modellentwurfs. Das Foto wird nicht als Spieltextur verwendet.

## Arbeitsstand

- Der zuvor abgeschnittene untere Teil der Häuser war durch zu grosse,
  achsenparallele Landmarken-Ausblendboxen verursacht. Die Boxen werden jetzt
  aus der tatsächlichen gedrehten Geometrie berechnet; ein Test verwendet das
  echte Kapellbrücken-GLB und eine zuvor betroffene Fassadenposition.
- Die Dächer und Grundkörper der Stadtgebäude stammen weiterhin aus der
  vorberechneten Welt. Fenster und Fassaden sind überwiegend prozedural und
  noch keine individuellen, referenzgetreuen Modelle.
- Ein erster Rathausbau mit Arkaden und Rathausturm ist in
  `tools/blender/models/rathausturm.py` vorhanden. Position und Grundrisse
  orientieren sich an OSM; Dachform, Arkaden und Zifferblatt an den oben
  genannten Referenzen. Masse und Details sind eine Annäherung, keine exakte
  Bauaufnahme. Ein vereinfachtes Modell des benachbarten Zunfthauses ist
  ebenfalls angelegt. Seine historischen Fassadenmalereien und Wappen fehlen
  noch; die generierte Bildstudie ist nicht hinreichend genau für das Spiel.
  Die weitere Häuserzeile benötigt individuelle Bearbeitung.
