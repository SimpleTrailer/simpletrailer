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
    position: fixed; bottom: 20px; right: 20px;
    width: 64px; height: 64px;
    background: linear-gradient(135deg, #E85D00, #FF8C42);
    color: #fff; border: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    box-shadow: 0 6px 24px rgba(232,93,0,0.5), 0 0 0 0 rgba(232,93,0,0.4);
    z-index: 99998;
    transition: transform .2s;
    animation: stc-pulse 2.4s ease-in-out infinite;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .stc-fab:hover { transform: scale(1.08); }
  .stc-fab:active { transform: scale(0.96); }
  .stc-fab.hidden { display: none; }
  .stc-fab svg { width: 30px; height: 30px; }
  @keyframes stc-pulse {
    0%, 100% { box-shadow: 0 6px 24px rgba(232,93,0,0.5), 0 0 0 0 rgba(232,93,0,0); }
    50%      { box-shadow: 0 6px 24px rgba(232,93,0,0.5), 0 0 0 14px rgba(232,93,0,0); }
  }
  .stc-fab-badge {
    position: absolute; top: 0; right: 0;
    width: 18px; height: 18px; border-radius: 50%;
    background: #22c55e; border: 2.5px solid #0D0D0D;
    box-shadow: 0 0 0 0 rgba(34,197,94,0.5);
    animation: stc-badge-pulse 2s ease-in-out infinite;
  }
  @keyframes stc-badge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
    50%      { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
  }

  .stc-window {
    position: fixed; bottom: 96px; right: 20px;
    width: 400px; max-width: calc(100vw - 32px);
    height: 600px; max-height: calc(100vh - 130px);
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
  @media (max-width: 480px) {
    .stc-window {
      bottom: 0; right: 0; left: 0; top: 0;
      width: 100%; height: 100%; max-width: none; max-height: none;
      border-radius: 0; border: none;
    }
    .stc-fab { bottom: 16px; right: 16px; }
  }

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
    background: #fff; color: #E85D00;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 1rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    flex-shrink: 0;
    letter-spacing: -0.02em;
  }
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
    background: linear-gradient(135deg, #E85D00, #FF8C42);
    color: #fff; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: .68rem; font-weight: 800; letter-spacing: -.02em;
  }

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
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ===== DOM ========================================================
  const root = document.createElement('div');
  root.innerHTML = `
    <button class="stc-fab" id="stcFab" aria-label="Chat öffnen" title="Frag Simply – dein Anhänger-Assistent">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 0 1-3.6-.66L3 21l1.39-4.45A7.93 7.93 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="stc-fab-badge"></span>
    </button>
    <div class="stc-window" id="stcWin" role="dialog" aria-label="Simply Chat">
      <div class="stc-header">
        <div class="stc-avatar">S</div>
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
      <div class="stc-footer">KI-gestützt · <span>powered by Claude</span></div>
    </div>
  `;
  document.body.appendChild(root);

  const fab        = document.getElementById('stcFab');
  const win        = document.getElementById('stcWin');
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
      av.textContent = 'S';
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
  async function sendMessage(text) {
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

  // ===== Wiring =====================================================
  fab.addEventListener('click', () => {
    win.classList.add('open');
    fab.classList.add('hidden');
    inputEl.focus();
  });
  closeBtn.addEventListener('click', () => {
    win.classList.remove('open');
    fab.classList.remove('hidden');
  });
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  // Initial-Render
  renderMessages();
  renderQuickReplies();
})();
