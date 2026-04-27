# Templates für simpletrailer.de

Diese 3 HTML-Seiten sind **fertig ausgefüllt** mit den echten SimpleTrailer-Daten (GbR, Lion Grone & Samuel Obodoefuna, Waltjenstr. 96 Bremen). Sie müssen auf simpletrailer.de erreichbar sein, BEVOR die App in die Stores eingereicht wird.

| Datei | Soll-URL | Pflicht für |
|---|---|---|
| [datenschutz.html](./datenschutz.html) | `simpletrailer.de/datenschutz` | App Store + Play Store + DSGVO |
| [agb.html](./agb.html) | `simpletrailer.de/agb` | DE-Vertragsrecht (B2C) |
| [impressum.html](./impressum.html) | `simpletrailer.de/impressum` | §5 TMG (jede deutsche Webseite) |

---

## So baust du sie ein (manuell, sobald du Zeit hast)

1. Die 3 HTML-Dateien in das Webseiten-Repo kopieren — z.B. ins Root oder in einen `legal/`-Ordner.
2. Vercel/Netlify deployt sie automatisch beim nächsten Push.
3. Im Footer von `index.html` die toten `href="#"`-Links durch die echten ersetzen:
   ```html
   <a href="/impressum">Impressum</a>
   <a href="/datenschutz">Datenschutz</a>
   <a href="/agb">AGB</a>
   ```

→ Schritt 3 ist eine Webseiten-Änderung. Wenn du willst, mache ich das in einem separaten kleinen Commit (super safe, nur Footer-Links — kein Risiko für Buchungen).

---

## Was du beachten solltest

**Diese Templates sind funktionsfähig**, aber sie sind keine 1:1 anwaltlich abgesegneten Endprodukte. Empfehlungen:

- **AGB:** Ein Anwalt sollte einmal drüber schauen — gerade Haftungs-Klauseln (§8) und Versicherungs-Selbstbeteiligungen sind ein Risiko-Thema. Kosten: einmalig ~150-400 € bei einem Vertragsrechts-Anwalt.
- **Datenschutzerklärung:** Du kannst sie zusätzlich gegen den eRecht24-Generator vergleichen (https://www.e-recht24.de/datenschutz-generator.html, auch kostenlose Variante).
- **Impressum:** ist Standard, aber prüfe nochmal ob die GbR-Vertretung korrekt formuliert ist — manche Anwälte bevorzugen "vertretungsberechtigte Gesellschafter (gemeinschaftlich)". Aktuell formuliert für gemeinschaftliche Vertretung.

Du kannst die App in den Store einreichen ohne diese Anwalts-Prüfung — Apple/Google fragen nur nach EXISTENZ einer Datenschutzerklärung, nicht nach Anwalts-Stempel. Aber vor echtem Live-Geschäft solltest du die AGB nochmal sicher haben.

---

## Was schon eingebaut ist

- **Verspätungsgebühr:** 5,00 €/Std (aus eurem Datenbank-Schema gelesen)
- **Versicherungs-SB:** Basis 500 €, Premium 50 € (aus account.html gelesen)
- **Kleinunternehmer-Status §19 UStG** (default im Impressum — falls ihr USt-IdNr habt, in `impressum.html` umstellen)
- **DSGVO-Auftragsverarbeiter:** Supabase, Stripe, Resend, Vercel, Firebase, Apple, Google
- **Speicherdauern:** Buchungen 10 Jahre (§147 AO), Schadensfotos 6 Monate, Konto bis Löschung
