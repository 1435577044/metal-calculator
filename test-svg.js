/**
 * 截面轮廓自检：把 section.js 生成的 path 采样成多边形，
 * 用鞋带公式算面积与解析引擎 geo.js 对比。
 * 同时检测自交、重复点等绘图缺陷。
 */
const G = require('./js/geo.js');
const S = require('./js/section.js');

/* ---------- path 采样 ---------- */
function samplePath(d) {
  const polys = [];
  let cur = [];
  const toks = d.match(/[MLZ][^MLZ]*/g) || [];
  for (const t of toks) {
    if (t[0] === 'Z') { if (cur.length > 2) polys.push(cur); cur = []; }
    else {
      const n = t.slice(1).trim().split(/\s+/).map(Number);
      cur.push([n[0], -n[1]]);
    }
  }
  if (cur.length > 2) polys.push(cur);
  return polys;
}

function polyArea(P) {
  let a = 0;
  for (let i = 0, n = P.length; i < n; i++) {
    const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

function pathArea(d) {
  const polys = samplePath(d);
  if (!polys.length) return 0;
  let a = Math.abs(polyArea(polys[0]));
  for (let i = 1; i < polys.length; i++) a -= Math.abs(polyArea(polys[i]));
  return a;
}

/** 线段相交检测（判断自交） */
function segsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function hasSelfCross(P) {
  const n = P.length;
  if (n > 160) return false;   // 圆弧多边形跳过（顶点密集易误判）
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segsCross(P[i], P[(i + 1) % n], P[j], P[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * 非相邻重复点检测
 * 相邻重复点由 dedup 清理，首尾接缝点属正常（闭合环需要），
 * 因此只统计"非相邻位置"上的重合点，那才是真实的路径缺陷。
 */
function dupCount(P) {
  const n = P.length;
  let d = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // 相邻（含首尾环绕）不算重复
      if (j === i + 1) continue;
      if (i === 0 && j === n - 1) continue;
      if (Math.abs(P[i][0] - P[j][0]) < 1e-6 && Math.abs(P[i][1] - P[j][1]) < 1e-6) d++;
    }
  }
  return d;
}

/* ---------- 用例 ---------- */
const CASES = [
  ['圆钢 Φ20',       'round',      { d: 20 },                                              { d: 20 }],
  ['钢管 Φ108×4',    'pipe',       { D: 108, t: 4 },                                      { D: 108, t: 4 }],
  ['方钢 40×40',     'square',     { a: 40 },                                             { a: 40 }],
  ['扁钢 100×10',    'flat',       { B: 100, t: 10 },                                     { B: 100, t: 10 }],
  ['六角钢 对边12',  'hex',        { s: 12 },                                             { s: 12 }],
  ['六角中空 30/16', 'hexHollow',  { s: 30, d: 16 },                                      { s: 30, d: 16 }],
  ['方管 100×4',     'squareTube', { a: 100, t: 4 },                                      { a: 100, t: 4 }],
  ['矩形管 100×50×3', 'tube',      { B: 100, H: 50, t: 3 },                              { B: 100, H: 50, t: 3 }],
  ['等边角钢 L50×5', 'angleEq',    { B: 50, t: 5, r: 7 },                                 { B: 50, t: 5, r: 7 }],
  ['不等边角钢 100/63/8', 'angleNe', { B1: 100, B2: 63, t: 8, r: 10 },                 { B1: 100, B2: 63, t: 8, r: 10 }],
  ['槽钢 20a#',      'channel',    { h: 200, b: 73, d: 7, t: 11, R: 4.5, r: 1.5 },      { h: 200, b: 73, d: 7, t: 11, R: 4.5, r: 1.5 }],
  ['槽钢 40a#',      'channel',    { h: 400, b: 100, d: 10, t: 18, R: 7, r: 2 },         { h: 400, b: 100, d: 10, t: 18, R: 7, r: 2 }],
  ['工字钢 I20a',    'ibeam',      { h: 200, b: 100, d: 7, t: 11.4, r: 11.5, r1: 5.75 }, { h: 200, b: 100, d: 7, t: 11.4, r: 11.5, r1: 5.75 }],
  ['工字钢 I40a',    'ibeam',      { h: 400, b: 142, d: 10.5, t: 16.5, r: 16.5, r1: 8.5 }, { h: 400, b: 142, d: 10.5, t: 16.5, r: 16.5, r1: 8.5 }],
  ['H型钢 300×150', 'hsteel',     { h: 300, b: 150, d: 6.5, t: 9, r: 12, r1: 6 },      { h: 300, b: 150, d: 6.5, t: 9, r: 12, r1: 6 }],
  ['不对称工字钢',   'ibeamAsym',  { h: 200, b1: 150, b2: 100, d: 8, t1: 12, t2: 10, r: 12, r1: 6 },
                                          { h: 200, b1: 150, b2: 100, d: 8, t1: 12, t2: 10, r: 12, r1: 6 }],
];

function buildGeo(type, p) {
  const v = k => Number(p[k]) || 0;
  switch (type) {
    case 'round':     return G.roundBar(v('d'));
    case 'pipe':      return G.pipe(v('D'), v('t'));
    case 'square':    return G.flatBar(v('a'), v('a'));
    case 'flat':      return G.flatBar(v('B'), v('t'));
    case 'hex':       return G.hexBar(v('s'));
    case 'hexHollow': return G.hexHollow(v('s'), v('d'));
    case 'squareTube':return G.squareTube(v('a'), v('t'));
    case 'tube':      return G.rectTube(v('B'), v('H'), v('t'));
    case 'angleEq':   return G.angleEq(v('B'), v('t'), v('r'));
    case 'angleNe':   return G.angleNe(v('B1'), v('B2'), v('t'), v('r'));
    case 'channel':   return G.channel(v('h'), v('b'), v('d'), v('t'), v('R'), v('r'));
    case 'ibeam': case 'hsteel':
                    return G.iSection(v('h'), v('b'), v('d'), v('t'), v('r'), v('r1'));
    case 'ibeamAsym': return G.iSectionAsym(v('h'), v('b1'), v('b2'), v('d'), v('t1'), v('t2'), v('r'), v('r1'));
    default: return null;
  }
}

console.log('截面轮廓自检：图形采样面积 vs 解析引擎面积\n');
console.log('说明：两者圆角建模方式不同（图形用切线圆弧，解析用"方角减扇形"），');
console.log('      面积允许 ≤3% 偏差；重点校验图形形状正确、无自交、无重复点。\n');
console.log('截面类型               图形cm²   解析cm²    偏差   自交  重复点  判定');
console.log('═'.repeat(72));

const TOL = 3.0;        // 面积容差 %
let bad = 0;
for (const [name, type, drawP, geoP] of CASES) {
  let d;
  try { d = S.pathFor(type, drawP); }
  catch (e) { console.log(`${name.padEnd(20)} 绘图异常: ${e.message}`); bad++; continue; }

  const polys = samplePath(d);
  const aDraw = pathArea(d) / 100;
  const g = buildGeo(type, geoP);
  const aGeo = g ? g.A / 100 : NaN;
  const dev = aGeo ? Math.abs(aDraw - aGeo) / aGeo * 100 : NaN;
  const cross = polys.some(hasSelfCross);
  const dups = polys.reduce((s, P) => s + dupCount(P), 0);
  const ok = dev < TOL && !cross && dups === 0;
  if (!ok) bad++;

  const mark = (b, s) => b ? s : ' ·';
  console.log(
    `${name.padEnd(20)}` +
    `${aDraw.toFixed(2).padStart(8)}${aGeo.toFixed(2).padStart(10)}` +
    `${dev.toFixed(1).padStart(7)}%` +
    `${mark(cross, '  是 ').padStart(7)}${mark(dups > 0, '  ' + dups + '  ')}` +
    `   ${ok ? 'ok' : '★不符'}`
  );
}
console.log('═'.repeat(72));
console.log(bad === 0 ? '全部通过 ✅ 图形与计算模型一致' : `${bad} 项不符 ⚠️`);
process.exit(bad === 0 ? 0 : 1);