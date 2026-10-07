// สร้างหน้าคู่มือสาธิต e2e-video/output-guide/index.html จากโฟลเดอร์ <flowId>/guide.json + ภาพ JPG
// หน้าเว็บวาดจากข้อมูลที่ฝังใน HTML (ใช้ได้เมื่อเปิดผ่าน file://) ภาพอ้างด้วย path แบบ relative: <flowId>/<file>
// รัน: node e2e-video/presentation/guide/build-guide.mjs [โฟลเดอร์ output]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ค้นหาเส้นทางอัตโนมัติ: ทุกโฟลเดอร์ย่อยที่ไม่ขึ้นต้นด้วย "_" และมี guide.json
// ลำดับ: guide.json.order → (ไม่มี) main ก่อน แล้ว id ที่รู้จักตามลำดับนี้ → ตัวอักษร
const KNOWN = ['main', 'article14', 'article14-ceiling', 'appeal', 'methods', 'fast-track', 'fast-track-denied', 'returns', 'extension', 'intake']
const SHORT = { main: 'เส้นทางหลัก', article14: 'ทางแยก 1: ส่งกรมคุ้มครองสิทธิฯ', appeal: 'ทางแยก 2: ไม่อนุมัติ → อุทธรณ์' }
// กลุ่มแท็บ: main / ทางแยกจากการตัดสินของเลขาธิการฯ / อื่น ๆ
const SECRETARY_IDS = ['article14', 'appeal', 'returns']
const groupOf = (id) => (id === 'main' ? 'main' : SECRETARY_IDS.includes(id) ? 'secretary' : 'other')
const shortLabel = (id, title) => SHORT[id] || String(title || id).replace(/^\s*ทางแยก(\s*\d+)?\s*:\s*/, '').trim() || id
const rank = (g, id) => (Number.isFinite(g.order) ? g.order : 1000 + (KNOWN.includes(id) ? KNOWN.indexOf(id) : KNOWN.length))

const here = dirname(fileURLToPath(import.meta.url))
const out = process.argv[2] ? resolve(process.argv[2]) : resolve(here, '..', '..', 'output-guide')

const flows = (existsSync(out) ? readdirSync(out, { withFileTypes: true }) : [])
  .filter((e) => e.isDirectory() && !e.name.startsWith('_') && existsSync(resolve(out, e.name, 'guide.json')))
  .map((e) => {
    const g = JSON.parse(readFileSync(resolve(out, e.name, 'guide.json'), 'utf-8'))
    const id = g.id || e.name
    return { ...g, id, dir: e.name, label: shortLabel(id, g.title), group: groupOf(id), sections: g.sections || [], shots: g.shots || [] }
  })
  .sort((a, b) => rank(a, a.id) - rank(b, b.id) || a.id.localeCompare(b.id))

if (!flows.length) {
  console.error(`ไม่พบ <flowId>/guide.json ในโฟลเดอร์ย่อยของ ${out}`)
  console.error('รัน Playwright guide ก่อน (e2e-video/presentation/guide/guide.spec.ts) หรือระบุโฟลเดอร์: node build-guide.mjs <outRoot>')
  process.exit(1)
}

// ฝัง JSON ใน <script> อย่างปลอดภัย (กัน </script> และ U+2028/2029)
const json = JSON.stringify(flows)
  .replace(/</g, '\\u003c')
  .replace(new RegExp(String.fromCharCode(0x2028), 'g'), '\\u2028')
  .replace(new RegExp(String.fromCharCode(0x2029), 'g'), '\\u2029')

