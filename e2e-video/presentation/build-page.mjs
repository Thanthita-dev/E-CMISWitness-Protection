// สร้างหน้าเว็บเล่นวิดีโอนำเสนอ e2e-video/output-presentation/index.html จากไฟล์ *.meta.json
// ซับไตเติลและแผงขั้นตอนไม่ได้ฝังในวิดีโอ หน้านี้วาดจากข้อมูลที่ฝังใน HTML (ใช้ได้เมื่อเปิดผ่าน file://)
// รัน: node e2e-video/presentation/build-page.mjs [โฟลเดอร์ output]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const bases = [
  'presentation',
  'presentation-main',
  'presentation-fast-track',
  'presentation-appeal',
  'presentation-methods',
  'presentation-extension',
  'presentation-article14',
]
const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', 'output-presentation')
mkdirSync(out, { recursive: true })

// ชื่อแท็บ: คลิปรวม / เส้นทางหลัก ที่เหลือใช้ชื่อคลิป
const tabLabel = { full: 'คลิปรวม', main: 'เส้นทางหลัก' }
const clips = bases
  .map((base) => resolve(out, `${base}.meta.json`))
  .filter((f) => existsSync(f))
  .map((f) => JSON.parse(readFileSync(f, 'utf-8')))
  .map((m) => ({
    base: m.base,
    cut: m.cut,
    label: tabLabel[m.cut] || m.title,
    title: m.title,
    duration: Number(m.duration) || 0,
    video: m.video,
    vtt: m.vtt,
    subtitles: m.subtitles || [],
    chapters: m.chapters || [],
    stages: m.stages || [],
  }))

// ฝัง JSON ใน <script> อย่างปลอดภัย (กัน </script> และ U+2028/2029)
const json = JSON.stringify(clips)
  .replace(/</g, '\\u003c')
  .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
  .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029')

