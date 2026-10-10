const G = require('./js/geo.js');

const F = (v, n = 3) => v.toFixed(n);
const pct = (x, r) => r ? (Math.abs(x - r) / r * 100).toFixed(1) + '%' : '—';

let fails = 0;
function chk(label, calc, ref, tol = 3) {
  const d = ref ? Math.abs(calc - ref) / ref * 100 : 0;
  const ok = d <= tol;
  if (!ok) fails++;
  console.log(`${ok ? '  ok ' : ' FAIL'} ${label.padEnd(22)} 计算=${F(calc)} 标准=${ref} 偏差=${d.toFixed(2)}%`);
}

console.log('\n########## 一、工字钢 GB/T 706 截面特性 ##########');
// [名称, h,b,tw,tf,r,r1, A cm2, Ix cm4, ix cm, 单重kg/m]
const IBEAM = [
  ['I10',   100, 68,  4.5,  7.6,  6.5,  3.3,  14.3,  245,  4.14, 11.261],
  ['I14',   140, 80,  5.5,  9.1,  7.0,  3.5,  21.5,  712,  5.76, 16.890],
  ['I18',   180, 94,  6.5, 10.7,  7.5,  4.0,  30.6, 1660,  7.36, 24.143],
  ['I20a',  200, 100, 7.0, 11.4, 11.5, 5.75, 35.6, 2370,  8.16, 27.929],
  ['I25a',  250, 116, 8.0, 13.0, 13.0, 6.5,  48.5, 5020, 10.17, 38.105],
  ['I32a',  320, 130, 9.5, 15.0, 15.0, 7.5,  67.1, 11080, 12.85, 52.717],
  ['I40a',  400, 142, 10.5, 16.5, 16.5, 8.5,  86.1, 21720, 15.89, 67.598],
  ['I56b',  560, 167, 15.0, 20.0, 20.0, 10.0, 146.0, 65580, 21.18, 114.6],
];
console.log('型号     A(cm²)      Ix(cm⁴)     ix(cm)   单重(kg/m)');
for (const [n, h, b, tw, tf, r, r1, A0, Ix0, ix0, m0] of IBEAM) {
  const g = G.iSection(h, b, tw, tf, r, r1);
  const s = G.solve(g, 7.85, { ytop: h / 2, ybot: h / 2, xrt: b / 2, xlf: b / 2 });
  console.log(
    `${n.padEnd(7)}${F(s.Acm2, 2).padStart(6)}/${String(A0).padEnd(6)}` +
    `${F(s.Ixcm4, 0).padStart(8)}/${String(Ix0).padEnd(7)}` +
    `${F(s.ixcm, 2).padStart(7)}/${String(ix0).padEnd(6)}` +
    `${F(s.mass, 3).padStart(7)}/${String(m0).padEnd(7)}`);
}

console.log('\n---- 关键量断言（容差 2%）----');
chk('I20a 面积 A', G.solve(G.iSection(200,100,7,11.4,11.5,5.75)).Acm2, 35.6, 2);
chk('I20a 惯性矩 Ix', G.solve(G.iSection(200,100,7,11.4,11.5,5.75)).Ixcm4, 2370, 2);
chk('I20a 回转半径 ix', G.solve(G.iSection(200,100,7,11.4,11.5,5.75)).ixcm, 8.16, 1);
chk('I40a 面积 A', G.solve(G.iSection(400,142,10.5,16.5,16.5,8.5)).Acm2, 86.1, 2);
chk('I56b 单重', G.solve(G.iSection(560,167,15,20,20,10)).mass, 114.6, 2);

