const OWNER = 'myoneyama-svg', REPO = 'figma-plugin-shelf', BRANCH = 'main';
const SHELF = 'https://myoneyama-svg.github.io/figma-plugin-shelf/';
const BASE_TAGS = ['アニメーション','テキスト','図形・変形','影・質感','カラー','素材','書き出し・変換','整理・効率化','デザイン参考','その他参考'];
const $ = s => document.querySelector(s);
const st = { token: null, kind: 'site', tags: new Set(), extraTags: new Set(), remoteTags: [], shot: null, remote: null };

/* ---------- GitHub ---------- */
async function gh(path, opt = {}, token = st.token) {
  const r = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + path, {
    method: opt.method || 'GET', body: opt.body, cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!r.ok) { const e = new Error('GitHub ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), c => c.charCodeAt(0)));
const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
async function readRemote(token = st.token) {
  const cur = await gh('/contents/data.json?ref=' + BRANCH, {}, token);
  return { sha: cur.sha, list: JSON.parse(unb64(cur.content)) };
}
function putFile(path, u8, message, sha) {
  return gh('/contents/' + path, { method: 'PUT', body: JSON.stringify({ message, content: b64(u8), branch: BRANCH, ...(sha ? { sha } : {}) }) });
}
const errMsg = e => e.status === 401 ? '鍵が正しくないか、期限が切れています。「鍵を入れ直す」から入れてください。'
  : (e.status === 403 || e.status === 404) ? 'この鍵では保存できません。Contents を Read and write にした鍵か確認してください。'
  : '保存できませんでした。通信状況を確かめて、もう一度お試しください。';

/* ---------- screenshot ---------- */
async function capture(windowId) {
  try {
    const url = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 92 });
    const im = new Image(); im.src = url; await im.decode();
    const w = Math.min(900, im.naturalWidth), h = Math.round(im.naturalHeight * w / im.naturalWidth);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return { blob, w, h, url: URL.createObjectURL(blob) };
  } catch (e) { return null; }
}

/* ---------- UI ---------- */
function show(id) { ['main', 'done', 'setup'].forEach(k => { $('#' + k).hidden = k !== id; }); }
function setKind(k) {
  st.kind = k;
  document.querySelectorAll('#kind button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
  checkDup();
}
function renderTags(extra) {
  if (extra) st.remoteTags = extra;
  const all = [...new Set([...BASE_TAGS, ...st.remoteTags, ...st.extraTags])];
  $('#tags').replaceChildren(...all.map(t => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t;
    b.setAttribute('aria-pressed', String(st.tags.has(t)));
    b.onclick = () => { st.tags.has(t) ? st.tags.delete(t) : st.tags.add(t); b.setAttribute('aria-pressed', String(st.tags.has(t))); };
    return b;
  }));
}
const norm = u => { try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, ''); } catch (e) { return u; } };
function checkDup() {
  const el = $('#dup'); if (!st.remote) { el.hidden = true; return; }
  const u = norm($('#url').value.trim());
  const hit = u && st.remote.list.find(p => p.url && norm(p.url) === u);
  el.textContent = hit ? '「' + hit.name + '」として保存済みです。保存すると2枚目ができます。' : '';
  el.hidden = !hit;
}
function cleanTitle(t, kind) {
  t = (t || '').trim();
  if (kind === 'plugin') t = t.replace(/\s*\|\s*Figma.*$/i, '').replace(/^Figma Community\s*[-|]\s*/i, '');
  return t;
}
function addTag() {
  const t = $('#tagname').value.replace(/\s+/g, ' ').trim(); if (!t) return;
  st.extraTags.add(t); st.tags.add(t); renderTags();
  $('#tagname').value = ''; $('#tagnew').hidden = true;
}
const openShelf = e => { e.preventDefault(); chrome.tabs.create({ url: SHELF }); window.close(); };

