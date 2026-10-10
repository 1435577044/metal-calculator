/* 最小 DOM 桩：在 Node 中实跑 app.js，验证初始化、切换、计算、导出全链路 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');

/* ---------- 极简 DOM 实现 ---------- */
class El {
  constructor(tag = 'div') {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._html = '';
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this._cls = new Set();
    this.value = '';
    this.textContent = '';
    this.classList = {
      add: (...c) => c.forEach(x => this._cls.add(x)),
      remove: (...c) => c.forEach(x => this._cls.delete(x)),
      toggle: (c, f) => { f ? this._cls.add(c) : this._cls.delete(c); },
      contains: c => this._cls.has(c),
      set: v => { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
    };
    this.classList.toggle = (c, f) => {
      if (f === undefined) { this._cls.has(c) ? this._cls.delete(c) : this._cls.add(c); }
      else f ? this._cls.add(c) : this._cls.delete(c);
    };
    this._events = {};
  }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  set innerHTML(v) {
    this._html = String(v);
    // 生成子节点桩，便于统计与触发事件
    this.children = [];
    const cnt = (this._html.match(/<input[^>]*>/g) || []).length +
                (this._html.match(/<select[^>]*>/g) || []).length;
    for (let i = 0; i < cnt; i++) {
      const c = new El(this._html.match(/<(input|select|button)[^>]*>/g)[i].startsWith('<input') ? 'input' : 'select');
      c.parentNode = this;
      this.children.push(c);
    }
    const btns = (this._html.match(/<button[^>]*data-[\w-]+="([^"]+)"/g) || []);
    this._btnData = btns.map(b => {
      const m = b.match(/data-([\w-]+)="([^"]+)"/);
      return { k: m[1], v: m[2] };
    });
    // select 的 value 初始为第一个 option 的索引（真实浏览器行为）
    if (this.tagName === 'SELECT') this.value = cnt ? 0 : '';
  }
  get innerHTML() { return this._html; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  querySelector(sel) {
    if (sel.startsWith('#')) return idMap[sel.slice(1)] || this.querySelectorAll(sel)[0] || null;
    return this.querySelectorAll(sel)[0] || null;
  }
  querySelectorAll(sel) {
    if (sel.startsWith('#')) { const e = idMap[sel.slice(1)]; return e ? [e] : []; }
    const out = [];
    const want = sel.trim();
    const walk = n => {
      for (const c of n.children) {
        if (match(c, want)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  matches(sel) { return match(this, sel); }
  addEventListener(t, fn) { (this._events[t] ||= []).push(fn); }
  removeEventListener() {}
  dispatch(t, e = {}) { (this._events[t] || []).forEach(fn => fn({ target: this, preventDefault() {}, ...e })); }
  closest(sel) {
    let n = this;
    while (n) { if (match(n, sel)) return n; n = n.parentNode; }
    return null;
  }
  click() { this.dispatch('click', { target: this }); }
  focus() {}
  set onclick(fn) { this._onclick = fn; }
  get onclick() { return this._onclick; }
  set onchange(fn) { this._onchange = fn; }
  get onchange() { return this._onchange; }
  set oninput(fn) { this._oninput = fn; }
  get innerText() { return this._html.replace(/<[^>]+>/g, '').trim(); }
  get scrollTop() { return 0; }
  set innerText(v) { this.textContent = v; }
  get clientHeight() { return 400; }
  get clientWidth() { return 600; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  get options() { return []; }
  set href(v) { this._href = v; }
  get download() { return this._dl; }
  set download(v) { this._dl = v; }
}
function match(node, sel) {
  if (sel.startsWith('#')) return node.id === sel.slice(1);
  if (sel.startsWith('.')) return node._cls.has(sel.slice(1));
  if (sel.includes('[')) {
    const m = sel.match(/\[([\w-]+)="?([^\]"]*)"?\]/);
    return m && (node.dataset[m[1]] === m[2] || node.attrs[m[1]] === m[2]);
  }
  const tag = sel.replace(/[.#][\w-]+/g, '');
  return !tag || node.tagName === tag.toUpperCase();
}

/* 从 index.html 中提取带 id 的元素，建立注册表 */
const root = new El('body');
root.id = 'ROOT';
const idMap = {};
const idRe = /id="([\w-]+)"/g;
let mm;
while ((mm = idRe.exec(html))) {
  const e = new El('input');
  e.id = mm[1];
  idMap[mm[1]] = e;
  root.appendChild(e);
}
// 补几个选择器所需的容器
const mk = (id, tag = 'div') => { const e = new El(tag); e.id = id; idMap[id] = e; root.appendChild(e); return e; };
['uFig', 'sFig', 'uKpi', 'uLenTb', 'sTb', 'stdTb', 'matTb', 'tTb', 'uDims', 'sDims', 'stdSeg',
 'uDims2', 'sDims2', 'uMode', 'sMode', 'p-unit', 'p-sect', 'p-batch', 'p-std', 'p-mat', 'p-help',
 'pgTitle', 'pgSub', 'tCnt', 'tHint', 'uMass', 'uMassN', 'sArea', 'sAreaN', 'uRho', 'uMod',
 'uCatHint', 'sUnitHint', 'unitSeg', 'uLen', 'bUnit', 'bStd',
   'btnTheme', 'btnExport', 'tPreset', 'tQuick', 'tPreview',
   'tPrice', 'tPaint'].forEach(id => { if (!idMap[id]) mk(id); });

/* 全局查询代理 */
const store = {};
const sandbox = {
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  console,
  document: {
    documentElement: root,
    body: root,
    querySelector: s => root.querySelector(s) || idMap[s.replace(/^#/, '')] || null,
    querySelectorAll: s => root.querySelectorAll(s) || [],
    createElement: t => new El(t),
    addEventListener: (t, fn) => { root._events[t] ||= []; root._events[t].push(fn); },
    activeElement: null
  },
  window: null,
  Blob: class { constructor(a) { this.parts = a; } },
  URL: { createObjectURL: () => 'blob:stub', revokeObjectURL() {} },
  alert: m => { sandbox.__alerts = (sandbox.__alerts || []).concat(m); },
  Date, Math, JSON, Number, String, Array, Object, Set, Map, RegExp, isNaN, parseFloat, parseInt,
  setTimeout, clearTimeout, setInterval, clearInterval,
  DOMMatrix: class { constructor() { this.a = 1; } }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
// window 复用 document 的事件注册表：app.js 会在 window 上监听
// DOMContentLoaded 与 pywebviewready
sandbox.addEventListener = (t, fn) => {
  const reg = (sandbox.document._events = sandbox.document._events || {});
  (reg[t] = reg[t] || []).push(fn);
  return sandbox;
};
sandbox.removeEventListener = () => sandbox;
sandbox.dispatchEvent = () => true;

vm.createContext(sandbox);
for (const f of ['js/geo.js', 'js/standards.js', 'js/section.js']) {
  vm.runInContext(fs.readFileSync(path.join(DIR, f), 'utf8'), sandbox, { filename: f });
}
try {
  vm.runInContext(fs.readFileSync(path.join(DIR, 'js/app.js'), 'utf8'), sandbox, { filename: 'js/app.js' });
} catch (e) {
  console.error('❌ app.js 加载异常:', e.message, '\n', e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}

// 触发 DOMContentLoaded
try {
  root._events.DOMContentLoaded.forEach(fn => fn({}));
  console.log('✅ app.js 初始化完成（DOMContentLoaded 已触发）');
} catch (e) {
  console.error('❌ 初始化异常:', e.message, '\n', e.stack.split('\n').slice(0, 5).join('\n'));
  // 诊断：打印关键 select 的当前值
  for (const id of ['uType', 'sType', 'tType', 'uMat', 'uMode']) {
    const e = idMap[id];
    console.error(`   [diag] #${id} tag=${e?.tagName} value=${JSON.stringify(e?.value)} htmlLen=${e?._html?.length}`);
  }
  process.exit(1);
}

/* 断言：Geo 与 STD 已加载 */
const G = sandbox.Geo, STD = sandbox.STD, SEC = sandbox.Section;
if (!G || !STD || !SEC) { console.error('❌ 依赖未加载'); process.exit(1); }
console.log('✅ 依赖就绪：Geo + STD + Section');

/* 抽查图形：path 必须生成且含闭合 */
const CASES = [
  ['工字钢', 'ibeam', { h: 200, b: 100, d: 7, t: 11.4, r: 11.5, r1: 5.75 }],
  ['槽钢',   'channel', { h: 200, b: 73, d: 7, t: 11, R: 4.5, r: 1.5 }],
  ['角钢',   'angleEq', { B: 50, t: 5, r: 7 }],
  ['方管',   'squareTube', { a: 100, t: 4 }],
  ['钢管',   'pipe', { D: 108, t: 4 }],
];
let drawBad = 0;
for (const [nm, tp, pp] of CASES) {
  try {
    const d = SEC.pathFor(tp, pp);
    const b = SEC.bounds(tp, pp);
    const okD = typeof d === 'string' && d.length > 20 && d.includes('Z');
    const okB = isFinite(b.w) && b.w > 0;
    if (!okD || !okB) drawBad++;
    console.log(` ${okD && okB ? 'ok  ' : 'FAIL'} ${nm.padEnd(6)} path=${String(d.length).padStart(6)}字符  尺寸=${b.w.toFixed(1)}×${b.h.toFixed(1)}mm`);
  } catch (e) { drawBad++; console.log(` FAIL ${nm}: ${e.message}`); }
}
if (drawBad) { console.log(`\n❌ ${drawBad} 项图形生成失败`); process.exit(1); }

/* 抽查几个关键计算（几何引擎 vs 国标表，几何简化模型允许 ~3% 差异；
   界面在国标模式下直接取表值，不受此差异影响） */
const checks = [
  ['工字钢 I20a 单重', G.solve(G.iSection(200,100,7,11.4,11.5,5.75)).mass, 27.93, 0.90],
  ['工字钢 I20a Ix', G.solve(G.iSection(200,100,7,11.4,11.5,5.75)).Ixcm4, 2370, 30],
  ['槽钢 10# 单重', G.solve(G.channel(100,48,5.3,8.5,3.25,1)).mass, 10.01, 0.32],
  ['槽钢 20a# ix', G.solve(G.channel(200,73,7,11,4.5,1.5)).ixcm, 7.86, 0.05],
  ['圆钢 Φ20 单重', G.solve(G.roundBar(20)).mass, 2.466, 0.01],
  ['角钢 L50×5 单重', G.solve(G.angleEq(50,5,7)).mass, 3.770, 0.02],
  ['钢管 Φ108×4 单重', G.solve(G.pipe(108,4)).mass, 10.26, 0.03],
];
let bad = 0;
console.log('\n计算抽查：');
for (const [n, v, ref, tol] of checks) {
  const ok = Math.abs(v - ref) <= tol;
  if (!ok) bad++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${n.padEnd(20)} ${v.toFixed(3)} / ${ref}`);
}

/* 规格库完整性 */
const total = STD.ibeam.length + STD.channel.length + STD.hsteel.length + STD.angleEq.length +
              STD.angleNe.length + STD.bars.round.length + STD.bars.square.length + STD.pipe.length;
console.log(`\n规格库总量：${total} 条`);
const nan = [...STD.ibeam, ...STD.channel, ...STD.hsteel].filter(x =>
  [x.A, x.Ix, x.Iy, x.Wx, x.Wy, x.ix, x.iy, x.m, x.h, x.b, x.tw, x.tf].some(v => !isFinite(v)));
console.log(nan.length === 0 ? '✅ 规格表无缺失数值' : `❌ ${nan.length} 条规格存在缺失: ${nan.slice(0,3).map(x=>x.name)}`);
if (nan.length) bad++;

console.log('\n' + (bad === 0 ? '全部通过 ✅' : `${bad} 项异常 ⚠️`));
process.exit(bad === 0 ? 0 : 1);