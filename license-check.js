/**
 * SimpleTrailer — Führerschein-Prüfung (Frontend-Steuerung).
 *
 * Ersetzt das frühere Stripe-Identity-Widget. Der Ablauf ist bewusst auf
 * EINEN Knopf reduziert:
 *
 *   Handy   →  „Verifizierung starten"  →  Kamera führt durch alle drei
 *              Aufnahmen (license-camera.js)  →  fertig
 *
 *   Rechner →  „Verifizierung starten"  →  QR-Code  →  Kunde macht am Handy
 *              weiter; diese Seite merkt es von selbst und geht weiter
 *
 * Warum die Weiche: ein Dokument am Rechner abzufotografieren ist mühsam,
 * viele Desktops haben gar keine brauchbare Kamera. Statt den Kunden damit
 * allein zu lassen, reichen wir den Vorgang ans Handy weiter.
 *
 * Fällt die Kamera aus (kein Zugriff, alter Browser), schaltet der Ablauf
 * lautlos auf die einfache Foto-Auswahl um — niemand bleibt stecken.
 *
 * Eingebunden in booking.html (Schritt 3), account.html und verify.html.
 *
 *   STLicense.mount('#container', {
 *     getToken:  () => accessToken,      // entfällt im Handy-Modus
 *     handoff:   'TICKET',               // nur auf verify.html
 *     onVerified:(info) => {},
 *     onStatus:  (status) => {}
 *   });
 */
