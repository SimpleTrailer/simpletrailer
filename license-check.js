/**
 * SimpleTrailer — Führerschein-Prüfung (Frontend-Modul)
 *
 * Ersetzt das frühere Stripe-Identity-Widget. Der Kunde fotografiert Schritt für
 * Schritt Vorderseite, Rückseite und ein Selfie; die Bilder gehen an
 * /api/verify-license, wo eine KI sie prüft.
 *
 * Eingebunden in booking.html (Schritt 3) und account.html.
 *
 * Verwendung:
 *   STLicense.mount('#containerId', {
 *     getToken: () => accessToken,        // Supabase Access-Token
 *     onVerified: (info) => { ... },      // optional: läuft nach erfolgreicher Freigabe
 *     onStatus: (status) => { ... }       // optional: bei jedem Statuswechsel
 *   });
 *
 * Bilder werden vor dem Hochladen im Browser verkleinert (max. 1600 px, JPEG).
 * Das spart Datenvolumen des Kunden und hält die Anfrage klein genug für Vercel.
 */
(function () {
  'use strict';

  const MAX_EDGE = 1600;
  const QUALITY  = 0.82;

  // Version des Einwilligungstextes weiter unten. Bei JEDER Textänderung
  // hochzählen — sie wird serverseitig als Nachweis gespeichert und muss zur
  // Konstante CONSENT_VERSION in api/verify-license.js passen.
  const CONSENT_VERSION = 'dl-bio-2026-07-30';

  // Vercel nimmt maximal ~4,5 MB Body an. Drei Bilder als Base64 sind rund
  // ein Drittel groesser als die Rohdaten — deshalb hier eine eigene Grenze,
  // damit der Kunde eine verstaendliche Meldung bekommt statt eines 413.
  const MAX_BODY_BYTES = 3.5 * 1024 * 1024;

  const STEPS = [
    {
      key: 'front',
      title: 'Vorderseite',
      hint: 'Die Seite mit deinem Foto. Alle vier Ecken müssen im Bild sein.',
      capture: 'environment',
      icon: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8" cy="11" r="2.2"/><path d="M13 10h6M13 14h4"/>'
    },
    {
      key: 'back',
      title: 'Rückseite',
      hint: 'Die Seite mit der Tabelle der Fahrzeugklassen.',
      capture: 'environment',
      icon: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M6 9h12M6 12.5h12M6 16h8"/>'
    },
    {
      key: 'selfie',
      title: 'Selfie',
      hint: 'Gesicht gut ausgeleuchtet, ohne Mütze oder Sonnenbrille.',
      capture: 'user',
      icon: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/>'
    }
  ];

  const CSS = `
  .stl-wrap{--stl-accent:#E85D00;}
  .stl-intro{font-size:.86rem;line-height:1.6;color:var(--gray,#8a8a8a);margin:0 0 18px;}
  .stl-facts{display:flex;flex-direction:column;gap:7px;font-size:.8rem;color:var(--gray,#8a8a8a);
    background:var(--s2,#111);border:1px solid var(--border,#2a2a2a);border-radius:11px;padding:13px 15px;margin-bottom:18px;}
  .stl-facts b{color:var(--text,#111);font-weight:650;}
  .stl-steps{display:flex;flex-direction:column;gap:11px;margin-bottom:18px;}
  .stl-step{display:flex;align-items:center;gap:13px;position:relative;
    background:var(--s2,#111);border:1.5px solid var(--border,#2a2a2a);border-radius:13px;padding:13px 15px;
    cursor:pointer;transition:border-color .18s ease,background .18s ease,transform .18s ease;}
  .stl-step:hover{border-color:var(--stl-accent);transform:translateY(-1px);}
  .stl-step:active{transform:translateY(0);}
  .stl-step input{position:absolute;inset:0;opacity:0;cursor:pointer;}
  .stl-num{flex:0 0 auto;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;
    background:var(--s3,#1c1c1c);border:1px solid var(--border,#2a2a2a);font-size:.82rem;font-weight:750;color:var(--gray,#888);
    transition:background .18s ease,color .18s ease,border-color .18s ease;}
  .stl-step.done .stl-num{background:#16a34a;border-color:#16a34a;color:#fff;}
  .stl-step.done{border-color:#86efac;}
  .stl-body{flex:1;min-width:0;}
  .stl-title{font-size:.93rem;font-weight:700;letter-spacing:-.01em;margin-bottom:2px;}
  .stl-hint{font-size:.77rem;line-height:1.45;color:var(--gray,#888);}
  .stl-thumb{flex:0 0 auto;width:52px;height:36px;border-radius:7px;object-fit:cover;border:1px solid var(--border,#2a2a2a);display:none;}
  .stl-step.done .stl-thumb{display:block;}
  .stl-svg{flex:0 0 auto;color:var(--gray,#777);}
  .stl-step.done .stl-svg{display:none;}
  .stl-msg{font-size:.83rem;line-height:1.55;border-radius:11px;padding:12px 14px;margin-bottom:16px;display:none;}
  .stl-msg.err{background:rgba(220,38,38,.08);border:1px solid rgba(220,38,38,.32);color:#dc2626;}
  .stl-msg.ok{background:rgba(22,163,74,.09);border:1px solid rgba(22,163,74,.3);color:#15803d;}
  .stl-msg.wait{background:rgba(232,93,0,.08);border:1px solid rgba(232,93,0,.28);color:#a34400;}
  .stl-busy{display:none;flex-direction:column;align-items:center;gap:13px;text-align:center;padding:26px 10px;}
  .stl-spin{width:34px;height:34px;border:3px solid var(--border,#2a2a2a);border-top-color:var(--stl-accent);
    border-radius:50%;animation:stl-spin 1s linear infinite;}
  @keyframes stl-spin{to{transform:rotate(360deg)}}
  .stl-busy-t{font-size:.93rem;font-weight:650;}
  .stl-busy-s{font-size:.8rem;color:var(--gray,#888);max-width:34ch;line-height:1.5;}
  /* Eigene Einwilligungs-Zeile statt .agb-row — die gibt es nur in booking.html,
     das Widget läuft aber auch im Kundenkonto. */
  .stl-consent{display:flex;align-items:flex-start;gap:13px;cursor:pointer;
    padding:15px 16px;margin-bottom:15px;
    background:var(--s2,#111);border:1.5px solid var(--border,#2a2a2a);border-radius:12px;
    transition:border-color .18s ease;}
  .stl-consent:hover{border-color:var(--stl-accent);}
  .stl-consent input{flex:0 0 auto;width:20px;height:20px;margin:1px 0 0;accent-color:var(--stl-accent);cursor:pointer;}
  .stl-consent-t{font-size:.79rem;line-height:1.55;color:var(--gray,#8a8a8a);}
  .stl-done{display:none;gap:14px;align-items:flex-start;}
  .stl-done-ic{width:42px;height:42px;border-radius:50%;background:#22c55e;color:#fff;flex:0 0 auto;
    display:flex;align-items:center;justify-content:center;font-size:1.35rem;}
  @media(max-width:420px){ .stl-hint{display:none} .stl-step{padding:14px} }
  `;

  function injectCss() {
    if (document.getElementById('stl-styles')) return;
    const s = document.createElement('style');
    s.id = 'stl-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /** Bild verkleinern + als JPEG-DataURL zurückgeben. */
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

  function mount(target, opts) {
    injectCss();
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!root) return null;

    const getToken  = opts.getToken || (() => null);
    const onVerified = opts.onVerified || function () {};
    const onStatus   = opts.onStatus   || function () {};

    const shots = { front: null, back: null, selfie: null };

    root.classList.add('stl-wrap');
    root.innerHTML = `
      <div class="stl-form">
        <p class="stl-intro">
          Einmalig vor deiner ersten Buchung prüfen wir deinen Führerschein. Drei Fotos genügen —
          die Prüfung läuft direkt danach und dauert meist unter einer Minute.
        </p>
        <div class="stl-facts">
          <span>📄 <b>Klasse B oder BE</b> — für PKW-Anhänger nötig</span>
          <span>🔒 <b>Privat gespeichert</b> — nach der Prüfung sofort gelöscht</span>
          <span>↻ <b>Nur einmal</b> — bei allen weiteren Buchungen entfällt der Check</span>
        </div>
        <div class="stl-msg" id="stlMsg"></div>
        <div class="stl-steps">
          ${STEPS.map((s, i) => `
            <label class="stl-step" data-key="${s.key}">
              <input type="file" accept="image/*" capture="${s.capture}" data-key="${s.key}">
              <span class="stl-num" data-num="${s.key}">${i + 1}</span>
              <span class="stl-body">
                <span class="stl-title">${s.title}</span>
                <span class="stl-hint">${s.hint}</span>
              </span>
              <img class="stl-thumb" data-thumb="${s.key}" alt="">
              <svg class="stl-svg" width="21" height="21" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
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
        <button class="btn btn-orange" id="stlSubmit" disabled>Führerschein prüfen lassen</button>
      </div>

      <div class="stl-busy" id="stlBusy">
        <div class="stl-spin"></div>
        <div class="stl-busy-t">Führerschein wird geprüft …</div>
        <div class="stl-busy-s">Das dauert meist unter einer Minute. Bitte die Seite nicht schließen.</div>
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
      form:   root.querySelector('.stl-form'),
      busy:   root.querySelector('#stlBusy'),
      done:   root.querySelector('#stlDone'),
      doneIn: root.querySelector('#stlDoneInfo'),
      msg:    root.querySelector('#stlMsg'),
      submit: root.querySelector('#stlSubmit'),
      consent: root.querySelector('#stlConsent')
    };

    function say(text, kind) {
      if (!text) { el.msg.style.display = 'none'; return; }
      el.msg.className = 'stl-msg ' + (kind || 'err');
      el.msg.textContent = text;
      el.msg.style.display = 'block';
    }

    function refreshSubmit() {
      const all = STEPS.every(s => shots[s.key]);
      el.submit.disabled = !(all && el.consent.checked);
    }

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
        refreshSubmit();
      });
    });

    el.consent.addEventListener('change', refreshSubmit);

    function showBusy(on) {
      el.form.style.display = on ? 'none' : '';
      el.busy.style.display = on ? 'flex' : 'none';
    }

    function showVerified(info) {
      el.form.style.display = 'none';
      el.busy.style.display = 'none';
      el.done.style.display = 'flex';
      const klass = (info && info.dl_classes && info.dl_classes.length) ? info.dl_classes.join(', ') : 'B';
      const exp   = info && info.dl_expires_at
        ? new Date(info.dl_expires_at).toLocaleDateString('de-DE') : null;
      el.doneIn.innerHTML = `Klasse <strong>${klass}</strong>${exp ? ` · gültig bis <strong>${exp}</strong>` : ''}`;
      onStatus('verified');
      onVerified(info || {});
    }

    function resetForRetry(message) {
      STEPS.forEach(s => {
        shots[s.key] = null;
        const step = root.querySelector(`.stl-step[data-key="${s.key}"]`);
        step.classList.remove('done');
        step.querySelector('input').value = '';
      });
      STEPS.forEach((s, i) => { root.querySelector(`[data-num="${s.key}"]`).textContent = String(i + 1); });
      showBusy(false);
      refreshSubmit();
      say(message, 'err');
    }

    el.submit.addEventListener('click', async () => {
      const token = getToken();
      if (!token) { say('Bitte melde dich zuerst an.'); return; }

      // Zu grosse Fotos vorher abfangen — sonst antwortet Vercel mit einem
      // nackten 413 und der Kunde sieht nur eine nichtssagende Fehlermeldung.
      const totalBytes = STEPS.reduce((n, s) => n + (shots[s.key] ? shots[s.key].length : 0), 0);
      if (totalBytes > MAX_BODY_BYTES) {
        say('Die Fotos sind zusammen zu groß. Bitte fotografiere sie noch einmal — am besten direkt mit der Kamera statt aus der Galerie.');
        return;
      }

      showBusy(true);
      say('');
      try {
        // consent + Textversion mitschicken: der Server prüft sie und protokolliert
        // sie als Nachweis nach Art. 7 Abs. 1 DSGVO. Ohne das lehnt er ab.
        const res = await fetch('/api/verify-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ ...shots, consent: true, consent_version: CONSENT_VERSION })
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          resetForRetry(data.error || 'Die Prüfung hat nicht geklappt. Bitte versuch es noch einmal.');
          return;
        }

        if (data.status === 'verified') { showVerified(data); return; }

        if (data.status === 'retry') { resetForRetry(data.message); return; }

        // 'review' — ein Mensch schaut drauf
        showBusy(false);
        el.form.style.display = 'none';
        say(data.message || 'Wir prüfen deinen Führerschein persönlich und melden uns per E-Mail.', 'wait');
        onStatus('review');
        onVerified(null);   // Seite darf ihren Folgezustand aktualisieren

      } catch (e) {
        resetForRetry('Verbindung unterbrochen. Bitte versuch es noch einmal.');
      }
    });

    /** Status vom Server holen und Oberfläche entsprechend zeigen. */
    async function refresh() {
      const token = getToken();
      if (!token) return null;
      let info = null;
      try {
        const res = await fetch('/api/verify-license', { headers: { Authorization: 'Bearer ' + token } });
        if (res.ok) info = await res.json();
      } catch (e) { /* offline — Formular anzeigen */ }

      const status = (info && info.dl_status) || 'unverified';
      onStatus(status);

      if (status === 'verified') { showVerified(info); return info; }

      el.done.style.display = 'none';
      showBusy(false);

      if (status === 'review') {
        el.form.style.display = 'none';
        say('Deine Prüfung läuft — wir schauen persönlich drauf und melden uns per E-Mail. Das dauert in der Regel nur wenige Stunden.', 'wait');
        return info;
      }
      if (status === 'rejected') {
        el.form.style.display = '';
        say((info.dl_rejected_reason ? info.dl_rejected_reason + ' ' : '') + 'Du kannst es mit besseren Fotos erneut versuchen.', 'err');
        return info;
      }
      el.form.style.display = '';
      return info;
    }

    return { refresh, showVerified };
  }

  window.STLicense = { mount };
})();
