# Entscheidungen mit Begründung

Format: **Entscheidung** — Begründung — Wann zu überdenken.

---

## D-01: Capacitor statt React Native / Flutter / Native
**Was:** Wrappe die bestehende Webseite mit Capacitor in eine native Hülle.
**Warum:** Webseite ist fertig + LIVE. Re-Build wäre 4-8 Wochen Doppelarbeit ohne Mehrwert. Stripe.js läuft bereits, Supabase auch. Capacitor unterstützt iOS+Android aus einer Code-Basis.
**Wann überdenken:** Wenn Apple wegen Guideline 4.2 ablehnt UND einfache Plugin-Verdrahtung nicht reicht. Dann React Native / native Screens.

## D-02: `server.url` (Live-Loading) statt Bundling
**Was:** Die App lädt https://simpletrailer.de via `server.url` in der Capacitor-Config. Lokal liegt nur ein Bootstrapper.
**Warum:** Jeder Webseiten-Bugfix erscheint sofort in der App ohne Store-Re-Review. 1-Mann-Betrieb kann sich keine 7-Tage-Review-Cycles für Bugfixes leisten.
**Wann überdenken:** Bei Apple-Reject wegen "thin wrapper" — eventuell hybride Strategie (Login + Trailer-Liste lokal, Rest via WebView).

## D-03: Bundle-ID `de.simpletrailer.app`
**Was:** Reverse-DNS-Notation der eigenen Domain.
**Warum:** Standard-Konvention. simpletrailer.de gehört dir, also `de.simpletrailer.app` ist deine Identität. Apple/Google brauchen diese eindeutig — einmal vergeben, nie änderbar (sonst neue App).
**Wann überdenken:** Niemals mehr nach erstem Submit.

## D-04: TypeScript für `capacitor.config.ts`
**Was:** Konfig-Datei in TypeScript (`.ts`), nicht JSON.
**Warum:** Standard von Capacitor seit v4. Bietet Autocomplete + Type-Safety. Für dich als Anfänger keine Mehrarbeit, weil ich die Datei schreibe.
**Wann überdenken:** Niemals.

## D-05: Hauptfarbe Orange `#E85D00`, NICHT Blau `#1e40af`
**Was:** App-Icon, Splash und Status-Bar nutzen das Orange der Webseite.
**Warum:** Du hattest Blau gewünscht, aber die Webseite ist konsequent Orange (`--orange: #E85D00`). Eine Blau-App + Orange-Webseite ist ein Branding-Bruch — Nutzer denken "falsche App". Branding-Konsistenz schlägt persönliche Vorliebe.
**Wann überdenken:** Morgen früh — wenn du wirklich Blau willst, ist es 5 Sekunden umgestellt (in `capacitor.config.ts`, in resources/icon-config.json, in index.html). Habe alle Stellen mit `// FARBWAHL` markiert.

## D-06: Capacitor v6 (neueste Version April 2026)
**Was:** Neueste stabile Capacitor-Version.
**Warum:** Beste Plugin-Kompatibilität, Apple-Privacy-Manifest-Support, Android 14 Targets ready.
**Wann überdenken:** Wenn ein Plugin Probleme macht (selten).

## D-07: Mindest-Versionen iOS 15 / Android API 24
**Was:** Wie vom User gewünscht. iOS 15 deckt ~99% der iPhones ab Stand 2026. Android API 24 = Android 7.0 = ~98% Marktanteil.
**Warum:** Genug moderne Features (Web-Crypto, Fetch, Service Worker) bei breiter Geräte-Abdeckung.

## D-08: Eigene `mobile-app/package.json` separat von Haupt-`package.json`
**Was:** mobile-app/ hat eigene npm-Welt mit eigenem `node_modules/`.
**Warum:** Du hast EXPLIZIT verboten, die Haupt-`package.json` anzufassen. Außerdem: Capacitor-Deps gehören nicht in die Webseiten-Backend-Welt (Supabase/Stripe/Resend).

