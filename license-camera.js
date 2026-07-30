/**
 * SimpleTrailer — geführte Kamera für die Führerschein-Prüfung.
 *
 * Ein Vollbild-Ablauf, der den Kunden durch drei Aufnahmen führt:
 *   1. Vorderseite   (Rückkamera, Dokumentrahmen im Kartenformat)
 *   2. Rückseite     (Rückkamera, gleicher Rahmen)
 *   3. Selfie        (Frontkamera — schaltet AUTOMATISCH um, ovaler Gesichtsrahmen)
 *
 * Nach dem dritten Foto wird sofort abgeschickt. Kein Formular, keine
 * Datei-Auswahl, kein Nachdenken — genau ein Knopf pro Schritt.
 *
 * WARUM DUNKEL: Eine Kamera-Oberfläche gehört dunkel. Das Sucherbild tritt
 * hervor, der Rahmen ist eindeutig zu erkennen, und es blendet nicht, wenn
 * jemand abends in der Einfahrt steht. Das ist keine Abweichung vom hellen
 * Seitendesign, sondern der Kontext.
 *
 * FALLBACK: Gibt es keine Kamera oder verweigert der Nutzer den Zugriff,
 * schaltet der Ablauf lautlos auf die normale Foto-Auswahl um. Niemand
 * bleibt stecken.
 *
 * Verwendung:
 *   STCamera.run({
 *     onDone: ({front, back, selfie}) => …,   // drei Data-URLs
 *     onCancel: () => …
 *   });
 */
