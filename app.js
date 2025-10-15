// =====================
// Music Compare · PWA
// Spotlight Mode + YouTube Windowed A/B/C
// =====================

// ------- 全局状态 -------
const state = {
  data: null,
  currentRecId: null,
  currentAnchorId: null,
  deferredPrompt: null,
  mode: 'segments', // 'segments' | 'spots'
};

const els = {
  versionBar: document.getElementById('versionBar'),
  anchors: document.getElementById('anchors'),
  microNote: document.getElementById('microNote'),
  quiz: document.getElementById('quiz'),
  installBtn: document.getElementById('installBtn'),
  shareBtn: document.getElementById('shareBtn'),
  playerHost: document.querySelector('.player'),
  modeToggle: document.getElementById('modeToggle'),
};

// ------- YouTube 播放相关 -------
let ytPlayer = null;
let currentRec = null;     // 当前版本（recording 对象）
let windowStart = 15;      // 时间窗起点（秒）← 可改
let windowEnd   = 45;      // 时间窗终点（秒）← 可改
let loopTimer   = null;    // 维护时间窗循环

// =====================
// 启动
// =====================
async function init() {
  try {
    const res = await fetch('data/bwv1007_prelude.json', { cache: 'no-cache' });
    state.data = await res.json();

    renderVersions();
    renderAnchors();   // 根据 state.mode 渲染
    renderQuiz();
    renderModeToggle();

    ensureYTContainer();

    // 默认当前录音
    state.currentRecId = state.data.recordings[0]?.id || null;
    currentRec = state.data.recordings[0] || null;

    loadYouTubeAPI(); // 注入并创建播放器
  } catch (e) {
    console.error(e);
  }

  // 安装提示
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    els.installBtn.hidden = true;
  });

  // 分享
  els.shareBtn.addEventListener('click', async () => {
    const text = `我在对比 ${state.data?.work?.title || ''} · ${state.mode === 'spots' ? '代表性片段' : '整曲段落'} · 窗口 ${windowStart}–${windowEnd}s`;
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'Music Compare', text, url }); }
      catch {}
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      els.shareBtn.textContent = '已复制链接';
      setTimeout(() => (els.shareBtn.textContent = '分享对比卡'), 1200);
    }
  });

  // 绑定事件
  wireVersionBar();
  wireAnchors();

  // 注册 SW
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    });
  }
}

// =====================
// UI 渲染
// =====================
function renderVersions() {
  els.versionBar.innerHTML = '';
  state.data.recordings.forEach(rec => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = rec.title || rec.id;
    btn.dataset.id = rec.id;
    els.versionBar.appendChild(btn);
  });
  syncActiveVersion();
}

function getCurrentAnchors() {
  // 兼容旧结构：若有 anchors 就用 anchors，否则按模式分组
  if (Array.isArray(state.data?.anchors)) return state.data.anchors;
  if (state.mode === 'spots') return state.data?.spots || [];
  return state.data?.segments || [];
}

function renderAnchors() {
  const anchors = getCurrentAnchors();
  els.anchors.innerHTML = '';
  anchors.forEach(a => {
    const chip = document.createElement('button');
    chip.className = 'anchor';
    chip.textContent = a.label;
    chip.dataset.id = a.id;
    els.anchors.appendChild(chip);
  });
  if (anchors[0]) setMicroNote(anchors[0].id);
  state.currentAnchorId = null;
  syncActiveAnchor();
}

