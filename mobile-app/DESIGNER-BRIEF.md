# Designer-Brief — SimpleTrailer App

> Für: Designer (oder dich selbst in Canva/Figma).
> Zweck: Alle Assets, die für App Store + Play Store benötigt werden.
> Stand: 2026-04-27.

---

## Brand

| Property | Wert |
|---|---|
| Name | SimpleTrailer |
| Wort-Bild | "Simple" weiß, "Trailer" orange |
| Hauptfarbe (Brand Orange) | `#E85D00` (sekundär `#FF6A00` für Hover) |
| Hintergrund Dark | `#0D0D0D` |
| Hintergrund Card | `#1A1A1A` |
| Border | `#383838` |
| Text Primär | `#FFFFFF` |
| Text Sekundär | `#888888` |
| Font | Inter, sonst System-Sans-Serif |
| Stil | Modern, clean, dunkel, vertrauenswürdig, sportlich |
| Vibe | Tier/Lime + Wirtschafts-Seriosität |

> Diese Werte spiegeln die Webseite (`../index.html` CSS-Variables) — die App soll sich identisch anfühlen.

---

## App-Icon (PFLICHT)

### iOS App Store
- **Größe:** 1024 × 1024 px
- **Format:** PNG, kein Alpha, sRGB
- **Ecken:** quadratisch (Apple rundet automatisch zu Squircle)
- **Inhalt:** Nicht zu klein, gut auf grauem und schwarzem Untergrund erkennbar
- **Anti-Pattern:** Keine Wörter im Icon (außer Brand-Mark)

### Google Play Store
- **Größe:** 512 × 512 px
- **Format:** PNG, 32-bit (mit Alpha)
- **Ecken:** quadratisch (Play Store rundet automatisch)

### Adaptive Icons (Android)
- **Foreground:** 432 × 432 px Layer (motiviert)
- **Background:** 432 × 432 px Layer (Farbe oder Pattern)
- **Sicherheits-Zone:** Alles ausserhalb 264 × 264 px (zentriert) kann beschnitten werden — wichtig sein nur was im inneren Drittel ist.

### Aktueller Status
✅ Platzhalter generiert aus `resources/icon-only.svg`
- Trailer-Symbol (Box mit Plane) auf dunklem Hintergrund
- "SimpleTrailer"-Text drunter (Apple sieht das nicht gerne — bitte anpassen)