async function init() {
  $('#open-shelf').onclick = openShelf; $('#open-shelf2').onclick = openShelf;
  $('#change-key').onclick = e => { e.preventDefault(); show('setup'); $('#token').focus(); };
  document.querySelectorAll('#kind button').forEach(b => b.onclick = () => setKind(b.dataset.kind));
  $('#url').addEventListener('input', checkDup);
  $('#setup').addEventListener('submit', saveToken);
  $('#save').onclick = save;
  $('#tagadd').onclick = () => { const n = $('#tagnew'); n.hidden = !n.hidden; if (!n.hidden) $('#tagname').focus(); };
  $('#tagok').onclick = addTag;
  $('#tagname').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); addTag(); } });

  st.token = (await chrome.storage.local.get('token')).token || null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const m = /figma\.com\/community\/plugin\/(\d+)/.exec(tab?.url || '');
  const kind = m ? 'plugin' : 'site';
  $('#name').value = cleanTitle(tab?.title, kind);
  $('#url').value = /^https?:/.test(tab?.url || '') ? tab.url : '';
  setKind(kind);
  renderTags();
  st.shot = tab ? await capture(tab.windowId) : null;
  if (st.shot) $('#shot-img').src = st.shot.url;
  else { $('#shot-img').hidden = true; $('#shot-none').hidden = false; $('#use-shot').checked = false; $('#use-shot').disabled = true; }

  if (!st.token) { show('setup'); $('#token').focus(); return; }
  show('main'); $('#desc').focus();
  readRemote().then(r => {
    st.remote = r;
    renderTags(r.list.flatMap(p => Array.isArray(p.tags) ? p.tags : []));
    checkDup();
  }).catch(e => { const el = $('#err'); el.textContent = errMsg(e); el.hidden = false; });
}

async function saveToken(e) {
  e.preventDefault();
  const tok = $('#token').value.trim(), err = $('#setup-err'), btn = $('#setup-save');
  if (!tok) { err.textContent = '鍵を貼り付けてください。'; err.hidden = false; return; }
  btn.disabled = true; btn.textContent = '確認中…'; err.hidden = true;
  try {
    st.remote = await readRemote(tok);
    st.token = tok; await chrome.storage.local.set({ token: tok });
    renderTags(st.remote.list.flatMap(p => Array.isArray(p.tags) ? p.tags : []));
    show('main'); checkDup(); $('#desc').focus();
  } catch (e2) {
    err.textContent = e2.status === 401 ? '鍵が正しくないか、期限が切れています。' : (e2.status === 403 || e2.status === 404) ? 'この鍵では figma-plugin-shelf を読めません。' : '確認できませんでした。';
    err.hidden = false;
  }
  btn.disabled = false; btn.textContent = '保存';
}

async function save() {
  const err = $('#err'), btn = $('#save');
  const name = $('#name').value.trim();
  if (!name) { err.textContent = '名前を入力してください。'; err.hidden = false; $('#name').focus(); return; }
  err.hidden = true; btn.disabled = true; btn.textContent = '保存中…';
  try {
    const url = $('#url').value.trim();
    const item = { kind: st.kind, name, desc: $('#desc').value.replace(/\s*\n\s*/g, ' ').trim(), url,
      tags: [...st.tags], memo: $('#memo').value, createdAt: new Date().toISOString() };
    if (st.shot && $('#use-shot').checked) {
      const path = 'images/' + newId() + '.jpg';
      await putFile(path, new Uint8Array(await st.shot.blob.arrayBuffer()), '画像を追加（拡張機能）');
      Object.assign(item, { img: path, imgW: st.shot.w, imgH: st.shot.h });
    }
    for (let tries = 0; ; tries++) {
      const r = await readRemote();
      const m = st.kind === 'plugin' && /plugin\/(\d+)/.exec(url);
      const id = m && !r.list.some(p => p.id === m[1]) ? m[1] : newId();
      const min = r.list.filter(p => (p.kind || 'plugin') === st.kind).reduce((a, p) => Math.min(a, p.order ?? 0), 0);
      const list = [...r.list, { id, ...item, order: min - 1 }];
      const u8 = new TextEncoder().encode(JSON.stringify(list, null, 1) + '\n');
      try { await putFile('data.json', u8, '「' + name + '」を追加（拡張機能）', r.sha); break; }
      catch (e) { if ((e.status !== 409 && e.status !== 422) || tries >= 2) throw e; }
    }
    show('done');
  } catch (e) {
    err.textContent = errMsg(e); err.hidden = false;
    btn.disabled = false; btn.textContent = '保存する';
  }
}
init();
