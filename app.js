const state = {
  data: null,
  currentRecId: null,
  currentAnchorId: null,
  deferredPrompt: null,
};

const els = {
  versionBar: document.getElementById('versionBar'),
  player: document.getElementById('player'),
  anchors: document.getElementById('anchors'),
  microNote: document.getElementById('microNote'),
  quiz: document.getElementById('quiz'),
  installBtn: document.getElementById('installBtn'),
  shareBtn: document.getElementById('shareBtn'),
};

async function init() {
  try {
    const res = await fetch('data/bwv1007_prelude.json', { cache: 'no-cache' });
    state.data = await res.json();
    renderVersions();
    renderAnchors();
    renderQuiz();
    // 默认载入第一版本
    switchVersion(state.data.recordings[0].id, /*seek*/0);
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
    const { outcome } = await state.deferredPrompt.userChoice;
    state.deferredPrompt = null;
    els.installBtn.hidden = true;
    console.log('install outcome:', outcome);
  });

  // Web Share
  els.shareBtn.addEventListener('click', async () => {
    const text = `我在对比 ${state.data.work.title} 的不同演绎：${state.currentRecId} @ ${Math.floor(els.player.currentTime)}s`;
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'Music Compare', text, url }); }
      catch (e) { console.log('share cancelled'); }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      els.shareBtn.textContent = '已复制链接';
      setTimeout(() => (els.shareBtn.textContent = '分享对比卡'), 1200);
    }
  });
}

function renderVersions() {
  els.versionBar.innerHTML = '';
  state.data.recordings.forEach(rec => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = rec.title;
    btn.dataset.id = rec.id;
    btn.addEventListener('click', () => switchVersion(rec.id));
    els.versionBar.appendChild(btn);
  });
  syncActiveVersion();
}

function renderAnchors() {
  els.anchors.innerHTML = '';
  state.data.anchors.forEach(a => {
    const chip = document.createElement('button');
    chip.className = 'anchor';
    chip.textContent = a.label;
    chip.dataset.id = a.id;
    chip.addEventListener('click', () => jumpToAnchor(a.id));
    els.anchors.appendChild(chip);
  });
  // 默认选第一个锚点的文案
  setMicroNote(state.data.anchors[0].id);
}

function renderQuiz() {
  els.quiz.innerHTML = '';
  state.data.quiz.forEach(q => {
    const wrap = document.createElement('div');
    wrap.className = 'q';
    q.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${q.text}${choice}`;
      btn.addEventListener('click', () => {
        // 简单埋点（可换成真实上报）
        console.log('quiz_submit', { qid: q.id, choice, rec: state.currentRecId, anchor: state.currentAnchorId });
        btn.classList.add('active');
        setTimeout(() => btn.classList.remove('active'), 600);
      });
      wrap.appendChild(btn);
    });
    els.quiz.appendChild(wrap);
  });
}

function switchVersion(recId, seekToCurrent) {
  const rec = state.data.recordings.find(r => r.id === recId);
  if (!rec) return;

  const currentPos = seekToCurrent !== undefined
    ? seekToCurrent
    : (els.player.currentTime || 0);

  state.currentRecId = recId;
  els.player.src = rec.url;
  // iOS 需先 load 再 seek
  els.player.addEventListener('loadedmetadata', function onLoaded() {
    els.player.removeEventListener('loadedmetadata', onLoaded);
    if (currentPos > 0) {
      try { els.player.currentTime = currentPos; } catch {}
    }
    els.player.play().catch(()=>{});
  });

  syncActiveVersion();
}

function jumpToAnchor(anchorId) {
  const a = state.data.anchors.find(x => x.id === anchorId);
  if (!a) return;
  state.currentAnchorId = anchorId;
  els.player.currentTime = a.startSec || 0;
  els.player.play().catch(()=>{});
  setMicroNote(anchorId);
  syncActiveAnchor();
  // 简单埋点
  console.log('seek_anchor', { anchorId, rec: state.currentRecId });
}

function setMicroNote(anchorId) {
  const a = state.data.anchors.find(x => x.id === anchorId);
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

// 在同一时间点切换版本（A/B/C）
els.versionBar?.addEventListener('click', (e) => {
  const target = e.target.closest('button[data-id]');
  if (!target) return;
  const id = target.dataset.id;
  if (id !== state.currentRecId) switchVersion(id);
});

// 注册 SW
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}

init();