const css = `
:root{--navy:#082b50;--navy-2:#0f416f;--ink:#172434;--muted:#687789;--gold:#caa631;--gold-soft:#f7edcb;--paper:#f4f5f6;--line:#dce3e9;--success:#22704a;--white:#fff}
*{box-sizing:border-box}
html{font-size:100%}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Kanit,"Noto Sans Thai",sans-serif;font-size:1rem;line-height:1.65}
button{font:inherit;color:inherit}
:focus-visible{outline:3px solid rgba(202,166,49,.6);outline-offset:2px;border-radius:4px}
.topbar{background:linear-gradient(135deg,#061d35,var(--navy-2));border-bottom:3px solid var(--gold);color:#fff}
.topbar-in{max-width:1600px;margin:0 auto;padding:.75rem 1.5rem;min-height:64px;display:flex;flex-direction:column;justify-content:center}
.topbar h1{margin:0;font-size:clamp(1.15rem,2.4vw,1.6rem);font-weight:700;line-height:1.3}
.topbar p{margin:0;font-size:.88rem;opacity:.85}
main{max-width:1600px;margin:0 auto;padding:1.2rem 1.5rem 3rem}
.card{background:var(--white);border:1px solid var(--line);border-radius:12px;box-shadow:0 8px 25px rgba(8,43,80,.06)}
.tabs{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 1rem;padding:0;list-style:none}
.tab{min-height:44px;padding:.5rem 1rem;border-radius:8px;border:1px solid #9aabba;background:var(--white);color:var(--navy);font-weight:600;font-size:.88rem;cursor:pointer;display:inline-flex;align-items:center;gap:.5rem;text-align:left}
.tab small{font-weight:400;color:var(--muted)}
.tab[aria-selected="true"]{background:var(--navy);border-color:var(--navy);color:#fff;box-shadow:inset 0 -3px 0 var(--gold)}
.tab[aria-selected="true"] small{color:#dbe6f1}
.layout{display:grid;grid-template-columns:minmax(0,1fr);gap:1rem}
@media(min-width:1100px){.layout{grid-template-columns:minmax(0,7fr) minmax(0,3fr);align-items:start}}
.col{min-width:0;display:flex;flex-direction:column;gap:1rem}
.stage-wrap{position:relative;background:#000;border-radius:12px 12px 0 0;overflow:hidden;aspect-ratio:16/9}
.stage-wrap video{display:block;width:100%;height:100%;background:#000;object-fit:contain}
.subs{position:absolute;left:0;right:0;bottom:3.6rem;display:flex;justify-content:center;padding:0 5%;pointer-events:none}
.subs span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;background:rgba(0,0,0,.78);color:#fff;font-size:clamp(1rem,2.6cqw,1.35rem);font-size:1.35rem;line-height:1.5;padding:.15rem .8rem;border-radius:6px;text-align:center;max-width:100%}
.subs span:empty{display:none}
.stage-wrap:fullscreen{border-radius:0;aspect-ratio:auto;width:100vw;height:100vh}
.stage-wrap:fullscreen .subs span{font-size:1.9rem}
.stage-wrap:-webkit-full-screen{border-radius:0;aspect-ratio:auto;width:100vw;height:100vh}
@media(max-width:600px){.subs span{font-size:1rem}.subs{bottom:3rem}}
.toolbar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.75rem 1rem;border-top:1px solid var(--line)}
.toolbar h2{margin:0;font-size:1.05rem;font-weight:700;color:var(--navy);flex:1 1 14rem;min-width:0}
.btn{min-height:44px;padding:.5rem 1rem;border-radius:8px;border:1px solid #9aabba;background:var(--white);color:var(--navy);font-weight:600;font-size:.88rem;cursor:pointer;display:inline-flex;align-items:center;gap:.45rem;text-decoration:none}
.btn[aria-pressed="true"]{background:var(--navy);color:#fff;border-color:var(--navy)}
.btn[aria-pressed="true"]::before{content:"✓"}
.btn:hover{background:#edf2f6}
.btn[aria-pressed="true"]:hover{background:var(--navy-2)}
.panel{padding:1rem 1.1rem}
.panel h2{margin:0 0 .6rem;font-size:1.05rem;font-weight:700;color:var(--navy)}
.badge{display:inline-block;padding:.28rem .58rem;border-radius:99px;font-size:.74rem;font-weight:600;background:var(--gold-soft);color:#654b08}
.badge.branch{background:#e3edf6;color:var(--navy)}
.step-tab{margin:.5rem 0 0;font-size:.8rem;font-weight:600;color:var(--muted)}
.step-title{margin:0;font-size:1.15rem;font-weight:700;color:var(--navy);line-height:1.4}
.step-text{margin:.4rem 0;color:var(--ink)}
.step-role{margin:0;font-size:.88rem;color:var(--muted)}
.route{display:flex;flex-wrap:wrap;gap:.4rem;margin:.9rem 0 0;padding:0;list-style:none}
.route li{display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .6rem;border-radius:99px;border:1px solid var(--line);font-size:.8rem;font-weight:600;background:var(--white);color:var(--muted)}
.route li.done{background:#dff0e7;border-color:#b9dcc9;color:#1e6141}
.route li.done::before{content:"✓"}
.route li.current{background:var(--navy);border-color:var(--navy);color:#fff;box-shadow:0 0 0 2px var(--gold)}
.route li.current::before{content:"▶"}
.route li.pending::before{content:"○"}
.empty{margin:0;color:var(--muted);font-size:.88rem}
.chapters{margin:0;padding:0;list-style:none;max-height:26rem;overflow:auto}
.chapters li+li{border-top:1px solid #e8edf1}
.chap{width:100%;min-height:44px;padding:.5rem .6rem;border:0;background:transparent;text-align:left;cursor:pointer;display:flex;gap:.6rem;align-items:baseline;border-left:4px solid transparent;border-radius:0}
.chap time{font-variant-numeric:tabular-nums;font-weight:600;color:var(--navy);flex:none}
.chap:hover{background:#f6f8fa}
.chap[aria-current="true"]{background:var(--gold-soft);border-left-color:var(--gold);font-weight:600}
.chap[aria-current="true"]::after{content:"กำลังเล่น";margin-left:auto;font-size:.74rem;color:#654b08;flex:none}
.dl{display:flex;flex-wrap:wrap;gap:.5rem}
.none{padding:2rem 1.5rem;text-align:center}
.none code{background:var(--gold-soft);padding:.1rem .45rem;border-radius:6px}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`