### Was zu ändern
- Text aus dem Icon entfernen (Apple's Empfehlung).
- Trailer-Mark zentrieren und vergrößern (Sicherheits-Zone der Adaptive Icons beachten).
- Eventuell stilisierter — z.B. nur ein Trailer-Hitch + 2 Räder, sehr reduziert.

### Inspiration
- Tier (Roller-Sharing) — sehr reduziertes Icon mit Markenfarbe
- Lime — abstraktes Symbol, keine Wörter
- Bolt (Mobility) — kreisrundes Icon, klares Symbol

---

## Splash-Screen

### iOS
- **Größe:** 2732 × 2732 px (Universal Splash)
- **Format:** PNG, sRGB
- **Hintergrund:** `#0D0D0D` (dunkelgrau)
- **Inhalt:** Logo zentriert, evtl. einfache Animation in App-Code.
- **Sicherheits-Zone:** Inhalt zentriert in mittleren 1080×1080 px

### Android
- **Größe:** 2732 × 2732 px (wird in viele DPI-Varianten skaliert)
- **Format:** PNG
- **Dark Mode Variante:** auch Pflicht (wir haben aktuell die gleiche)

### Aktueller Status
✅ Generiert aus `resources/splash.svg`
- "SimpleTrailer" Wortmarke + Trailer-Box

---

## Screenshots für Store-Listings

### Apple App Store

| Gerät | Auflösung | Anzahl | Pflicht |
|---|---|---|---|
| iPhone 6.7" (z.B. 15 Pro Max) | 1290 × 2796 | mind. 3, max 10 | JA |
| iPhone 6.1" (z.B. 15) | 1170 × 2532 | mind. 3, max 10 | JA wenn andere fehlen |
| iPhone 5.5" (z.B. 8 Plus) | 1242 × 2208 | mind. 3 | wenn iOS < 14 unterstützt |
| iPad 12.9" | 2048 × 2732 | mind. 3 | nur wenn iPad-Support |

**Workflow:** iOS-Simulator auf Mac → richtiges Device-Profil → URL wechseln (App testen) → Cmd+S für Screenshot → speichert auf Desktop.

### Google Play Store

| Gerät | Auflösung | Anzahl | Pflicht |
|---|---|---|---|
| Phone | 1080 × 1920 oder höher | mind. 2, max 8 | JA |
| Tablet 7" | 1024 × 600 oder höher | mind. 1 | wenn Tablet-Support |
| Tablet 10" | 1280 × 800 oder höher | mind. 1 | wenn Tablet-Support |

**Feature-Grafik (Hero):** 1024 × 500 px PNG/JPG ohne Alpha — wird oben im Listing angezeigt.

### Empfohlene Screenshot-Reihenfolge (5 Stück)

1. **Map mit Anhänger-Standorten** — Hero, zeigt das Konzept
2. **Buchungs-Formular** — zeigt einfache Bedienung
3. **Bezahlseite mit Apple Pay** (iOS) / Google Pay (Android) — zeigt Payment
4. **Buchungs-Bestätigung mit Code** — zeigt das Ergebnis
5. **Onboarding "Berechtigungen"** — zeigt native Features (HILFT BEI APPLE-REVIEW!)

---

## Feature-Grafik (Google Play)

- **Größe:** 1024 × 500 px
- **Format:** PNG/JPG, KEIN Alpha
- **Inhalt:** Hero-Bild, das oben im Play-Store-Listing erscheint
- **Vorschlag:**
  - Links: 2-3 App-Screenshots in Phone-Mockup
  - Rechts: Logo + Tagline "Anhänger mieten in Bremen"
  - Hintergrund: Dunkler Verlauf mit Orange-Akzent

---

## Promo-Video (optional)

### Apple "App Preview"
- **Länge:** 15-30 Sekunden
- **Format:** .mov, .mp4, .m4v (h.264)
- **Auflösung:** wie Screenshots der jeweiligen Geräte-Klasse
- **Wichtig:** ZEIGT die App in Aktion, kein Marketing-Video

### Google "Promo Video"
- YouTube-URL eintragen, kein direkter Upload
- Empfohlen: 30s Bildschirmaufnahme + Voiceover

---

## Vorlagen / Tools

| Was | Empfehlung | Kosten |
|---|---|---|
| Screenshots automatisch generieren | Fastlane (snapshot) | gratis |
| Mockups einfach (Phone-Frames um Screenshots) | mockuphone.com, mockup.photos | gratis |
| Feature-Grafik | Canva (Template "Google Play Feature Graphic") | gratis |
| Icon-Design | Icon Kitchen (icon.kitchen), Adobe Express | gratis |
| Komplettes Design-System | Figma | gratis bis 3 Files |

---

## Was du selbst (User Lion) machen kannst

**In ~2 Stunden ohne Designer:**
1. Eigenes Icon in https://icon.kitchen → Square, Brand-Farbe, Trailer-Symbol → Export für iOS + Android
2. Screenshots im Android Studio Emulator (Pixel 6 Pro, 1080×2400) — Save Screenshot Button
3. iOS-Screenshots im Simulator (iPhone 15 Pro Max) — Cmd+S
4. Feature-Grafik in Canva mit kostenlosem Template

**Wenn Designer ~1 Tag bezahlt:**
- Brandbook (Logo-Varianten, Farben, Typografie) — 3-5h
- Icon-Set finalisiert — 2-3h
- 5-7 polierte Screenshots mit Phone-Mockups + Marketing-Texten — 4-6h

---

## Checkliste vor Submission

### iOS
- [ ] Icon 1024×1024 PNG in `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- [ ] LaunchScreen.storyboard finalisiert (zumindest Logo zentriert)
- [ ] Mind. 3 Screenshots pro Geräte-Größe
- [ ] App Preview Video (optional)
- [ ] Privacy Nutrition Label in App Store Connect
- [ ] Demo-Account angelegt
- [ ] Notes for Reviewer geschrieben (siehe `store-listings/apple-app-store.md`)

### Android
- [ ] Icon 512×512 PNG hochgeladen
- [ ] Feature-Grafik 1024×500 PNG hochgeladen
- [ ] Mind. 2 Screenshots
- [ ] Daten-Sicherheits-Formular ausgefüllt
- [ ] Datenschutz-URL erreichbar (`simpletrailer.de/datenschutz`)
- [ ] Inhalts-Bewertungs-Fragebogen ausgefüllt
- [ ] Test-Track-Build (Closed Testing) gelaufen
