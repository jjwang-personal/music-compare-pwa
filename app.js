// =====================
// Minimal Music Compare (Full piece + Unified segments only)
// =====================

// ------- 状态 & 元素 -------
const state = {
  data: null,
  currentRecId: null,
  currentAnchorId: null,
};

const els = {
  versionBar: document.getElementById('versionBar'),
  anchors: document.getElementById('anchors'),
  playerHost: document.querySelector('.player'),
};

// ------- YouTube 播放 -------
let ytPlayer = null;
let currentRec = null;

// =====================
// 启动
// =====================
async function init() {
  try {
    const res = await fetch('data/bwv1007_prelude.json', { cache: 'no-cache' });
    state.data = await res.json();

    // 渲染版本按钮 & 统一段落
    renderVersions();
    renderSegments();

    // 播放器容器
    ensureYTContainer();

    // 默认选择第一个版本
    state.currentRecId = state.data.recordings[0]?.id || null;
    currentRec = state.data.recordings[0] || null;

    // 注入并创建播放器
    loadYouTubeAPI();

    // 绑定事件
    wireVersionBar();
    wireAnchors();
  } catch (e) {
    console.error('init failed:', e);
  }
}

// =====================
// 渲染
// =====================
function renderVersions() {
  els.versionBar.innerHTML = '';
  (state.data.recordings || []).forEach(rec => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = rec.title || rec.id;
    btn.dataset.id = rec.id;
    els.versionBar.appendChild(btn);
  });
  syncActiveVersion();
}

function renderSegments() {
  els.anchors.innerHTML = '';
  (state.data.segments || []).forEach(a => {
    const chip = document.createElement('button');
    chip.className = 'anchor';
    chip.textContent = a.label || secLabel(a.startSec);
    chip.dataset.id = a.id;
    els.anchors.appendChild(chip);
  });
  syncActiveAnchor();
}

function secLabel(s) {
  const m = Math.floor((s || 0) / 60);
  const ss = String(Math.floor((s || 0) % 60)).padStart(2, '0');
  return `${m}:${ss}`;
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
// 事件
// =====================
function wireVersionBar() {
  els.versionBar.addEventListener('click', (e) => {
    const target = e.target.closest('button[data-id]');
    if (!target) return;
    const id = target.dataset.id;
    if (id !== state.currentRecId) switchVersionSameTime(id);
  });
}

function wireAnchors() {
  els.anchors.addEventListener('click', (e) => {
    const chip = e.target.closest('button[data-id]');
    if (!chip) return;
    jumpToSegment(chip.dataset.id);
  });
}

// =====================
// YouTube 播放器
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
    playerVars: { rel: 0, modestbranding: 1, autoplay: 1 },
    events: { onReady: (e) => e.target.playVideo(), onStateChange: onPlayerStateChange }
  });
}

// --- 段落结束自动暂停（仅当选择了段落时） ---
let endWatchTimer = null;

function getSelectedSegment() {
  if (!state.currentAnchorId) return null;
  const segs = state.data?.segments || [];
  return segs.find(s => s.id === state.currentAnchorId) || null;
}

function getSegmentEnd(startSec) {
  const segs = state.data?.segments || [];
  if (!Number.isFinite(startSec)) return null;
  // 以“下一个段落的 startSec”作为当前段落的结束；若没有，则默认 +30s
  const idx = segs.findIndex(s => Math.floor(s.startSec || 0) === Math.floor(startSec || 0));
  if (idx >= 0 && idx + 1 < segs.length) {
    const nextStart = Math.max(0, Math.floor(segs[idx + 1].startSec || 0));
    // 至少保证有 1s 的长度
    return Math.max(nextStart, Math.floor(startSec) + 1);
  }
  return Math.floor(startSec) + 30; // 默认 30 秒窗口
}

function onPlayerStateChange(e) {
  if (e.data === YT.PlayerState.PLAYING) {
    startEndWatch();
  } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
    stopEndWatch();
  }
}

function startEndWatch() {
  stopEndWatch();
  endWatchTimer = setInterval(() => {
    if (!ytPlayer || !ytPlayer.getCurrentTime) return;
    const seg = getSelectedSegment();
    if (!seg) return; // 未选择段落时不限制
    const start = Math.max(0, Math.floor(seg.startSec || 0));
    const end = getSegmentEnd(start);
    const t = ytPlayer.getCurrentTime();
    // 到达段落末尾时暂停（给一点余量）
    if (end != null && t >= (end - 0.15)) {
      ytPlayer.pauseVideo();
      stopEndWatch();
    }
  }, 200);
}

function stopEndWatch() {
  if (endWatchTimer) {
    clearInterval(endWatchTimer);
    endWatchTimer = null;
  }
}

// =====================
// 播放控制（整曲 + 统一段落）
// =====================

// 切换版本：保持当前播放秒（尽可能同步）
function switchVersionSameTime(nextRecId) {
  if (!ytPlayer) return;
  const next = state.data.recordings.find(r => r.id === nextRecId);
  if (!next) return;

  const anchor = (state.data.segments || []).find(x => x.id === state.currentAnchorId);
  const curT = ytPlayer.getCurrentTime ? Math.floor(ytPlayer.getCurrentTime()) : 0;
  const startFrom = anchor ? Math.max(0, Math.floor(anchor.startSec || 0)) : curT;

  currentRec = next;
  ytPlayer.loadVideoById({
    videoId: getVideoId(next),
    startSeconds: startFrom,
    suggestedQuality: 'large'
  });

  state.currentRecId = nextRecId;
  syncActiveVersion();
}

// 统一段落对比：点击锚点，整首中直接跳到该段起点
function jumpToSegment(anchorId) {
  const a = (state.data.segments || []).find(x => x.id === anchorId);
  if (!a || !ytPlayer) return;
  state.currentAnchorId = anchorId;

  const start = Math.max(0, Math.floor(a.startSec || 0));
  ytPlayer.seekTo(start, true);
  ytPlayer.playVideo();
  startEndWatch();

  syncActiveAnchor();
}

// =====================
// 入口
// =====================
init();