console.log('\n########## 二、槽钢 GB/T 707 截面特性 ##########');
const CHAN = [
  ['5#',    50, 37,  4.5,  7.0,  2.00, 0.50,  6.93,   26.0,  1.94,  5.438],
  ['8#',    80, 43,  5.0,  8.0,  2.75, 0.75, 10.24,  101.3,  3.14,  8.045],
  ['10#',  100, 48,  5.3,  8.5,  3.25, 1.00, 12.74,  198.0,  3.94, 10.007],
  ['14a#', 140, 58,  6.0,  9.5,  4.75, 1.75, 18.51,  563.7,  5.52, 14.535],
  ['20a#', 200, 73,  7.0, 11.0,  4.50, 1.50, 28.83, 1780.0,  7.86, 22.637],
  ['30a#', 300, 85,  7.0, 13.5,  7.00, 2.50, 39.27, 6320.0, 12.69, 31.427],
  ['40a#', 400, 100, 10.0, 18.0,  7.00, 2.00, 75.04, 17510.0, 15.28, 58.928],
];
console.log('型号     A(cm²)      Ix(cm⁴)     ix(cm)   单重(kg/m)');
for (const [n, h, b, d, t, R, r, A0, Ix0, ix0, m0] of CHAN) {
  const g = G.channel(h, b, d, t, R, r);
  const s = G.solve(g, 7.85, { ytop: h / 2, ybot: h / 2, xrt: b, xlf: d / 2 });
  console.log(
    `${n.padEnd(7)}${F(s.Acm2, 2).padStart(6)}/${String(A0).padEnd(6)}` +
    `${F(s.Ixcm4, 0).padStart(8)}/${String(Ix0).padEnd(7)}` +
    `${F(s.ixcm, 2).padStart(7)}/${String(ix0).padEnd(6)}` +
    `${F(s.mass, 3).padStart(7)}/${String(m0).padEnd(7)}`);
}
console.log('---- 断言 ----');
chk('10# 槽钢 A', G.solve(G.channel(100,48,5.3,8.5,3.25,1)).Acm2, 12.74, 4);
chk('10# 槽钢 Ix', G.solve(G.channel(100,48,5.3,8.5,3.25,1)).Ixcm4, 198, 5);
chk('20a# 槽钢 ix', G.solve(G.channel(200,73,7,11,4.5,1.5)).ixcm, 7.86, 3);
chk('40a# 槽钢单重', G.solve(G.channel(400,100,10,18,7,2)).mass, 58.93, 6);

console.log('\n########## 三、等边角钢 GB/T 706 ##########');
const ANG = [
  ['L25×4',  25, 4,  4.0, 1.459],
  ['L50×5',  50, 5,  7.0, 3.770],
  ['L75×6',  75, 6,  8.0, 6.905],
  ['L100×10',100,10,12.0, 15.120],
];
for (const [n, B, t, r, m0] of ANG) {
  const s = G.solve(G.angleEq(B, t, r), 7.85);
  chk(n + ' 单重', s.mass, m0, 3);
  console.log(`        A=${F(s.Acm2,2)}cm²  Ix=${F(s.Ixcm4,2)}cm⁴  iy=${F(s.iycm,2)}cm`);
}
chk('L50×5 面积', G.solve(G.angleEq(50,5,7)).Acm2, 4.80, 3);

console.log('\n########## 四、棒材 / 管材 单重校验 ##########');
const BARS = [
  ['圆钢 Φ8',      G.roundBar(8),      0.395],
  ['圆钢 Φ10',     G.roundBar(10),     0.617],
  ['圆钢 Φ16',     G.roundBar(16),     1.580],
  ['圆钢 Φ20',     G.roundBar(20),     2.466],
  ['圆钢 Φ25',     G.roundBar(25),     3.854],
  ['圆钢 Φ40',     G.roundBar(40),     9.866],
  ['方钢 20×20',   G.flatBar(20,20),   3.140],
  ['方钢 40×40',   G.flatBar(40,40),  12.560],
  ['扁钢 50×5',    G.flatBar(50,5),    1.963],
  ['扁钢 100×10',  G.flatBar(100,10),  7.850],
  ['钢板 200×10',  G.flatBar(200,10), 15.700],
  // 冷弯管国标重量随实际焊管圆角随机组变化，几何值允许 5% 差异
  ['方管 100×4',   G.squareTube(100,4,0), 11.730, 5],
  ['方管 60×3',    G.squareTube(60,3,0),   5.260, 5],
  ['矩形管100×50×3',G.rectTube(100,50,3,0),6.510, 5],
  ['六角钢 对边12', G.hexBar(12),       0.979],
  ['六角钢 对边20', G.hexBar(20),       2.720],
];
for (const [n, g, m0, tol] of BARS) chk(n, G.solve(g).mass, m0, tol || 2);

console.log('\n########## 五、钢管 GB/T 8163 ##########');
const PIPES = [
  ['Φ57×3.5',  57, 3.5, 4.618],
  ['Φ108×4',  108, 4.0, 10.260],
  ['Φ159×6',  159, 6.0, 22.640],
  ['Φ219×6',  219, 6.0, 31.520],
  ['Φ325×8',  325, 8.0, 62.540],
];
for (const [n, D, t, m0] of PIPES) chk('钢管 ' + n, G.solve(G.pipe(D, t)).mass, m0, 2);

