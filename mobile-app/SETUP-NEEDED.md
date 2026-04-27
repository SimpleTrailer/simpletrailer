# Tools, die noch installiert werden müssen

Stand: 2026-04-27. Nichts davon habe ich nachts selbst installiert (User-Vorgabe).

---

## 1. Java Development Kit (JDK 17) – PFLICHT für Android-Build

**Warum:** Gradle (das Android-Build-Tool) läuft auf Java. Aktuell:
```
ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
```

**Was installieren:** Eclipse Temurin JDK 17 (Open Source, von der Adoptium-Community).

**Wie:**
1. Auf https://adoptium.net/temurin/releases/?version=17 Windows x64 MSI laden.
2. Installieren — Häkchen "Set JAVA_HOME variable" aktivieren.
3. Neues Terminal öffnen, prüfen:
   ```bash
   java -version          # sollte "17.x" zeigen
   echo %JAVA_HOME%       # sollte z.B. C:\Program Files\Eclipse Adoptium\jdk-17.x.x\
   ```

**Alternative:** Über Chocolatey: `choco install temurin17` (falls Chocolatey installiert).

**Zeitaufwand:** ~5 Minuten.

---

## 2. Android Studio (für SDK + Emulator) – PFLICHT für Android-Build

**Warum:** Liefert das Android SDK (>1 GB an Plattform-Tools) + den Emulator zum Testen ohne echtes Gerät.

**Was installieren:** Android Studio Hedgehog (oder neuer).

**Wie:**
1. Auf https://developer.android.com/studio Windows-Installer laden (~1 GB).
2. Standard-Installation (mit "Android Virtual Device" anhaken).
3. Beim ersten Start: SDK-Komponenten herunterladen (~3-6 GB).
4. Im Setup-Wizard: SDK Platform 34 + Build-Tools installieren.
5. Umgebungsvariable `ANDROID_HOME` setzen, z.B. `C:\Users\Lion\AppData\Local\Android\Sdk`.
6. Path ergänzen um `%ANDROID_HOME%\platform-tools` (für `adb`).

**Test:**
```bash
adb --version          # sollte Android Debug Bridge anzeigen
```

**Zeitaufwand:** ~30-60 Minuten (Download dauert).

**Speicherbedarf:** ~10 GB total (Studio + SDK + Emulator-Image).

---

## 3. Mac mit Xcode (für iOS-Build) – PFLICHT für iOS

**Warum:** Apple verbietet iOS-Builds auf Nicht-Apple-Hardware. Xcode läuft NUR auf macOS.

**Optionen:**
- **Eigener Mac kaufen** (Mac Mini ab ~700 €).
- **Cloud-Mac mieten** (MacInCloud ~25 €/Monat, MacStadium ~80 €/Monat).
- **Freund/Kollege** mit Mac fragen.
- **iOS-Build CI** (Bitrise, Codemagic, Ionic Appflow) – ab ~30 €/Monat, automatisierte Builds.

**Empfehlung für Anfänger:** MacInCloud oder Codemagic. Kein Hardware-Kauf für eine erste Submission.

---

## 4. Apple Developer Program – PFLICHT für App Store

**Was:** 99 USD/Jahr (~95 €).
**Wo:** https://developer.apple.com/programs/enroll/
**Was du brauchst:** Apple-ID, Pass / Personalausweis (Identitätsprüfung), Kreditkarte.
**Dauer der Aufnahme:** 24-48h (Identitätsprüfung).

**Tipp:** Mache das früh — die Identitätsprüfung kann sich ziehen.

---

## 5. Google Play Console – PFLICHT für Play Store

**Was:** 25 USD einmalig (~24 €).
**Wo:** https://play.google.com/console/signup
**Was du brauchst:** Google-Konto, Kreditkarte, ggf. D-U-N-S-Number falls als Firma anmelden.
**Dauer der Aufnahme:** wenige Stunden.

---

## 6. Firebase-Projekt für Push Notifications – Empfohlen, nicht zwingend

**Warum:** Sowohl Android (FCM) als auch iOS (APNs durchgereicht über FCM) brauchen einen Push-Backend-Endpoint.

**Wie:**
1. https://console.firebase.google.com → "Projekt erstellen" → Name "simpletrailer".
2. Android-App hinzufügen mit Package-Name `de.simpletrailer.app` → `google-services.json` herunterladen → ablegen unter `mobile-app/android/app/google-services.json`.
3. iOS-App hinzufügen mit Bundle-ID `de.simpletrailer.app` → `GoogleService-Info.plist` herunterladen → ablegen in `mobile-app/ios/App/App/`.
4. APNs-Auth-Key in Apple Developer-Portal generieren und in Firebase hochladen.
5. Server-Key aus Firebase → in Supabase als Secret speichern (für Backend-Push-Versand).

**Zeitaufwand:** ~1-2 Stunden.

---

## 7. Sharp (optional – für eigene Icon-Generierung)

Bereits implizit vorhanden über `@capacitor/assets`. Wenn du eigene PNGs anstatt SVGs verwendest, läuft das automatisch.

---

## 8. CocoaPods (NUR auf Mac) – PFLICHT auf Mac

```bash
sudo gem install cocoapods
cd mobile-app/ios/App
pod install
```

Capacitor hat das übersprungen, weil der Build-Server auf Windows lief.

---

## Reihenfolge-Empfehlung

1. **Heute:** JDK + Android Studio installieren → erster Android-Build testen.
2. **Diese Woche:** Google Play Console-Konto anlegen.
3. **Nächste Woche:** Firebase-Setup + Push-Notification-Backend.
4. **Wenn Android-App im Store läuft:** Apple Developer Program + Mac organisieren.
5. **Erst dann:** iOS-Build und App Store Submission.

---

## Wenn etwas nicht funktioniert

Häufige Fehler nach Android-Studio-Install:
- **`gradlew assembleDebug` failed with "Could not find tools.jar":** JDK ist installiert, aber `JAVA_HOME` zeigt auf JRE statt JDK. Korrekt setzen.
- **Build dauert ewig:** Erster Build lädt mehrere hundert MB Gradle-Dependencies. Geduld haben.
- **"SDK location not found":** `ANDROID_HOME` setzen ODER `mobile-app/android/local.properties` anlegen mit `sdk.dir=C:\\Users\\Lion\\AppData\\Local\\Android\\Sdk`.
- **Emulator startet nicht:** Hardware-Beschleunigung (HAXM/Hyper-V) im BIOS aktivieren.
