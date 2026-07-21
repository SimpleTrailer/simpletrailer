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
      'hero.pt.price': '<strong>ab 9&nbsp;€</strong> für 3 Std',
      'hero.pt.deposit': 'Keine Kaution',
      'hero.pt.fast': 'In 3 Minuten gebucht',
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
      'map.locating': 'Wird ermittelt…',
      'map.loading': 'Wird geladen…',
      'map.click_to_zoom': 'Klicken zum Zoomen aktivieren',
      'map.all': 'Alle',
      'map.tarp_trailers': 'Planenanhänger',
      'map.car_transporters': 'Autotransporter',
      'map.box_trailers': 'Kofferanhänger',
      'map.available_in_bremen': 'verfügbar in Bremen',
      'map.label.from': 'Von',
      'map.label.to': 'Bis',

      // Booking-Datum
      'booking.find_trailer': 'Anhänger finden →',
      'booking.when_label': 'Wann brauchst du einen Anhänger?',
      'booking.when_label_upper': 'WANN BRAUCHST DU EINEN ANHÄNGER?',
      'booking.step1': 'Zeitraum',
      'booking.step2': 'Optionen',
      'booking.step3': 'Konto',
      'booking.step4': 'Führerschein',
      'booking.step5': 'Zahlung',
      'booking.choose_tariff': 'Tarif wählen',
      'booking.mode.flex': 'Individuell',
      'booking.mode.flex.desc': 'Beliebiger Zeitraum',
      'booking.mode.day': 'Ganzer Tag',
      'booking.mode.day.desc': '24 Std. Festpreis',
      'booking.mode.weekend': 'Wochenende',
      'booking.mode.week': '1 Woche',
      'booking.from': 'ab',
      'booking.day': 'Tag',
      'booking.days': 'Tage',
      'booking.save': 'spare',
      'booking.datetime': 'Datum & Uhrzeit',
      'booking.pickup_date': 'Abholung – Datum',
      'booking.pickup_time': 'Abholung – Uhrzeit wählen',
      'booking.return_date': 'Rückgabe – Datum',
      'booking.return_time': 'Rückgabe – Uhrzeit wählen',
      'booking.protection': 'Schutzpaket wählen',
      'booking.cancellation': 'Kostenlose Stornierung',
      'booking.return_option': 'Rückgabe-Option',
      'booking.summary': 'Zusammenfassung',
      'booking.payment_method': 'Zahlungsmethode',
      'booking.book_pay': 'Jetzt buchen & bezahlen',
      'booking.agb_consent': 'Ich akzeptiere die <a href="#" onclick="openLegalModal(\'agb\');return false;">AGB</a> und die <a href="#" onclick="openLegalModal(\'datenschutz\');return false;">Datenschutzerklärung</a> und stimme der automatischen Abbuchung etwaiger Verspätungs- und Schadensersatzgebühren von der hinterlegten Zahlungsmethode zu.',
      'booking.widerruf_consent': 'Ich habe zur Kenntnis genommen, dass <strong>kein Widerrufsrecht</strong> besteht (§ 312g Abs. 2 Nr. 9 BGB), und stimme dem sofortigen Vertragsbeginn ausdrücklich zu.',

      // Trust-Badges (unter Hero)
      'trust.fully_online': '100 % online buchbar',
      'trust.contactless': 'Kontaktlose Abholung',
      'trust.local': 'Lokal in Bremen',
      'trust.no_deposit': 'Ohne Kaution',

      // FAQ
      'faq.title': 'Kurze Antworten auf echte Fragen',
      'faq.sub': 'Alles was du vor deiner ersten Buchung wissen musst — von Führerschein bis Rückgabe. Noch unklar? Frag Simply oder lies im Ratgeber.',
      'faq.q1': 'Brauche ich einen besonderen Führerschein?',
      'faq.a1': 'Nein – normaler <strong>Klasse B reicht</strong> völlig. Unser Anhänger liegt unter 750 kg Gesamtgewicht, da brauchst du kein BE. Einfach ankuppeln und losfahren.<br><br>Du bist unsicher mit deinem Auto? Probier unseren <a href="#" onclick="openInfoModalIndex();return false;" style="color:var(--orange);font-weight:600;text-decoration:underline;">Führerschein-Rechner</a> aus – der sagt dir in 5 Sekunden, ob B reicht. Er steckt unter „<em>ⓘ Alle Details + Führerscheinrechner</em>" auf der Anhänger-Karte oben.',
      'faq.q2': 'Wie komme ich an den Anhänger ran?',
      'faq.a2': 'Nach der Buchung kriegst du per Mail einen Code. Den gibst du am Schloss am Stellplatz ein, koppelst den Anhänger an – fertig. Kein Büro, kein Termin, keine Wartezeit.',
      'faq.q3': 'Was passiert, wenn ich zu spät zurückbringe?',
      'faq.a3': '<strong>10 € pro angefangene Stunde.</strong> Klingt erstmal viel, hat aber einen Grund: damit wir sicherstellen können, dass der nächste Mieter nicht warten muss. Wenn du absehen kannst, dass du länger brauchst – einfach rechtzeitig in der Buchungsmail verlängern, solange der Anhänger noch frei ist.',
      'faq.q4': 'Gibt es eine Kaution?',
      'faq.a4': 'Keine Kaution. Du zahlst nur deinen Tarif – das war\'s. Im Schadensfall greift unsere Haftpflicht. Alles Weitere steht in den AGB, aber kurz gesagt: kein verstecktes Geld.',
      'faq.q5': 'Wie funktioniert die Rückgabe?',
      'faq.a5': 'Anhänger zurück zum Stellplatz, kurz fegen, mit dem Handy ein Foto vom Innenraum hochladen — fertig. Du bekommst innerhalb von Minuten eine Abrechnung per Mail. Wenn du Free-Floating gebucht hast, darfst du auch irgendwo im Bremer Stadtgebiet abstellen.',
      'faq.q6': 'Was passiert bei einem Schaden?',
      'faq.a6': 'Mach <strong>direkt ein Foto</strong> und melde es per Mail an <a href="mailto:info@simpletrailer.de" style="color:var(--orange);font-weight:600;">info@simpletrailer.de</a>. Bei kleinen Schäden greift unsere Haftpflicht. Wenn du den Basis- oder Premium-Schutz gebucht hast, ist deine Selbstbeteiligung auf 500 € bzw. 50 € gedeckelt. Ohne Schutz haftest du in Höhe des tatsächlichen Schadens.',
      'faq.q7': 'Kann ich die Miete verlängern?',
      'faq.a7': 'Ja, einfach in deiner Buchungs-Mail auf <em>„Buchung verlängern"</em> klicken — solange der Anhänger für den neuen Zeitraum noch frei ist. Ist günstiger als die Verspätungsgebühr von 10 €/Std. und du behältst die Übersicht.',
      'faq.cta.title': 'Deine Frage ist nicht dabei?',
      'faq.cta.sub': 'Frag <strong>Simply</strong> – unseren KI-Assistenten. Oder lies dich tiefer ein in unserem <a href="/ratgeber" style="color:var(--orange);font-weight:600;text-decoration:underline;">Ratgeber</a> (Führerschein, Ankuppeln, Beladen).',
      'faq.cta.btn': 'Simply jetzt fragen →',

      // Section-Tags + Titles
      'sec.trailers.tag': 'Unsere Anhänger',
      'sec.trailers.title': 'Für jeden Zweck der richtige.',
      'sec.prices.tag': 'Preise',
      'sec.prices.title': 'Dein Zeitraum. Dein Preis.',
      'sec.usecases.tag': 'Wofür Anhänger?',
      'sec.usecases.title': 'Für jede Tour der passende Tarif',
      'sec.how.tag': 'So läuft\'s ab',
      'sec.how.title': 'Buchen in 5 Schritten',
      'sec.reviews.tag': 'Bewertungen',
      'sec.faq.tag': 'FAQ',
      'sec.guides.tag': 'Ratgeber',
      'sec.guides.title': 'Anhänger-Wissen, kompakt erklärt',
      'sec.contact.tag': 'Kontakt',

      // Trailer-Cards
      'trailers.swipe': 'Wischen →',
      'trailers.swipe.suffix': 'um alle Anhänger zu sehen',
      'trailers.available': 'Verfügbar',
      'trailers.unavailable': 'Momentan nicht verfügbar',
      'trailers.soon': 'Demnächst',
      'trailers.book_now': 'Jetzt buchen →',
      'trailers.notify': 'Benachrichtigen wenn verfügbar',
      'trailers.spec.contactless': '<strong>Kontaktlose</strong> Abholung',
      'trailers.plane.name': 'PKW-Anhänger mit Plane',
      'trailers.plane.spec1': '<strong>Bis 750 kg</strong> zGG',
      'trailers.plane.spec2': '<strong>Führerschein B</strong> reicht',
      'trailers.plane.spec3': '<strong>Plane</strong> inklusive',
      'trailers.auto.name': 'Autotransporter',
      'trailers.auto.spec1': '<strong>Bis 2.500 kg</strong> zGG',
      'trailers.auto.spec2': '<strong>Führerschein BE</strong> erforderlich',
      'trailers.auto.spec3': '<strong>Auffahrrampen</strong> inklusive',
      'trailers.koffer.name': 'Kofferanhänger',
      'trailers.koffer.spec1': '<strong>Bis 1.200 kg</strong> zGG',
      'trailers.koffer.spec3': '<strong>Vollständig</strong> wetterfest',
      'trailers.hochplane.name': 'Hochplanen-Anhänger',
      'trailers.hochplane.spec1': '<strong>Bis 1.300 kg</strong> zGG',
      'trailers.hochplane.spec2': '<strong>Führerschein B96</strong> / BE',
      'trailers.hochplane.spec3': '<strong>1,60 m Hochplane</strong> – viel Volumen',
      'trailers.pferde.name': 'Pferdeanhänger',
      'trailers.pferde.spec1': '<strong>Bis 2.000 kg</strong> zGG',
      'trailers.pferde.spec2': '<strong>Führerschein BE</strong> erforderlich',
      'trailers.pferde.spec3': '<strong>Für 2 Pferde</strong> · Alu-Boden',
      'trailers.kipper.name': 'Rückwärtskipper',
      'trailers.kipper.spec1': '<strong>Bis 1.500 kg</strong> zGG',
      'trailers.kipper.spec2': '<strong>Führerschein B96</strong> / BE',
      'trailers.kipper.spec3': '<strong>Hydraulisch kippbar</strong> · Alu-Bordwände',

      // Preise
      'prices.sub': 'Wähle einfach wann du den Anhänger brauchst – der Preis berechnet sich automatisch. Kurztrip, Wochenende oder Urlaub.',
      'prices.vat': 'Alle Preise inkl. 19 % MwSt',
      'prices.book': 'Buchen',
      'prices.no_deposit': 'Keine Kaution nötig',
      'prices.most_booked': 'Meist gebucht',
      'prices.weekend_deal': 'Wochenend-Deal',
      'prices.save_deal': '🔥 Sparangebot',
      'prices.flex.sub': 'Preis nach Dauer · frei wählbar',
      'prices.flex.f1': 'Bis 3 Std.',
      'prices.flex.f2': 'Bis 6 Std.',
      'prices.flex.f3': 'Bis 24 Std.',
      'prices.flex.f4': 'Extra-Tag',
      'prices.day.period': '/ 24 Std.',
      'prices.day.sub': '≈ 1,21 €/Stunde',
      'prices.day.f1': 'Volle 24 Stunden',
      'prices.day.f2': 'Schloss per Zahlencode',
      'prices.weekend.period': '/ Fr–So',
      'prices.weekend.sub': '≈ 19,67 €/Tag',
      'prices.weekend.f1': 'Freitag bis Sonntag',
      'prices.weekend.f2': 'Ideal für Umzüge',
      'prices.week.period': '/ 7 Tage',
      'prices.week.sub': '≈ 17 €/Tag · <span class="save">spare 54 €</span> <span class="price-old">173 €</span>',
      'prices.week.f1': '7 Tage ab Startdatum',
      'prices.week.f2': 'Perfekt für den Urlaub',

      // Use Cases
      'usecases.sub': 'Vom Sperrmüll-Termin bis zum IKEA-Sonntag — wähle deinen Einsatz und buche direkt.',
      'usecases.book_now': 'Jetzt buchen',
      'usecases.notify': 'Benachrichtigen',
      'usecases.move.title': 'Umzug & Möbel',
      'usecases.move.meta': 'Sofa, Schrank, Kartons · ab <strong>29 €/Tag</strong>',
      'usecases.garden.title': 'Sperrmüll & Garten',
      'usecases.garden.meta': 'Recyclinghof, Grünschnitt · ab <strong>9 €/3 h</strong>',
      'usecases.auto.title': 'Auto-Transport',
      'usecases.auto.meta': 'Auto abschleppen, Pannenhilfe · <strong>bald verfügbar</strong>',
      'usecases.shop.title': 'Großeinkauf',
      'usecases.shop.meta': 'IKEA, Baumarkt, Möbelhaus · ab <strong>9 €/3 h</strong>',

      // How-it-works
      'how.s1.title': 'Auf Karte finden',
      'how.s1.desc': 'Sieh live, ob der Anhänger gerade frei ist. Kein Anruf, kein Warten – direkt auf der Karte.',
      'how.s2.title': 'Zeit aussuchen',
      'how.s2.desc': '3 Stunden, ein Tag oder das ganze Wochenende – du wählst, wir machen das möglich.',
      'how.s3.title': 'Direkt zahlen',
      'how.s3.desc': 'Karte, PayPal – fertig. Nach einem kurzen Vorab-Check-Foto wird dir der Zugangscode freigeschaltet.',
      'how.s4.title': 'Abholen & losfahren',
      'how.s4.desc': 'Code eingeben, kurzes Foto vom Anhänger (Schutz für beide Seiten), ankuppeln, los. Keine Schlüsselübergabe.',
      'how.s5.title': 'Zurück & abschließen',
      'how.s5.desc': 'Anhänger zurück an den Stellplatz, Foto in der Rückgabe-Maske hochladen, Schloss zu. Wir prüfen automatisch.',

      // Ratgeber
      'ratgeber.sub': 'Praktische Anleitungen vor der ersten Fahrt — geschrieben für Anfänger, geprüft von Profis.',
      'ratgeber.read': 'Artikel lesen',
      'ratgeber.all': 'Alle Ratgeber ansehen →',
      'ratgeber.tag.license': 'Führerschein',
      'ratgeber.tag.safety': 'Sicherheit',
      'ratgeber.tag.guide': 'Anleitung',
      'ratgeber.c1.title': 'Welcher Anhänger mit Führerschein B?',
      'ratgeber.c1.meta': 'Alles zu 750 kg, 3,5 t und der BE-Erweiterung — mit Rechenbeispielen für dein Auto.',
      'ratgeber.c2.title': 'Anhänger richtig beladen',
      'ratgeber.c2.meta': 'Schwerpunkt, Stützlast, Ladungssicherung — und warum eine falsche Beladung dich Punkte kostet.',
      'ratgeber.c3.title': 'Anhänger ankuppeln Schritt für Schritt',
      'ratgeber.c3.meta': 'Vom Aufsetzen der Kupplung über Stecker bis Abreißseil — die 6 Schritte für dein erstes Mal.',

      // Contact
      'contact.title': 'Irgendwas unklar?<br>Schreib uns.',
      'contact.sub': 'Wir sind kein Callcenter. Wir antworten persönlich – meistens innerhalb von ein paar Stunden.',
      'contact.hours': 'Mo–So, 8:00–20:00 Uhr',
      'contact.name': 'Name',
      'contact.name.ph': 'Dein Name',
      'contact.message': 'Nachricht',
      'contact.message.ph': 'Was möchtest du wissen?',
      'contact.send': 'Nachricht senden →',

      // Newsletter
      'newsletter.tag': 'Newsletter',
      'newsletter.title': 'Die besten Anhänger-Tipps direkt ins Postfach',
      'newsletter.sub': 'Praktische Anleitungen, Saison-Aktionen, neue Anhänger-Typen — kein Spam, jederzeit kündbar.',
      'newsletter.signup': 'Anmelden',
      'newsletter.legal': 'Mit Anmeldung bestätigst du unsere <a href="/datenschutz" style="color:#fff;">Datenschutzerklärung</a>. Double-Opt-In: du bekommst eine Bestätigungs-Mail.',

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
      'footer.brand.desc': 'Anhängervermietung in Bremen. Einfach buchen, sofort losfahren.',
      'footer.founded': 'Gegründet 2026',
      'footer.service': 'Service',
      'footer.our_trailer': 'Unser Anhänger',
      'footer.how': 'So funktioniert\'s',
      'footer.prices': 'Preise',
      'footer.guides': 'Ratgeber',
      'footer.legal': 'Rechtliches',
      'footer.bremen_de': 'Bremen, Deutschland',
      'footer.pay_with': 'Sicher bezahlen mit',
      'footer.copyright': '© SimpleTrailer 2026 – Alle Rechte vorbehalten',
      'footer.made': 'Made in Bremen 🧡',

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
      'account.auth.sub': 'Melde dich an um deine Buchungen zu sehen.',
      'account.email.placeholder': 'deine@email.de',
      'account.password.placeholder': 'Mindestens 6 Zeichen',
      'account.forgot': 'Passwort vergessen?',
      'account.firstname': 'Vorname *',
      'account.lastname': 'Nachname *',
      'account.email_req': 'E-Mail *',
      'account.phone_req': 'Telefon *',
      'account.address_req': 'Adresse *',
      'account.password_req': 'Passwort *',
      'account.create': 'Konto erstellen',
      'account.reset.desc': 'Gib deine E-Mail ein — wir schicken dir einen Link zum Zurücksetzen.',
      'account.reset.send': 'Link senden',
      'account.reset.back': '← Zurück zum Login',
      'account.book_new': '+ Neuen Anhänger buchen',
      'account.delete': 'Konto löschen',
      'account.profile': 'Profil',
      'account.edit': 'Bearbeiten',
      'account.phone': 'Telefon',
      'account.birthdate': 'Geburtsdatum',
      'account.address': 'Adresse',
      'account.bookings.loading': 'Buchungen werden geladen...',

      // Precheck
      'precheck.loading': 'Buchung wird geladen…',
      'precheck.error.title': 'Link ungültig',
      'precheck.error.msg': 'Dieser Link ist nicht gültig oder bereits abgelaufen.',
      'precheck.pending.title': 'Buchung beginnt in',
      'precheck.pending.info': 'Der Schloss-Code wird ab 15 Min vor Mietbeginn freigeschaltet. Sobald die Zeit reif ist, kannst du den Pre-Check starten und bekommst den Code.',
      'precheck.pending.start': 'Buchungs-Beginn:',
      'precheck.pending.trailer': 'Anhänger:',
      'precheck.pending.auto': 'Diese Seite aktualisiert sich automatisch. Du brauchst sie nicht offen lassen — komm einfach zur Buchungszeit wieder zurück.',
      'precheck.title': 'Vor der Abfahrt',
      'precheck.step_badge': '📋 Vorab-Check · Schritt 1 von 2',
      'precheck.sub': 'Mache <strong>2 Fotos</strong> des Anhängers und bestätige den Zustand – danach erhältst du den Schloss-Code.',
      'precheck.photo1.title': '📷 Foto 1 — Anhänger von außen (Seite)',
      'precheck.photo1.desc': 'Stell dich an die Seite des Anhängers. Komplette Plane, Räder und Deichsel müssen drauf sein.',
      'precheck.photo2.title': '📷 Foto 2 — Ladefläche von oben',
      'precheck.photo2.desc': 'Steig auf den Anhänger oder schau von oben rein. Der gesamte Boden muss sichtbar sein.',
      'precheck.photo.choose': 'Foto auswählen',
      'precheck.photo.take': 'Foto aufnehmen',
      'precheck.photo.tap': 'Tippen zum Aufnehmen',
      'precheck.success.code_intro': 'Hier ist dein Zugangscode für das Zahlenschloss:',
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
      'precheck.success.farewell': 'Gute Fahrt! Denk daran, den Anhänger rechtzeitig zurückzugeben — bei Verspätung 10 €/h.',

      // Return
      'return.title': 'Anhänger zurückgeben',
      'return.sub': 'Zwei schnelle Fotos (die Kamera führt dich durch), Häkchen setzen — fertig.',
      'return.your_booking': 'Deine Buchung',
      'return.booking_num': 'Buchungsnummer',
      'return.expected_return': 'Gebuchte Rückgabe',
      'return.amount': 'Mietbetrag',
      'return.countdown.until_return': 'Zeit bis zur Rückgabe',
      'return.countdown.late': 'Verspätung',
      'return.countdown.starts_in': 'Buchung beginnt in',
      'return.late_warning': 'Bei verspäteter Rückgabe werden <strong>10 € pro angefangene Stunde</strong> automatisch nachgebucht.',
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
      'return.photo.title': 'Foto 1 · Anhänger am Stellplatz',
      'return.photo.desc': 'Tippe unten — die Kamera zeigt dir eine durchsichtige Schablone, wie der Anhänger ins Bild soll. Foto 2 (Ladefläche) kommt direkt danach.',
      'return.confirm.in_zone': 'Ich bestätige: Der Anhänger steht innerhalb der Rückgabe-Zone (grüner Kreis).',
      'return.confirm.out_zone': '<strong>Ich gebe außerhalb der Zone ab</strong> und akzeptiere die Rückführungspauschale von <strong>50 €</strong>.',
      'return.submit': 'Rückgabe bestätigen',
      'return.submit.hint': 'Bei nicht ordnungsgemäßer Rückgabe (außerhalb der Zone) wird eine Rückführungspauschale von 50 € berechnet, sobald der Tracker die Position bestätigt.',
      'return.success.title': 'Rückgabe bestätigt!',
      'return.success.msg': 'Danke! Du bekommst gleich eine Abrechnung per E-Mail.',
      'return.pending.title': 'Rückgabe vermerkt',
      'return.pending.msg': 'Wir warten auf die finale Bestätigung vom Tracker.',
      'return.back_home': 'Zurück zur Startseite',
      'return.loading': 'Buchung wird geladen...',
      'return.trailer': 'Anhänger',
      'return.photo.choose': 'Foto aufnehmen',
      'return.photo.or_drop': 'oder hierher ziehen',
      'return.late_fee.label': 'Verspätungsaufpreis',
      'return.error.title': 'Buchung nicht gefunden',
      'return.error.msg': 'Dieser Rückgabe-Link ist ungültig oder abgelaufen.',
      'return.pending.head': '⏳ Standort wird bestätigt',
      'return.pending.info': 'Der Tracker meldet sich nicht immer sofort. Wir bestätigen die Rückgabe final sobald die Position eingegangen ist (i.d.R. innerhalb 1 Stunde) — du bekommst dann eine E-Mail. Bei Problem melden wir uns.',

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
      'confirm.howto.title': '📖 So funktioniert deine Buchung',
      'confirm.howto.sub': 'Kurz erklärt — damit beim Abholen, Fahren und Zurückgeben alles glatt läuft.',
      'confirm.s1.title': '15 Minuten vor Mietbeginn zum Anhänger fahren',
      'confirm.s1.desc': 'Stellplatz steht in der Bestätigungs-Mail. GPS-Position siehst du auch in deinem Kundenkonto.',
      'confirm.s2.title': 'Vorab-Check öffnen und Foto machen',
      'confirm.s2.desc': 'Foto von außen + Ladefläche. Damit ist der Zustand dokumentiert — schützt dich vor späteren falschen Schadens-Vorwürfen.',
      'confirm.s3.title': 'Schloss-Code eingeben + ankuppeln',
      'confirm.s3.desc': 'Der Code kommt nach dem Foto-Upload. Anleitung zum Ankuppeln + Unterlegkeile gibt\'s direkt nach dem Code.',
      'confirm.s4.title': 'Nach der Nutzung: Rückgabe-Foto + Schloss zu',
      'confirm.s4.desc': 'Anhänger sauber zurückstellen, Rückgabe-Link aus deiner Mail öffnen, Foto hochladen. Fertig.',
      'confirm.guide_full.title': '📖 Vollständige Anleitung',
      'confirm.guide_full.desc': 'Schloss öffnen, ankuppeln, Unterlegkeile lösen, Rückgabe — alles Schritt für Schritt erklärt. Auch wenn du noch nie einen Anhänger gefahren hast.',
      'confirm.guide_full.btn': 'Anleitung lesen →',
      'confirm.acc.title': 'Du bist eingeloggt',
      'confirm.acc.desc': 'Im Kundenkonto siehst du alle Details, den Code (sobald freigeschaltet), Mietvertrag-PDF, Verlängern + Storno.',
      'confirm.acc.btn': 'Zum Kundenkonto →',
      'confirm.email.hint': '📧 <strong style="color:#ddd;">Bestätigung an deine E-Mail unterwegs</strong> — Mietvertrag und Rechnung als PDF im Anhang. Falls nicht im Posteingang, schau kurz im Junk-Ordner.',

      // Common buttons / generic
      'btn.continue': 'Weiter →',
      'btn.back': '← Zurück',
      'btn.cancel': 'Abbrechen',
      'btn.save': 'Speichern',
      'btn.close': 'Schließen',
      'btn.confirm': 'Bestätigen',
      'btn.loading': 'Wird geladen…',

      // Anleitung / Guide
      'guide.nav.account': 'Konto',
      'guide.badge': 'Schritt für Schritt',
      'guide.title': 'So funktioniert es',
      'guide.sub': 'Abholen, ankuppeln, fahren, zurückgeben. Auch wenn du noch nie einen Anhänger gefahren hast — das schaffst du in wenigen Minuten.',
      'guide.tab.pickup': 'Abholung',
      'guide.tab.return': 'Rückgabe',
      'guide.pickup.intro.title': 'Du bist am Stellplatz. Was jetzt?',
      'guide.pickup.intro.desc': 'Der Anhänger steht für dich bereit. Bis du losfährst dauert es <strong style="color:#fff;">5–7 Minuten</strong>. Halte dein Handy bereit — der Schloss-Code wird im Vorab-Check freigeschaltet.',
      'guide.return.intro.title': 'Mietzeit endet — was tun?',
      'guide.return.intro.desc': 'Anhänger zurück, Foto, Schloss zu. Dauer ca. <strong style="color:#fff;">3–5 Minuten</strong>. Wichtig: vor Mietende fertig sein, sonst werden <strong>10 € pro Stunde</strong> Verspätung automatisch nachgebucht.',
      'guide.expand9': 'Alle 9 Schritte anzeigen ⌄',
      'guide.expand10': 'Alle 10 Schritte anzeigen ⌄',
      'guide.s1': 'Pre-Check-Foto machen',
      'guide.s2': 'Schloss-Code eingeben',
      'guide.s3': 'Kurzcheck — alles dran?',
      'guide.s4': 'An dein Auto rangieren',
      'guide.s5': 'Stützrad runter, ankuppeln',
      'guide.s6': 'Stützrad ganz hochkurbeln',
      'guide.s7': 'Elektrik anschließen',
      'guide.s8': 'Unterlegkeile lösen + verstauen',
      'guide.s9': 'Losfahren — vorsichtig',
      'guide.r1': 'Zum Rückgabe-Stellplatz fahren',
      'guide.r2': 'Anhänger absetzen',
      'guide.r3': 'Unterlegkeile setzen',
      'guide.r4': 'Stützrad runter',
      'guide.r5': 'Elektrik trennen',
      'guide.r6': 'Abkuppeln',
      'guide.r7': 'Auto wegfahren',
      'guide.r8': 'Schloss zumachen',
      'guide.r9': 'Aufräumen — wirklich sauber',
      'guide.r10': 'Rückgabe-Foto machen + Link öffnen',

      // 404
      '404.title': 'Diese Seite existiert leider nicht.',
      '404.sub': 'Vielleicht ist der Link veraltet oder du hast dich vertippt. Hier geht\'s zurück:',
      '404.home': 'Zur Startseite →',
      '404.book': 'Direkt buchen',
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
      'hero.pt.price': '<strong>from €9</strong> for 3 hrs',
      'hero.pt.deposit': 'No deposit',
      'hero.pt.fast': 'Booked in 3 minutes',
      'hero.badge.sofort': 'Instantly',
      'hero.badge.sofort.suffix': 'available',
      'hero.badge.naehe': 'Pick up',
      'hero.badge.naehe.suffix': 'near you',
      'hero.badge.ohne': 'No',
      'hero.badge.ohne.suffix': 'deposit',

      'map.placeholder': 'Enter city or address…',
      'map.search': 'Search',
      'map.my_location': 'My Location',
      'map.locating': 'Locating…',
      'map.loading': 'Loading…',
      'map.click_to_zoom': 'Click to enable zoom',
      'map.all': 'All',
      'map.tarp_trailers': 'Tarp Trailer',
      'map.car_transporters': 'Car Transporter',
      'map.box_trailers': 'Box Trailer',
      'map.available_in_bremen': 'available in Bremen',
      'map.label.from': 'From',
      'map.label.to': 'To',

      'booking.find_trailer': 'Find Trailer →',
      'booking.when_label': 'When do you need a trailer?',
      'booking.when_label_upper': 'WHEN DO YOU NEED A TRAILER?',
      'booking.step1': 'Period',
      'booking.step2': 'Options',
      'booking.step3': 'Account',
      'booking.step4': 'License',
      'booking.step5': 'Payment',
      'booking.choose_tariff': 'Choose Tariff',
      'booking.mode.flex': 'Custom',
      'booking.mode.flex.desc': 'Any time period',
      'booking.mode.day': 'Full Day',
      'booking.mode.day.desc': '24 hrs fixed price',
      'booking.mode.weekend': 'Weekend',
      'booking.mode.week': '1 Week',
      'booking.from': 'from',
      'booking.day': 'day',
      'booking.days': 'days',
      'booking.save': 'save',
      'booking.datetime': 'Date & Time',
      'booking.pickup_date': 'Pickup – Date',
      'booking.pickup_time': 'Pickup – Choose Time',
      'booking.return_date': 'Return – Date',
      'booking.return_time': 'Return – Choose Time',
      'booking.protection': 'Choose Protection Package',
      'booking.cancellation': 'Free Cancellation',
      'booking.return_option': 'Return Option',
      'booking.summary': 'Summary',
      'booking.payment_method': 'Payment Method',
      'booking.book_pay': 'Book & Pay Now',
      'booking.agb_consent': 'I accept the <a href="#" onclick="openLegalModal(\'agb\');return false;">Terms and Conditions</a> and the <a href="#" onclick="openLegalModal(\'datenschutz\');return false;">Privacy Policy</a> and consent to automatic charging of any late fees and damage compensation from the saved payment method.',
      'booking.widerruf_consent': 'I acknowledge that <strong>no right of withdrawal</strong> applies (§ 312g Abs. 2 No. 9 BGB) and expressly agree to the immediate start of the contract.',

      'trust.fully_online': '100% online booking',
      'trust.contactless': 'Contactless pickup',
      'trust.local': 'Local in Bremen',
      'trust.no_deposit': 'No deposit',

      'faq.title': 'Short Answers to Real Questions',
      'faq.sub': 'Everything you need to know before your first booking — from driver\'s license to return. Still unclear? Ask Simply or read our guides.',
      'faq.q1': 'Do I need a special driver\'s license?',
      'faq.a1': 'No – a standard <strong>Class B license is enough</strong>. Our trailer weighs under 750 kg total, so you don\'t need BE. Just hitch up and drive off.<br><br>Unsure about your car? Try our <a href="#" onclick="openInfoModalIndex();return false;" style="color:var(--orange);font-weight:600;text-decoration:underline;">License Calculator</a> — it tells you in 5 seconds whether B is sufficient. You\'ll find it under „<em>ⓘ All details + License calculator</em>" on the trailer card above.',
      'faq.q2': 'How do I access the trailer?',
      'faq.a2': 'After booking you\'ll get a code by email. Enter it at the padlock at the parking spot, hitch up the trailer — done. No office, no appointment, no waiting.',
      'faq.q3': 'What happens if I return late?',
      'faq.a3': '<strong>€10 per started hour.</strong> Sounds like a lot, but there\'s a reason: to ensure the next renter doesn\'t have to wait. If you can foresee that you\'ll need longer — simply extend the booking in your confirmation email while the trailer is still available.',
      'faq.q4': 'Is there a deposit?',
      'faq.a4': 'No deposit. You only pay your tariff — that\'s it. In case of damage, our liability insurance covers it. Everything else is in the T&Cs, but in short: no hidden money.',
      'faq.q5': 'How does the return work?',
      'faq.a5': 'Trailer back to the parking spot, quick sweep, upload a photo of the interior with your phone — done. You\'ll receive an invoice by email within minutes. If you booked free-floating, you can also drop it off anywhere in the Bremen city area.',
      'faq.q6': 'What happens in case of damage?',
      'faq.a6': 'Take <strong>a photo immediately</strong> and report it by email to <a href="mailto:info@simpletrailer.de" style="color:var(--orange);font-weight:600;">info@simpletrailer.de</a>. For minor damage, our liability insurance covers it. If you booked the Basic or Premium package, your deductible is capped at €500 or €50. Without protection, you\'re liable for the actual damage.',
      'faq.q7': 'Can I extend my rental?',
      'faq.a7': 'Yes, just click <em>„Extend booking"</em> in your booking email — as long as the trailer is still available for the new time. It\'s cheaper than the €10/hour late fee and keeps things tidy.',
      'faq.cta.title': 'Your question isn\'t here?',
      'faq.cta.sub': 'Ask <strong>Simply</strong> — our AI assistant. Or dive deeper in our <a href="/ratgeber" style="color:var(--orange);font-weight:600;text-decoration:underline;">guides</a> (license, hitching, loading).',
      'faq.cta.btn': 'Ask Simply now →',

      // Section-Tags + Titles
      'sec.trailers.tag': 'Our Trailers',
      'sec.trailers.title': 'The right one for every purpose.',
      'sec.prices.tag': 'Prices',
      'sec.prices.title': 'Your timeframe. Your price.',
      'sec.usecases.tag': 'What for?',
      'sec.usecases.title': 'The right tariff for every trip',
      'sec.how.tag': 'How it works',
      'sec.how.title': 'Book in 5 steps',
      'sec.reviews.tag': 'Reviews',
      'sec.faq.tag': 'FAQ',
      'sec.guides.tag': 'Guides',
      'sec.guides.title': 'Trailer knowledge, explained concisely',
      'sec.contact.tag': 'Contact',

      // Trailer-Cards
      'trailers.swipe': 'Swipe →',
      'trailers.swipe.suffix': 'to see all trailers',
      'trailers.available': 'Available',
      'trailers.unavailable': 'Currently unavailable',
      'trailers.soon': 'Coming soon',
      'trailers.book_now': 'Book now →',
      'trailers.notify': 'Notify me when available',
      'trailers.spec.contactless': '<strong>Contactless</strong> pickup',
      'trailers.plane.name': 'Tarp Trailer',
      'trailers.plane.spec1': '<strong>Up to 750 kg</strong> GVW',
      'trailers.plane.spec2': '<strong>Class B license</strong> sufficient',
      'trailers.plane.spec3': '<strong>Tarp</strong> included',
      'trailers.auto.name': 'Car Transporter',
      'trailers.auto.spec1': '<strong>Up to 2,500 kg</strong> GVW',
      'trailers.auto.spec2': '<strong>Class BE license</strong> required',
      'trailers.auto.spec3': '<strong>Ramps</strong> included',
      'trailers.koffer.name': 'Box Trailer',
      'trailers.koffer.spec1': '<strong>Up to 1,200 kg</strong> GVW',
      'trailers.koffer.spec3': '<strong>Fully</strong> weatherproof',
      'trailers.hochplane.name': 'High-Tarp Trailer',
      'trailers.hochplane.spec1': '<strong>Up to 1,300 kg</strong> GVW',
      'trailers.hochplane.spec2': '<strong>Class B96</strong> / BE',
      'trailers.hochplane.spec3': '<strong>1.60 m high tarp</strong> – lots of volume',
      'trailers.pferde.name': 'Horse Trailer',
      'trailers.pferde.spec1': '<strong>Up to 2,000 kg</strong> GVW',
      'trailers.pferde.spec2': '<strong>Class BE license</strong> required',
      'trailers.pferde.spec3': '<strong>For 2 horses</strong> · aluminum floor',
      'trailers.kipper.name': 'Rear Tipper',
      'trailers.kipper.spec1': '<strong>Up to 1,500 kg</strong> GVW',
      'trailers.kipper.spec2': '<strong>Class B96</strong> / BE',
      'trailers.kipper.spec3': '<strong>Hydraulic tipping</strong> · aluminum sides',

      // Prices
      'prices.sub': 'Just pick when you need the trailer – the price calculates automatically. Short trip, weekend, or holiday.',
      'prices.vat': 'All prices incl. 19% VAT',
      'prices.book': 'Book',
      'prices.no_deposit': 'No deposit required',
      'prices.most_booked': 'Most booked',
      'prices.weekend_deal': 'Weekend Deal',
      'prices.save_deal': '🔥 Best Value',
      'prices.flex.sub': 'Price by duration · freely selectable',
      'prices.flex.f1': 'Up to 3 hrs',
      'prices.flex.f2': 'Up to 6 hrs',
      'prices.flex.f3': 'Up to 24 hrs',
      'prices.flex.f4': 'Extra day',
      'prices.day.period': '/ 24 hrs',
      'prices.day.sub': '≈ €1.21/hour',
      'prices.day.f1': 'Full 24 hours',
      'prices.day.f2': 'Padlock with code',
      'prices.weekend.period': '/ Fri–Sun',
      'prices.weekend.sub': '≈ €19.67/day',
      'prices.weekend.f1': 'Friday to Sunday',
      'prices.weekend.f2': 'Perfect for moving',
      'prices.week.period': '/ 7 days',
      'prices.week.sub': '≈ €17/day · <span class="save">save €54</span> <span class="price-old">€173</span>',
      'prices.week.f1': '7 days from start date',
      'prices.week.f2': 'Perfect for holidays',

      // Use Cases
      'usecases.sub': 'From bulky-waste trips to IKEA Sundays — pick your use case and book directly.',
      'usecases.book_now': 'Book now',
      'usecases.notify': 'Notify me',
      'usecases.move.title': 'Moving & Furniture',
      'usecases.move.meta': 'Sofa, wardrobe, boxes · from <strong>€29/day</strong>',
      'usecases.garden.title': 'Bulky Waste & Garden',
      'usecases.garden.meta': 'Recycling center, garden waste · from <strong>€9/3 hrs</strong>',
      'usecases.auto.title': 'Car Transport',
      'usecases.auto.meta': 'Tow a car, roadside help · <strong>coming soon</strong>',
      'usecases.shop.title': 'Big Shopping',
      'usecases.shop.meta': 'IKEA, hardware store, furniture · from <strong>€9/3 hrs</strong>',

      // How-it-works
      'how.s1.title': 'Find on the map',
      'how.s1.desc': 'See live if the trailer is currently free. No phone call, no waiting — directly on the map.',
      'how.s2.title': 'Pick a time',
      'how.s2.desc': '3 hours, a day, or the whole weekend — you choose, we make it work.',
      'how.s3.title': 'Pay instantly',
      'how.s3.desc': 'Card, PayPal — done. After a quick pre-check photo your access code is unlocked.',
      'how.s4.title': 'Pick up & drive off',
      'how.s4.desc': 'Enter the code, take a quick photo of the trailer (protects both sides), hitch up, go. No key handover.',
      'how.s5.title': 'Return & lock up',
      'how.s5.desc': 'Trailer back to its parking spot, upload a photo in the return form, close the padlock. We check automatically.',

      // Guides
      'ratgeber.sub': 'Practical guides before your first drive — written for beginners, verified by pros.',
      'ratgeber.read': 'Read article',
      'ratgeber.all': 'See all guides →',
      'ratgeber.tag.license': 'License',
      'ratgeber.tag.safety': 'Safety',
      'ratgeber.tag.guide': 'How-To',
      'ratgeber.c1.title': 'Which trailer with a Class B license?',
      'ratgeber.c1.meta': 'Everything about 750 kg, 3.5 t, and the BE extension — with calculation examples for your car.',
      'ratgeber.c2.title': 'Loading a trailer correctly',
      'ratgeber.c2.meta': 'Center of gravity, tongue weight, cargo securing — and why wrong loading costs you points.',
      'ratgeber.c3.title': 'Hitching a trailer step by step',
      'ratgeber.c3.meta': 'From mounting the coupling via the plug to the breakaway cable — the 6 steps for your first time.',

      // Contact
      'contact.title': 'Anything unclear?<br>Write to us.',
      'contact.sub': 'We\'re not a call center. We answer personally — usually within a few hours.',
      'contact.hours': 'Mon–Sun, 8:00 AM – 8:00 PM',
      'contact.name': 'Name',
      'contact.name.ph': 'Your name',
      'contact.message': 'Message',
      'contact.message.ph': 'What would you like to know?',
      'contact.send': 'Send message →',

      // Newsletter
      'newsletter.tag': 'Newsletter',
      'newsletter.title': 'The best trailer tips straight to your inbox',
      'newsletter.sub': 'Practical guides, seasonal deals, new trailer types — no spam, unsubscribe anytime.',
      'newsletter.signup': 'Sign up',
      'newsletter.legal': 'By signing up, you confirm our <a href="/datenschutz" style="color:#fff;">Privacy Policy</a>. Double opt-in: you\'ll receive a confirmation email.',

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
      'footer.brand.desc': 'Trailer rental in Bremen. Easy to book, drive immediately.',
      'footer.founded': 'Founded 2026',
      'footer.service': 'Service',
      'footer.our_trailer': 'Our Trailer',
      'footer.how': 'How it works',
      'footer.prices': 'Prices',
      'footer.guides': 'Guides',
      'footer.legal': 'Legal',
      'footer.bremen_de': 'Bremen, Germany',
      'footer.pay_with': 'Secure payment with',
      'footer.copyright': '© SimpleTrailer 2026 – All rights reserved',
      'footer.made': 'Made in Bremen 🧡',

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
      'account.auth.sub': 'Sign in to see your bookings.',
      'account.email.placeholder': 'your@email.com',
      'account.password.placeholder': 'At least 6 characters',
      'account.forgot': 'Forgot password?',
      'account.firstname': 'First name *',
      'account.lastname': 'Last name *',
      'account.email_req': 'Email *',
      'account.phone_req': 'Phone *',
      'account.address_req': 'Address *',
      'account.password_req': 'Password *',
      'account.create': 'Create account',
      'account.reset.desc': 'Enter your email — we\'ll send you a reset link.',
      'account.reset.send': 'Send link',
      'account.reset.back': '← Back to login',
      'account.book_new': '+ Book new trailer',
      'account.delete': 'Delete account',
      'account.profile': 'Profile',
      'account.edit': 'Edit',
      'account.phone': 'Phone',
      'account.birthdate': 'Date of birth',
      'account.address': 'Address',
      'account.bookings.loading': 'Loading bookings...',

      'precheck.loading': 'Loading booking…',
      'precheck.error.title': 'Invalid link',
      'precheck.error.msg': 'This link is not valid or has expired.',
      'precheck.pending.title': 'Booking starts in',
      'precheck.pending.info': 'The padlock code is unlocked 15 minutes before your rental starts. Once it\'s time, you can start the pre-check and get the code.',
      'precheck.pending.start': 'Booking start:',
      'precheck.pending.trailer': 'Trailer:',
      'precheck.pending.auto': 'This page updates automatically. You don\'t need to keep it open — just come back when your booking time arrives.',
      'precheck.title': 'Before departure',
      'precheck.step_badge': '📋 Pre-Check · Step 1 of 2',
      'precheck.sub': 'Take <strong>2 photos</strong> of the trailer and confirm its condition — then you\'ll get the padlock code.',
      'precheck.photo1.title': '📷 Photo 1 — Trailer from outside (side view)',
      'precheck.photo1.desc': 'Stand at the side of the trailer. The full tarp, wheels, and tow bar must be visible.',
      'precheck.photo2.title': '📷 Photo 2 — Loading area from above',
      'precheck.photo2.desc': 'Step onto the trailer or look down into it. The entire floor must be visible.',
      'precheck.photo.choose': 'Select photo',
      'precheck.photo.take': 'Take photo',
      'precheck.photo.tap': 'Tap to take',
      'precheck.success.code_intro': 'Here\'s your access code for the padlock:',
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
      'precheck.success.farewell': 'Safe trip! Remember to return the trailer on time — late fee is €10/hour.',

      'return.title': 'Return Trailer',
      'return.sub': 'Two quick photos (the camera guides you), tick the box — done.',
      'return.your_booking': 'Your Booking',
      'return.booking_num': 'Booking Number',
      'return.expected_return': 'Booked Return',
      'return.amount': 'Rental Amount',
      'return.countdown.until_return': 'Time until return',
      'return.countdown.late': 'Late by',
      'return.countdown.starts_in': 'Booking starts in',
      'return.late_warning': 'For late returns, <strong>€10 per started hour</strong> will be automatically charged.',
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
      'return.photo.title': 'Photo 1 · Trailer at its spot',
      'return.photo.desc': 'Tap below — the camera shows you a transparent template for framing the trailer. Photo 2 (cargo bed) follows right after.',
      'return.confirm.in_zone': 'I confirm: The trailer is within the return zone (green circle).',
      'return.confirm.out_zone': '<strong>I\'m returning it outside the zone</strong> and accept the recovery fee of <strong>€50</strong>.',
      'return.submit': 'Confirm Return',
      'return.submit.hint': 'For improper return (outside the zone), a recovery fee of €50 will be charged once the tracker confirms the position.',
      'return.success.title': 'Return confirmed!',
      'return.success.msg': 'Thanks! You\'ll receive an invoice by email shortly.',
      'return.pending.title': 'Return Noted',
      'return.pending.msg': 'We\'re waiting for the final confirmation from the tracker.',
      'return.back_home': 'Back to Home',
      'return.loading': 'Loading booking...',
      'return.trailer': 'Trailer',
      'return.photo.choose': 'Take photo',
      'return.photo.or_drop': 'or drag it here',
      'return.late_fee.label': 'Late Fee',
      'return.error.title': 'Booking not found',
      'return.error.msg': 'This return link is invalid or has expired.',
      'return.pending.head': '⏳ Location being confirmed',
      'return.pending.info': 'The tracker doesn\'t always respond immediately. We\'ll confirm the return as soon as the position is received (usually within 1 hour) — you\'ll get an email then. We\'ll reach out if there\'s an issue.',

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
      'confirm.howto.title': '📖 How your booking works',
      'confirm.howto.sub': 'Quick overview — so pickup, driving, and return all go smoothly.',
      'confirm.s1.title': 'Drive to the trailer 15 minutes before rental start',
      'confirm.s1.desc': 'Location is in the confirmation email. You can also see the GPS position in your account.',
      'confirm.s2.title': 'Open the Pre-Check and take photos',
      'confirm.s2.desc': 'Photo from outside + loading area. This documents the condition — protects you from false damage claims later.',
      'confirm.s3.title': 'Enter padlock code + hitch up',
      'confirm.s3.desc': 'The code appears after photo upload. Instructions for hitching + wheel chocks are shown right after.',
      'confirm.s4.title': 'After use: Return photo + lock the padlock',
      'confirm.s4.desc': 'Park the trailer cleanly, open the return link from your email, upload a photo. Done.',
      'confirm.guide_full.title': '📖 Complete Guide',
      'confirm.guide_full.desc': 'Open padlock, hitch up, remove chocks, return — everything step by step. Even if you\'ve never towed a trailer before.',
      'confirm.guide_full.btn': 'Read guide →',
      'confirm.acc.title': 'You\'re signed in',
      'confirm.acc.desc': 'In your account you can see all details, the code (once unlocked), rental contract PDF, extend + cancel.',
      'confirm.acc.btn': 'Go to Account →',
      'confirm.email.hint': '📧 <strong style="color:#ddd;">Confirmation is on its way to your email</strong> — rental contract and invoice attached as PDF. If not in your inbox, please check the junk folder.',

      'btn.continue': 'Continue →',
      'btn.back': '← Back',
      'btn.cancel': 'Cancel',
      'btn.save': 'Save',
      'btn.close': 'Close',
      'btn.confirm': 'Confirm',
      'btn.loading': 'Loading…',

      // Guide
      'guide.nav.account': 'Account',
      'guide.badge': 'Step by step',
      'guide.title': 'How it works',
      'guide.sub': 'Pick up, hitch up, drive, return. Even if you\'ve never towed a trailer before — you\'ll get this in just a few minutes.',
      'guide.tab.pickup': 'Pickup',
      'guide.tab.return': 'Return',
      'guide.pickup.intro.title': 'You\'re at the parking spot. Now what?',
      'guide.pickup.intro.desc': 'The trailer is ready for you. It takes <strong style="color:#fff;">5–7 minutes</strong> until you\'re on the road. Keep your phone ready — the padlock code is unlocked during the pre-check.',
      'guide.return.intro.title': 'Rental ending — what to do?',
      'guide.return.intro.desc': 'Return the trailer, photo, lock up. Takes about <strong style="color:#fff;">3–5 minutes</strong>. Important: be done before rental end, otherwise <strong>€10 per hour</strong> late fee will be auto-charged.',
      'guide.expand9': 'Show all 9 steps ⌄',
      'guide.expand10': 'Show all 10 steps ⌄',
      'guide.s1': 'Take pre-check photo',
      'guide.s2': 'Enter padlock code',
      'guide.s3': 'Quick check — everything there?',
      'guide.s4': 'Maneuver to your car',
      'guide.s5': 'Lower jockey wheel, hitch up',
      'guide.s6': 'Crank jockey wheel all the way up',
      'guide.s7': 'Connect electrics',
      'guide.s8': 'Remove + store wheel chocks',
      'guide.s9': 'Drive off — carefully',
      'guide.r1': 'Drive to return parking spot',
      'guide.r2': 'Set down the trailer',
      'guide.r3': 'Place wheel chocks',
      'guide.r4': 'Lower jockey wheel',
      'guide.r5': 'Disconnect electrics',
      'guide.r6': 'Unhitch',
      'guide.r7': 'Move car away',
      'guide.r8': 'Close the padlock',
      'guide.r9': 'Tidy up — really clean',
      'guide.r10': 'Take return photo + open link',

      '404.title': 'This page doesn\'t exist.',
      '404.sub': 'Maybe the link is outdated or you mistyped it. Here\'s the way back:',
      '404.home': 'Go to Homepage →',
      '404.book': 'Book directly',
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
  // SVG-Flaggen statt Emoji — Windows rendert Emoji-Flaggen nicht zuverlaessig
  // (Segoe UI Emoji unterstuetzt sie nicht, Result waere "DE"/"GB"-Text).
  const FLAG_DE = '<svg viewBox="0 0 5 3" width="18" height="12" aria-hidden="true" style="display:block;border-radius:2px;"><rect width="5" height="1" y="0" fill="#000"/><rect width="5" height="1" y="1" fill="#D00"/><rect width="5" height="1" y="2" fill="#FFCE00"/></svg>';
  const FLAG_EN = '<svg viewBox="0 0 60 30" width="18" height="12" aria-hidden="true" style="display:block;border-radius:2px;"><clipPath id="stft"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="stfs"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#stft)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#stfs)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>';

  function buildSwitchHtml() {
    return `
      <div class="st-lang-switch" role="group" aria-label="${t('lang.switch.title')}">
        <button type="button" class="st-lang-btn ${currentLang === 'de' ? 'active' : ''}" data-lang="de" aria-label="Deutsch">
          <span class="st-lang-flag">${FLAG_DE}</span><span class="st-lang-code">DE</span>
        </button>
        <button type="button" class="st-lang-btn ${currentLang === 'en' ? 'active' : ''}" data-lang="en" aria-label="English">
          <span class="st-lang-flag">${FLAG_EN}</span><span class="st-lang-code">EN</span>
        </button>
      </div>`;
  }

  function injectStyles() {
    if (document.getElementById('st-lang-switch-styles')) return;
    const css = `
      .st-lang-switch { display:inline-flex; gap:2px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:2px; flex-shrink:0; }
      .st-lang-btn { background:transparent; border:none; color:#aaa; padding:5px 9px; border-radius:6px; cursor:pointer; font-family:inherit; font-size:.78rem; font-weight:700; display:inline-flex; align-items:center; gap:5px; line-height:1; transition:background .15s, color .15s; }
      .st-lang-btn:hover { color:#fff; background:rgba(255,255,255,0.05); }
      .st-lang-btn.active { background:rgba(232,93,0,0.18); color:#fff; }
      .st-lang-flag { display:inline-flex; line-height:0; }
      .st-lang-wrapper { display:inline-flex; align-items:center; }
      /* Mobile: kompakter, nur Flaggen ohne Text */
      @media (max-width:768px) {
        .st-lang-btn { padding:4px 5px; font-size:.72rem; gap:0; }
        .st-lang-code { display:none; }
        .st-lang-switch { gap:1px; padding:1px; }
        .st-lang-wrapper { margin-left:0; margin-right:6px; }
      }
      @media (max-width:380px) {
        /* Sehr schmale Phones: noch kleiner */
        .st-lang-btn { padding:3px 4px; }
        .st-lang-flag svg { width:14px; height:10px; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'st-lang-switch-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function injectSwitch() {
    // 1) Explizite Container (data-lang-switch-here) haben Vorrang
    const explicit = document.querySelector('[data-lang-switch-here]');
    if (explicit && !explicit.querySelector('.st-lang-switch')) {
      explicit.innerHTML = buildSwitchHtml();
      attachSwitchHandlers();
      return;
    }
    // 2) Nav-inner Layout (index.html / nutzt zentralen Wrapper)
    let target = document.querySelector('nav .nav-inner');
    if (target && !target.querySelector('.st-lang-switch')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-lang-wrapper';
      wrapper.innerHTML = buildSwitchHtml();
      // Position: vor nav-account-icon (oder vor hamburger als Fallback)
      // damit auf Mobile noch genug Platz bleibt
      const accountIcon = target.querySelector('.nav-account-icon');
      const hamburger = target.querySelector('.hamburger');
      if (accountIcon) target.insertBefore(wrapper, accountIcon);
      else if (hamburger) target.insertBefore(wrapper, hamburger);
      else target.appendChild(wrapper);
      attachSwitchHandlers();
      return;
    }
    // 3) Fallback: einfache nav ohne nav-inner — direkt in <nav>
    const nav = document.querySelector('nav');
    if (nav && !nav.querySelector('.st-lang-switch')) {
      const wrapper = document.createElement('div');
      wrapper.className = 'st-lang-wrapper';
      wrapper.style.cssText = 'margin-left:auto;';
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
