/**
 * Simply – SimpleTrailer Chat-Assistent
 * Floating-Button + Chat-Window. Nutzt /api/chat (Anthropic Claude).
 *
 * Einbindung:  <script src="/chat-widget.js" defer></script>
 *
 * KEINE Dependencies. KEIN Build-Step. Pures Vanilla-JS.
 */
(function () {
  if (window.__simpletrailerChatLoaded) return;
  window.__simpletrailerChatLoaded = true;

  const STORAGE_KEY = 'st_chat_history_v2';   // v2: cache invalidation nach Branding-Update
  const WELCOME = "Hey, ich bin **Simply** 👋 dein Anhänger-Assistent von SimpleTrailer.\n\nIch helfe dir bei allem rund um Mieten, Preisen oder Buchung — und kann dich direkt zur passenden Buchung weiterleiten. Was brauchst du?";
  const QUICK_REPLIES = [
    'Anhänger fürs Wochenende',
    'Was kostet ein Tag?',
    'Welchen Führerschein brauche ich?',
    'Wie läuft die Abholung?'
  ];

  // ===== Styles ====================================================
  const css = `
  .stc-fab {
    position: fixed; bottom: 14px; right: 14px;
    width: 92px; height: auto;
    touch-action: none;
    background: transparent; border: none; padding: 0;
    cursor: pointer;
    z-index: 99998;
    transition: transform .2s;
    transform-origin: 50% 100%;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .stc-fab img {
    width: 100%; height: auto; display: block;
    filter: drop-shadow(0 12px 20px rgba(0,0,0,0.55)) drop-shadow(0 0 20px rgba(232,93,0,0.22));
    pointer-events: none;
    animation: stc-bob 3.8s ease-in-out infinite;
  }
  .stc-fab.stc-overlay-hidden { display: none !important; }
  .stc-fab.stc-dragging { cursor: grabbing; transition: none; }

  /* Rueckruf-Formular (Popup) */
  .stc-hf-overlay {
    position: fixed; inset: 0; z-index: 100001;
    display: none; align-items: center; justify-content: center;
    background: rgba(0,0,0,.7); backdrop-filter: blur(6px);
    padding: 18px;
  }
  .stc-hf-overlay.open { display: flex; }
  .stc-hf-card {
    position: relative;
    width: 100%; max-width: 400px;
    background: #161616; border: 1px solid #2e2e2e;
    border-radius: 18px; padding: 22px;
    color: #fff; font-family: 'Inter', system-ui, sans-serif;
    box-shadow: 0 24px 64px rgba(0,0,0,.6);
    animation: stc-slideUp .25s cubic-bezier(.16,1,.3,1);
    max-height: 92dvh; overflow-y: auto;
  }
  .stc-hf-close {
    position: absolute; top: 10px; right: 12px;
    background: rgba(255,255,255,.08); border: none; color: #aaa;
    width: 30px; height: 30px; border-radius: 50%;
    font-size: 1.15rem; cursor: pointer; line-height: 1;
  }
  .stc-hf-close:hover { color: #fff; background: rgba(255,255,255,.16); }
  .stc-hf-title { font-weight: 800; font-size: 1.08rem; margin: 0 0 6px; letter-spacing: -.01em; }
  .stc-hf-sub { color: #999; font-size: .8rem; line-height: 1.5; margin: 0 0 16px; }
  .stc-hf-label { display: block; font-size: .72rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #888; margin: 12px 0 5px; }
  .stc-hf-input {
    width: 100%; box-sizing: border-box;
    background: #0D0D0D; border: 1.5px solid #2e2e2e; border-radius: 10px;
    color: #fff; padding: 11px 12px; font-size: 16px; font-family: inherit;
    outline: none; transition: border-color .15s;
  }
  .stc-hf-input:focus { border-color: #E85D00; }
  textarea.stc-hf-input { resize: vertical; min-height: 70px; }
  .stc-hf-err { color: #f87171; font-size: .8rem; min-height: 1.2em; margin: 10px 0 4px; }
  .stc-hf-submit {
    width: 100%; background: linear-gradient(135deg, #E85D00, #FF6A00);
    color: #fff; border: none; border-radius: 11px;
    padding: 14px; font-weight: 800; font-size: .98rem; font-family: inherit;
    cursor: pointer; transition: transform .15s, box-shadow .15s;
    box-shadow: 0 4px 14px rgba(232,93,0,.35);
  }
  .stc-hf-submit:hover { transform: translateY(-1px); }
  .stc-hf-submit:disabled { opacity: .7; cursor: wait; transform: none; }
  @media (max-width: 480px) {
    .stc-hf-overlay { align-items: flex-end; padding: 0; }
    .stc-hf-card { max-width: none; border-radius: 20px 20px 0 0; }
  }
  .stc-fab:hover { transform: scale(1.06); }
  .stc-fab:active { transform: scale(0.97); }
  .stc-fab:focus-visible { outline: 2px solid #FF8C42; outline-offset: 6px; border-radius: 14px; }
  .stc-fab.hidden { display: none; }
  /* Simply wippt sanft auf seiner Federung */
  @keyframes stc-bob {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-4px); }
  }
  .stc-fab-badge {
    position: absolute; top: 0; right: 12px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #22c55e; border: 2.5px solid #0D0D0D;
    box-shadow: 0 0 0 0 rgba(34,197,94,0.5);
    animation: stc-badge-pulse 2s ease-in-out infinite;
  }
  @keyframes stc-badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
    50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
  }

  /* Sprechblase nach 10s — kommt aus Simplys Mund */
  .stc-tooltip {
    position: fixed;
    bottom: 124px; right: 40px;
    max-width: 280px;
    background: #fff;
    color: #0D0D0D;
    padding: 14px 18px;
    border-radius: 16px 16px 4px 16px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(232,93,0,0.08);
    z-index: 99997;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.92rem;
    line-height: 1.4;
    font-weight: 500;
    opacity: 0;
    transform: translateY(8px) scale(0.96);
    pointer-events: none;
    transition: opacity .35s cubic-bezier(0.16, 1, 0.3, 1), transform .35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .stc-tooltip.show {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
  }
  .stc-tooltip strong { color: #E85D00; font-weight: 700; }
  .stc-tooltip .stc-tooltip-close {
    position: absolute;
    top: 6px; right: 8px;
    background: transparent; border: none;
    color: #888; font-size: 1.1rem; cursor: pointer;
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    line-height: 1; padding: 0;
  }
  .stc-tooltip .stc-tooltip-close:hover { color: #0D0D0D; }
  .stc-tooltip-arrow {
    position: absolute;
    bottom: -8px; right: 20px;
    width: 16px; height: 16px;
    background: #fff;
    transform: rotate(45deg);
    border-radius: 0 0 4px 0;
    box-shadow: 4px 4px 8px rgba(0,0,0,0.06);
  }

  /* Aufgeregter Hüpfer während der Attention-Phase — Simply will was sagen */
  .stc-fab.attention img {
    animation: stc-wiggle 1.2s ease-in-out 3;
    transform-origin: 50% 100%;
  }
  @keyframes stc-wiggle {
    0%, 100% { transform: rotate(0deg) translateY(0); }
    15%      { transform: rotate(-3deg) translateY(-7px); }
    30%      { transform: rotate(2.5deg) translateY(-2px); }
    45%      { transform: rotate(-2deg) translateY(-6px); }
    65%      { transform: rotate(1.5deg) translateY(0); }
    82%      { transform: rotate(-1deg) translateY(-2px); }
  }

  /* Barrierefreiheit: keine Dauer-Bewegung wenn der User das so eingestellt hat */
  @media (prefers-reduced-motion: reduce) {
    .stc-fab img, .stc-fab.attention img, .stc-fab-badge { animation: none !important; }
  }

  /* Mobile: Tooltip etwas kompakter */
  @media (max-width: 600px) {
    .stc-tooltip { max-width: calc(100vw - 110px); font-size: 0.85rem; padding: 12px 14px; bottom: 102px; right: 32px; }
    .stc-tooltip-arrow { right: 16px; }
  }

  .stc-window {
    position: fixed; bottom: 96px; right: 20px;
    width: 460px; max-width: calc(100vw - 32px);
    height: 760px; max-height: calc(100vh - 60px);
    background: #0F0F10;
    border: 1px solid #2A2A2C;
    border-radius: 22px;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
    display: none; flex-direction: column;
    z-index: 99999;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #fff;
    overflow: hidden;
    animation: stc-slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .stc-window.open { display: flex; }
  @keyframes stc-slideUp {
    from { opacity: 0; transform: translateY(16px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  /* Scroll-Chaining verhindern — wenn man im Chat scrollt, scrollt NICHT die Webseite mit */
  .stc-window, .stc-messages {
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  /* Mobile: Bottom-Sheet (kein Vollbild) — Webseite oben weiterhin sichtbar */
  @media (max-width: 600px) {
    .stc-window {
      bottom: 0; right: 0; left: 0; top: auto;
      width: 100%; max-width: none;
      height: 95dvh;
      max-height: 95dvh;
      border-radius: 24px 24px 0 0;
      border: none;
      border-top: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 -16px 50px rgba(0,0,0,0.7), 0 -1px 0 rgba(255,255,255,0.05);
      animation: stc-slideUpMobile 0.32s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes stc-slideUpMobile {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    .stc-fab { bottom: 12px; right: 12px; width: 76px; }
    /* Drag-Handle oben — prominenter als Popup-Hinweis */
    .stc-window::before {
      content: ''; position: absolute; top: 10px; left: 50%;
      transform: translateX(-50%);
      width: 44px; height: 5px; border-radius: 3px;
      background: rgba(255,255,255,0.35);
      z-index: 10; pointer-events: none;
    }
    .stc-header { padding-top: 26px; }
  }

  /* Backdrop hinter dem Window auf Mobile (klickbar zum Schliessen) */
  .stc-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    z-index: 99997;
    opacity: 0;
    transition: opacity 0.25s ease;
  }
  .stc-backdrop.open { display: block; opacity: 1; }
  @media (min-width: 601px) { .stc-backdrop { display: none !important; } }

  /* Wenn Chat offen ist auf Mobile: Body nicht scrollbar */
  body.stc-locked { overflow: hidden !important; position: fixed !important; width: 100% !important; }

  .stc-header {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 18px;
    background: linear-gradient(135deg, #E85D00, #FF8C42);
    flex-shrink: 0;
    position: relative;
  }
  .stc-header::after {
    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px;
    background: rgba(0,0,0,0.2);
  }
  .stc-avatar {
    width: 38px; height: 38px; border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    flex-shrink: 0;
    overflow: hidden;
  }
  .stc-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .stc-header-text { flex: 1; min-width: 0; }
  .stc-header-text strong { display: block; font-size: .98rem; font-weight: 700; letter-spacing: -.01em; }
  .stc-header-text small { display: flex; align-items: center; font-size: .72rem; opacity: 0.92; margin-top: 2px; }
  .stc-status-dot {
    display: inline-block; width: 8px; height: 8px; border-radius: 50%;
    background: #4ade80; margin-right: 6px;
    box-shadow: 0 0 6px rgba(74,222,128,0.6);
  }
  .stc-close {
    background: rgba(255,255,255,0.18); border: none; color: #fff;
    width: 32px; height: 32px; border-radius: 50%;
    cursor: pointer; font-size: 1.2rem;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
    line-height: 1;
  }
  .stc-close:hover { background: rgba(255,255,255,0.3); }

  .stc-messages {
    flex: 1; overflow-y: auto;
    padding: 20px 16px;
    display: flex; flex-direction: column; gap: 14px;
    scroll-behavior: smooth;
    background: #0F0F10;
  }
  .stc-messages::-webkit-scrollbar { width: 6px; }
  .stc-messages::-webkit-scrollbar-thumb { background: #2A2A2C; border-radius: 3px; }
  .stc-messages::-webkit-scrollbar-track { background: transparent; }

  .stc-msg-row { display: flex; gap: 8px; align-items: flex-end; }
  .stc-msg-row.user { justify-content: flex-end; }
  .stc-msg-avatar {
    width: 26px; height: 26px; border-radius: 50%;
    background: #fff; flex-shrink: 0;
    overflow: hidden;
    border: 1px solid #2A2A2C;
  }
  .stc-msg-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .stc-msg {
    max-width: 78%;
    padding: 10px 14px; border-radius: 16px;
    line-height: 1.5; font-size: .92rem;
    word-wrap: break-word;
  }
  .stc-msg.user {
    background: linear-gradient(135deg, #E85D00, #FF6A00);
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .stc-msg.bot {
    background: #1B1B1D;
    color: #ECECEE;
    border: 1px solid #2A2A2C;
    border-bottom-left-radius: 4px;
  }
  .stc-msg.bot.error { border-color: #ef4444; color: #fca5a5; }

  /* Markdown */
  .stc-msg strong, .stc-msg b { font-weight: 700; color: #fff; }
  .stc-msg em, .stc-msg i { font-style: italic; }
  .stc-msg code {
    background: rgba(232,93,0,0.15); color: #FF8C42;
    padding: 1px 6px; border-radius: 4px;
    font-family: 'SF Mono', Monaco, Consolas, monospace;
    font-size: .85em;
  }
  .stc-msg ul, .stc-msg ol {
    margin: 6px 0; padding-left: 20px;
  }
  .stc-msg li { margin: 2px 0; }
  .stc-msg a {
    color: #FF8C42; text-decoration: underline; text-decoration-color: rgba(255,140,66,0.4);
    text-underline-offset: 2px;
  }
  .stc-msg a:hover { text-decoration-color: #FF8C42; }
  .stc-msg p + p { margin-top: 8px; }

  /* CTA-Button (vom Bot generiert) */
  .stc-msg .stc-cta {
    display: inline-flex; align-items: center; gap: 6px;
    background: linear-gradient(135deg, #E85D00, #FF8C42);
    color: #fff !important;
    padding: 10px 18px;
    border-radius: 10px;
    font-weight: 700; font-size: .88rem;
    text-decoration: none !important;
    margin-top: 10px;
    box-shadow: 0 4px 12px rgba(232,93,0,0.3);
    transition: transform .15s, box-shadow .15s;
  }
  .stc-msg .stc-cta:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(232,93,0,0.45);
  }

  .stc-typing { display: inline-flex; align-items: center; gap: 4px; padding: 4px 0; }
  .stc-typing span {
    width: 7px; height: 7px; border-radius: 50%; background: #888;
    animation: stc-blink 1.2s infinite;
  }
  .stc-typing span:nth-child(2) { animation-delay: 0.2s; }
  .stc-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes stc-blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }

  .stc-quick {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 0 16px 12px;
    flex-shrink: 0;
  }
  .stc-quick button {
    background: #1B1B1D; border: 1px solid #2A2A2C; color: #BCBCBE;
    padding: 9px 13px; border-radius: 18px; cursor: pointer;
    font-size: .78rem; font-family: inherit;
    transition: all .15s;
  }
  .stc-quick button:hover {
    background: #232325; border-color: #E85D00; color: #fff;
    transform: translateY(-1px);
  }

  .stc-input-row {
    display: flex; gap: 8px; padding: 14px;
    border-top: 1px solid #232325;
    background: #0F0F10;
    flex-shrink: 0;
  }
  .stc-input {
    flex: 1; background: #1B1B1D; border: 1.5px solid #2A2A2C;
    color: #fff; padding: 11px 16px; border-radius: 22px;
    font-size: .92rem; font-family: inherit;
    outline: none;
    transition: border-color .15s;
  }
  .stc-input:focus { border-color: #E85D00; }
  .stc-input::placeholder { color: #666; }
  .stc-input:disabled { opacity: 0.5; }

  .stc-send {
    background: linear-gradient(135deg, #E85D00, #FF6A00); border: none; color: #fff;
    width: 42px; height: 42px; border-radius: 50%;
    cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: transform .15s, box-shadow .15s;
    box-shadow: 0 2px 8px rgba(232,93,0,0.3);
  }
  .stc-send:hover { transform: scale(1.05); box-shadow: 0 4px 12px rgba(232,93,0,0.45); }
  .stc-send:active { transform: scale(0.95); }
  .stc-send:disabled { background: #333; cursor: not-allowed; box-shadow: none; transform: none; }
  .stc-send svg { width: 18px; height: 18px; }

  .stc-footer {
    text-align: center; padding: 6px 0 8px;
    font-size: .65rem; color: #555;
    background: #0F0F10;
    flex-shrink: 0;
    letter-spacing: .02em;
  }
  .stc-footer span { color: #888; }
  /* "Mit Mensch sprechen" — dezent default, prominenter wenn .escalate gesetzt */
  .stc-human {
    padding: 8px 16px; background: #0F0F10;
    border-top: 1px solid #222;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    font-size: .75rem; color: #888;
    flex-shrink: 0;
    transition: background .25s, border-color .25s;
  }
  .stc-human a {
    color: #E85D00; text-decoration: none; font-weight: 600; white-space: nowrap;
  }
  .stc-human a:hover { color: #FF8C42; }
  .stc-human.escalate {
    background: linear-gradient(135deg,#1a0d00,#0F0F10);
    border-top-color: #E85D00;
    color: #ddd;
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ===== DOM ========================================================
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="stc-backdrop" id="stcBackdrop"></div>
    <button class="stc-fab" id="stcFab" aria-label="Chat öffnen" title="Frag Simply – dein Anhänger-Assistent">
      <img src="/simply-mascot.webp" alt="" width="640" height="485" loading="lazy" decoding="async">
      <span class="stc-fab-badge"></span>
    </button>
    <div class="stc-window" id="stcWin" role="dialog" aria-label="Simply Chat">
      <div class="stc-header">
        <div class="stc-avatar"><img src="/simply-face.webp" alt="" loading="lazy" decoding="async"></div>
        <div class="stc-header-text">
          <strong>Simply</strong>
          <small><span class="stc-status-dot"></span>Online · meist sofortige Antwort</small>
        </div>
        <button class="stc-close" id="stcClose" aria-label="Schließen">×</button>
      </div>
      <div class="stc-messages" id="stcMessages"></div>
      <div class="stc-quick" id="stcQuick"></div>
      <div class="stc-input-row">
        <input class="stc-input" id="stcInput" type="text" placeholder="Frag Simply alles..." maxlength="500" />
        <button class="stc-send" id="stcSend" aria-label="Senden">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="stc-human" id="stcHuman">
        <span>Lieber mit einem Menschen sprechen?</span>
        <a href="#" id="stcHumanLink">Direkt schreiben →</a>
      </div>
      <div class="stc-footer">KI-gestützt · <span>powered by Claude</span></div>
    </div>
  `;
  document.body.appendChild(root);

  const fab        = document.getElementById('stcFab');
  const win        = document.getElementById('stcWin');
  const backdrop   = document.getElementById('stcBackdrop');
  const closeBtn   = document.getElementById('stcClose');
  const messagesEl = document.getElementById('stcMessages');
  const quickEl    = document.getElementById('stcQuick');
  const inputEl    = document.getElementById('stcInput');
  const sendBtn    = document.getElementById('stcSend');

  // ===== State ======================================================
  let history = [];
  try { history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) {}
  let isStreaming = false;

  // ===== Markdown renderer (sicher, escaped) ========================
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function renderMarkdown(text) {
    // 1. Escape ALL HTML first
    let s = escapeHtml(text);

    // 2. Code spans `…`
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 3. Bold **…** (vor italic, sonst Konflikt)
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

    // 4. Italic *…* (nur wenn nicht in **)
    s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

    // 5. Booking-CTA-Links: spezielles Format [Jetzt buchen →](booking-url)
    //    werden als Buttons gerendert
    s = s.replace(/\[([^\]]+)\]\((\/booking[^\s)]*)\)/g, '<a href="$2" class="stc-cta">$1</a>');

    // 6. Normal Markdown-Links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/\[([^\]]+)\]\((\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

    // 7. Auto-Link bare URLs
    s = s.replace(/(^|[^"'>])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    s = s.replace(/(^|[^"'>\/])(simpletrailer\.de[a-zA-Z0-9\-_/.]*)/g, '$1<a href="https://$2" target="_blank" rel="noopener">$2</a>');
    s = s.replace(/\b(info@simpletrailer\.de)\b/g, '<a href="mailto:$1">$1</a>');

    // 8. Lists — Zeilen die mit "- " oder "* " beginnen
    const lines = s.split('\n');
    const out = [];
    let inList = false;
    for (const line of lines) {
      const m = line.match(/^[-*]\s+(.+)$/);
      if (m) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push('<li>' + m[1] + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(line);
      }
    }
    if (inList) out.push('</ul>');
    s = out.join('\n');

    // 9. Paragraphs / Line-Breaks
    s = s.replace(/\n\n+/g, '</p><p>');
    s = s.replace(/\n/g, '<br>');
    if (!/^<(ul|ol|p)/.test(s)) s = '<p>' + s + '</p>';
    // Cleanup: <p> direkt vor <ul> entfernen
    s = s.replace(/<p>(<ul>)/g, '$1').replace(/(<\/ul>)<\/p>/g, '$1');
    s = s.replace(/<p><\/p>/g, '').replace(/<p><br>/g, '<p>');

    return s;
  }

  // ===== Render =====================================================
  function renderMessages() {
    messagesEl.innerHTML = '';
    if (history.length === 0) {
      addMessageDom('bot', WELCOME);
    } else {
      history.forEach(m => addMessageDom(m.role, m.content));
    }
  }
  function addMessageDom(role, text, opts = {}) {
    const row = document.createElement('div');
    row.className = 'stc-msg-row ' + role;

    if (role === 'bot') {
      const av = document.createElement('div');
      av.className = 'stc-msg-avatar';
      av.innerHTML = '<img src="/simply-face.webp" alt="" loading="lazy" decoding="async">';
      row.appendChild(av);
    }

    const div = document.createElement('div');
    div.className = 'stc-msg ' + role + (opts.error ? ' error' : '');
    div.innerHTML = renderMarkdown(text);
    row.appendChild(div);

    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }
  function renderQuickReplies() {
    quickEl.innerHTML = '';
    if (history.length > 1) return;
    QUICK_REPLIES.forEach(text => {
      const btn = document.createElement('button');
      btn.textContent = text;
      btn.addEventListener('click', () => { sendMessage(text); });
      quickEl.appendChild(btn);
    });
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20))); } catch (e) {}
  }

  // ===== Streaming Send =============================================
  // ===== Rueckruf-Formular (Popup): "Lieber mit einem Menschen sprechen" =====
  // Oeffnet ein kleines Kontaktformular ueber dem Chat. Der bisherige
  // Simply-Verlauf wird (transparent angekuendigt) mitgesendet, damit
  // Lion/Samuel den Kontext sehen.
  let humanFormEl = null;

  function chatTranscript() {
    return (history || []).slice(-12)
      .map(m => (m.role === 'user' ? 'Kunde: ' : 'Simply: ') + (typeof m.content === 'string' ? m.content : ''))
      .join('\n');
  }

  function buildHumanForm() {
    if (humanFormEl) return humanFormEl;
    const wrap = document.createElement('div');
    wrap.className = 'stc-hf-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Rückruf anfordern');
    wrap.innerHTML = `
      <div class="stc-hf-card">
        <button type="button" class="stc-hf-close" aria-label="Schließen">×</button>
        <p class="stc-hf-title">📞 Wir rufen dich zurück</p>
        <p class="stc-hf-sub">Meist innerhalb weniger Stunden (werktags). Dein bisheriger Chat mit Simply wird mitgesendet, damit wir direkt im Thema sind.</p>
        <label class="stc-hf-label" for="stcHfName">Dein Name *</label>
        <input class="stc-hf-input" id="stcHfName" type="text" maxlength="120" autocomplete="name" placeholder="Vor- und Nachname" />
        <label class="stc-hf-label" for="stcHfPhone">Telefonnummer *</label>
        <input class="stc-hf-input" id="stcHfPhone" type="tel" maxlength="40" inputmode="tel" autocomplete="tel" placeholder="z.B. 0151 1234567" />
        <label class="stc-hf-label" for="stcHfMail">E-Mail <span style="opacity:.55;font-weight:400;">(optional)</span></label>
        <input class="stc-hf-input" id="stcHfMail" type="email" maxlength="200" autocomplete="email" placeholder="deine@email.de" />
        <label class="stc-hf-label" for="stcHfMsg">Worum geht es? *</label>
        <textarea class="stc-hf-input" id="stcHfMsg" rows="3" maxlength="1500" placeholder="Kurz dein Anliegen…"></textarea>
        <p class="stc-hf-err" id="stcHfErr"></p>
        <button type="button" class="stc-hf-submit" id="stcHfSubmit">Rückruf anfordern →</button>
      </div>`;
    document.body.appendChild(wrap);

    const close = () => wrap.classList.remove('open');
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    wrap.querySelector('.stc-hf-close').addEventListener('click', close);

    wrap.querySelector('#stcHfSubmit').addEventListener('click', async () => {
      const name  = wrap.querySelector('#stcHfName').value.trim();
      const phone = wrap.querySelector('#stcHfPhone').value.trim();
      const mail  = wrap.querySelector('#stcHfMail').value.trim();
      const msg   = wrap.querySelector('#stcHfMsg').value.trim();
      const err   = wrap.querySelector('#stcHfErr');
      const btn   = wrap.querySelector('#stcHfSubmit');

      const phoneOk = /^[\d\s+()\/-]{6,20}$/.test(phone);
      const mailOk  = !mail || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail);
      if (!name || !msg) { err.textContent = 'Bitte Name und Anliegen ausfüllen.'; return; }
      if (!phoneOk)      { err.textContent = 'Bitte eine gültige Telefonnummer angeben.'; return; }
      if (!mailOk)       { err.textContent = 'Die E-Mail-Adresse sieht nicht richtig aus.'; return; }
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Wird gesendet…';

      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            phone,
            email: mail || 'rueckruf@simply-chat.simpletrailer.de',
            message: 'RÜCKRUF-BITTE über Simply-Chat\n\nAnliegen: ' + msg +
                     '\n\n--- Bisheriger Chat mit Simply ---\n' + (chatTranscript() || '(noch kein Verlauf)')
          })
        });
        if (!res.ok) throw new Error('send failed');
        try { window.stcTrack && stcTrack('simply_callback_request'); } catch (e) {}
        btn.textContent = 'Angefragt ✓';
        btn.style.background = '#22c55e';
        setTimeout(() => {
          close();
          btn.disabled = false;
          btn.textContent = 'Rückruf anfordern →';
          btn.style.background = '';
          wrap.querySelector('#stcHfMsg').value = '';
          const note = 'Deine Rückruf-Bitte ist raus, ' + name.split(' ')[0] + '! 📞 Wir melden uns so schnell wie möglich unter **' + phone + '**.';
          addMessageDom('bot', note);
          history.push({ role: 'assistant', content: note });
          persist();
        }, 1200);
      } catch (e2) {
        err.textContent = 'Senden fehlgeschlagen — bitte direkt an info@simpletrailer.de mailen.';
        btn.disabled = false;
        btn.textContent = 'Rückruf anfordern →';
      }
    });

    humanFormEl = wrap;
    return wrap;
  }

  function startHumanFlow() {
    const f = buildHumanForm();
    f.classList.add('open');
    setTimeout(() => { try { f.querySelector('#stcHfName').focus(); } catch (e) {} }, 80);
  }

  async function sendMessage(text) {
    text = (text || '').trim();

    text = (text || '').trim();
    if (!text || isStreaming) return;

    inputEl.value = '';
    quickEl.innerHTML = '';
    isStreaming = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;

    addMessageDom('user', text);
    history.push({ role: 'user', content: text });
    persist();

    // Typing-Indicator
    const botDiv = addMessageDom('bot', '');
    botDiv.innerHTML = '<span class="stc-typing"><span></span><span></span><span></span></span>';

    let acc = '';
    let firstChunk = true;
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        botDiv.classList.add('error');
        botDiv.innerHTML = renderMarkdown(data.error || 'Es gab einen Fehler. Bitte versuch es nochmal oder schreib uns eine Mail an info@simpletrailer.de.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const obj = JSON.parse(payload);
            if (obj.status === 'checking_availability') {
              if (firstChunk) {
                botDiv.innerHTML = '<span class="stc-typing"><span></span><span></span><span></span></span> <em style="color:#888;font-size:.85em;">Prüfe Verfügbarkeit…</em>';
              }
            }
            if (obj.delta) {
              if (firstChunk) { botDiv.textContent = ''; firstChunk = false; }
              acc += obj.delta;
              botDiv.innerHTML = renderMarkdown(acc);
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
            if (obj.error) {
              botDiv.classList.add('error');
              botDiv.textContent = obj.error;
            }
          } catch (e) { /* ignore non-JSON lines */ }
        }
      }

      if (acc) {
        history.push({ role: 'assistant', content: acc });
        persist();
      }
    } catch (e) {
      botDiv.classList.add('error');
      botDiv.textContent = 'Verbindung fehlgeschlagen. Bitte später nochmal probieren oder Mail an info@simpletrailer.de schreiben.';
    } finally {
      isStreaming = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  // ===== Body-Scroll-Lock (iOS-safe) ================================
  // iOS braucht position:fixed um wirklich zu locken, plus saved-scroll-restore
  let savedScrollY = 0;
  function lockBodyScroll() {
    if (window.innerWidth >= 601) return; // nur Mobile
    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = `-${savedScrollY}px`;
    document.body.classList.add('stc-locked');
  }
  function unlockBodyScroll() {
    if (!document.body.classList.contains('stc-locked')) return;
    document.body.classList.remove('stc-locked');
    document.body.style.top = '';
    window.scrollTo(0, savedScrollY);
  }

  // ===== Wiring =====================================================
  function openChat() {
    win.classList.add('open');
    backdrop.classList.add('open');
    fab.classList.add('hidden');
    lockBodyScroll();
    // Auf Mobile: NICHT direkt focussieren — sonst springt Tastatur sofort hoch.
    if (window.innerWidth >= 601) inputEl.focus();
    setTimeout(() => { messagesEl.scrollTop = messagesEl.scrollHeight; }, 50);
  }
  function closeChat() {
    win.classList.remove('open');
    backdrop.classList.remove('open');
    fab.classList.remove('hidden');
    inputEl.blur();
    unlockBodyScroll();
    // Wenn zwischenzeitlich Tastatur die Window-Höhe gesetzt hat: zuruecksetzen
    win.style.height = '';
    win.style.maxHeight = '';
  }

  // ===== Overlay-Watcher: Simply verschwindet, wenn Modals/Flows offen sind =====
  // (Anhaenger-Wahl, Info-, Notify-, Rechts-Overlays) — er bleibt der Homepage-Begleiter
  // und haengt nicht ueber Buttons in den Dialogen.
  (function overlayWatcher() {
    const SELECTORS = '#trailerModal, #notifyModal, #infoOverlayIdx, #insInfoOverlay, .info-overlay, .trailer-modal-bg';
    function anyOverlayOpen() {
      try {
        return Array.from(document.querySelectorAll(SELECTORS)).some(el => {
          const st = window.getComputedStyle(el);
          return st.display !== 'none' && st.visibility !== 'hidden';
        });
      } catch (e) { return false; }
    }
    let raf = null;
    function sync() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        fab.classList.toggle('stc-overlay-hidden', anyOverlayOpen());
      });
    }
    try {
      const mo = new MutationObserver(sync);
      mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'], subtree: true });
      sync();
    } catch (e) { /* alte Browser: FAB bleibt einfach sichtbar */ }
  })();

  // ===== Draggable: Simply frei verschieben (Position bleibt gespeichert) =====
  (function draggableFab() {
    const KEY = 'st_simply_pos_v1';
    let dragging = false, moved = false, startX = 0, startY = 0, origX = 0, origY = 0;

    function clamp(x, y) {
      const r = fab.getBoundingClientRect();
      const maxX = window.innerWidth  - r.width  - 4;
      const maxY = window.innerHeight - r.height - 4;
      return [Math.min(Math.max(4, x), maxX), Math.min(Math.max(4, y), maxY)];
    }
    function apply(x, y) {
      fab.style.left = x + 'px';
      fab.style.top = y + 'px';
      fab.style.right = 'auto';
      fab.style.bottom = 'auto';
    }
    // Gespeicherte Position wiederherstellen
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && typeof saved.x === 'number') {
        requestAnimationFrame(() => { const [x, y] = clamp(saved.x, saved.y); apply(x, y); });
      }
    } catch (e) {}

    fab.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      const r = fab.getBoundingClientRect();
      origX = r.left; origY = r.top;
      try { fab.setPointerCapture(e.pointerId); } catch (err) {}
    });
    fab.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 7) return; // Klick-Toleranz
      moved = true;
      fab.classList.add('stc-dragging');
      const [x, y] = clamp(origX + dx, origY + dy);
      apply(x, y);
    });
    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove('stc-dragging');
      if (moved) {
        const r = fab.getBoundingClientRect();
        try { localStorage.setItem(KEY, JSON.stringify({ x: r.left, y: r.top })); } catch (err) {}
        // Klick nach Drag unterdruecken
        const block = (ev) => { ev.stopPropagation(); ev.preventDefault(); fab.removeEventListener('click', block, true); };
        fab.addEventListener('click', block, true);
        setTimeout(() => fab.removeEventListener('click', block, true), 0);
      }
    }
    fab.addEventListener('pointerup', endDrag);
    fab.addEventListener('pointercancel', endDrag);
    window.addEventListener('resize', () => {
      try {
        const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (saved) { const [x, y] = clamp(saved.x, saved.y); apply(x, y); }
      } catch (e) {}
    });
  })();

  fab.addEventListener('click', openChat);
  closeBtn.addEventListener('click', closeChat);
  backdrop.addEventListener('click', closeChat);

  // ===== Attention-Tooltip nach 10 Sek =====
  // Macht Simply bemerkbar für User die ihn übersehen.
  // Nur 1× pro Tab/Session + nicht wenn User schon den Chat geöffnet hat
  // + nicht wenn User schon History hat (= kennt Simply schon).
  (function setupAttentionTooltip() {
    try {
      if (sessionStorage.getItem('st_simply_attention_shown')) return;
      if ((history || []).length > 0) return; // User hat schon mit Simply gechattet

      // Tooltip-Element erstellen
      const tip = document.createElement('div');
      tip.className = 'stc-tooltip';
      tip.setAttribute('role', 'dialog');
      tip.setAttribute('aria-label', 'Hinweis vom Chat-Assistenten');
      tip.innerHTML = `
        <button class="stc-tooltip-close" aria-label="Schließen">×</button>
        <div>Moin! 👋 Ich bin <strong>Simply</strong> — kann ich dir bei deiner Buchung helfen?</div>
        <div class="stc-tooltip-arrow"></div>
      `;
      document.body.appendChild(tip);

      const closeTip = (markShown = true) => {
        tip.classList.remove('show');
        if (markShown) {
          try { sessionStorage.setItem('st_simply_attention_shown', '1'); } catch(e) {}
        }
        setTimeout(() => { try { tip.remove(); } catch(e) {} }, 400);
      };

      // Close-Button-Handler
      tip.querySelector('.stc-tooltip-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTip(true);
      });

      // Klick auf Tooltip selbst → öffnet Chat
      tip.addEventListener('click', () => {
        closeTip(true);
        openChat();
      });

      // Wenn User den FAB klickt während Tooltip sichtbar → schließen ohne mark
      // (FAB-Klick öffnet Chat ohnehin durch normalen Handler)

      // Nach 10 Sek einblenden
      const showDelay = 10000;
      const showT = setTimeout(() => {
        // Falls zwischenzeitlich Chat geöffnet wurde, nicht mehr zeigen
        if (win.classList.contains('open')) {
          tip.remove();
          try { sessionStorage.setItem('st_simply_attention_shown', '1'); } catch(e) {}
          return;
        }
        // Stärkere Pulse-Animation am FAB starten
        fab.classList.add('attention');
        setTimeout(() => fab.classList.remove('attention'), 5000);
        // Tooltip einblenden — bleibt sichtbar bis User aktiv schliesst (X klicken,
        // Tooltip-Body anklicken oder Chat ueber den FAB oeffnet).
        tip.classList.add('show');
      }, showDelay);

      // Wenn User Chat selbst öffnet bevor Tooltip kommt → Cancel
      fab.addEventListener('click', () => {
        clearTimeout(showT);
        try { sessionStorage.setItem('st_simply_attention_shown', '1'); } catch(e) {}
        if (tip.classList.contains('show')) closeTip(false);
      }, { once: false });

      // Wenn User Page scrollt — Tooltip bleibt sichtbar (kein Hide)
    } catch (e) { /* fail silent */ }
  })();

  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  // ===== "Mit Mensch sprechen" Button ==============================
  // Permanent dezent sichtbar, eskaliert nach 3+ User-Messages oder wenn der
  // Bot sagt "kann ich nicht beantworten / schreib uns" — Lead-Capture-Hebel.
  const humanBox  = document.getElementById('stcHuman');
  const humanLink = document.getElementById('stcHumanLink');

  function escalateHuman() {
    if (humanBox) humanBox.classList.add('escalate');
  }

  if (humanLink) {
    humanLink.addEventListener('click', (e) => {
      e.preventDefault();
      startHumanFlow();
    });
  }

  // Eskalations-Trigger: ab der 3. User-Message ODER bot signalisiert Limit.
  // Wird über MutationObserver an die Messages-Liste gehängt — kein Polling,
  // kein Memory-Leak. Hört auf zu beobachten sobald escalate aktiv ist.
  const ESCALATE_HINTS = [
    'kann ich dir nicht', 'leider keine', 'schreib uns', 'info@simpletrailer.de',
    'kontaktiere uns', 'persönlich beantworten', 'da müssten wir', 'außerhalb meines'
  ];
  function checkEscalation() {
    try {
      if (!humanBox || humanBox.classList.contains('escalate')) return true;
      const userMsgs = (history || []).filter(m => m.role === 'user').length;
      const lastBot  = ((history || []).filter(m => m.role === 'assistant').slice(-1)[0] || {}).content || '';
      const lastBotStr = typeof lastBot === 'string' ? lastBot.toLowerCase() : '';
      if (userMsgs >= 3 || ESCALATE_HINTS.some(h => lastBotStr.includes(h))) {
        escalateHuman();
        return true;
      }
    } catch (e) { /* ignore */ }
    return false;
  }
  if (messagesEl && window.MutationObserver) {
    const obs = new MutationObserver(() => {
      if (checkEscalation()) obs.disconnect();
    });
    obs.observe(messagesEl, { childList: true, subtree: true, characterData: true });
  }

  // ===== Mobile Keyboard Handling ===================================
  // iOS/Android Tastatur deckt sonst das Input-Feld zu — mit Visual Viewport
  // skaliert sich das Chat-Window dynamisch wenn die Tastatur kommt.
  if (window.visualViewport) {
    const onViewportChange = () => {
      if (!win.classList.contains('open')) return;
      if (window.innerWidth >= 601) return; // nur Mobile
      // Setze die Window-Hoehe auf die sichtbare Viewport-Hoehe minus etwas Abstand oben
      const vh = window.visualViewport.height;
      const targetHeight = Math.min(vh - 20, window.innerHeight * 0.85);
      win.style.height = targetHeight + 'px';
      win.style.maxHeight = targetHeight + 'px';
      // Scroll Messages zum Ende, damit die letzte Antwort sichtbar bleibt
      messagesEl.scrollTop = messagesEl.scrollHeight;
    };
    window.visualViewport.addEventListener('resize', onViewportChange);
    window.visualViewport.addEventListener('scroll', onViewportChange);
  }

  // Beim Fokussieren des Inputs: nach kurzer Verzoegerung Messages scrollen
  // (gibt der Tastatur Zeit zum Aufgehen)
  inputEl.addEventListener('focus', () => {
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
      // Auf manchen Browsern: Input in den sichtbaren Bereich scrollen
      try { inputEl.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) {}
    }, 350);
  });

  // Initial-Render
  renderMessages();
  renderQuickReplies();
})();
