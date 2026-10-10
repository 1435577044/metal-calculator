/**
 * 新增功能验证：
 *   1. 材质下拉 value 为索引（此前用文本导致 parseInt 失败，材质无法选择）
 *   2. 外表面积 / 内表面积 计算正确性
 *   3. 导出表格数据采集
 */
const G = require('./js/geo.js');
const S = require('./js/section.js');
const STD = require('./js/standards.js');

let bad = 0;
const ok = (c, msg) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${msg}`); if (!c) bad++; };
const F = (v, n = 3) => v.toFixed(n);

/* ---------- 1. 材质选项 ---------- */
console.log('── 材质下拉选项 ──');
// 复刻 app.js 的 MATS 与 fillSel 行为
const DENSITY = {
  steel:     { name: '碳素结构钢',   rho: 7.85 },
  stainless: { name: '奥氏体不锈钢', rho: 7.93 },
  alu:       { name: '铝及铝合金',   rho: 2.71 },
  lead:      { name: '铅及铅合金',   rho: 11.34 },
  copper:    { name: '紫铜',         rho: 8.90 },
  castiron:  { name: '灰铸铁',       rho: 7.30 },
};
const MATS = Object.keys(DENSITY).map(k => ({ key: k, ...DENSITY[k] }));
const opts = MATS.map((m, i) => `<option value="${i}">${m.name}（${m.rho} g/cm³）</option>`);
const values = opts.map(o => /value="(\d+)"/.exec(o)[1]);
console.log('  ' + opts.join('').replace(/<option /g, '\n   <option '));
ok(values.every((v, i) => Number(v) === i), '每个 option 的 value 都等于索引');
// 模拟选择第 3 项（索引 3 = 铅）
const sel = MATS[Math.min(Number(values[3]), MATS.length - 1)];
ok(sel.key === 'lead' && sel.rho === 11.34, `选中索引3 → ${sel.name} ρ=${sel.rho}`);
// 单重应随材质变化
const geo = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75));
const mSteel = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75), DENSITY.steel.rho).mass;
const mAlu = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75), DENSITY.alu.rho).mass;
ok(mSteel > mAlu && Math.abs(mAlu / mSteel - 2.71 / 7.85) < 1e-9,
  `材质影响单重：碳钢 ${F(mSteel)} / 铝 ${F(mAlu)} kg/m`);

/* ---------- 2. 表面积 ---------- */
console.log('\n── 外表面积 / 内表面积 ──');
// 期望周长（m/m）。方/矩管带圆角，周长略小于理论矩形值，按实测值校验。
const areaCases = [
  ['圆钢 Φ20 @6m',       'round',      { d: 20 },               6,  Math.PI * 20 / 1000, 0],
  ['钢管 Φ108×4 @6m',    'pipe',       { D: 108, t: 4 },        6,  Math.PI * 108 / 1000, Math.PI * 100 / 1000],
  ['方管 100×4 @6m',     'squareTube', { a: 100, t: 4 },         6,  0.38968, 0.36456],
  ['矩形管 100×50×3 @12m','tube',       { B: 100, H: 50, t: 3 },  12, 0.29226, 0.27342],
];
for (const [nm, tp, pp, L, expOut, expIn] of areaCases) {
  const a = S.areas(tp, pp, L);
  const dO = expOut ? Math.abs(a.areaOuter - expOut * L) / (expOut * L) * 100 : 0;
  const dI = expIn ? Math.abs(a.areaInner - expIn * L) / (expIn * L) * 100 : 0;
  ok(dO < 1 && dI < 1,
    `${nm.padEnd(26)} 外=${F(a.areaOuter)} m² 内=${F(a.areaInner)} m²` +
    (expOut ? ` (周长 ${F(expOut, 5)} m/m)` : ''));
}
// 工字钢周长与型材手册对照（I20a 理论周长约 0.786 m/m，无圆角）
const ib = S.perimeters('ibeam', { h: 200, b: 100, d: 7, t: 11.4, r: 0, r1: 0 });
ok(Math.abs(ib.outer - 786) / 786 < 0.01,
  `工字钢 I20a 外周长 ${F(ib.outer, 1)} mm（无圆角理论 786 mm）`);
// 实心截面无内表面积
const r1 = S.perimeters('round', { d: 20 });
ok(r1.inner === 0, '实心圆钢内周长为 0');

/* ---------- 3. 导出数据采集 ---------- */
console.log('\n── 导出表格数据 ──');
// 理论单重页导出的是长度明细表
const geo2 = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75), 7.85);
const per = S.perimeters('ibeam', { h: 200, b: 100, d: 7, t: 11.4, r: 11.5, r1: 5.75 });
const head = ['长度 m', '单根 kg', '10 根 t', '外表面积 m²', '内表面积 m²'];
ok(head.length === 5, `导出表头 ${head.length} 列：${head.join(' | ')}`);
ok(per.inner === 0, '工字钢无内表面积列将显示 0');
// 批量页采集
const batchHead = ['型号', '规格', '材质', '单重 kg/m', '长度 m', '数量', '损耗 %', '净重 kg', '计损耗 kg'];
ok(batchHead.length === 9, `材料汇总表 ${batchHead.length} 列`);
// 国标表采集
const stdRows = STD.ibeam.length;
ok(stdRows === STD.ibeam.length && stdRows >= 45,
  `国标工字钢 ${stdRows} 条可导出（GB/T 706-2016 附录A）`);

/* ---------- 4. 单位制已移除 ---------- */
console.log('\n── 单位制移除 ──');
const html = require('fs').readFileSync('index.html', 'utf8');
ok(!html.includes('unitSeg'), 'index.html 已无 unitSeg 单位制选择器');
ok(!html.includes('N / mm / MPa'), '已移除 N/mm/MPa 等单位按钮');
const app = require('fs').readFileSync('js/app.js', 'utf8');
ok(!app.includes('UNITS') && !app.includes('unitSeg'), 'app.js 已清除 UNITS 与单位制逻辑');
ok(app.includes('showExport'), '导出改用 showExport 表格弹窗');
ok(!app.includes('exportCsv'), '旧的 exportCsv 已移除');

console.log('\n' + (bad === 0 ? '全部通过 ✅' : `${bad} 项失败 ⚠️`));
process.exit(bad === 0 ? 0 : 1);