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

  // 添加“整曲播放（从头）”按钮（默认高亮）
  const fullChip = document.createElement('button');
  fullChip.className = 'anchor primary';
  fullChip.textContent = '整曲播放（从头）';
  fullChip.dataset.id = 'full_piece';
  els.anchors.appendChild(fullChip);

  // 渲染各段落 chips
  (state.data.segments || []).forEach(a => {
    const chip = document.createElement('button');
    chip.className = 'anchor';
    chip.textContent = a.label || secLabel(a.startSec);
    chip.dataset.id = a.id;
    els.anchors.appendChild(chip);
  });

  // 初始高亮（未选段时高亮整曲）
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
  const chips = [...els.anchors.children];
  chips.forEach(chip => {
    const isFull = chip.dataset.id === 'full_piece';
    const active = state.currentAnchorId ? (chip.dataset.id === state.currentAnchorId) : isFull;
    chip.classList.toggle('active', active);
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
    const id = chip.dataset.id;
    if (id === 'full_piece') {
      playFullPieceFromStart();
      return;
    }
    jumpToSegment(id);
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

  const cur = Math.floor(startSec || 0);

  // 1) 优先使用明确的 endSec（与 startSec 匹配的分段）
  const match = segs.find(s => Math.floor(s.startSec || 0) === cur && Number.isFinite(s.endSec));
  if (match) {
    const end = Math.floor(match.endSec);
    return Math.max(end, cur + 1); // 至少 1 秒长度
  }

  // 2) 没有 endSec：使用“下一个段落的 startSec”
  const nextCandidates = segs
    .map(s => Math.floor(s.startSec || 0))
    .filter(s => s > cur);
  if (nextCandidates.length > 0) {
    const nextStart = Math.min(...nextCandidates);
    return Math.max(nextStart, cur + 1);
  }

  // 3) 仍然没有：退回到视频总时长；拿不到则 +30s
  const dur = (ytPlayer && ytPlayer.getDuration) ? Math.floor(ytPlayer.getDuration() || 0) : 0;
  if (dur && dur > cur) return dur;
  return cur + 30;
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
  // 如果没有选择任何段落，切换版本时从整首开头开始播放（0s）
  const startFrom = anchor
    ? Math.max(0, Math.floor(anchor.startSec || 0))
    : 0;

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

// 退出分段模式：整曲从头播放
function playFullPieceFromStart() {
  state.currentAnchorId = null;   // 清空当前段落选择
  if (typeof stopEndWatch === 'function') stopEndWatch(); // 停止段末暂停监控
  if (ytPlayer) {
    ytPlayer.seekTo(0, true);
    ytPlayer.playVideo();
  }
  syncActiveAnchor();
}

// =====================
// 入口
// =====================
init();