function renderQuiz() {
  els.quiz.innerHTML = '';
  (state.data.quiz || []).forEach(q => {
    const wrap = document.createElement('div');
    wrap.className = 'q';
    q.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${q.text}${choice}`;
      btn.addEventListener('click', () => {
        console.log('quiz_submit', { qid: q.id, choice, rec: state.currentRecId, anchor: state.currentAnchorId, mode: state.mode });
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 600);
      });
      wrap.appendChild(btn);
    });
    els.quiz.appendChild(wrap);
  });
}

function renderModeToggle() {
  if (!els.modeToggle) return;
  els.modeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (mode === state.mode) return;
    setMode(mode);
  });
  syncModeToggle();
}

function setMode(mode) {
  state.mode = mode;
  state.currentAnchorId = null;
  renderAnchors();
  syncModeToggle();
  console.log('mode_change', { mode });
}

function syncModeToggle() {
  if (!els.modeToggle) return;
  [...els.modeToggle.querySelectorAll('.seg')].forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.mode);
  });
}

function setMicroNote(anchorId) {
  const a = getCurrentAnchors().find(x => x.id === anchorId);
  els.microNote.textContent = a?.note || '';
}

function syncActiveVersion() {
  [...els.versionBar.children].forEach(btn => {
    btn.classList.toggle('active', btn.dataset.id === state.currentRecId);
  });
}
function syncActiveAnchor() {
  [...els.anchors.children].forEach(chip => {
    chip.classList.toggle('active', chip.dataset.id === state.currentAnchorId);
  });
}

// =====================
// 事件绑定
// =====================
function wireVersionBar() {
  els.versionBar.addEventListener('click', (e) => {
    const target = e.target.closest('button[data-id]');
    if (!target) return;
    const id = target.dataset.id;
    if (id !== state.currentRecId) switchVersionSameWindow(id);
  });
}

function wireAnchors() {
  els.anchors.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-id]');
    if (!chip) return;
    jumpToAnchorWindow(chip.dataset.id);
  });
}

// =====================
// YouTube 播放器工具
// =====================
function ensureYTContainer() {
  if (!els.playerHost) return;
  if (!document.getElementById('yt-container')) {
    const div = document.createElement('div');
    div.id = 'yt-container';
    els.playerHost.innerHTML = '';
    els.playerHost.appendChild(div);
  }
}

function loadYouTubeAPI() {
  window.onYouTubeIframeAPIReady = function () {
    createYTPlayer();
  };
  if (![...document.scripts].some(s => s.src.includes('youtube.com/iframe_api'))) {
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  } else {
    if (window.YT && window.YT.Player) createYTPlayer();
  }
}

function getVideoId(rec) {
  if (!rec) return null;
  if (rec.ytId) return rec.ytId;
  if (rec.embed) {
    const m = rec.embed.match(/\/embed\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
  }
  return null;
}

function createYTPlayer() {
  if (!state.data?.recordings?.length) return;
  currentRec = state.data.recordings.find(r => r.id === state.currentRecId) || state.data.recordings[0];
  state.currentRecId = currentRec.id;

  ytPlayer = new YT.Player('yt-container', {
    height: '220',
    width: '100%',
    videoId: getVideoId(currentRec),
    playerVars: {
      rel: 0, modestbranding: 1,
      start: windowStart, end: windowEnd, autoplay: 1
    },
    events: { onReady: onPlayerReady, onStateChange: onPlayerStateChange }
  });
}

function onPlayerReady(e) {
  e.target.playVideo();
  startWindowLoop();
  syncActiveVersion();
}

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    startWindowLoop();
  } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
    stopWindowLoop();
    if (e.data === YT.PlayerState.ENDED) {
      seekWithinWindow(windowStart);
    }
  }
}

function startWindowLoop() {
  stopWindowLoop();
  loopTimer = setInterval(() => {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    const t = ytPlayer.getCurrentTime();
    if (t >= windowEnd - 0.25) {
      seekWithinWindow(windowStart);
    }
  }, 200);
}

function stopWindowLoop() {
  if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
}

function seekWithinWindow(sec) {
  if (!ytPlayer) return;
  const clamped = Math.max(windowStart, Math.min(windowEnd - 0.2, sec));
  ytPlayer.seekTo(clamped, true);
  ytPlayer.playVideo();
}

// =====================
// 时间窗操作
// =====================
function setWindow(startSec, endSec, keepRelative = true) {
  const prevStart = windowStart;
  const prevEnd   = windowEnd;
  const prevLen   = Math.max(1, prevEnd - prevStart);

  const curT = ytPlayer?.getCurrentTime ? ytPlayer.getCurrentTime() : startSec;
  const rel  = (curT - prevStart) / prevLen; // [0..1]

  windowStart = Math.max(0, Math.floor(startSec));
  windowEnd   = Math.max(windowStart + 1, Math.floor(endSec)); // 至少 1s
  const nextLen = windowEnd - windowStart;
  const nextPos = keepRelative ? (windowStart + rel * nextLen) : windowStart;

  if (currentRec && ytPlayer) {
    ytPlayer.loadVideoById({
      videoId: getVideoId(currentRec),
      startSeconds: Math.max(windowStart, Math.min(windowEnd - 0.2, nextPos)),
      endSeconds: windowEnd,
      suggestedQuality: 'large'
    });
  }
}

// 同一“时间窗”里切换到另一个版本：保持窗内当前时刻不变
function switchVersionSameWindow(nextRecId) {
  if (!ytPlayer) return;
  const next = state.data.recordings.find(r => r.id === nextRecId);
  if (!next) return;

  const curT = ytPlayer.getCurrentTime ? ytPlayer.getCurrentTime() : windowStart;
  const pos  = Math.max(windowStart, Math.min(windowEnd - 0.2, curT));

  currentRec = next;
  ytPlayer.loadVideoById({
    videoId: getVideoId(next),
    startSeconds: pos,
    endSeconds: windowEnd,
    suggestedQuality: 'large'
  });

  state.currentRecId = nextRecId;
  syncActiveVersion();
}

// 点击锚点：把“时间窗”移动到该片段（没有 endSec 就默认 30s）
function jumpToAnchorWindow(anchorId) {
  const a = getCurrentAnchors().find(x => x.id === anchorId);
  if (!a) return;
  state.currentAnchorId = anchorId;

  const start = Math.max(0, Math.floor(a.startSec || 0));
  const end   = a.endSec ? Math.floor(a.endSec) : start + 30;
  setWindow(start, end, /*keepRelative=*/false);

  setMicroNote(anchorId);
  syncActiveAnchor();
  console.log('seek_anchor_window', { mode: state.mode, anchorId, start, end, rec: state.currentRecId });
}

// =====================
// 入口
// =====================
init();