const js = `
(function () {
  var clips = JSON.parse(document.getElementById('clip-data').textContent);
  var $ = function (id) { return document.getElementById(id); };
  var video = $('video'), wrap = $('stage'), subsEl = $('subs').firstChild;
  var cur = null, subsOn = true, lastSub = -2, lastStage = -2, lastChap = -2;

  try { subsOn = localStorage.getItem('ecmis-present-subs') !== '0'; } catch (e) {}

  function mmss(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  // หา index ล่าสุดที่ at <= t (รายการเรียงตามเวลา)
  function lastAt(list, t, key) {
    var r = -1;
    for (var i = 0; i < list.length; i++) { if (list[i][key] <= t) r = i; else break; }
    return r;
  }

  function renderTabs() {
    var ul = $('tabs');
    clips.forEach(function (c) {
      var li = el('li');
      var b = el('button', 'tab');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.cut = c.cut;
      b.appendChild(document.createTextNode(c.label + ' '));
      b.appendChild(el('small', '', mmss(c.duration)));
      b.addEventListener('click', function () { select(c.cut, true); });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }

  function select(cut, push) {
    var c = clips.filter(function (x) { return x.cut === cut; })[0] || clips[0];
    cur = c;
    if (push) { try { history.replaceState(null, '', '#' + c.cut); } catch (e) { location.hash = c.cut; } }
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.setAttribute('aria-selected', String(b.dataset.cut === c.cut));
    });
    video.pause();
    video.src = c.video;
    video.load();
    $('clip-title').textContent = c.title + ' (' + mmss(c.duration) + ')';
    $('dl-mp4').href = c.video;
    $('dl-vtt').href = c.vtt;
    var ul = $('chapters');
    ul.textContent = '';
    c.chapters.forEach(function (ch, i) {
      var li = el('li');
      var b = el('button', 'chap');
      b.type = 'button';
      b.dataset.i = i;
      b.appendChild(el('time', '', mmss(ch.at)));
      b.appendChild(el('span', '', '· ' + ch.roleName + ' — ' + ch.label));
      b.addEventListener('click', function () { video.currentTime = ch.at; video.play(); });
      li.appendChild(b);
      ul.appendChild(li);
    });
    $('chapters-empty').hidden = c.chapters.length > 0;
    lastSub = lastStage = lastChap = -2;
    sync();
  }

  function renderSub(t) {
    var i = -1, s = cur.subtitles;
    for (var k = 0; k < s.length; k++) { if (t >= s[k].from && t < s[k].to) { i = k; break; } }
    if (i === lastSub) return;
    lastSub = i;
    subsEl.textContent = subsOn && i >= 0 ? s[i].text : '';
  }

  function renderStage(t) {
    var i = lastAt(cur.stages, t, 'at');
    if (i === lastStage) return;
    lastStage = i;
    var box = $('step');
    box.textContent = '';
    var st = i >= 0 ? cur.stages[i].stage : null;
    if (!st) {
      box.appendChild(el('p', 'empty', 'ยังไม่อยู่ในขั้นตอนของกระบวนงาน (ช่วงแนะนำหรือสรุป)'));
      return;
    }
    box.appendChild(el('span', st.branch ? 'badge branch' : 'badge', st.branch ? 'ทางแยก: ' + st.branch : 'เส้นทางหลัก'));
    box.appendChild(el('p', 'step-tab', st.tab));
    box.appendChild(el('p', 'step-title', st.title));
    box.appendChild(el('p', 'step-text', st.step));
    box.appendChild(el('p', 'step-role', '👤 ' + st.roleName));
    var ol = el('ol', 'route');
    ol.setAttribute('aria-label', 'ลำดับขั้นตอน');
    (st.route || []).forEach(function (tab) {
      var done = (st.doneTabs || []).indexOf(tab) >= 0;
      var isCur = tab === st.tab;
      var li = el('li', isCur ? 'current' : done ? 'done' : 'pending', tab);
      li.setAttribute('aria-label', tab + (isCur ? ' (ขั้นปัจจุบัน)' : done ? ' (เสร็จแล้ว)' : ' (รอดำเนินการ)'));
      if (isCur) li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  function renderChap(t) {
    var i = lastAt(cur.chapters, t, 'at');
    if (i === lastChap) return;
    lastChap = i;
    Array.prototype.forEach.call($('chapters').querySelectorAll('.chap'), function (b) {
      if (Number(b.dataset.i) === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  function sync() {
    if (!cur) return;
    var t = video.currentTime || 0;
    renderSub(t); renderStage(t); renderChap(t);
  }
  function loop() { sync(); if (!video.paused && !video.ended) requestAnimationFrame(loop); }

  ['timeupdate', 'seeked', 'loadedmetadata'].forEach(function (ev) { video.addEventListener(ev, sync); });
  video.addEventListener('play', function () { requestAnimationFrame(loop); });

  var subBtn = $('sub-toggle');
  function paintSubBtn() { subBtn.setAttribute('aria-pressed', String(subsOn)); }
  subBtn.addEventListener('click', function () {
    subsOn = !subsOn;
    try { localStorage.setItem('ecmis-present-subs', subsOn ? '1' : '0'); } catch (e) {}
    paintSubBtn(); lastSub = -2; sync();
  });
  paintSubBtn();

  // เต็มจอที่ตัวห่อ เพื่อให้ซับไตเติลแสดงด้วย
  $('fs').addEventListener('click', function () {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    var req = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
    if (req) req.call(wrap);
  });

  renderTabs();
  window.addEventListener('hashchange', function () { select(location.hash.slice(1), false); });
  select(location.hash.slice(1) || clips[0].cut, false);
})();
`

