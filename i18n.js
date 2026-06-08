/**
 * SimpleTrailer i18n — Sprach-Switch DE/EN
 *
 * Architektur:
 *  - Translations als Inline-Objekt (TRANSLATIONS.de / .en).
 *  - HTML-Texte werden ueber `data-i18n="key"` Attribute uebersetzt.
 *  - Attribute (placeholder, title, alt) ueber `data-i18n-attr="placeholder:key;title:key2"`.
 *  - JavaScript-Strings via globaler `t(key, fallback)` Funktion.
 *  - Sprach-Switch wird automatisch in jede <nav> eingefuegt (DOMContentLoaded).
 *  - Auswahl wird in localStorage gespeichert. Beim ersten Besuch:
 *    Browser-Sprache erkennen (en wenn navigator.language mit "en" startet).
 *
 * AGB / Datenschutz / Impressum / E-Mails / PDFs bleiben Deutsch
 * (rechtlich verbindlich + Aufwand-Reduktion).
 */
(function () {
  'use strict';

  // ============================================================
  //  TRANSLATIONS  (nach Bereichen sortiert)
  // ============================================================
  const TRANSLATIONS = {
    de: {
      // Sprach-Switch
      'lang.switch.title': 'Sprache wechseln',

      // Nav (global, auf jeder Seite)
      'nav.trailers': 'Anhänger',
      'nav.prices': 'Preise',
      'nav.faq': 'FAQ',
      'nav.account': 'Mein Konto',
      'nav.guide': 'Anleitung',
      'nav.book': 'Jetzt buchen',
      'nav.back': '← Zurück',

      // Hero (index)
      'hero.tag': 'Anhängervermietung Bremen',
      'hero.title.1': 'Anhänger mieten.',
      'hero.title.2': 'Einfach.',
      'hero.title.3': 'Sofort.',
      'hero.sub.1': 'Einfach online buchen.',
      'hero.sub.extra': 'Kein Papierkram, keine Kaution, keine Wartezeit.',
      'hero.sub.cta': 'Fahr einfach los.',
      'hero.badge.sofort': 'Sofort',
      'hero.badge.sofort.suffix': 'verfügbar',
      'hero.badge.naehe': 'In deiner Nähe',
      'hero.badge.naehe.suffix': 'abholen',
      'hero.badge.ohne': 'Ohne',
      'hero.badge.ohne.suffix': 'Kaution',

      // Map / Search
      'map.placeholder': 'Ort oder Adresse eingeben…',
      'map.search': 'Suchen',
      'map.my_location': 'Mein Standort',
      'map.click_to_zoom': 'Klicken zum Zoomen aktivieren',
      'map.all': 'Alle',
      'map.tarp_trailers': 'Planenanhänger',
      'map.available_in_bremen': 'verfügbar in Bremen',
      'map.label.from': 'Von',
      'map.label.to': 'Bis',

      // Booking-Datum
      'booking.find_trailer': 'Anhänger finden →',
      'booking.when_label': 'Wann brauchst du einen Anhänger?',
      'booking.step1': 'Zeitraum',
      'booking.step2': 'Optionen',
      'booking.step3': 'Konto',
      'booking.step4': 'Führerschein',
      'booking.step5': 'Zahlung',

      // Trust-Badges (unter Hero)
      'trust.fully_online': '100 % online buchbar',
      'trust.contactless': 'Kontaktlose Abholung',
      'trust.local': 'Lokal in Bremen',
      'trust.no_deposit': 'Ohne Kaution',

      // FAQ
      'faq.title': 'Kurze Antworten auf echte Fragen',
      'faq.sub': 'Alles was du vor deiner ersten Buchung wissen musst — von Führerschein bis Rückgabe. Noch unklar? Frag Simply oder lies im Ratgeber.',

      // Reviews
      'reviews.title': 'Was unsere Mieter sagen.',
      'reviews.you_satisfied': 'Du warst zufrieden? Bewerte uns.',
      'reviews.you_satisfied.sub': 'Eine kurze Google-Bewertung hilft anderen, uns zu finden — und uns, weiter zu wachsen.',
      'reviews.write_google': 'Google-Bewertung schreiben →',

      // Footer
      'footer.imprint': 'Impressum',
      'footer.privacy': 'Datenschutz',
      'footer.terms': 'AGB',
      'footer.guide': 'Anleitung',
      'footer.faq': 'FAQ',
      'footer.contact': 'Kontakt',

      // Account
      'account.title': 'Mein Konto',
      'account.welcome': 'Willkommen zurück',
      'account.loading': 'Wird geladen…',
      'account.login': 'Anmelden',
      'account.signup': 'Registrieren',
      'account.email': 'E-Mail',
      'account.password': 'Passwort',
      'account.logout': 'Abmelden',
      'account.my_bookings': 'Meine Buchungen',
      'account.no_bookings': 'Noch keine Buchungen.',
      'account.book_now': 'Jetzt buchen',
      'account.active_booking': '● Aktive Buchung',
      'account.access_code': '🔑 Zugangscode Zahlenschloss',
      'account.access_code.hint': 'Diesen Code am Schloss eingeben',
      'account.location.title': 'Standort des Anhängers',
      'account.location.loading': 'Adresse wird geladen…',
      'account.location.route': '🚗 Route starten',
      'account.location.map': '🗺 Auf Karte',
      'account.start_precheck': '📷 Vorab-Check starten → Schloss-Code erhalten',
      'account.start_return': 'Rückgabe starten →',
      'account.guide_inline.title': '📖 Anleitung — Abholung & Rückgabe',
      'account.guide_inline.detailed': 'Detaillierte Anleitung mit Skizzen →',
      'account.extend.title': '⏱ Mietzeit verlängern',
      'account.extend.desc': 'Brauchst du länger? Wähle eine Option — der Aufpreis wird sofort über die hinterlegte Karte abgebucht.',
      'account.extend.hour': 'Stunde',
      'account.extend.hours': 'Stunden',
      'account.extend.day': 'Tag',
      'account.extend.engpass': 'Bei Engpass (Folge-Buchung): nicht möglich — bitte rechtzeitig zurückgeben.',
      'account.cancel.title': '↩ Buchung stornieren',
      'account.cancel.btn': 'Jetzt stornieren',
      'account.pdf_note': 'Mietvertrag + Rechnung als PDF: in deiner Buchungs-E-Mail im Anhang.',

      // Precheck
      'precheck.title': 'Vor der Abfahrt',
      'precheck.step_badge': '📋 Vorab-Check · Schritt 1 von 2',
      'precheck.sub': 'Mache 2 Fotos des Anhängers und bestätige den Zustand – danach erhältst du den Schloss-Code.',
      'precheck.photo_outside': 'Foto 1 — Außenansicht',
      'precheck.photo_inside': 'Foto 2 — Ladefläche',
      'precheck.photo.choose': 'Foto auswählen',
      'precheck.photo.take': 'Foto aufnehmen',
      'precheck.confirm.title': 'Bestätigung',
      'precheck.confirm.condition': 'Ich bestätige, dass der Anhänger beim Abholen <strong>unbeschädigt und in ordnungsgemäßem Zustand</strong> ist. Sichtbare Vorschäden habe ich im Foto dokumentiert.',
      'precheck.confirm.license': 'Ich besitze einen gültigen <strong>Führerschein Klasse B</strong> und mein Fahrzeug ist für den Anhängerbetrieb versichert.',
      'precheck.confirm.agb': 'Ich habe die <strong>Allgemeinen Geschäftsbedingungen</strong> von SimpleTrailer gelesen und akzeptiere diese. Bei Schäden hafte ich entsprechend dem gewählten Schutzpaket.',
      'precheck.submit': '✓ Bestätigen & Zugangscode erhalten',
      'precheck.success.title': 'Alles bestätigt!',
      'precheck.success.code_label': 'Zugangscode',
      'precheck.success.code_hint': 'Diesen Code am Zahlenschloss eingeben',
      'precheck.success.guide.title': 'So geht\'s weiter',
      'precheck.success.guide.desc': 'Schloss öffnen, ankuppeln, Unterlegkeile lösen, sicher fahren — in 9 Schritten mit Skizzen erklärt.',
      'precheck.success.open_guide': 'Anleitung öffnen →',
      'precheck.success.account.title': 'Buchung verwalten',
      'precheck.success.account.desc': 'Im Kundenkonto siehst du <strong>deinen Zugangscode jederzeit</strong>, startest die Rückgabe und kannst die Mietzeit verlängern.',
      'precheck.success.account.btn': 'Zum Kundenkonto →',
      'precheck.success.farewell': 'Gute Fahrt! Denk daran, den Anhänger rechtzeitig zurückzugeben — bei Verspätung 15 €/h.',

      // Return
      'return.title': 'Anhänger zurückgeben',
      'return.sub': 'Foto machen und Rückgabe bestätigen.',
      'return.your_booking': 'Deine Buchung',
      'return.booking_num': 'Buchungsnummer',
      'return.expected_return': 'Gebuchte Rückgabe',
      'return.amount': 'Mietbetrag',
      'return.countdown.until_return': 'Zeit bis zur Rückgabe',
      'return.countdown.late': 'Verspätung',
      'return.countdown.starts_in': 'Buchung beginnt in',
      'return.late_warning': 'Bei verspäteter Rückgabe werden <strong>15 € pro angefangene Stunde</strong> automatisch nachgebucht.',
      'return.guide.title': 'Rückgabe-Anleitung',
      'return.guide.desc': 'Abkuppeln, Unterlegkeile setzen, Schloss zu — in 10 Schritten erklärt mit Skizzen.',
      'return.guide.open': 'Anleitung öffnen →',
      'return.zone.title': 'Rückgabe-Zone',
      'return.zone.desc': 'Bring den Anhänger zurück zum Stellplatz (grüner Kreis).',
      'return.zone.loading': 'Lade Anhänger-Position…',
      'return.zone.in_zone': '✓ Anhänger ist in der Zone',
      'return.zone.out_zone_prefix': '⚠ Anhänger',
      'return.zone.out_zone_suffix': 'außerhalb der Zone',
      'return.zone.unknown': 'Anhänger meldet sich nicht',
      'return.zone.unknown_desc': 'Tracker hat noch keine Position gesendet. Du kannst trotzdem abgeben — wir prüfen sobald der Tracker sich meldet.',
      'return.geo.btn': '📍 Meinen Standort zeigen',
      'return.geo.loading': '📍 Lade Standort…',
      'return.geo.shared': '✓ Standort geteilt',
      'return.photo.title': 'Foto zur Bestätigung',
      'return.photo.desc': 'Mach ein Foto des Anhängers an seinem Stellplatz – damit bestätigen wir die ordnungsgemäße Rückgabe.',
      'return.confirm.in_zone': 'Ich bestätige: Der Anhänger steht innerhalb der Rückgabe-Zone (grüner Kreis).',
      'return.confirm.out_zone': '<strong>Ich gebe außerhalb der Zone ab</strong> und akzeptiere die Rückführungspauschale von <strong>50 €</strong>.',
      'return.submit': 'Rückgabe bestätigen',
      'return.submit.hint': 'Bei nicht ordnungsgemäßer Rückgabe (außerhalb der Zone) wird eine Rückführungspauschale von 50 € berechnet, sobald der Tracker die Position bestätigt.',
      'return.success.title': 'Rückgabe bestätigt!',
      'return.success.msg': 'Danke! Du bekommst gleich eine Abrechnung per E-Mail.',
      'return.pending.title': 'Rückgabe vermerkt',
      'return.pending.msg': 'Wir warten auf die finale Bestätigung vom Tracker.',
      'return.back_home': 'Zurück zur Startseite',

      // Booking confirm
      'confirm.title': 'Danke für deine Buchung!',
      'confirm.sub': 'Dein Anhänger ist fest reserviert. Hier ist alles auf einen Blick.',
      'confirm.booking_num': 'Buchungsnummer',
      'confirm.trailer': 'Anhänger',
      'confirm.from': 'Von',
      'confirm.to': 'Bis',
      'confirm.paid': 'Bezahlt',
      'confirm.location.title': 'Standort des Anhängers',
      'confirm.step1.label': 'Schritt 1 — Vor Abholung',
      'confirm.step1.desc': 'Mache <strong>15 Minuten vor Mietbeginn</strong> ein Foto des Anhängers und bestätige den Zustand — erst dann wird der <strong>Schloss-Code</strong> freigeschaltet.',
      'confirm.start_precheck': '📷 Vorab-Check starten →',
      'confirm.loading': 'Buchung wird bestätigt...',

      // Common buttons / generic
      'btn.continue': 'Weiter →',
      'btn.back': '← Zurück',
      'btn.cancel': 'Abbrechen',
      'btn.save': 'Speichern',
      'btn.close': 'Schließen',
      'btn.confirm': 'Bestätigen',
      'btn.loading': 'Wird geladen…',

      // 404
      '404.title': '404 — Seite nicht gefunden',
      '404.sub': 'Die gesuchte Seite gibt\'s nicht (mehr).',
      '404.home': 'Zur Startseite',
    },

    en: {
      'lang.switch.title': 'Change language',

      'nav.trailers': 'Trailers',
      'nav.prices': 'Prices',
      'nav.faq': 'FAQ',
      'nav.account': 'My Account',
      'nav.guide': 'Guide',
      'nav.book': 'Book Now',
      'nav.back': '← Back',

      'hero.tag': 'Trailer Rental Bremen',
      'hero.title.1': 'Rent a trailer.',
      'hero.title.2': 'Simple.',
      'hero.title.3': 'Instant.',
      'hero.sub.1': 'Book online in minutes.',
      'hero.sub.extra': 'No paperwork, no deposit, no waiting.',
      'hero.sub.cta': 'Just drive.',
      'hero.badge.sofort': 'Instantly',
      'hero.badge.sofort.suffix': 'available',
      'hero.badge.naehe': 'Pick up',
      'hero.badge.naehe.suffix': 'near you',
      'hero.badge.ohne': 'No',
      'hero.badge.ohne.suffix': 'deposit',

      'map.placeholder': 'Enter city or address…',
      'map.search': 'Search',
      'map.my_location': 'My Location',
      'map.click_to_zoom': 'Click to enable zoom',
      'map.all': 'All',
      'map.tarp_trailers': 'Tarp Trailers',
      'map.available_in_bremen': 'available in Bremen',
      'map.label.from': 'From',
      'map.label.to': 'To',

      'booking.find_trailer': 'Find Trailer →',
      'booking.when_label': 'When do you need a trailer?',
      'booking.step1': 'Period',
      'booking.step2': 'Options',
      'booking.step3': 'Account',
      'booking.step4': 'License',
      'booking.step5': 'Payment',

      'trust.fully_online': '100% online booking',
      'trust.contactless': 'Contactless pickup',
      'trust.local': 'Local in Bremen',
      'trust.no_deposit': 'No deposit',

      'faq.title': 'Short Answers to Real Questions',
      'faq.sub': 'Everything you need to know before your first booking — from driver\'s license to return. Still unclear? Ask Simply or read our guides.',

      'reviews.title': 'What our renters say.',
      'reviews.you_satisfied': 'Were you happy? Rate us.',
      'reviews.you_satisfied.sub': 'A short Google review helps others find us — and helps us keep growing.',
      'reviews.write_google': 'Write a Google review →',

      'footer.imprint': 'Imprint',
      'footer.privacy': 'Privacy Policy',
      'footer.terms': 'Terms',
      'footer.guide': 'Guide',
      'footer.faq': 'FAQ',
      'footer.contact': 'Contact',

      'account.title': 'My Account',
      'account.welcome': 'Welcome back',
      'account.loading': 'Loading…',
      'account.login': 'Sign in',
      'account.signup': 'Sign up',
      'account.email': 'Email',
      'account.password': 'Password',
      'account.logout': 'Sign out',
      'account.my_bookings': 'My Bookings',
      'account.no_bookings': 'No bookings yet.',
      'account.book_now': 'Book Now',
      'account.active_booking': '● Active Booking',
      'account.access_code': '🔑 Padlock Access Code',
      'account.access_code.hint': 'Enter this code at the padlock',
      'account.location.title': 'Trailer Location',
      'account.location.loading': 'Loading address…',
      'account.location.route': '🚗 Start Route',
      'account.location.map': '🗺 Show on Map',
      'account.start_precheck': '📷 Start Pre-Check → Get Padlock Code',
      'account.start_return': 'Start Return →',
      'account.guide_inline.title': '📖 Guide — Pickup & Return',
      'account.guide_inline.detailed': 'Detailed guide with illustrations →',
      'account.extend.title': '⏱ Extend Rental Time',
      'account.extend.desc': 'Need more time? Pick an option — the surcharge will be charged immediately to your saved card.',
      'account.extend.hour': 'hour',
      'account.extend.hours': 'hours',
      'account.extend.day': 'day',
      'account.extend.engpass': 'If there\'s a follow-up booking: not possible — please return on time.',
      'account.cancel.title': '↩ Cancel Booking',
      'account.cancel.btn': 'Cancel now',
      'account.pdf_note': 'Rental contract + invoice as PDF: attached to your booking confirmation email.',

      'precheck.title': 'Before departure',
      'precheck.step_badge': '📋 Pre-Check · Step 1 of 2',
      'precheck.sub': 'Take 2 photos of the trailer and confirm its condition — then you\'ll get the padlock code.',
      'precheck.photo_outside': 'Photo 1 — Exterior',
      'precheck.photo_inside': 'Photo 2 — Loading Area',
      'precheck.photo.choose': 'Select photo',
      'precheck.photo.take': 'Take photo',
      'precheck.confirm.title': 'Confirmation',
      'precheck.confirm.condition': 'I confirm that the trailer is <strong>undamaged and in proper condition</strong> at pickup. I have documented any visible existing damage in the photo.',
      'precheck.confirm.license': 'I hold a valid <strong>Class B driver\'s license</strong> and my vehicle is insured for trailer operation.',
      'precheck.confirm.agb': 'I have read and accept the <strong>Terms and Conditions</strong> of SimpleTrailer. In case of damage, I am liable according to the protection package I selected.',
      'precheck.submit': '✓ Confirm & Get Access Code',
      'precheck.success.title': 'All confirmed!',
      'precheck.success.code_label': 'Access Code',
      'precheck.success.code_hint': 'Enter this code at the padlock',
      'precheck.success.guide.title': 'What\'s next',
      'precheck.success.guide.desc': 'Open the padlock, hitch up, remove wheel chocks, drive safely — explained in 9 steps with sketches.',
      'precheck.success.open_guide': 'Open guide →',
      'precheck.success.account.title': 'Manage Booking',
      'precheck.success.account.desc': 'In your account, you can <strong>see your access code anytime</strong>, start the return, and extend the rental time.',
      'precheck.success.account.btn': 'Go to Account →',
      'precheck.success.farewell': 'Safe trip! Remember to return the trailer on time — late fee is €15/hour.',

      'return.title': 'Return Trailer',
      'return.sub': 'Take a photo and confirm the return.',
      'return.your_booking': 'Your Booking',
      'return.booking_num': 'Booking Number',
      'return.expected_return': 'Booked Return',
      'return.amount': 'Rental Amount',
      'return.countdown.until_return': 'Time until return',
      'return.countdown.late': 'Late by',
      'return.countdown.starts_in': 'Booking starts in',
      'return.late_warning': 'For late returns, <strong>€15 per started hour</strong> will be automatically charged.',
      'return.guide.title': 'Return Guide',
      'return.guide.desc': 'Unhitch, set wheel chocks, lock — explained in 10 steps with sketches.',
      'return.guide.open': 'Open guide →',
      'return.zone.title': 'Return Zone',
      'return.zone.desc': 'Bring the trailer back to the parking spot (green circle).',
      'return.zone.loading': 'Loading trailer position…',
      'return.zone.in_zone': '✓ Trailer is in the zone',
      'return.zone.out_zone_prefix': '⚠ Trailer',
      'return.zone.out_zone_suffix': 'outside the zone',
      'return.zone.unknown': 'Trailer not responding',
      'return.zone.unknown_desc': 'Tracker has not sent a position yet. You can still return it — we\'ll verify once the tracker reports.',
      'return.geo.btn': '📍 Show my location',
      'return.geo.loading': '📍 Loading location…',
      'return.geo.shared': '✓ Location shared',
      'return.photo.title': 'Photo to Confirm',
      'return.photo.desc': 'Take a photo of the trailer at its parking spot — we use this to confirm a proper return.',
      'return.confirm.in_zone': 'I confirm: The trailer is within the return zone (green circle).',
      'return.confirm.out_zone': '<strong>I\'m returning it outside the zone</strong> and accept the recovery fee of <strong>€50</strong>.',
      'return.submit': 'Confirm Return',
      'return.submit.hint': 'For improper return (outside the zone), a recovery fee of €50 will be charged once the tracker confirms the position.',
      'return.success.title': 'Return confirmed!',
      'return.success.msg': 'Thanks! You\'ll receive an invoice by email shortly.',
      'return.pending.title': 'Return Noted',
      'return.pending.msg': 'We\'re waiting for the final confirmation from the tracker.',
      'return.back_home': 'Back to Home',

      'confirm.title': 'Thanks for your booking!',
      'confirm.sub': 'Your trailer is firmly reserved. Here\'s everything at a glance.',
      'confirm.booking_num': 'Booking Number',
      'confirm.trailer': 'Trailer',
      'confirm.from': 'From',
      'confirm.to': 'To',
      'confirm.paid': 'Paid',
      'confirm.location.title': 'Trailer Location',
      'confirm.step1.label': 'Step 1 — Before Pickup',
      'confirm.step1.desc': 'Take a photo of the trailer <strong>15 minutes before your rental starts</strong> and confirm its condition — only then will the <strong>padlock code</strong> be unlocked.',
      'confirm.start_precheck': '📷 Start Pre-Check →',
      'confirm.loading': 'Confirming booking...',

      'btn.continue': 'Continue →',
      'btn.back': '← Back',
      'btn.cancel': 'Cancel',
      'btn.save': 'Save',
      'btn.close': 'Close',
      'btn.confirm': 'Confirm',
      'btn.loading': 'Loading…',

      '404.title': '404 — Page not found',
      '404.sub': 'This page doesn\'t exist (anymore).',
      '404.home': 'Go to Homepage',
    }
  };

  // ============================================================
  //  STATE
  // ============================================================
  const STORAGE_KEY = 'st_lang';
  // WICHTIG: Default IMMER Deutsch fuer SEO.
  // Google-Crawler sehen so immer den deutschen Inhalt (= verbindliche Indexierung).
  // Auto-Detect der Browser-Sprache wuerde dazu fuehren dass Googlebot englischen
  // Content auf der .de-Domain indexiert → Duplicate-Content / Confusion.
  // Englisch greift NUR wenn User explizit den Switch klickt (in localStorage gespeichert).
  function detectLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'de' || stored === 'en') return stored;
    return 'de'; // Default DE — Browser-Sprache wird absichtlich ignoriert
  }
  let currentLang = detectLang();

  // ============================================================
  //  PUBLIC API
  // ============================================================
  function t(key, fallback) {
    return (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key])
        || (TRANSLATIONS.de && TRANSLATIONS.de[key])
        || fallback
        || key;
  }

  function getLang() { return currentLang; }

  function setLang(lang) {
    if (lang !== 'de' && lang !== 'en') return;
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyTranslations();
    updateSwitchUI();
    // Custom event damit andere Scripts auf Sprach-Wechsel reagieren koennen
    document.dispatchEvent(new CustomEvent('st-lang-changed', { detail: { lang } }));
  }

  function applyTranslations() {
    document.documentElement.lang = currentLang;
    // Text-Content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const val = t(key, '');
      if (val) el.textContent = val;
    });
    // HTML-Content (Strings mit <strong> etc.)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (!key) return;
      const val = t(key, '');
      if (val) el.innerHTML = val;
    });
    // Attribute (placeholder, title, aria-label, alt)
    document.querySelectorAll('[data-i18n-attr]').forEach(el => {
      const config = el.getAttribute('data-i18n-attr');
      if (!config) return;
      config.split(';').forEach(pair => {
        const [attr, key] = pair.split(':').map(s => s && s.trim());
        if (attr && key) {
          const val = t(key, '');
          if (val) el.setAttribute(attr, val);
        }
      });
    });
  }

  // ============================================================
  //  LANG-SWITCH UI
  // ============================================================
  function buildSwitchHtml() {
    return `
      <div class="st-lang-switch" role="group" aria-label="${t('lang.switch.title')}">
        <button type="button" class="st-lang-btn ${currentLang === 'de' ? 'active' : ''}" data-lang="de" aria-label="Deutsch">
          <span class="st-lang-flag">🇩🇪</span><span class="st-lang-code">DE</span>
        </button>
        <button type="button" class="st-lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" aria-label="English">
          <span class="st-lang-flag">🇬🇧</span><span class="st-lang-code">EN</span>
        </button>
      </div>`;
  }

  function injectStyles() {
    if (document.getElementById('st-lang-switch-styles')) return;
    const css = `
      .st-lang-switch { display:inline-flex; gap:2px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.10); border-radius:8px; padding:2px; }
      .st-lang-btn { background:transparent; border:none; color:#aaa; padding:5px 9px; border-radius:6px; cursor:pointer; font-family:inherit; font-size:.78rem; font-weight:700; display:inline-flex; align-items:center; gap:5px; line-height:1; transition:background .15s, color .15s; }
      .st-lang-btn:hover { color:#fff; background:rgba(255,255,255,0.05); }
      .st-lang-btn.active { background:rgba(232,93,0,0.18); color:#fff; }
      .st-lang-flag { font-size:.9rem; line-height:1; }
      @media (max-width:520px) {
        .st-lang-btn { padding:5px 7px; font-size:.74rem; }
        .st-lang-code { display:none; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'st-lang-switch-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectSwitch() {
    // Wenn explizit ein Container existiert, dort einfuegen
    const explicit = document.querySelector('[data-lang-switch-here]');
    if (explicit && !explicit.querySelector('.st-lang-switch')) {
      explicit.innerHTML = buildSwitchHtml();
      attachSwitchHandlers();
      return;
    }
    // Sonst: in die erste <nav> einfuegen
    const nav = document.querySelector('nav');
    if (nav && !nav.querySelector('.st-lang-switch')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-lang-wrapper';
      wrapper.style.cssText = 'margin-left:auto; display:inline-flex; align-items:center;';
      wrapper.innerHTML = buildSwitchHtml();
      nav.appendChild(wrapper);
      attachSwitchHandlers();
    }
  }

  function attachSwitchHandlers() {
    document.querySelectorAll('.st-lang-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lang = btn.getAttribute('data-lang');
        if (lang) setLang(lang);
      });
    });
  }

  function updateSwitchUI() {
    document.querySelectorAll('.st-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-lang') === currentLang);
    });
  }

  // ============================================================
  //  GLOBAL EXPOSURE
  // ============================================================
  window.stI18n = { t, getLang, setLang, applyTranslations };
  window.t = t; // Convenience-Shortcut fuer Inline-Scripts

  // ============================================================
  //  INIT
  // ============================================================
  function init() {
    injectStyles();
    injectSwitch();
    applyTranslations();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