(function () {
  'use strict';

  const MAX_EDGE = 1600;
  const QUALITY  = 0.82;

  const SCHRITTE = [
    {
      key: 'front',
      nr: 1,
      titel: 'Vorderseite',
      hinweis: 'Die Seite mit deinem Foto — Karte ganz in den Rahmen legen.',
      facing: 'environment',
      form: 'karte'
    },
    {
      key: 'back',
      nr: 2,
      titel: 'Rückseite',
      hinweis: 'Die Seite mit der Tabelle der Fahrzeugklassen.',
      facing: 'environment',
      form: 'karte'
    },
    {
      key: 'selfie',
      nr: 3,
      titel: 'Selfie',
      hinweis: 'Gesicht in das Oval, ohne Mütze oder Sonnenbrille.',
      facing: 'user',
      form: 'oval'
    }
  ];

  const CSS = `
  .stc-overlay{position:fixed;inset:0;z-index:99999;background:#08090A;color:#fff;
    display:flex;flex-direction:column;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;
    animation:stc-in .28s cubic-bezier(.2,.8,.2,1);}
  @keyframes stc-in{from{opacity:0;transform:scale(1.015)}to{opacity:1;transform:none}}
  @keyframes stc-out{to{opacity:0}}
  .stc-overlay.closing{animation:stc-out .2s ease forwards;}

  /* ── Kopf ── */
  .stc-head{position:relative;z-index:3;display:flex;align-items:center;gap:14px;
    padding:calc(env(safe-area-inset-top,0px) + 14px) 18px 14px;}
  .stc-close{width:38px;height:38px;flex:0 0 auto;border:none;border-radius:50%;cursor:pointer;
    background:rgba(255,255,255,.10);color:#fff;font-size:1.15rem;line-height:1;
    display:flex;align-items:center;justify-content:center;transition:background .18s ease;}
  .stc-close:hover{background:rgba(255,255,255,.18);}
  .stc-steps{flex:1;display:flex;gap:6px;align-items:center;}
  .stc-dot{flex:1;height:3px;border-radius:3px;background:rgba(255,255,255,.16);overflow:hidden;}
  .stc-dot i{display:block;height:100%;width:0;background:#E85D00;border-radius:3px;
    transition:width .45s cubic-bezier(.2,.8,.2,1);}
  .stc-dot.done i{width:100%;}
  .stc-dot.now i{width:100%;background:rgba(255,255,255,.55);}
  .stc-count{flex:0 0 auto;font-size:.76rem;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.5);}

  /* ── Sucher ── */
  .stc-stage{position:relative;flex:1;overflow:hidden;background:#000;}
  .stc-stage video,.stc-stage canvas.shot{position:absolute;inset:0;width:100%;height:100%;
    object-fit:cover;display:block;}
  .stc-stage video.mirror{transform:scaleX(-1);}
  .stc-stage canvas.shot{display:none;z-index:2;}
  .stc-stage.frozen canvas.shot{display:block;}
  .stc-stage.frozen video{visibility:hidden;}

  /* Maske: alles ausserhalb des Rahmens abdunkeln */
  .stc-mask{position:absolute;inset:0;z-index:3;pointer-events:none;}
  .stc-frame{position:absolute;border:2.5px solid rgba(255,255,255,.92);
    box-shadow:0 0 0 100vmax rgba(4,5,6,.62);transition:all .4s cubic-bezier(.2,.8,.2,1);}
  .stc-frame.karte{left:6%;right:6%;top:50%;transform:translateY(-50%);
    aspect-ratio:1.586/1;border-radius:14px;}
  .stc-frame.oval{left:50%;top:47%;transform:translate(-50%,-50%);
    width:66vw;max-width:300px;aspect-ratio:.78/1;border-radius:50%;}
  /* Ecken-Winkel als Zielhilfe */
  .stc-frame.karte::before,.stc-frame.karte::after{content:'';position:absolute;width:26px;height:26px;
    border:3px solid #E85D00;}
  .stc-frame.karte::before{top:-3px;left:-3px;border-right:none;border-bottom:none;border-radius:14px 0 0 0;}
  .stc-frame.karte::after{bottom:-3px;right:-3px;border-left:none;border-top:none;border-radius:0 0 14px 0;}

  .stc-hint{position:absolute;z-index:4;left:0;right:0;bottom:16px;text-align:center;padding:0 26px;
    font-size:.86rem;line-height:1.5;color:rgba(255,255,255,.82);text-shadow:0 1px 8px rgba(0,0,0,.6);}
  .stc-title{position:absolute;z-index:4;left:0;right:0;top:16px;text-align:center;
    font-size:1.12rem;font-weight:700;letter-spacing:-.02em;text-shadow:0 1px 10px rgba(0,0,0,.7);}

  /* Bestätigungs-Haken nach der Aufnahme */
  .stc-ok{position:absolute;inset:0;z-index:5;display:none;align-items:center;justify-content:center;
    background:rgba(8,9,10,.5);}
  .stc-ok.show{display:flex;}
  .stc-ok span{width:76px;height:76px;border-radius:50%;background:#16a34a;color:#fff;
    display:flex;align-items:center;justify-content:center;font-size:2.1rem;
    animation:stc-pop .42s cubic-bezier(.2,1.5,.4,1);}
  @keyframes stc-pop{0%{transform:scale(.3);opacity:0}60%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}

  /* ── Fuss ── */
  .stc-foot{position:relative;z-index:3;display:flex;align-items:center;justify-content:center;gap:26px;
    padding:20px 20px calc(env(safe-area-inset-bottom,0px) + 26px);}
  .stc-shutter{width:74px;height:74px;border-radius:50%;border:none;cursor:pointer;background:transparent;
    display:flex;align-items:center;justify-content:center;padding:0;
    transition:transform .14s ease;-webkit-tap-highlight-color:transparent;}
  .stc-shutter::before{content:'';position:absolute;width:74px;height:74px;border-radius:50%;
    border:3px solid rgba(255,255,255,.85);}
  .stc-shutter i{width:58px;height:58px;border-radius:50%;background:#fff;transition:transform .14s ease;}
  .stc-shutter:active{transform:scale(.94);}
  .stc-shutter:active i{transform:scale(.88);}
  .stc-shutter:disabled{opacity:.4;cursor:default;}
  .stc-side{position:absolute;font-size:.84rem;color:rgba(255,255,255,.6);background:none;border:none;
    cursor:pointer;padding:10px;font-family:inherit;}
  .stc-side.left{left:22px;}
  .stc-side.right{right:22px;}
  .stc-side:hover{color:#fff;}

  /* ── Zustände ── */
  .stc-center{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:16px;text-align:center;padding:30px;background:#08090A;}
  .stc-spin{width:38px;height:38px;border:3px solid rgba(255,255,255,.16);border-top-color:#E85D00;
    border-radius:50%;animation:stc-rot .9s linear infinite;}
  @keyframes stc-rot{to{transform:rotate(360deg)}}
  .stc-center h3{font-size:1.05rem;font-weight:700;letter-spacing:-.02em;}
  .stc-center p{font-size:.87rem;line-height:1.55;color:rgba(255,255,255,.62);max-width:32ch;}
  .stc-center button{margin-top:6px;background:#E85D00;color:#fff;border:none;border-radius:11px;
    padding:13px 26px;font-weight:700;font-size:.92rem;cursor:pointer;font-family:inherit;}

  @media (min-width:900px){
    .stc-frame.karte{left:22%;right:22%;}
  }
  `;

  function css() {
    if (document.getElementById('stc-styles')) return;
    const s = document.createElement('style');
    s.id = 'stc-styles';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /** Kurzes Vibrieren, falls das Gerät (bzw. unsere App-Brücke) es kann. */
  function tap() {
    try {
      if (window.STNative && typeof window.STNative.haptic === 'function') return window.STNative.haptic('light');
      if (navigator.vibrate) navigator.vibrate(12);
    } catch (e) {}
  }

  /** Ein Videobild in eine verkleinerte JPEG-Data-URL verwandeln. */
  function grab(video, spiegeln) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) throw new Error('Kamerabild noch nicht bereit.');
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    const w = Math.round(vw * scale), h = Math.round(vh * scale);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (spiegeln) {           // Selfie zurückdrehen — sonst steht Schrift seitenverkehrt
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);
    return c.toDataURL('image/jpeg', QUALITY);
  }

  async function run(opts) {
    css();
    const onDone   = opts.onDone   || function () {};
    const onCancel = opts.onCancel || function () {};
    const onFallback = opts.onFallback || null;

    const bilder = {};
    let idx = 0, stream = null, video = null, wurzel = null, beendet = false;

    // ── Aufbau ──────────────────────────────────────────────────────────────
    wurzel = document.createElement('div');
    wurzel.className = 'stc-overlay';
    wurzel.setAttribute('role', 'dialog');
    wurzel.setAttribute('aria-label', 'Führerschein fotografieren');
    wurzel.innerHTML = `
      <div class="stc-head">
        <button class="stc-close" aria-label="Abbrechen">✕</button>
        <div class="stc-steps">
          ${SCHRITTE.map((s, i) => `<span class="stc-dot" data-dot="${i}"><i></i></span>`).join('')}
        </div>
        <span class="stc-count">1&thinsp;/&thinsp;3</span>
      </div>
      <div class="stc-stage">
        <video playsinline autoplay muted></video>
        <canvas class="shot"></canvas>
        <div class="stc-mask"><div class="stc-frame karte"></div></div>
        <div class="stc-title"></div>
        <div class="stc-hint"></div>
        <div class="stc-ok"><span>✓</span></div>
        <div class="stc-center" style="display:none;"></div>
      </div>
      <div class="stc-foot">
        <button class="stc-side left" type="button">Neu</button>
        <button class="stc-shutter" aria-label="Foto aufnehmen"><i></i></button>
      </div>
    `;
    document.body.appendChild(wurzel);
    document.body.style.overflow = 'hidden';

    const el = {
      video:   wurzel.querySelector('video'),
      stage:   wurzel.querySelector('.stc-stage'),
      shot:    wurzel.querySelector('canvas.shot'),
      frame:   wurzel.querySelector('.stc-frame'),
      titel:   wurzel.querySelector('.stc-title'),
      hinweis: wurzel.querySelector('.stc-hint'),
      ok:      wurzel.querySelector('.stc-ok'),
      center:  wurzel.querySelector('.stc-center'),
      count:   wurzel.querySelector('.stc-count'),
      shutter: wurzel.querySelector('.stc-shutter'),
      wieder:  wurzel.querySelector('.stc-side.left'),
      close:   wurzel.querySelector('.stc-close'),
      foot:    wurzel.querySelector('.stc-foot')
    };
    video = el.video;
    el.wieder.style.visibility = 'hidden';

    function zumachen() {
      if (beendet) return;
      beendet = true;
      stoppen();
      wurzel.classList.add('closing');
      setTimeout(() => { wurzel.remove(); document.body.style.overflow = ''; }, 200);
    }
    function stoppen() {
      try { if (stream) stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      stream = null;
    }
    function mitte(html) {
      el.center.style.display = 'flex';
      el.center.innerHTML = html;
      el.foot.style.visibility = 'hidden';
    }
    function mitteWeg() {
      el.center.style.display = 'none';
      el.foot.style.visibility = '';
    }

    el.close.addEventListener('click', () => { zumachen(); onCancel(); });

    // ── Kamera für einen Schritt starten ────────────────────────────────────
    async function kameraFuer(schritt) {
      stoppen();
      const wunsch = {
        video: {
          facingMode: { ideal: schritt.facing },
          width:  { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };
      try {
        stream = await navigator.mediaDevices.getUserMedia(wunsch);
      } catch (e) {
        // Manche Geräte mögen die exakte Wunschauflösung nicht — schlicht nochmal.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: schritt.facing }, audio: false });
      }
      video.srcObject = stream;
      video.classList.toggle('mirror', schritt.facing === 'user');
      await video.play().catch(() => {});
      // Warten bis wirklich Bilddaten da sind, sonst wäre die erste Aufnahme leer.
      if (!video.videoWidth) {
        await new Promise(r => {
          const t = setTimeout(r, 2500);
          video.addEventListener('loadedmetadata', () => { clearTimeout(t); r(); }, { once: true });
        });
      }
    }

    function schrittZeigen(i) {
      const s = SCHRITTE[i];
      el.titel.textContent = s.titel;
      el.hinweis.textContent = s.hinweis;
      el.frame.className = 'stc-frame ' + s.form;
      el.count.innerHTML = `${s.nr}&thinsp;/&thinsp;3`;
      wurzel.querySelectorAll('.stc-dot').forEach((d, n) => {
        d.classList.toggle('done', n < i);
        d.classList.toggle('now', n === i);
      });
      el.wieder.style.visibility = i > 0 ? '' : 'hidden';
    }

    async function zuSchritt(i) {
      idx = i;
      const s = SCHRITTE[i];
      el.stage.classList.remove('frozen');
      schrittZeigen(i);
      el.shutter.disabled = true;
      try {
        await kameraFuer(s);
        el.shutter.disabled = false;
      } catch (e) {
        // Kein Zugriff → sauber auf die einfache Foto-Auswahl zurückfallen
        stoppen();
        if (onFallback) {
          zumachen();
          onFallback(e && e.name === 'NotAllowedError'
            ? 'Kein Kamera-Zugriff — du kannst die Fotos auch einzeln auswählen.'
            : 'Die Kamera ist auf diesem Gerät nicht verfügbar — bitte wähle die Fotos einzeln aus.');
          return;
        }
        mitte(`<h3>Kamera nicht verfügbar</h3>
               <p>Bitte erlaube den Kamera-Zugriff in deinem Browser und versuch es erneut.</p>
               <button type="button" data-retry>Nochmal versuchen</button>`);
        el.center.querySelector('[data-retry]').onclick = () => { mitteWeg(); zuSchritt(i); };
      }
    }

    // ── Auslöser ────────────────────────────────────────────────────────────
    el.shutter.addEventListener('click', async () => {
      if (el.shutter.disabled) return;
      const s = SCHRITTE[idx];
      let daten;
      try {
        daten = grab(video, s.facing === 'user');
      } catch (e) {
        el.hinweis.textContent = 'Bild noch nicht scharf — bitte kurz warten und nochmal tippen.';
        return;
      }
      tap();
      bilder[s.key] = daten;

      // Aufnahme einfrieren, Haken zeigen, dann von selbst weiter
      const ctx = el.shot.getContext('2d');
      const bild = new Image();
      bild.onload = () => {
        el.shot.width = bild.width; el.shot.height = bild.height;
        ctx.drawImage(bild, 0, 0);
        el.stage.classList.add('frozen');
      };
      bild.src = daten;

      el.shutter.disabled = true;
      el.ok.classList.add('show');
      wurzel.querySelector(`[data-dot="${idx}"]`).classList.add('done');

      setTimeout(async () => {
        el.ok.classList.remove('show');
        if (idx < SCHRITTE.length - 1) {
          await zuSchritt(idx + 1);
        } else {
          stoppen();
          mitte(`<div class="stc-spin"></div>
                 <h3>Führerschein wird geprüft</h3>
                 <p>Das dauert meist unter einer Minute. Bitte die Seite nicht schließen.</p>`);
          onDone({ ...bilder }, { schliessen: zumachen, meldung: (h) => mitte(h) });
        }
      }, 620);
    });

    // ── „Neu" — den vorherigen Schritt wiederholen ──────────────────────────
    el.wieder.addEventListener('click', () => {
      if (idx === 0) return;
      delete bilder[SCHRITTE[idx].key];
      delete bilder[SCHRITTE[idx - 1].key];
      wurzel.querySelector(`[data-dot="${idx - 1}"]`).classList.remove('done');
      zuSchritt(idx - 1);
    });

    // Los geht's
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      zumachen();
      if (onFallback) onFallback('Dein Browser unterstützt keine Kamera-Aufnahme — bitte wähle die Fotos einzeln aus.');
      return;
    }
    await zuSchritt(0);
  }

  /** Kann dieses Gerät überhaupt eine Kamera öffnen? */
  function verfuegbar() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
  }

  /** Grobe Einschätzung: sitzt der Nutzer an einem Rechner ohne brauchbare Kamera? */
  function istDesktop() {
    const grob = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return !grob && Math.min(window.innerWidth, window.innerHeight) > 600;
  }

  window.STCamera = { run, verfuegbar, istDesktop };
})();