const empty = `<main><section class="card none"><h2>ยังไม่มีวิดีโอ</h2><p>ยังไม่มีวิดีโอ — รัน <code>pnpm video:presentation:all</code></p></section></main>`

const body = clips.length
  ? `<main>
<ul class="tabs" id="tabs" role="tablist" aria-label="เลือกคลิป"></ul>
<div class="layout">
  <div class="col">
    <section class="card" aria-label="วิดีโอ">
      <div class="stage-wrap" id="stage">
        <video id="video" controls preload="metadata" playsinline></video>
        <div class="subs" id="subs" aria-live="off"><span></span></div>
      </div>
      <div class="toolbar">
        <h2 id="clip-title"></h2>
        <button type="button" class="btn" id="sub-toggle" aria-pressed="true">ซับไตเติล</button>
        <button type="button" class="btn" id="fs">เต็มจอ</button>
      </div>
    </section>
    <section class="card panel" aria-label="ดาวน์โหลด">
      <h2>ดาวน์โหลด</h2>
      <div class="dl">
        <a class="btn" id="dl-mp4" download>ดาวน์โหลด MP4</a>
        <a class="btn" id="dl-vtt" download>ดาวน์โหลดซับไตเติล (.vtt)</a>
      </div>
    </section>
  </div>
  <div class="col">
    <section class="card panel" aria-labelledby="step-h" aria-live="polite">
      <h2 id="step-h">ขั้นตอนปัจจุบัน</h2>
      <div id="step"></div>
    </section>
    <section class="card panel" aria-labelledby="chap-h">
      <h2 id="chap-h">บทในคลิป</h2>
      <p class="empty" id="chapters-empty" hidden>คลิปนี้ไม่มีบท</p>
      <ul class="chapters" id="chapters"></ul>
    </section>
  </div>
</div>
<script type="application/json" id="clip-data">${json}</script>
<script>${js}</script>
</main>`
  : empty

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>วิดีโอนำเสนอ E-CMIS · ระบบคุ้มครองพยาน</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<header class="topbar"><div class="topbar-in"><h1>วิดีโอนำเสนอ E-CMIS · ระบบคุ้มครองพยาน ป.ป.ท.</h1><p>กิจกรรมที่ 6 พร้อมเสียงบรรยาย ซับไตเติลและขั้นตอนแสดงจากข้อมูลบนหน้านี้</p></div></header>
${body}
</body>
</html>
`
writeFileSync(resolve(out, 'index.html'), html)
console.log(`สร้าง ${resolve(out, 'index.html')} (${clips.length} คลิป)`)