const css = `
:root{--navy:#082b50;--navy-2:#0f416f;--ink:#172434;--muted:#687789;--gold:#caa631;--gold-soft:#f7edcb;--paper:#f4f5f6;--line:#dce3e9;--white:#fff;--chip-bg:#e3edf7;--chip-fg:#0b3a6b;--quote-bg:#fff8e5;--quote-fg:#5f5027;--shadow:rgba(8,43,80,.06);--btn-fg:#fff}
@media (prefers-color-scheme:dark){:root{--navy:#9cc3ee;--navy-2:#16406b;--ink:#e6edf4;--muted:#9aabba;--gold-soft:#4a3f16;--paper:#0e1824;--line:#243649;--white:#15222f;--chip-bg:#1d3a58;--chip-fg:#bcd8f5;--quote-bg:#2b2612;--quote-fg:#ecd9a0;--shadow:rgba(0,0,0,.3);--btn-fg:#0e1824}}
*{box-sizing:border-box}
html{font-size:100%;scroll-behavior:smooth;scroll-padding-top:5rem}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Kanit,"Noto Sans Thai","Sarabun","Thonburi",sans-serif;font-size:1rem;line-height:1.65}
button{font:inherit;color:inherit}
html,button,a,select,.lb,.pm{touch-action:manipulation}
:focus-visible{outline:3px solid rgba(202,166,49,.7);outline-offset:2px;border-radius:4px}
.topbar{background:linear-gradient(135deg,#061d35,#0f416f);border-bottom:3px solid var(--gold);color:#fff}
.topbar-in{max-width:1600px;margin:0 auto;padding:.75rem 1.5rem;display:flex;flex-direction:column;gap:.1rem}
.topbar h1{margin:0;font-size:clamp(1.15rem,2.4vw,1.7rem);font-weight:700;line-height:1.3}
.topbar p{margin:0;font-size:.88rem;opacity:.88}
.bar{position:sticky;top:0;z-index:20;background:var(--paper);border-bottom:1px solid var(--line)}
.bar-in{max-width:1600px;margin:0 auto;padding:.6rem 1.5rem;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.tabs{display:flex;flex-direction:column;gap:.45rem;flex:1;min-width:0}
.tab-sel{display:none;width:100%;min-width:0;min-height:44px;padding:.4rem .6rem;border-radius:8px;border:1px solid #9aabba;background:var(--white);color:var(--navy);font-weight:600;font-size:.88rem}
.tg{display:flex;flex-wrap:wrap;align-items:center;gap:.4rem .5rem}
.tg-l{flex:0 0 13.5rem;font-size:.76rem;font-weight:600;color:var(--muted)}
.tg ul{display:flex;flex-wrap:wrap;gap:.4rem;margin:0;padding:0;list-style:none;flex:1;min-width:0}
.case-note{margin:.15rem 0 0;font-size:.8rem;display:inline-block;padding:.05rem .6rem;border-radius:99px;background:var(--gold-soft);color:#654b08;width:fit-content}
.callout a{color:inherit;font-weight:600;text-decoration:underline;text-underline-offset:2px}
.tab{min-height:44px;max-width:100%;padding:.4rem 1rem;text-align:left;border-radius:8px;border:1px solid #9aabba;background:var(--white);color:var(--navy);font-weight:600;font-size:.88rem;cursor:pointer}
.tab[aria-current=true]{background:var(--navy);color:var(--btn-fg);border-color:var(--navy)}
.btn{min-height:44px;padding:.4rem 1rem;border-radius:8px;border:1px solid var(--gold);background:var(--gold);color:#172434;font-weight:700;font-size:.88rem;cursor:pointer}
.btn.ghost{background:var(--white);color:var(--navy);border-color:#9aabba;font-weight:600}
main{max-width:1600px;margin:0 auto;padding:1.2rem 1.5rem 4rem}
.summary{margin:0 0 1rem}
.summary h2{margin:0;font-size:1.35rem;color:var(--navy)}
.summary p{margin:.2rem 0 0;color:var(--muted)}
.callout{margin:0 0 1rem;padding:.8rem .9rem;border-left:4px solid var(--gold);background:var(--quote-bg);color:var(--quote-fg);border-radius:0 8px 8px 0}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:1.5rem;align-items:start}
.toc{position:sticky;top:5rem;max-height:calc(100vh - 6rem);overflow:auto;background:var(--white);border:1px solid var(--line);border-radius:12px;padding:.6rem;box-shadow:0 8px 25px var(--shadow)}
.toc h3{margin:.2rem .4rem .4rem;font-size:.8rem;color:var(--muted);font-weight:600}
.toc a{display:block;padding:.45rem .6rem;border-radius:8px;color:var(--ink);text-decoration:none;font-size:.88rem;line-height:1.4}
.toc a:hover{background:var(--paper)}
.toc a.on{background:var(--gold-soft)}
.toc .rng{display:block;font-size:.76rem;color:var(--muted)}
.chip{display:inline-block;padding:.1rem .55rem;border-radius:99px;background:var(--chip-bg);color:var(--chip-fg);font-size:.74rem;font-weight:600;white-space:nowrap}
.sec{margin:2rem 0 .8rem;padding-bottom:.4rem;border-bottom:2px solid var(--gold)}
.sec:first-child{margin-top:0}
.sec h2{margin:.2rem 0 0;font-size:1.3rem;color:var(--navy);line-height:1.35}
.sec p{margin:.2rem 0 0;color:var(--muted);font-size:.9rem}
.step{display:grid;grid-template-columns:5.2rem minmax(0,1fr);gap:.2rem 1rem;background:var(--white);border:1px solid var(--line);border-radius:12px;padding:1rem;margin:0 0 1rem;box-shadow:0 8px 25px var(--shadow)}
.num{font-size:3rem;font-weight:700;line-height:1;color:var(--gold);text-align:center}
.body{min-width:0}
.verb{display:inline-block;margin-right:.5rem;padding:.1rem .7rem;border-radius:6px;background:var(--navy);color:var(--btn-fg);font-weight:700;font-size:.88rem}
.verb.look,.verb.result{background:var(--gold);color:#172434}
.note{font-size:1.1rem;font-weight:500;margin:.2rem 0}
.quote{margin:.4rem 0;padding:.6rem .8rem;border-left:4px solid var(--gold);background:var(--quote-bg);color:var(--quote-fg);border-radius:0 8px 8px 0;white-space:pre-wrap;overflow-wrap:anywhere}
.url{font-size:.76rem;color:var(--muted);overflow-wrap:anywhere}
.shot{display:block;margin:.7rem 0 0;padding:0;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:var(--paper);cursor:zoom-in;width:100%}
.shot img{display:block;width:100%;height:auto;aspect-ratio:1440/900}
.lb{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.88);display:none;flex-direction:column;align-items:center;justify-content:center;padding:1rem}
.lb.open{display:flex}
.lb img{max-width:100%;max-height:calc(100vh - 6rem);border-radius:6px;background:#fff}
.lb .cap{color:#fff;margin-top:.6rem;text-align:center;font-size:.95rem}
.lb .ctl{position:absolute;top:.8rem;right:.8rem;display:flex;gap:.5rem}
.lb .nav{position:absolute;top:50%;transform:translateY(-50%);width:48px;height:64px;border:0;border-radius:8px;background:rgba(255,255,255,.18);color:#fff;font-size:1.8rem;cursor:pointer}
.lb .prev{left:.6rem}.lb .next{right:.6rem}
.pm{position:fixed;inset:0;z-index:40;background:var(--paper);display:none;flex-direction:column}
.pm.open{display:flex}
.pm-top{display:flex;align-items:center;gap:1rem;padding:.6rem 1rem;background:var(--navy-2);color:#fff}
.pm-top .prog{flex:1;height:10px;border-radius:99px;background:rgba(255,255,255,.25);overflow:hidden}
.pm-top .prog i{display:block;height:100%;background:var(--gold);width:0}
.pm-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(260px,32%) minmax(0,1fr);gap:1.2rem;padding:1rem 1.2rem}
.pm-info{overflow:auto;container-type:inline-size}
.pm-info .num{text-align:left;font-size:4.5rem}
.pm-info .note{font-size:1.5rem;line-height:1.4}
.pm-img{min-height:0;display:flex;align-items:center;justify-content:center}
.pm-img img{max-width:100%;max-height:100%;object-fit:contain;border:1px solid var(--line);border-radius:8px;background:#fff}
.pm-next{margin-top:1rem;padding:.6rem .75rem;border:1px solid var(--line);border-radius:8px;background:var(--white);cursor:default}
.pm-next-lbl{color:var(--muted);font-size:.76rem;font-weight:600;margin-bottom:.4rem}
.pm-next-grid{display:grid;grid-template-columns:minmax(0,min(40%,160px)) minmax(0,1fr);gap:.6rem;align-items:start}
.pm-next-grid img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:6px;background:#fff}
.pm-next-txt{min-width:0;font-size:.88rem;line-height:1.4}
.pm-next-hd{display:flex;flex-wrap:wrap;align-items:center;gap:.3rem}
.pm-next-hd .verb{margin-right:0}
.pm-next-hd .chip{white-space:normal;overflow-wrap:anywhere}
.pm-next-n{font-weight:700}
.pm-next-desc{margin-top:.3rem;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
.pm-next-end{color:var(--muted);font-size:.88rem}
@container (max-width:360px){.pm-next-grid{grid-template-columns:minmax(0,96px) minmax(0,1fr)}}
.pm-foot{display:flex;gap:.5rem;justify-content:center;padding:.6rem;border-top:1px solid var(--line)}
@media (max-width:900px){
  .layout{grid-template-columns:minmax(0,1fr)}
  .toc{position:static;max-height:14rem}
  .pm-body{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
  .pm-info{max-height:40vh}
}
@media (max-width:700px){
  .tg{display:none}
  .tab-sel{display:block}
  .bar-in{flex-wrap:nowrap}
  .btn{padding:.4rem .75rem}
}
@media (max-width:480px){
  .topbar-in,.bar-in,main{padding-left:16px;padding-right:16px}
  .step{grid-template-columns:minmax(0,1fr)}
  .num{text-align:left;font-size:2.2rem}
}
@media print{
  .bar,.toc,.lb,.pm,.callout,.case-note{display:none!important}
  body{background:#fff;color:#000}
  .layout{display:block}
  .step{break-inside:avoid;page-break-inside:avoid;min-height:46vh;box-shadow:none}
  .sec{break-after:avoid}
  .panel[hidden]{display:block!important}
  .topbar{background:#fff;color:#000;border-bottom:2px solid #000}
}
`

