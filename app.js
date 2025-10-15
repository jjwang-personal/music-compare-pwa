function switchVersion(recId, seekToCurrent) {
  const rec = state.data.recordings.find(r => r.id === recId);
  if (!rec) return;

  const container = document.querySelector('.player');
  container.innerHTML = ''; // 清空

  // 统一用 YouTube iframe
  const iframe = document.createElement('iframe');
  // 计算开始时间：如果从当前时间切换版本，就带上 start；否则正常起播
  const start = Number.isFinite(seekToCurrent) ? Math.max(0, Math.floor(seekToCurrent)) : 0;
  const base = rec.embed || (rec.ytId ? `https://www.youtube.com/embed/${rec.ytId}` : '');
  const src = start > 0 ? `${base}?start=${start}&autoplay=1` : `${base}?autoplay=1`;

  iframe.src = src;
  iframe.width = '100%';
  iframe.height = '200';
  iframe.frameBorder = '0';
  iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  iframe.allowFullscreen = true;
  iframe.style.borderRadius = '12px';
  iframe.id = 'ytframe';

  container.appendChild(iframe);

  state.currentRecId = recId;
  syncActiveVersion();
}

function jumpToAnchor(anchorId) {
  const a = state.data.anchors.find(x => x.id === anchorId);
  if (!a) return;
  state.currentAnchorId = anchorId;

  const rec = state.data.recordings.find(r => r.id === state.currentRecId);
  if (!rec) return;

  const base = rec.embed || (rec.ytId ? `https://www.youtube.com/embed/${rec.ytId}` : '');
  const iframe = document.getElementById('ytframe');
  if (iframe) {
    // 通过修改 src 的方式跳转到锚点秒数
    iframe.src = `${base}?start=${Math.max(0, Math.floor(a.startSec || 0))}&autoplay=1`;
  }

  setMicroNote(anchorId);
  syncActiveAnchor();
  console.log('seek_anchor', { anchorId, rec: state.currentRecId });
}