(function () {
  'use strict';

  // Version des Einwilligungstextes weiter unten. Bei JEDER Textänderung
  // hochzählen — sie wird serverseitig als Nachweis gespeichert und muss zur
  // Konstante CONSENT_VERSION in api/verify-license.js passen.
  const CONSENT_VERSION = 'dl-bio-2026-07-30';

  // Vercel nimmt maximal ~4,5 MB Body an. Drei Bilder als Base64 sind rund
  // ein Drittel größer als die Rohdaten — eigene Grenze, damit der Kunde eine
  // verständliche Meldung bekommt statt eines nackten Fehlers.
  const MAX_BODY_BYTES = 3.5 * 1024 * 1024;

  const MAX_EDGE = 1600;
  const QUALITY  = 0.82;

  const FALLBACK_STEPS = [
    { key: 'front',  titel: 'Vorderseite', capture: 'environment' },
    { key: 'back',   titel: 'Rückseite',   capture: 'environment' },
    { key: 'selfie', titel: 'Selfie',      capture: 'user' }
  ];

  const CSS = `
  .stl-wrap{--stl-accent:#E85D00;}
  .stl-intro{font-size:.88rem;line-height:1.62;color:var(--gray,#8a8a8a);margin:0 0 16px;}
  .stl-facts{display:flex;flex-direction:column;gap:9px;font-size:.82rem;color:var(--gray,#8a8a8a);
    background:var(--s2,#111);border:1px solid var(--border,#2a2a2a);border-radius:12px;
    padding:14px 16px;margin-bottom:16px;}
  .stl-facts b{color:var(--white,#111);font-weight:650;}

  /* Ablauf-Vorschau: zeigt vorab, was gleich passiert */
  .stl-flow{display:flex;align-items:stretch;gap:8px;margin-bottom:18px;}
  .stl-flow-item{flex:1;text-align:center;background:var(--s2,#111);
    border:1px solid var(--border,#2a2a2a);border-radius:12px;padding:13px 8px;}
  .stl-flow-ic{display:block;margin:0 auto 7px;color:var(--stl-accent);}
  .stl-flow-t{font-size:.76rem;font-weight:700;letter-spacing:-.01em;}
  .stl-flow-n{font-size:.66rem;color:var(--gray,#888);margin-top:2px;}

  .stl-consent{display:flex;align-items:flex-start;gap:13px;cursor:pointer;
    padding:15px 16px;margin-bottom:15px;
    background:var(--s2,#111);border:1.5px solid var(--border,#2a2a2a);border-radius:12px;
    transition:border-color .18s ease;}
  .stl-consent:hover{border-color:var(--stl-accent);}
  .stl-consent input{flex:0 0 auto;width:20px;height:20px;margin:1px 0 0;accent-color:var(--stl-accent);cursor:pointer;}
  .stl-consent-t{font-size:.79rem;line-height:1.55;color:var(--gray,#8a8a8a);}

  .stl-msg{font-size:.84rem;line-height:1.55;border-radius:11px;padding:12px 14px;margin-bottom:14px;display:none;}
  .stl-msg.err{background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.32);color:#dc2626;}
  .stl-msg.ok{background:rgba(22,163,74,.09);border:1px solid rgba(22,163,74,.3);color:#15803d;}
  .stl-msg.wait{background:rgba(232,93,0,.08);border:1px solid rgba(232,93,0,.28);color:#a34400;}

  /* QR-Übergabe an das Handy */
  .stl-qr{display:none;text-align:center;}
  .stl-qr-card{display:inline-block;background:#fff;padding:14px;border-radius:16px;
    box-shadow:0 10px 30px -18px rgba(17,18,19,.4);border:1px solid var(--border,#2a2a2a);}
  .stl-qr-card svg{display:block;width:220px;height:220px;}
  .stl-qr h4{font-size:1rem;font-weight:700;letter-spacing:-.02em;margin:18px 0 6px;}
  .stl-qr p{font-size:.84rem;line-height:1.6;color:var(--gray,#888);max-width:38ch;margin:0 auto;}
  .stl-qr-wait{display:inline-flex;align-items:center;gap:9px;margin-top:16px;
    font-size:.82rem;color:var(--gray,#888);}
  .stl-qr-wait i{width:14px;height:14px;border:2px solid var(--border,#2a2a2a);border-top-color:var(--stl-accent);
    border-radius:50%;animation:stl-rot .9s linear infinite;display:block;}
  @keyframes stl-rot{to{transform:rotate(360deg)}}
  .stl-qr-alt{margin-top:18px;font-size:.8rem;color:var(--gray,#888);}
  .stl-qr-alt button{background:none;border:none;color:var(--stl-accent);font-weight:650;
    cursor:pointer;font-family:inherit;font-size:.8rem;text-decoration:underline;padding:0;}

  /* Einfache Foto-Auswahl (nur wenn die Kamera nicht geht) */
  .stl-steps{display:none;flex-direction:column;gap:11px;margin-bottom:16px;}
  .stl-step{display:flex;align-items:center;gap:13px;position:relative;
    background:var(--s2,#111);border:1.5px solid var(--border,#2a2a2a);border-radius:13px;padding:13px 15px;
    cursor:pointer;transition:border-color .18s ease,transform .18s ease;}
  .stl-step:hover{border-color:var(--stl-accent);transform:translateY(-1px);}
  .stl-step input{position:absolute;inset:0;opacity:0;cursor:pointer;}
  .stl-num{flex:0 0 auto;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;
    justify-content:center;background:var(--s3,#1c1c1c);border:1px solid var(--border,#2a2a2a);
    font-size:.8rem;font-weight:750;color:var(--gray,#888);}
  .stl-step.done .stl-num{background:#16a34a;border-color:#16a34a;color:#fff;}
  .stl-step.done{border-color:#86efac;}
  .stl-step-t{flex:1;font-size:.9rem;font-weight:650;}
  .stl-thumb{width:48px;height:33px;border-radius:6px;object-fit:cover;
    border:1px solid var(--border,#2a2a2a);display:none;}
  .stl-step.done .stl-thumb{display:block;}

  .stl-busy{display:none;flex-direction:column;align-items:center;gap:13px;text-align:center;padding:26px 10px;}
  .stl-spin{width:34px;height:34px;border:3px solid var(--border,#2a2a2a);border-top-color:var(--stl-accent);
    border-radius:50%;animation:stl-rot 1s linear infinite;}
  .stl-busy-t{font-size:.94rem;font-weight:650;}
  .stl-busy-s{font-size:.81rem;color:var(--gray,#888);max-width:34ch;line-height:1.5;}

  .stl-done{display:none;gap:14px;align-items:flex-start;}
  .stl-done-ic{width:42px;height:42px;border-radius:50%;background:#22c55e;color:#fff;flex:0 0 auto;
    display:flex;align-items:center;justify-content:center;font-size:1.35rem;}
  @media(max-width:420px){ .stl-flow-n{display:none} }
  `;

  function injectCss() {
    if (document.getElementById('stl-styles')) return;
    const s = document.createElement('style');
    s.id = 'stl-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /** Bild verkleinern + als JPEG-DataURL (nur für den Fallback-Weg). */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Bitte ein Foto auswählen.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', QUALITY));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Foto konnte nicht gelesen werden.')); };
      img.src = url;
    });
  }

  const ICONS = {
    front:  '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8" cy="11" r="2.2"/><path d="M13 10h6M13 14h4"/>',
    back:   '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6 9h12M6 12.5h12M6 16h8"/>',
    selfie: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/>'
  };
  const svg = d => `<svg class="stl-flow-ic" width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

  function mount(target, opts) {
    injectCss();
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) return null;

    const getToken   = opts.getToken || (() => null);
    const handoff    = opts.handoff || null;      // gesetzt = wir sind auf dem Handy
    const onVerified = opts.onVerified || function () {};
    const onStatus   = opts.onStatus   || function () {};

    const shots = { front: null, back: null, selfie: null };
    let pollTimer = null;

    root.classList.add('stl-wrap');
    root.innerHTML = `
      <div class="stl-form">
        <p class="stl-intro">
          Einmalig vor deiner ersten Buchung prüfen wir deinen Führerschein.
          Drei Aufnahmen genügen — die Kamera führt dich Schritt für Schritt durch.
        </p>

        <div class="stl-flow">
          <div class="stl-flow-item">${svg(ICONS.front)}<span class="stl-flow-t">Vorderseite</span><span class="stl-flow-n">Seite mit Foto</span></div>
          <div class="stl-flow-item">${svg(ICONS.back)}<span class="stl-flow-t">Rückseite</span><span class="stl-flow-n">Klassen-Tabelle</span></div>
          <div class="stl-flow-item">${svg(ICONS.selfie)}<span class="stl-flow-t">Selfie</span><span class="stl-flow-n">kurz in die Kamera</span></div>
        </div>

        <div class="stl-facts">
          <span>📄 <b>Klasse B oder BE</b> — für PKW-Anhänger nötig</span>
          <span>🔒 <b>Privat gespeichert</b> — nach der Prüfung sofort gelöscht</span>
          <span>↻ <b>Nur einmal</b> — bei allen weiteren Buchungen entfällt der Check</span>
        </div>

        <div class="stl-msg" id="stlMsg"></div>

        <!-- Einfache Auswahl: erscheint nur, wenn die Kamera nicht geht -->
        <div class="stl-steps" id="stlSteps">
          ${FALLBACK_STEPS.map((s, i) => `
            <label class="stl-step" data-key="${s.key}">
              <input type="file" accept="image/*" capture="${s.capture}" data-key="${s.key}">
              <span class="stl-num" data-num="${s.key}">${i + 1}</span>
              <span class="stl-step-t">${s.titel}</span>
              <img class="stl-thumb" data-thumb="${s.key}" alt="">
            </label>`).join('')}
        </div>

        <label class="stl-consent" for="stlConsent">
          <input type="checkbox" id="stlConsent">
          <span class="stl-consent-t">
            Ich willige ein, dass mein Selfie und mein Führerschein-Lichtbild automatisiert verglichen werden,
            um meine Identität zu prüfen (Art.&nbsp;9 Abs.&nbsp;2 lit.&nbsp;a DSGVO). Die Bilder werden nach der
            Prüfung gelöscht. Die Einwilligung kann ich jederzeit widerrufen; ohne Prüfung ist keine Buchung möglich.
          </span>
        </label>

        <button class="btn btn-orange" id="stlStart" disabled>Verifizierung starten</button>
      </div>

      <!-- Übergabe an das Handy -->
      <div class="stl-qr" id="stlQr">
        <div class="stl-qr-card" id="stlQrCode"></div>
        <h4>Mit dem Handy weitermachen</h4>
        <p>Scanne den Code mit deiner Handy-Kamera. Dort führt dich die Kamera durch die drei Aufnahmen —
           am Rechner geht es danach automatisch weiter.</p>
        <div class="stl-qr-wait"><i></i> Warte auf dein Handy …</div>
        <div class="stl-qr-alt">Kein Handy zur Hand? <button type="button" id="stlHere">Hier am Rechner fortfahren</button></div>
      </div>

      <div class="stl-busy" id="stlBusy">
        <div class="stl-spin"></div>
        <div class="stl-busy-t">Führerschein wird geprüft …</div>
        <div class="stl-busy-s">Das dauert nur ein paar Sekunden. Bitte die Seite nicht schließen.</div>
      </div>

      <div class="stl-done" id="stlDone">
        <div class="stl-done-ic">✓</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:1rem;margin-bottom:4px;">Führerschein bestätigt</div>
          <div style="font-size:.84rem;line-height:1.5;color:var(--gray,#888);" id="stlDoneInfo">–</div>
        </div>
      </div>
    `;

    const el = {
      form:    root.querySelector('.stl-form'),
      steps:   root.querySelector('#stlSteps'),
      qr:      root.querySelector('#stlQr'),
      qrCode:  root.querySelector('#stlQrCode'),
      hier:    root.querySelector('#stlHere'),
      busy:    root.querySelector('#stlBusy'),
      done:    root.querySelector('#stlDone'),
      doneIn:  root.querySelector('#stlDoneInfo'),
      msg:     root.querySelector('#stlMsg'),
      start:   root.querySelector('#stlStart'),
      consent: root.querySelector('#stlConsent')
    };

    function say(text, kind) {
      if (!text) { el.msg.style.display = 'none'; return; }
      el.msg.className = 'stl-msg ' + (kind || 'err');
      el.msg.textContent = text;
      el.msg.style.display = 'block';
    }

    let fallbackModus = false;

    function refreshStart() {
      if (!el.consent.checked) { el.start.disabled = true; return; }
      el.start.disabled = fallbackModus && !FALLBACK_STEPS.every(s => shots[s.key]);
    }
    el.consent.addEventListener('change', refreshStart);

    // ── Fallback-Auswahl ────────────────────────────────────────────────────
    root.querySelectorAll('input[type=file]').forEach(inp => {
      inp.addEventListener('change', async ev => {
        const key = inp.dataset.key;
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        try {
          say('');
          shots[key] = await shrink(file);
          root.querySelector(`[data-thumb="${key}"]`).src = shots[key];
          root.querySelector(`.stl-step[data-key="${key}"]`).classList.add('done');
          root.querySelector(`[data-num="${key}"]`).textContent = '✓';
        } catch (e) {
          say(e.message || 'Foto konnte nicht verarbeitet werden.');
        }
        refreshStart();
      });
    });

    function zuFallback(grund) {
      fallbackModus = true;
      el.steps.style.display = 'flex';
      el.start.textContent = 'Führerschein prüfen lassen';
      if (grund) say(grund, 'wait');
      refreshStart();
    }

    // ── Anzeige-Zustände ────────────────────────────────────────────────────
    function zeige(was) {
      el.form.style.display = was === 'form' ? '' : 'none';
      el.qr.style.display   = was === 'qr'   ? 'block' : 'none';
      el.busy.style.display = was === 'busy' ? 'flex' : 'none';
      el.done.style.display = was === 'done' ? 'flex' : 'none';
    }

    function zeigeVerifiziert(info) {
      stopPoll();
      zeige('done');
      const klass = (info && info.dl_classes && info.dl_classes.length) ? info.dl_classes.join(', ') : 'B';
      const exp   = info && info.dl_expires_at ? new Date(info.dl_expires_at).toLocaleDateString('de-DE') : null;
      el.doneIn.innerHTML = `Klasse <strong>${klass}</strong>${exp ? ` · gültig bis <strong>${exp}</strong>` : ''}`;
      onStatus('verified');
      onVerified(info || {});
    }

    function zuruecksetzen(message) {
      FALLBACK_STEPS.forEach((s, i) => {
        shots[s.key] = null;
        const step = root.querySelector(`.stl-step[data-key="${s.key}"]`);
        if (step) {
          step.classList.remove('done');
          step.querySelector('input').value = '';
          root.querySelector(`[data-num="${s.key}"]`).textContent = String(i + 1);
        }
      });
      zeige('form');
      refreshStart();
      say(message, 'err');
    }

    /** Blendet alles aus, was nur zum Aufnehmen gebraucht wird (Endzustände). */
    function nurMeldung() {
      zeige('form');
      const weg = ['.stl-intro', '.stl-flow', '.stl-facts', '.stl-consent'];
      weg.forEach(sel => { const n = root.querySelector(sel); if (n) n.style.display = 'none'; });
      el.start.style.display = 'none';
      el.steps.style.display = 'none';
    }

    // ── Absenden ────────────────────────────────────────────────────────────
    /**
     * @param {object} bilder  die drei Aufnahmen
     * @param {object} steuer  Steuerung der Kamera-Vollbildansicht — MUSS in JEDEM
     *   Ausgang geschlossen werden. Sonst liegt sie über allem und der Kunde sieht
     *   ewig „Führerschein wird geprüft", egal was der Server antwortet.
     */
    async function absenden(bilder, steuer) {
      const zu = () => { try { if (steuer && steuer.schliessen) steuer.schliessen(); } catch (e) {} };

      const bytes = Object.values(bilder).reduce((n, v) => n + (v ? v.length : 0), 0);
      if (bytes > MAX_BODY_BYTES) {
        zu();
        zuruecksetzen('Die Fotos sind zusammen zu groß geworden. Bitte nimm sie noch einmal auf — am besten etwas näher dran und ohne Spiegelungen.');
        return;
      }

      zeige('busy');
      say('');
      try {
        const headers = { 'Content-Type': 'application/json' };
        const payload = { ...bilder, consent: true, consent_version: CONSENT_VERSION };
        if (handoff) payload.handoff_token = handoff;
        else headers.Authorization = 'Bearer ' + getToken();

        // Notbremse: hängt die Anfrage, darf der Kunde nicht ewig warten.
        const abbruch = new AbortController();
        const wecker = setTimeout(() => abbruch.abort(), 90000);

        let res, data;
        try {
          res  = await fetch('/api/verify-license', {
            method: 'POST', headers, body: JSON.stringify(payload), signal: abbruch.signal
          });
          data = await res.json().catch(() => ({}));
        } finally {
          clearTimeout(wecker);
        }

        zu();   // ab hier ist die Kamera-Ansicht in jedem Fall weg

        if (!res.ok)                    { zuruecksetzen(data.error || 'Die Prüfung hat nicht geklappt. Bitte versuch es noch einmal.'); return; }
        if (data.status === 'verified') { zeigeVerifiziert(data); return; }
        if (data.status === 'retry')    { zuruecksetzen(data.message); return; }

        // 'review' — ein Mensch schaut drauf
        nurMeldung();
        say(data.message || 'Wir prüfen deinen Führerschein persönlich und melden uns per E-Mail.', 'wait');
        onStatus('review');
        onVerified(null);
      } catch (e) {
        zu();
        zuruecksetzen(e && e.name === 'AbortError'
          ? 'Die Prüfung hat zu lange gedauert. Bitte versuch es noch einmal — oder schreib uns kurz, dann prüfen wir persönlich.'
          : 'Verbindung unterbrochen. Bitte versuch es noch einmal.');
      }
    }

    // ── Warten auf das Handy ────────────────────────────────────────────────
    function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

    function warteAufHandy() {
      stopPoll();
      let versuche = 0;
      pollTimer = setInterval(async () => {
        versuche++;
        if (versuche > 200) { stopPoll(); return; }        // ~10 Minuten
        try {
          const res = await fetch('/api/verify-license', { headers: { Authorization: 'Bearer ' + getToken() } });
          if (!res.ok) return;
          const info = await res.json();
          if (info.dl_status === 'verified') { zeigeVerifiziert(info); }
          else if (info.dl_status === 'review' || info.dl_status === 'rejected') { stopPoll(); refresh(); }
        } catch (e) { /* Netz kurz weg — einfach weiter versuchen */ }
      }, 3000);
    }

    // ── Startknopf ──────────────────────────────────────────────────────────
    el.start.addEventListener('click', async () => {
      if (!handoff && !getToken()) { say('Bitte melde dich zuerst an.'); return; }

      // Fallback-Weg: Fotos liegen schon vor (keine Kamera-Ansicht zu schließen)
      if (fallbackModus) { absenden({ ...shots }, null); return; }

      // Rechner ohne brauchbare Kamera → ans Handy übergeben
      if (!handoff && STCamera.istDesktop()) {
        el.start.disabled = true;
        el.start.textContent = 'Einen Moment …';
        try {
          const res = await fetch('/api/verify-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getToken() },
            body: JSON.stringify({ action: 'handoff' })
          });
          const data = await res.json();
          if (!res.ok || !data.qr) throw new Error(data.error || 'QR-Code nicht verfügbar');
          el.qrCode.innerHTML = data.qr;
          zeige('qr');
          warteAufHandy();
        } catch (e) {
          // QR ging nicht → dann eben hier, mit Kamera oder Auswahl
          el.start.disabled = false;
          el.start.textContent = 'Verifizierung starten';
          starteKamera();
        }
        return;
      }

      starteKamera();
    });

    // „Kein Handy zur Hand?" → doch am Rechner
    el.hier.addEventListener('click', () => { stopPoll(); zeige('form'); starteKamera(); });

    function starteKamera() {
      if (!STCamera.verfuegbar()) { zuFallback('Bitte wähle die drei Fotos einzeln aus.'); return; }
      STCamera.run({
        // steuer.schliessen() macht die Vollbild-Kamera zu — ohne das bliebe sie
        // über der Seite liegen und würde jede Antwort verdecken.
        onDone: (bilder, steuer) => { absenden(bilder, steuer); },
        onCancel: () => { zeige('form'); },
        onFallback: (grund) => { zuFallback(grund); }
      });
    }

    /** Status vom Server holen und Oberfläche entsprechend zeigen. */
    async function refresh() {
      let info = null;
      try {
        const url = handoff ? `/api/verify-license?t=${encodeURIComponent(handoff)}` : '/api/verify-license';
        const res = await fetch(url, handoff ? {} : { headers: { Authorization: 'Bearer ' + getToken() } });
        if (res.ok) info = await res.json();
      } catch (e) { /* offline — Formular anzeigen */ }

      const status = (info && info.dl_status) || 'unverified';
      onStatus(status);

      if (status === 'verified') { zeigeVerifiziert(info); return info; }

      stopPoll();
      zeige('form');

      if (status === 'review') {
        nurMeldung();
        say('Deine Prüfung läuft — wir schauen persönlich drauf und melden uns per E-Mail. Das dauert in der Regel nur wenige Stunden.', 'wait');
        return info;
      }
      if (status === 'rejected') {
        say((info.dl_rejected_reason ? info.dl_rejected_reason + ' ' : '') + 'Du kannst es mit besseren Fotos erneut versuchen.', 'err');
        return info;
      }
      return info;
    }

    return { refresh, showVerified: zeigeVerifiziert, stop: stopPoll };
  }

  window.STLicense = { mount };
})();