const js = `
(function(){
var FLOWS=JSON.parse(document.getElementById('guide-data').textContent);
var VERB={click:'กด',fill:'กรอก',select:'เลือก',check:'ติ๊ก',attach:'แนบไฟล์',date:'ระบุวันที่',confirm:'ยืนยัน',look:'ดู',result:'ผลลัพธ์'};
var $=function(s,r){return (r||document).querySelector(s)};
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function pad(n){return String(n).padStart(3,'0')}
function thDate(iso){var d=new Date(iso);if(isNaN(d))return '';return d.toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})}
function img(f,s){return (f.dir||f.id)+'/'+s.file}

var cur=0,pmOn=false,pmIdx=0,lbIdx=-1;
var tabsEl=$('#tabs'),panelEl=$('#panel');
var cd=FLOWS.map(function(f){return f.capturedAt}).filter(Boolean).sort().pop();
if(cd)$('#cap').textContent=' · ถ่ายภาพเมื่อ '+thDate(cd);

// จุดต่อของทางแยกในเส้นทางหลัก: ใช้ branchSection ก่อน แล้วถอยไปหาขั้นของเลขาธิการฯ
var DEFAULT_CASE='WP-2569-000612';
function mainIdx(){for(var i=0;i<FLOWS.length;i++)if(FLOWS[i].id==='main')return i;return -1}
function branchInfo(f){
  var mi=mainIdx();if(mi<0)return null;var m=FLOWS[mi];
  if(f.branchSection){
    var ns=m.shots.filter(function(s){return s.section===f.branchSection}).map(function(s){return s.n});
    if(ns.length){var a=Math.min.apply(null,ns),b=Math.max.apply(null,ns);
      return {mi:mi,n:a,label:'ขั้นที่ '+(a===b?a:a+'–'+b)+' ‘'+f.branchSection+'’ ของเส้นทางหลัก',pre:'ต่อจาก',post:''}}
  }
  for(var i=0;i<m.shots.length;i++)if(m.shots[i].role==='secretary'){var n=m.shots[i].n||i+1;
    return {mi:mi,n:n,label:'ขั้นที่ '+n+' ของเส้นทางหลัก',pre:'ต่อจาก',post:' (เลขาธิการฯ พิจารณา)'}}
  return null;
}
function branchCallout(f){
  var c=el('div','callout'),bi=branchInfo(f);
  if(!bi){c.textContent='ต่อจากจุดที่เลขาธิการฯ พิจารณาในเส้นทางหลัก';return c}
  c.appendChild(document.createTextNode(bi.pre+' '));
  var a=el('a',null,bi.label);a.href='#main';
  a.onclick=function(e){e.preventDefault();select(bi.mi);var t=document.getElementById('s'+bi.n);if(t)t.scrollIntoView()};
  c.appendChild(a);if(bi.post)c.appendChild(document.createTextNode(bi.post));
  return c;
}

var GROUPS=[['main','เส้นทางหลัก'],['secretary','ทางแยกจากการตัดสินของเลขาธิการฯ'],['other','Edge case อื่น ๆ']];
function renderTabs(){
  tabsEl.textContent='';
  GROUPS.forEach(function(g){
    var items=[];FLOWS.forEach(function(f,i){if(f.group===g[0])items.push(i)});
    if(!items.length)return;
    var row=el('div','tg');row.setAttribute('role','group');row.setAttribute('aria-label',g[1]);
    row.appendChild(el('span','tg-l',g[1]));
    var ul=el('ul');
    items.forEach(function(i){var f=FLOWS[i];
      var li=el('li');var b=el('button','tab',f.label+' ('+f.shots.length+')');
      b.type='button';if(i===cur)b.setAttribute('aria-current','true');
      b.onclick=function(){select(i)};li.appendChild(b);ul.appendChild(li);
    });
    row.appendChild(ul);tabsEl.appendChild(row);
  });
  // จอแคบ: ใช้ select แบบแบ่งกลุ่มแทนแถวปุ่ม
  var sel=el('select','tab-sel');sel.setAttribute('aria-label','เลือกเส้นทางสาธิต');
  GROUPS.forEach(function(g){
    var og=null;FLOWS.forEach(function(f,i){if(f.group!==g[0])return;
      if(!og){og=document.createElement('optgroup');og.label=g[1];sel.appendChild(og)}
      var o=el('option',null,f.label+' ('+f.shots.length+')');o.value=String(i);if(i===cur)o.selected=true;og.appendChild(o)});
  });
  sel.onchange=function(){select(parseInt(sel.value,10))};
  tabsEl.appendChild(sel);
}

function range(f,sec){
  var ns=f.shots.filter(function(s){return s.section===sec.title}).map(function(s){return s.n});
  if(!ns.length)return '';
  var a=Math.min.apply(null,ns),b=Math.max.apply(null,ns);
  return a===b?'ขั้น '+a:'ขั้น '+a+'–'+b;
}

function stepCard(f,s){
  var c=el('article','step');c.id='s'+s.n;
  c.appendChild(el('div','num',String(s.n)));
  var b=el('div','body');
  var h=el('div');
  var v=el('span','verb '+s.action,VERB[s.action]||s.action);h.appendChild(v);
  if(s.roleName)h.appendChild(el('span','chip',s.roleName));
  b.appendChild(h);
  b.appendChild(el('div','note',s.note||''));
  if(s.value)b.appendChild(el('div','quote',s.value));
  if(s.url){var p=s.url;try{var u=new URL(s.url,'http://x');p=u.pathname+u.search+u.hash}catch(e){}b.appendChild(el('div','url',p))}
  var sb=el('button','shot');sb.type='button';sb.setAttribute('aria-label','ขยายภาพขั้นที่ '+s.n);
  var im=el('img');im.loading='lazy';im.alt='ภาพหน้าจอขั้นที่ '+s.n+': '+(s.note||'');im.src=img(f,s);
  sb.appendChild(im);sb.onclick=function(){openLb(s.n-1)};
  b.appendChild(sb);c.appendChild(b);return c;
}

function renderPanel(){
  var f=FLOWS[cur];panelEl.textContent='';
  var sm=el('div','summary');sm.appendChild(el('h2',null,f.title||f.label));
  if(f.summary)sm.appendChild(el('p',null,f.summary));
  panelEl.appendChild(sm);
  if(f.branchFrom||f.branchSection)panelEl.appendChild(branchCallout(f));
  var lay=el('div','layout');var toc=el('nav','toc');toc.setAttribute('aria-label','สารบัญ');
  toc.appendChild(el('h3',null,'สารบัญ'));
  var main=el('div');
  f.sections.forEach(function(sec,si){
    var id='sec'+si;
    var a=el('a');a.href='#'+f.id+'/'+id;a.dataset.t=id;
    a.appendChild(el('span','chip',sec.roleName||sec.role||''));
    a.appendChild(document.createTextNode(' '+sec.title));
    a.appendChild(el('span','rng',range(f,sec)));
    a.onclick=function(e){e.preventDefault();var t=document.getElementById(id);if(t)t.scrollIntoView()};
    toc.appendChild(a);
    var hd=el('div','sec');hd.id=id;
    hd.appendChild(el('span','chip',sec.roleName||sec.role||''));
    hd.appendChild(el('h2',null,sec.title));
    if(sec.detail)hd.appendChild(el('p',null,sec.detail));
    main.appendChild(hd);
    f.shots.filter(function(s){return s.section===sec.title}).forEach(function(s){main.appendChild(stepCard(f,s))});
  });
  // ขั้นที่ไม่อยู่ใน section ใดเลย
  var known={};f.sections.forEach(function(s){known[s.title]=1});
  f.shots.filter(function(s){return !known[s.section]}).forEach(function(s){main.appendChild(stepCard(f,s))});
  lay.appendChild(toc);lay.appendChild(main);panelEl.appendChild(lay);
  observe();
}

var io=null;
function observe(){
  if(io)io.disconnect();
  if(!('IntersectionObserver' in window))return;
  io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){
      document.querySelectorAll('.toc a').forEach(function(a){a.classList.toggle('on',a.dataset.t===e.target.id)});
    }});
  },{rootMargin:'-80px 0px -70% 0px'});
  document.querySelectorAll('.sec').forEach(function(s){io.observe(s)});
}

function renderCase(){
  var f=FLOWS[cur],n=$('#case-note');
  if(f.caseNo&&f.caseNo!==DEFAULT_CASE){n.textContent='เรื่องที่ใช้ในแท็บนี้: '+f.caseNo;n.hidden=false}
  else{n.textContent='';n.hidden=true}
}
function select(i,noHash){
  cur=i;if(!noHash)history.replaceState(null,'','#'+FLOWS[i].id);
  renderTabs();renderCase();renderPanel();window.scrollTo(0,0);if(pmOn)pmShow(0);
}

// lightbox
var lb=$('#lb'),lbImg=$('#lb-img'),lbCap=$('#lb-cap');
function openLb(i){var f=FLOWS[cur];if(i<0||i>=f.shots.length)return;lbIdx=i;var s=f.shots[i];
  lbImg.src=img(f,s);lbImg.alt=s.note||'';lbCap.textContent='ขั้น '+s.n+'/'+f.shots.length+' · '+(VERB[s.action]||'')+' '+(s.note||'');lb.classList.add('open')}
function closeLb(){lb.classList.remove('open');lbIdx=-1}
$('#lb-close').onclick=closeLb;$('#lb-prev').onclick=function(e){e.stopPropagation();openLb(lbIdx-1)};
$('#lb-next').onclick=function(e){e.stopPropagation();openLb(lbIdx+1)};
lb.onclick=function(e){if(e.target===lb)closeLb()};

// presenter mode
var pm=$('#pm');
function pmShow(i){
  var f=FLOWS[cur],n=f.shots.length;pmIdx=Math.max(0,Math.min(n-1,i));var s=f.shots[pmIdx];
  $('#pm-count').textContent='ขั้น '+(pmIdx+1)+'/'+n;$('#pm-prog').style.width=((pmIdx+1)/n*100)+'%';
  var info=$('#pm-info');info.textContent='';
  var sec=f.sections.filter(function(x){return x.title===s.section})[0];
  info.appendChild(el('div','url',f.label+' › '+(s.section||'')));
  info.appendChild(el('div','num',String(s.n)));
  var h=el('div');h.appendChild(el('span','verb '+s.action,VERB[s.action]||s.action));
  if(s.roleName)h.appendChild(el('span','chip',s.roleName));info.appendChild(h);
  info.appendChild(el('div','note',s.note||''));
  if(s.value)info.appendChild(el('div','quote',s.value));
  var im=$('#pm-img');im.src=img(f,s);im.alt=s.note||'';
  var nx=f.shots[pmIdx+1];if(nx){var pre=new Image();pre.src=img(f,nx)}
  var box=el('div','pm-next');box.setAttribute('role','region');box.setAttribute('aria-label','ขั้นถัดไป');
  box.appendChild(el('div','pm-next-lbl','ขั้นถัดไป'));
  if(nx){
    var g=el('div','pm-next-grid');var ti=document.createElement('img');ti.src=img(f,nx);ti.alt=nx.note||'';ti.loading='lazy';g.appendChild(ti);
    var tx=el('div','pm-next-txt');var hd=el('div','pm-next-hd');hd.appendChild(el('span','pm-next-n',String(nx.n)));
    hd.appendChild(el('span','verb '+nx.action,VERB[nx.action]||nx.action));
    if(nx.roleName)hd.appendChild(el('span','chip',nx.roleName));tx.appendChild(hd);
    var d=el('div','pm-next-desc',nx.note||'');d.title=nx.note||'';tx.appendChild(d);g.appendChild(tx);box.appendChild(g);
  }else box.appendChild(el('div','pm-next-end','ขั้นสุดท้ายของเส้นทางนี้'));
  info.appendChild(box);
}
function pmOpen(){pmOn=true;pm.classList.add('open');document.body.style.overflow='hidden';pmShow(0)}
function pmClose(){pmOn=false;pm.classList.remove('open');document.body.style.overflow=''}
$('#pm-toggle').onclick=function(){pmOn?pmClose():pmOpen()};
$('#pm-exit').onclick=pmClose;$('#pm-prev').onclick=function(){pmShow(pmIdx-1)};$('#pm-next').onclick=function(){pmShow(pmIdx+1)};

document.addEventListener('keydown',function(e){
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(lbIdx>=0){
    if(e.key==='Escape')closeLb();else if(e.key==='ArrowRight')openLb(lbIdx+1);else if(e.key==='ArrowLeft')openLb(lbIdx-1);else return;
    e.preventDefault();return;
  }
  if(pmOn){
    if(e.key==='Escape')pmClose();
    else if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown')pmShow(pmIdx+1);
    else if(e.key==='ArrowLeft'||e.key==='PageUp')pmShow(pmIdx-1);
    else return;
    e.preventDefault();
  }
});

function fromHash(){
  var id=(location.hash||'').slice(1).split('/')[0];
  var i=FLOWS.findIndex(function(f){return f.id===id});
  return i<0?0:i;
}
window.addEventListener('hashchange',function(){var i=fromHash();if(i!==cur)select(i,true)});
select(fromHash(),true);
})();
`

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>คู่มือสาธิตระบบคุ้มครองพยาน ก6</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<header class="topbar"><div class="topbar-in">
<h1>คู่มือสาธิตระบบคุ้มครองพยาน (ก6)</h1>
<p>เรื่อง WP-2569-000612 · สูบบุหรี่ในที่ทำงาน · ผู้ขอรับการคุ้มครอง ตรีรุด หล่อจัง<span id="cap"></span></p>
<p class="case-note" id="case-note" hidden></p>
</div></header>
<div class="bar"><div class="bar-in">
<nav class="tabs" id="tabs" aria-label="เส้นทางสาธิต"></nav>
<button type="button" class="btn" id="pm-toggle">โหมดนำเสนอ</button>
</div></div>
<main><div class="panel" id="panel"></div></main>

