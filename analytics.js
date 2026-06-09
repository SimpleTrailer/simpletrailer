/*
 * SimpleTrailer Analytics — zentrale Tracking-Konfiguration
 *
 * Aktiviert:
 *  1) Microsoft Clarity (Heatmaps, Session-Recordings, Rage/Dead Clicks) — gratis, DSGVO-konform
 *  2) Vercel Web Analytics (Live-Visitors, Page Views, Top Pages)        — im Pro-Plan inklusive
 *
 * SETUP:
 *  - Clarity: clarity.microsoft.com → Login mit Microsoft-Account → "New Project" anlegen
 *    → Project-ID kopieren → unten in CLARITY_ID einsetzen.
 *  - Vercel Analytics: vercel.com → Projekt → Analytics-Tab → "Enable" klicken.
 *    Kein Code nötig, das Script lädt sich automatisch ab Vercel-Domain.
 *
 * DSGVO: Beide Tools sind cookielos (Clarity nutzt LocalStorage statt Cookies, Vercel nutzt nichts).
 * In der Datenschutzerklaerung sollten sie trotzdem erwaehnt werden.
 */
(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────
  // 1) MICROSOFT CLARITY
  // ────────────────────────────────────────────────────────────
  // SimpleTrailer Clarity-Projekt: clarity.microsoft.com/projects/view/wiy9ow3sje
  const CLARITY_ID = 'wiy9ow3sje';

  if (CLARITY_ID && CLARITY_ID !== 'PUT_YOUR_CLARITY_ID_HERE') {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1;
      t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0];
      y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  // ────────────────────────────────────────────────────────────
  // 2) VERCEL WEB ANALYTICS
  // ────────────────────────────────────────────────────────────
  // Auto-aktiv auf Vercel-Production. Auf localhost / file:// passiert nichts.
  try {
    const onVercel = location.hostname === 'simpletrailer.de'
                  || location.hostname.endsWith('.vercel.app');
    if (onVercel) {
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
      const s = document.createElement('script');
      s.defer = true;
      s.src = '/_vercel/insights/script.js';
      document.head.appendChild(s);
    }
  } catch (e) { /* ignore */ }

  // ────────────────────────────────────────────────────────────
  // 3) SimpleTrailer Custom Events (für Funnel-Tracking)
  // ────────────────────────────────────────────────────────────
  // Aufrufer machen window.stcTrack('event_name', { extra: 'data' });
  // Wird automatisch an Vercel + Clarity gesendet.
  window.stcTrack = function (eventName, props) {
    try {
      props = props || {};
      // Vercel
      if (window.va) window.va('event', { name: eventName, ...props });
      // Clarity Custom Tags
      if (window.clarity) {
        window.clarity('event', eventName);
        Object.keys(props).forEach(k => {
          try { window.clarity('set', k, String(props[k])); } catch (e) {}
        });
      }
    } catch (e) { /* ignore */ }
  };

  // ────────────────────────────────────────────────────────────
  // 4) Live-Visitor-Heartbeat (fuer Admin-Dashboard)
  // ────────────────────────────────────────────────────────────
  // Anonyme Session-ID pro Tab. Pingt /api/heartbeat alle 30s mit aktuellem Pfad.
  // Admin-Dashboard zeigt damit "X Besucher gerade auf der Seite" in Echtzeit.
  // DSGVO: keine IP, keine Cookies, keine personenbezogenen Daten.
  try {
    const onProd = location.hostname === 'simpletrailer.de'
                || location.hostname.endsWith('.vercel.app');
    if (onProd) {
      let sid = sessionStorage.getItem('st_sid');
      if (!sid) {
        sid = 'sid_' + (window.crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : (Math.random().toString(36).slice(2) + Date.now().toString(36)));
        sessionStorage.setItem('st_sid', sid);
      }

      const heartbeat = () => {
        try {
          fetch('/api/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid, path: location.pathname }),
            keepalive: true
          }).catch(() => {});
        } catch (e) { /* ignore */ }
      };

      // Erster Ping SOFORT (damit Admin sofort siehst)
      heartbeat();
      // Dann alle 10s (Active-Window im Backend ist 60s, also genug Margin)
      setInterval(heartbeat, 10000);

      // Sofort-Heartbeat wenn User Tab oeffnet/aktiviert (z.B. von Hintergrund kommt)
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) heartbeat();
      });
      window.addEventListener('pageshow', heartbeat);

      // Bei Tab-Schliessen Last-Ping (best-effort via Beacon)
      window.addEventListener('pagehide', () => {
        try {
          if (navigator.sendBeacon) {
            const blob = new Blob(
              [JSON.stringify({ session_id: sid, path: location.pathname })],
              { type: 'application/json' }
            );
            navigator.sendBeacon('/api/heartbeat', blob);
          }
        } catch (e) { /* ignore */ }
      });
    }
  } catch (e) { /* ignore */ }

  // ────────────────────────────────────────────────────────────
  // 6) SENTRY ERROR MONITORING
  // ────────────────────────────────────────────────────────────
  // SETUP (einmalig, ~5 Min):
  //  1) Account auf sentry.io anlegen (gratis: 5k Errors/Monat reicht locker)
  //  2) "Create Project" -> Plattform "JavaScript / Browser" -> Name "simpletrailer-web"
  //  3) DSN kopieren (Format: https://abc123@oXYZ.ingest.sentry.io/123)
  //  4) DSN unten in SENTRY_DSN einsetzen, Datei pushen
  //  5) Ab da: bei jedem JS-Crash kommt Mail mit Stack-Trace + User-Aktionen davor
  const SENTRY_DSN = 'https://a2c801ed6f3b51a36ae3fdb8afdc1a5f@o4511339376082944.ingest.de.sentry.io/4511339384275024';

  if (SENTRY_DSN) {
    try {
      const onProd = location.hostname === 'simpletrailer.de'
                  || location.hostname.endsWith('.vercel.app');
      if (onProd) {
        const s = document.createElement('script');
        s.src = 'https://browser.sentry-cdn.com/8.13.0/bundle.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = function () {
          if (window.Sentry) {
            window.Sentry.init({
              dsn: SENTRY_DSN,
              environment: location.hostname.includes('vercel.app') ? 'staging' : 'prod',
              tracesSampleRate: 0.1, // 10% Performance-Tracing
              ignoreErrors: [
                /chrome-extension/i, /moz-extension/i, /safari-extension/i,
                'ResizeObserver loop limit exceeded',
                'Non-Error promise rejection captured'
              ]
            });
          }
        };
        document.head.appendChild(s);
      }
    } catch (e) { /* ignore */ }
  }

  // ────────────────────────────────────────────────────────────
  // 7) GOOGLE ADS + GA4 (gtag.js)
  // ────────────────────────────────────────────────────────────
  // SETUP:
  //  1) Google Ads Konto anlegen (ads.google.com)
  //  2) "Tools → Conversions → Neu" → Typ "Webseite" → Event "purchase"
  //     → Liefert "Conversion-ID" (Format: AW-1234567890) + "Conversion-Label"
  //  3) GA4-Property in analytics.google.com anlegen → "Web-Datenstream"
  //     → Liefert Mess-ID (Format: G-XXXXXXXXXX)
  //  4) Drei IDs unten eintragen, deployen, fertig.
  //  5) Conversion-Event wird auf booking-confirm.html automatisch gefeuert.
  const GOOGLE_ADS_CONVERSION_ID    = 'AW-18225533391';        // Google Ads Konto 686-850-9760
  const GOOGLE_ADS_CONVERSION_LABEL = 'o1IgCLKE87scEM-jzvJD';   // Conversion-Aktion "Buchung abgeschlossen"
  const GA4_MEASUREMENT_ID          = '';                       // z.B. 'G-XXXXXXXXXX' (kommt sobald GA4 angelegt)

  window.ST_ADS_CONFIG = {
    adsId:      GOOGLE_ADS_CONVERSION_ID,
    adsLabel:   GOOGLE_ADS_CONVERSION_LABEL,
    ga4Id:      GA4_MEASUREMENT_ID,
  };

  try {
    const anyId = GOOGLE_ADS_CONVERSION_ID || GA4_MEASUREMENT_ID;
    const onProd = location.hostname === 'simpletrailer.de'
                || location.hostname.endsWith('.vercel.app');
    if (!anyId && onProd) {
      console.info('[analytics] Google-Ads-/GA4-IDs noch nicht gesetzt — Conversion-Tracking inaktiv. Siehe analytics.js Section 7.');
    }
    if (anyId && onProd) {
      // Google-Ads-Tag wird seit 2026-06-09 STATISCH im <head> jeder HTML-Seite eingebunden
      // (sonst findet Google's Tag-Verifizierer ihn nicht, weil defer-Loading zu spaet ist).
      // Hier nur noch GA4 nachziehen falls Mess-ID gesetzt — und doppelte Initialisierung vermeiden.
      window.dataLayer = window.dataLayer || [];
      if (!window.gtag) {
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
      }
      // GA4 zusaetzlich initialisieren wenn Mess-ID hinterlegt (Google Ads ist schon via statischem Tag aktiv)
      if (GA4_MEASUREMENT_ID) {
        window.gtag('config', GA4_MEASUREMENT_ID, { anonymize_ip: true });
        // gtag.js wird vom statischen Tag schon geladen — nur noch laden wenn NUR GA4 (keine Ads-ID) gesetzt ist
        if (!GOOGLE_ADS_CONVERSION_ID) {
          const g = document.createElement('script');
          g.async = true;
          g.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA4_MEASUREMENT_ID);
          document.head.appendChild(g);
        }
      }
    }
  } catch (e) { /* ignore */ }

  // Helper: Conversion auf Buchungs-Bestätigung feuern.
  // Aufruf von booking-confirm.html: window.stcFireBookingConversion(amount, bookingId)
  window.stcFireBookingConversion = function (amountEur, transactionId) {
    try {
      const cfg = window.ST_ADS_CONFIG || {};
      // Google Ads Conversion
      if (window.gtag && cfg.adsId && cfg.adsLabel) {
        window.gtag('event', 'conversion', {
          send_to: cfg.adsId + '/' + cfg.adsLabel,
          value: Number(amountEur) || 0,
          currency: 'EUR',
          transaction_id: transactionId || ''
        });
      }
      // GA4 purchase Event
      if (window.gtag && cfg.ga4Id) {
        window.gtag('event', 'purchase', {
          transaction_id: transactionId || '',
          value: Number(amountEur) || 0,
          currency: 'EUR'
        });
      }
      // Auch in unsere internen Custom-Events
      if (window.stcTrack) window.stcTrack('booking_purchase', { value: amountEur, id: transactionId });
    } catch (e) { /* ignore */ }
  };

  // ────────────────────────────────────────────────────────────
  // 5) Auto-Tracking wichtiger Funnel-Schritte
  // ────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    const path = location.pathname;

    // booking.html: Schritt sichtbar machen
    if (path.includes('booking.html') || path === '/booking') {
      window.stcTrack('booking_funnel_start');
    }
    if (path.includes('booking-confirm') || path === '/booking-confirm') {
      window.stcTrack('booking_funnel_completed');
    }
    if (path.includes('return.html') || path === '/return') {
      window.stcTrack('return_page_open');
    }
    if (path.includes('precheck.html') || path === '/precheck') {
      window.stcTrack('precheck_open');
    }
    if (path.includes('account.html') || path === '/account') {
      window.stcTrack('account_open');
    }
  });

})();
