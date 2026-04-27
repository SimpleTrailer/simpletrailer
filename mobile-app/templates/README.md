# Templates für simpletrailer.de

Diese HTML-Vorlagen brauchst du als URLs auf deiner Webseite, BEVOR du in die App-Stores einreichst:

| Datei | Zweck | Pflicht für |
|---|---|---|
| `datenschutz.html` | Datenschutzerklärung (DSGVO) | App Store + Play Store |
| `agb.html` | Allgemeine Geschäftsbedingungen | DE-Vertragsrecht |
| `impressum.html` | Impressum (§5 TMG) | DE-Recht (jede deutsche Webseite) |

---

## Aktivierung

1. **Deine Daten in die Templates eintragen** (Adresse, Inhaber, USt-ID, etc.)
2. **Anwalt drüber lesen lassen** — gerade die AGB sind ein Haftungsthema. Vorlagen sind nur Startpunkt.
3. **Auf simpletrailer.de hochladen:**
   - `simpletrailer.de/datenschutz` (oder `/datenschutz.html`)
   - `simpletrailer.de/agb`
   - `simpletrailer.de/impressum`
4. **Footer-Links aktualisieren** in `../../index.html:1839-1841` (aktuell `href="#"` Platzhalter):
   ```html
   <a href="/impressum">Impressum</a>
   <a href="/datenschutz">Datenschutz</a>
   <a href="/agb">AGB</a>
   ```

> ⚠️ Schritt 4 ist eine WEBSEITEN-ÄNDERUNG. Nicht autonom durchgeführt — User muss zustimmen / selbst machen.

---

## Wer noch was prüfen sollte

- **Anwalt** für AGB-Klauseln (Haftung, Versicherung, Stornierung)
- **Datenschutzbeauftragter** (oder Online-Generator wie eRecht24, Datenschutz-Konfigurator) für die Datenschutzerklärung
- **Steuerberater** falls USt-Sätze geändert werden müssen (aktuell: keine USt-Angaben in Templates)

---

## Online-Generatoren (als zweite Meinung)

- https://www.e-recht24.de/impressum-generator.html
- https://www.activemind.de/datenschutz/datenschutzerklaerung-generator/
- https://www.datenschutz.org/datenschutzerklaerung/

Aber: blind-kopiert ist nicht so gut wie individuell geprüft.