<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="ภาพขยาย">
<div class="ctl"><button type="button" class="btn ghost" id="lb-close">ปิด (Esc)</button></div>
<button type="button" class="nav prev" id="lb-prev" aria-label="ขั้นก่อนหน้า">‹</button>
<img id="lb-img" alt="">
<button type="button" class="nav next" id="lb-next" aria-label="ขั้นถัดไป">›</button>
<div class="cap" id="lb-cap"></div>
</div>

<div class="pm" id="pm" role="dialog" aria-label="โหมดนำเสนอ">
<div class="pm-top"><strong id="pm-count">ขั้น 1/1</strong><div class="prog"><i id="pm-prog"></i></div>
<button type="button" class="btn ghost" id="pm-exit">ออก (Esc)</button></div>
<div class="pm-body"><div class="pm-info" id="pm-info"></div><div class="pm-img"><img id="pm-img" alt=""></div></div>
<div class="pm-foot"><button type="button" class="btn ghost" id="pm-prev">← ก่อนหน้า</button><button type="button" class="btn" id="pm-next">ถัดไป →</button></div>
</div>

<script type="application/json" id="guide-data">${json}</script>
<script>${js}</script>
</body>
</html>
`

mkdirSync(out, { recursive: true })
writeFileSync(resolve(out, 'index.html'), html)
console.log(`เขียน ${resolve(out, 'index.html')} (${flows.map((f) => `${f.id}:${f.shots.length}`).join(', ')})`)