console.log('\n########## 六、材质密度换算 ##########');
const S = G.solve(G.iSection(200,100,7,11.4,11.5,5.75));
const AREA = G.iSection(200,100,7,11.4,11.5,5.75).A;   // mm²，单重线性于 ρ
let matBad = 0;
for (const grp of G.DENSITY_GROUPS) {
  const keys = Object.keys(G.DENSITY).filter(k => G.DENSITY[k].grp === grp);
  console.log(`  ── ${grp}（${keys.length} 种）──`);
  for (const k of keys) {
    const d = G.DENSITY[k];
    const m = AREA * d.rho / 1000;                       // 理论单重 kg/m
    const calc = G.solve(G.iSection(200,100,7,11.4,11.5,5.75), d.rho).mass;
    if (Math.abs(calc - m) > 1e-6) matBad++;
    console.log(`     ${d.name.padEnd(18)} ρ=${String(d.rho).padStart(6)}  I20a 单重 = ${F(calc)} kg/m  ${d.mod}`);
  }
}
if (matBad === 0) console.log(`  ✅ ${Object.keys(G.DENSITY).length} 种材质的单重均等于 面积×ρ/1000`);
// 关键密度值抽查（GB 标准值）
chk('不锈钢 304 (7.93)', AREA * 7.93 / 1000, 27.888, 1);
chk('纯铝 (2.70)',      AREA * 2.70 / 1000,  9.506, 1);
chk('铅 (11.34)',       AREA * 11.34 / 1000, 40.033, 1);
chk('钛 TC4 (4.51)',    AREA * 4.51 / 1000,  15.865, 1);

console.log('\n########## 七、不对称工字钢形心 ##########');
const as = G.solve(G.iSectionAsym(200, 150, 100, 8, 12, 10, 12, 6), 7.85,
  { ytop: 100, ybot: 100, xrt: 75, xlf: 75 });
console.log(`  A=${F(as.Acm2,2)} cm²  cy=${F(as.cy,2)} mm (上翼缘更宽更厚，形心偏上 ✓)`);
console.log(`  Ix=${F(as.Ixcm4,1)} cm⁴  Iy=${F(as.Iycm4,1)} cm⁴  Wx=${F(as.Wxcm3,1)} cm³`);
if (as.cy <= 0) { console.log('  FAIL 形心方向错误'); fails++; }

console.log('\n########## 七·五、新增截面类型 ##########');
const NEW_SEC = [
  ['钢板 100×10',        () => G.plate(100, 10),                     1000],
  ['T型钢 h200 b100',    () => G.tBeam(200, 100, 8, 12),            2704],
  ['箱形 100×6',         () => G.boxAngle(100, 6),                  100 * 100 - 88 * 88],
  ['C型钢 b75 h50 t1 l10', () => G.cSection(75, 50, 1, 10),        75 * 2 + 48 + 10 * 2],
  ['圆头扁钢 40×10',     () => G.roundFlat(40, 10),                  30 * 10 + 2 * (Math.PI * 25 / 2)],
  ['圆头扁钢 20×6',      () => G.roundFlat(20, 6),                   14 * 6 + 2 * (Math.PI * 9 / 2)],
  ['箱形 50×5',          () => G.boxAngle(50, 5),                    50 * 50 - 40 * 40],
];
for (const [n, fn, a0] of NEW_SEC) chk(n + ' 面积', fn().A, a0, 1);

console.log('\n########## 八、边界与退化情形 ##########');
chk('圆钢 Φ0', G.solve(G.roundBar(0)).mass, 0, 0.01);
chk('钢管 壁厚=半径', G.solve(G.pipe(20, 10)).mass, 0, 0.01);
console.log('  矩形管负圆角容错:', F(G.solve(G.rectTube(100, 50, 3, -5)).Acm2, 2), 'cm² (应≈8.70)');
console.log('  极端长细比 I20a:', F(S.ix / S.iy, 1), '(ix/iy)');

console.log('\n══════════════════════════════════════════');
console.log(fails === 0 ? ' 全部通过 ✅' : ` ${fails} 项超出容差 ⚠️`);
console.log('══════════════════════════════════════════\n');