## D-09: Geo/Camera/Push-Plugins werden installiert, aber WebView nutzt zunächst weiter `navigator.geolocation` und `<input type="file">`
**Was:** Plugins sind verfügbar, Bridge ist da, Webseite nutzt sie aber zunächst noch nicht.
**Warum:** Webseite-Code anfassen ist verboten. Aber: Apple guckt im Bundle nach Plugin-Code + Privacy-Strings. Allein das Vorhandensein hilft. Echtes Verdrahten kommt in NEXT-STEPS.
**Wann überdenken:** Sobald Webseiten-Änderungen erlaubt — dann Bridge nutzen.

## D-10: Kein Versuch, Java/Android-SDK selbst zu installieren
**Was:** Wenn `gradle` fehlt, dokumentiere ich das in SETUP-NEEDED.md statt zu installieren.
**Warum:** User-Vorgabe ("Falls etwas fehlt: NICHT selbst installieren"). Außerdem: Android Studio ist 8 GB+, einer der größten Installer überhaupt — Risiko zu hoch ohne Bestätigung.

## D-11: Resources werden als simple SVG → PNG generiert (Platzhalter)
**Was:** Icon und Splash sind generierte Logo-PNGs in Orange mit "ST" Text.
**Warum:** "Platzhalter okay" laut User. Echtes Design braucht Designer.

## D-12: Push-Notifications-Plugin installiert, aber kein FCM-Setup
**Was:** Push-Plugin ist da, aber Firebase-Konfig-Datei `google-services.json` fehlt.
**Warum:** Erfordert Firebase-Account + Konfiguration in Cloud-Console. Nicht über Nacht autonom machbar. Steht in NEXT-STEPS.

## D-13: Stripe Apple Pay / Google Pay nicht in Phase 2
**Was:** Stripe Elements via Web läuft. Apple-Pay nativ über `@stripe/stripe-capacitor` ist NICHT installiert.
**Warum:** Apple Pay benötigt Merchant-ID + Konfiguration in Stripe Dashboard + Xcode-Capability. Geht nicht ohne Mac. Web-Apple-Pay funktioniert in WebView aber, sobald Apple Pay im Dashboard aktiv.

## D-14: Splash-Screen 2 Sekunden, dann auto-hide
**Was:** Splash blendet nach Page-Load aus, max 2s.
**Warum:** UX-Standard. Längeres Splash wirkt langsam.

## D-15: WebView-Setting: User-Agent zeigt SimpleTrailer-App
**Was:** WebView wird mit `userAgent` "SimpleTrailerApp/1.0" suffixed.
**Warum:** So kann die Webseite später erkennen "ich laufe in der App" und z.B. den `Mein Konto`-Link versteckt rendern oder Push-Banner einblenden.

## D-16: Webseite bleibt 1:1 unangetastet — native Plugins sind ZUSÄTZLICH (USER-KLARSTELLUNG)
**Was:** Per User-Klarstellung in der Nacht: Buchung/Login/Bezahlung der Webseite bleiben EXAKT wie sie sind. Alle nativen Features (Push/Kamera/Geo/Badge) werden zusätzlich angeboten, ersetzen aber nichts.
**Warum:** Webseite läuft LIVE mit echten Zahlungen. Risiko bei Änderung > Nutzen jeglicher "Verbesserung".
**Wann überdenken:** NIEMALS in dieser Phase. Wenn Apple ablehnt: Lösung dokumentieren, nicht Webseite umbauen.
**Wie umgesetzt:** `server.url=simpletrailer.de` lädt die Webseite 1:1. Bridge bietet Plugins an, die Webseite IST nicht gezwungen sie zu nutzen. Falls die Webseite später Push-Token an Backend schicken will: optional, in NEXT-STEPS.

## D-17: Branch-Workflow: alles auf `mobile-app-development`
**Was:** Kein Merge nach `main` über Nacht. Du entscheidest morgens.
**Warum:** main ist deine LIVE-Webseite. Auch wenn ich nichts dort geändert habe — kein automatischer Merge ohne Review.
