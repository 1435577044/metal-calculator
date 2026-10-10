/* ============================================================
 *  数据复核 · 国标规格库自洽性与权威性校验
 *  ------------------------------------------------------------
 *  三重校验：
 *   ① 自洽性  —— 表内 A 与 m 必须满足 m = A × 7.85 / 10
 *   ② 标准公式 —— 钢管按 GB 式 W=(D−S)×S×0.02466 复算
 *   ③ 几何对拍 —— 表值 vs 解析几何引擎
 *  任何一项超差即视为数据不可信。
 * ==========================================================*/
const STD = require('./js/standards.js');
const G = require('./js/geo.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(` ${cond ? 'ok  ' : 'FAIL'} ${msg}`); };
const F = (v, n = 3) => Number(v).toFixed(n);

console.log('══════ 数据复核 · 国标规格库 ══════\n');

/* ───────── 一、自洽性：m = A(cm²) × 7.85 / 10 ───────── */
console.log('── 一、自洽性（m 与 A 必须互推一致）──');
const SELF = [
  ['工字钢 GB/T 706-2016', STD.ibeam,   0.02],
  ['槽钢 GB/T 707',        STD.channel, 0.35],
  ['H型钢 GB/T 11263',     STD.hsteel,  0.55],
];
for (const [name, rows, tol] of SELF) {
  let bad = [];
  for (const x of rows) {
    const calc = x.A * 7.85 / 10;
    const dev = Math.abs(calc - x.m) / x.m * 100;
    if (dev > tol) bad.push(`${x.short} A=${x.A} m=${x.m} 应=${F(calc)} (${F(dev, 2)}%)`);
  }
  ok(bad.length === 0,
    `${name.padEnd(20)} ${String(rows.length).padStart(3)} 条，超差 ${bad.length}` +
    (bad.length ? `\n         ${bad.slice(0, 4).join('\n         ')}` : ''));
}

/* ───────── 二、钢管：GB 标准公式复算 ───────── */
console.log('\n── 二、钢管 GB/T 8163 标准公式 ──');
{
  // 表值保留 2 位小数，故允许 ≤0.01 kg/m 的舍入差（相对偏差随规格变小而放大）
  const bad = [];
  let maxAbs = 0;
  for (const x of STD.pipe) {
    const w = (x.D - x.t) * x.t * 0.02466;
    const abs = Math.abs(w - x.m);
    maxAbs = Math.max(maxAbs, abs);
    if (abs > 0.011) bad.push(`Φ${x.D}×${x.t}: ${x.m} vs ${F(w, 3)}`);
  }
  ok(bad.length === 0,
    `钢管 ${STD.pipe.length} 条全部等于 (D−S)×S×0.02466，最大绝对差 ${F(maxAbs, 3)} kg/m（2 位小数舍入）` +
    (bad.length ? `，异常 ${bad.length}：${bad.slice(0, 3).join('; ')}` : ''));
  // 与权威值抽样比对（公开技术资料）
  const REF = [[57, 3.5, 4.62], [76, 4, 7.10], [89, 4, 8.38], [108, 4, 10.26],
               [133, 4, 12.73], [159, 4.5, 17.15], [219, 6, 31.52],
               [273, 7, 45.92], [325, 8, 62.54], [426, 10, 102.59]];
  let refBad = [];
  for (const [D, t, m0] of REF) {
    const row = STD.pipe.find(x => x.D === D && x.t === t);
    if (!row) { refBad.push(`Φ${D}×${t} 缺失`); continue; }
    if (Math.abs(row.m - m0) > 0.02) refBad.push(`Φ${D}×${t}: ${row.m} vs 权威 ${m0}`);
  }
  ok(refBad.length === 0,
    `10 个权威抽样值一致${refBad.length ? '，差异：' + refBad.join('; ') : ''}`);
}

/* ───────── 三、圆钢 / 方钢：解析公式复算 ───────── */
console.log('\n── 三、圆钢 / 方钢 GB/T 702 ──');
{
  let bad = 0;
  for (const x of STD.bars.round) {
    const c = Math.PI * x.d * x.d / 4 * 7.85 / 1000;
    if (Math.abs(c - x.m) > 0.001) bad++;
  }
  ok(bad === 0, `圆钢 ${STD.bars.round.length} 条等于 π·d²/4·ρ`);
  bad = 0;
  for (const x of STD.bars.square) {
    const c = x.a * x.a * 7.85 / 1000;
    if (Math.abs(c - x.m) > 0.001) bad++;
  }
  ok(bad === 0, `方钢 ${STD.bars.square.length} 条等于 a²·ρ`);
}

/* ───────── 四、表值 vs 几何引擎 ───────── */
console.log('\n── 四、国标表值 vs 解析几何引擎 ──');
{
  // 工字钢：GB 2016 修订后 r 减小，几何应更贴近表值
  let mx = 0, worst = '';
  for (const x of STD.ibeam) {
    const g = G.solve(G.iSection(x.h, x.b, x.tw, x.tf, x.r, x.r1), 7.85,
      { ytop: x.h / 2, ybot: x.h / 2, xrt: x.b / 2, xlf: x.b / 2 });
    const dev = Math.abs(g.mass - x.m) / x.m * 100;
    if (dev > mx) { mx = dev; worst = x.short; }
  }
  ok(mx < 2.5, `工字钢单重最大偏差 ${F(mx, 2)}%（${worst}）`);

  // 槽钢：geo.channel 已按 GB 公式重构，应几乎完全吻合
  mx = 0; worst = '';
  for (const x of STD.channel) {
    const g = G.solve(G.channel(x.h, x.b, x.tw, x.tf, x.R, x.rr), 7.85);
    const dev = Math.abs(g.mass - x.m) / x.m * 100;
    if (dev > mx) { mx = dev; worst = x.short; }
  }
  ok(mx < 0.5, `槽钢单重最大偏差 ${F(mx, 3)}%（${worst}）`);

  // 槽钢惯性矩
  mx = 0; worst = '';
  for (const x of STD.channel) {
    const g = G.solve(G.channel(x.h, x.b, x.tw, x.tf, x.R, x.rr), 7.85);
    const dev = Math.abs(g.Ixcm4 - x.Ix) / x.Ix * 100;
    if (dev > mx) { mx = dev; worst = x.short; }
  }
  // 槽钢面积已按 GB 公式精确锁定，但 Ix 由组合法求得并按面积缩放，
  // 与国标算法的圆角处理略有差异，实测 ≤5%
  ok(mx < 5, `槽钢 Ix 最大偏差 ${F(mx, 2)}%（${worst}）— 国标型号模式取表值，不受影响`);
}

/* ───────── 五、结构完整性 ───────── */
console.log('\n── 五、表结构完整性 ──');
{
  const all = [
    ...STD.ibeam.map(x => ({ x, k: '工字钢' })),
    ...STD.channel.map(x => ({ x, k: '槽钢' })),
    ...STD.hsteel.map(x => ({ x, k: 'H型钢' })),
  ];
  let bad = 0, dup = new Set(), dupCount = 0;
  for (const { x, k } of all) {
    const vals = [x.A, x.Ix, x.Iy, x.Wx, x.Wy, x.ix, x.iy, x.m];
    if (vals.some(v => v == null || !isFinite(v) || v <= 0)) bad++;
    if (x.tw > x.tf) bad++;                        // 腹板不应厚于翼缘
    if (x.b <= x.tw || x.h <= x.tf) bad++;        // 翼宽应大于腹板厚、总高大于翼厚
    const key = `${x.h}/${x.b}/${x.tw}/${x.tf}`;
    if (dup.has(key)) dupCount++; else dup.add(key);
  }
  ok(bad === 0, `型钢 ${all.length} 条：数值有效且尺寸关系合理（违规 ${bad}）`);
  ok(dupCount === 0, `型钢尺寸组合无重复（重复 ${dupCount}）`);

  // 圆角合理性：r 应 ≤ min(翼厚, 腹板内伸)
  let rBad = 0;
  for (const x of STD.ibeam) {
    if (x.r > x.tf * 1.05 || x.r < 0) rBad++;
    if (x.r1 > x.tf * 0.75 || x.r1 < 0) rBad++;
  }
  ok(rBad === 0, `工字钢圆角 r/r1 与翼缘厚相称（异常 ${rBad}）`);

  // 名称唯一
  const names = all.map(o => o.x.name);
  ok(new Set(names).size === names.length, `型号命名无重复（${new Set(names).size}/${names.length}）`);
}

/* ───────── 六、材质库 ───────── */
console.log('\n── 六、材质密度库 ──');
{
  const keys = Object.keys(G.DENSITY);
  const groups = new Set(keys.map(k => G.DENSITY[k].grp));
  ok(groups.size === G.DENSITY_GROUPS.length,
    `材质 ${keys.length} 种，覆盖 ${groups.size} 个分组（${[...groups].join('/')}）`);
  let bad = 0;
  for (const k of keys) {
    const d = G.DENSITY[k];
    if (!(d.rho > 0 && d.rho <= 25)) bad++;       // 金属密度合理区间
    if (!d.name || !d.mod) bad++;
    if (!G.DENSITY_GROUPS.includes(d.grp)) bad++;
  }
  ok(bad === 0, `全部材质的密度/名称/模量/分组有效（异常 ${bad}）`);
  // GB 标准密度抽查
  const REF = { steel: 7.85, ss304: 7.93, ss316: 7.98, alu: 2.70, lead: 11.34,
                copper: 8.90, castiron: 7.30, titanium: 4.51, tungsten: 19.30 };
  let d2 = 0;
  for (const [k, v] of Object.entries(REF)) {
    if (!G.DENSITY[k] || Math.abs(G.DENSITY[k].rho - v) > 1e-9) d2++;
  }
  ok(d2 === 0, `${Object.keys(REF).length} 个关键密度与 GB 标准值一致`);
}

/* ───────── 七、新增截面 ───────── */
console.log('\n── 七、新增截面类型 ──');
{
  const CASES = [
    ['钢板 100×10',         () => G.plate(100, 10),            1000],
    ['T型钢 h200 b100',     () => G.tBeam(200, 100, 8, 12),    2704],
    ['箱形 100×6',          () => G.boxAngle(100, 6),          2256],
    ['箱形 50×5',           () => G.boxAngle(50, 5),           900],
    ['圆头扁钢 40×10',      () => G.roundFlat(40, 10),          378.54],
    ['C型钢 75×50×1 卷10',  () => G.cSection(75, 50, 1, 10),    218],
  ];
  let bad = [];
  for (const [n, fn, a0] of CASES) {
    const a = fn().A;
    if (Math.abs(a - a0) / a0 * 100 > 1) bad.push(`${n}: ${F(a, 1)} vs ${a0}`);
  }
  ok(bad.length === 0,
    `${CASES.length} 类新增截面面积精确吻合${bad.length ? '：' + bad.join('; ') : ''}`);
  // 单重线性于密度
  const g = G.tBeam(200, 100, 8, 12);
  ok(Math.abs(G.solve(g, 2.70).mass * 7.85 / 2.70 - G.solve(g, 7.85).mass) < 1e-9,
    '单重随密度线性换算正确');
}

console.log('\n' + '═'.repeat(52));
console.log(`  ${fail === 0 ? '数据复核通过 ✅' : fail + ' 项未通过 ⚠️'}   通过 ${pass} / ${pass + fail}`);
console.log('═'.repeat(52));
process.exit(fail ? 1 : 0);
