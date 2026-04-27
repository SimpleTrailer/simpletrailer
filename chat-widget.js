/**
 * SimpleTrailer Chat-Widget
 * Floating-Button + Chat-Window. Nutzt /api/chat (Anthropic Claude).
 *
 * Einbindung:  <script src="/chat-widget.js" defer></script>
 *
 * KEINE Dependencies. KEIN Build-Step. Pures Vanilla-JS.
 */
(function () {
  if (window.__simpletrailerChatLoaded) return;
  window.__simpletrailerChatLoaded = true;

  const STORAGE_KEY = 'st_chat_history_v1';
  const WELCOME = "Hi! Ich bin der SimpleTrailer-Assistent. Ich helfe dir bei Fragen zu Anhänger-Miete, Preisen, dem Buchungsprozess oder allem anderen. Was möchtest du wissen?";
  const QUICK_REPLIES = [
    'Wie viel kostet ein Anhänger?',
    'Welchen Führerschein brauche ich?',
    'Wie funktioniert die Abholung?',
    'Wie storniere ich?'
  ];

  // ===== Styles ====================================================
  const css = `
  .stc-fab {
    position: fixed; bottom: 20px; right: 20px;
    width: 60px; height: 60px;
    background: linear-gradient(135deg, #E85D00, #FF6A00);
    color: #fff; border: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.6rem; cursor: pointer;
    box-shadow: 0 4px 20px rgba(232,93,0,0.45), 0 0 0 0 rgba(232,93,0,0.4);
    z-index: 99998;
    transition: transform .2s;
    animation: stc-pulse 2.4s ease-in-out infinite;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .stc-fab:hover { transform: scale(1.08); }
  .stc-fab.hidden { display: none; }
  @keyframes stc-pulse {
    0%, 100% { box-shadow: 0 4px 20px rgba(232,93,0,0.45), 0 0 0 0 rgba(232,93,0,0); }
    50%      { box-shadow: 0 4px 20px rgba(232,93,0,0.45), 0 0 0 12px rgba(232,93,0,0); }
  }
  .stc-fab-badge {
    position: absolute; top: -2px; right: -2px;
    width: 18px; height: 18px; border-radius: 50%;
    background: #22c55e; border: 2px solid #0D0D0D;
  }

  .stc-window {
    position: fixed; bottom: 90px; right: 20px;
    width: 380px; max-width: calc(100vw - 32px);
    height: 560px; max-height: calc(100vh - 120px);
    background: #161616;
    border: 1px solid #383838;
    border-radius: 18px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.5);
    display: none; flex-direction: column;
    z-index: 99999;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    color: #fff;
    overflow: hidden;
    animation: stc-slideUp 0.22s ease;
  }
  .stc-window.open { display: flex; }
  @keyframes stc-slideUp {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 480px) {
    .stc-window {
      bottom: 0; right: 0; left: 0; top: 0;
      width: 100%; height: 100%; max-width: none; max-height: none;
      border-radius: 0; border: none;
    }
  }

  .stc-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px;
    background: linear-gradient(135deg, #E85D00, #FF6A00);
    flex-shrink: 0;
  }
  .stc-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: #fff; color: #E85D00;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: .95rem;
  }
  .stc-header-text { flex: 1; }
  .stc-header-text strong { display: block; font-size: .92rem; font-weight: 700; }
  .stc-header-text small { display: block; font-size: .68rem; opacity: 0.9; margin-top: 1px; }
  .stc-status-dot {
    display: inline-block; width: 7px; height: 7px; border-radius: 50%;
    background: #4ade80; margin-right: 5px; vertical-align: middle;
  }
  .stc-close {
    background: rgba(255,255,255,0.18); border: none; color: #fff;
    width: 30px; height: 30px; border-radius: 50%;
    cursor: pointer; font-size: 1.1rem;
    display: flex; align-items: center; justify-content: center;
  }
  .stc-close:hover { background: rgba(255,255,255,0.3); }

  .stc-messages {
    flex: 1; overflow-y: auto;
    padding: 18px 16px;
    display: flex; flex-direction: column; gap: 12px;
    scroll-behavior: smooth;
  }
  .stc-msg { max-width: 85%; padding: 10px 14px; border-radius: 14px; line-height: 1.45; font-size: .9rem; word-wrap: break-word; }
  .stc-msg.user { align-self: flex-end; background: #E85D00; color: #fff; border-bottom-right-radius: 4px; }
  .stc-msg.bot  { align-self: flex-start; background: #1E1E1E; color: #fff; border: 1px solid #2A2A2A; border-bottom-left-radius: 4px; }
  .stc-msg.bot a { color: #FF8C42; text-decoration: underline; }
  .stc-msg.bot.error { border-color: #ef4444; color: #fca5a5; }
  .stc-typing {
    display: inline-flex; align-items: center; gap: 4px;
  }
  .stc-typing span { width: 6px; height: 6px; border-radius: 50%; background: #888; animation: stc-blink 1.2s infinite; }
  .stc-typing span:nth-child(2) { animation-delay: 0.2s; }
  .stc-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes stc-blink { 0%, 60%, 100% { opacity: 0.3; } 30% { opacity: 1; } }

  .stc-quick {
    display: flex; flex-wrap: wrap; gap: 6px;
    padding: 0 16px 12px;
  }
  .stc-quick button {
    background: #1E1E1E; border: 1px solid #383838; color: #ccc;
    padding: 8px 12px; border-radius: 16px; cursor: pointer;
    font-size: .78rem; font-family: inherit;
    transition: all .15s;
  }
  .stc-quick button:hover { background: #2A2A2A; border-color: #E85D00; color: #fff; }

  .stc-input-row {
    display: flex; gap: 8px; padding: 12px 14px;
    border-top: 1px solid #2A2A2A;
    background: #0D0D0D;
    flex-shrink: 0;
  }
  .stc-input {
    flex: 1; background: #1E1E1E; border: 1px solid #383838;
    color: #fff; padding: 10px 14px; border-radius: 22px;
    font-size: .9rem; font-family: inherit;
    outline: none;
  }
  .stc-input:focus { border-color: #E85D00; }
  .stc-input::placeholder { color: #666; }
  .stc-send {
    background: #E85D00; border: none; color: #fff;
    width: 40px; height: 40px; border-radius: 50%;
    cursor: pointer; font-size: 1.1rem;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background .15s;
  }
  .stc-send:hover { background: #FF6A00; }
  .stc-send:disabled { background: #555; cursor: not-allowed; }

  .stc-footer {
    text-align: center; padding: 6px;
    font-size: .65rem; color: #555;
    background: #0D0D0D; border-top: 1px solid #1A1A1A;
    flex-shrink: 0;
  }
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ===== DOM ========================================================
  const root = document.createElement('div');
  root.innerHTML = `
    <button class="stc-fab" id="stcFab" aria-label="Chat öffnen" title="Frage? Chat starten">
      💬
      <span class="stc-fab-badge"></span>
    </button>
    <div class="stc-window" id="stcWin" role="dialog" aria-label="SimpleTrailer Chat">
      <div class="stc-header">
        <div class="stc-avatar">ST</div>
        <div class="stc-header-text">
          <strong>SimpleTrailer Assistent</strong>
          <small><span class="stc-status-dot"></span>Online · meist sofortige Antwort</small>
        </div>
        <button class="stc-close" id="stcClose" aria-label="Schließen">×</button>
      </div>
      <div class="stc-messages" id="stcMessages"></div>
      <div class="stc-quick" id="stcQuick"></div>
      <div class="stc-input-row">
        <input class="stc-input" id="stcInput" type="text" placeholder="Schreib deine Frage..." maxlength="500" />
        <button class="stc-send" id="stcSend" aria-label="Senden">↑</button>
      </div>
      <div class="stc-footer">KI-gestützt · powered by Claude</div>
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
    const div = document.createElement('div');
    div.className = 'stc-msg ' + role + (opts.error ? ' error' : '');
    // Simple URL-Linkify
    const safe = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(simpletrailer\.de\/[a-z\-/.]+)/gi, '<a href="https://$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(\binfo@simpletrailer\.de)/gi, '<a href="mailto:$1">$1</a>')
      .replace(/\n/g, '<br>');
    div.innerHTML = safe;
    messagesEl.appendChild(div);
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
        botDiv.innerHTML = (data.error || 'Es gab einen Fehler. Bitte versuch es nochmal oder schreib uns eine Mail an info@simpletrailer.de.').replace(/\n/g, '<br>');
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
              const safe = acc
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
                .replace(/(simpletrailer\.de\/[a-z\-/.]+)/gi, '<a href="https://$1" target="_blank" rel="noopener">$1</a>')
                .replace(/(\binfo@simpletrailer\.de)/gi, '<a href="mailto:$1">$1</a>')
                .replace(/\n/g, '<br>');
              botDiv.innerHTML = safe;
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
