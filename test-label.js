/**
 * 型号标签完整性校验
 * 确保下拉列表里的每一项都不含 undefined / NaN / null，
 * 且标注的规格与实际参数一致。
 */
const G = require('./js/geo.js');
const STD = require('./js/standards.js');
const fs = require('fs');

let bad = 0;
const ok = (c, m) => { console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) bad++; };

// 复刻 app.js 的 stdRows（保持同源校验）
function t2r(B1, B2, t) { return Math.max(1, Math.min(t, (B1 - t) * .6, (B2 - t) * .6)); }
function stdRows(kind) {
  switch (kind) {
    case 'ibeam': case 'hsteel':
      return STD[kind].map(x => ({
        label: `${x.name}　${x.h}×${x.b}×${x.tw}×${x.tf}`,
        params: { h: x.h, b: x.b, d: x.tw, t: x.tf, r: x.r, r1: x.r1 },
        mass: x.m, A: x.A
      }));
    case 'channel':
      return STD.channel.map(x => ({
        label: `${x.name}　${x.h}×${x.b}×${x.tw}×${x.tf}`,
        params: { h: x.h, b: x.b, d: x.tw, t: x.tf, R: x.R, r: x.rr },
        mass: x.m, A: x.A
      }));
    case 'angleEq':
      return STD.angleEq.map(x => ({ label: x.name, params: { B: x.B, t: x.t, r: x.r }, mass: x.m }));
    case 'angleNe':
      return STD.angleNe.map(x => ({
        label: x.name, params: { B1: x.B1, B2: x.B2, t: x.t, r: t2r(x.B1, x.B2, x.t) }, mass: x.m
      }));
    case 'round':
      return STD.bars.round.map(x => ({ label: 'Φ' + x.d, params: { d: x.d }, mass: x.m }));
    case 'square':
      return STD.bars.square.map(x => ({ label: x.a + '×' + x.a, params: { a: x.a }, mass: x.m }));
    case 'pipe':
      return STD.pipe.map(x => ({ label: 'Φ' + x.D + '×' + x.t, params: { D: x.D, t: x.t }, mass: x.m }));
    default: return [];
  }
}

console.log('── 标签不含 undefined / NaN / null ──');
const KINDS = ['ibeam', 'channel', 'hsteel', 'angleEq', 'angleNe', 'round', 'square', 'pipe'];
const DIRTY = /undefined|NaN|null|Infinity/;
let total = 0, dirty = [];

for (const k of KINDS) {
  const rows = stdRows(k);
  total += rows.length;
  const badRows = rows.filter(r => DIRTY.test(r.label));
  const badParam = rows.filter(r => Object.values(r.params).some(v =>
    v === undefined || v === null || Number.isNaN(v)));
  if (badRows.length) dirty.push(...badRows.map(r => `${k}: ${r.label}`));
  if (badParam.length) dirty.push(...badParam.map(r => `${k}: 参数含空值 ${JSON.stringify(r.params)}`));
  ok(badRows.length === 0 && badParam.length === 0,
    `${k.padEnd(9)} ${String(rows.length).padStart(3)} 条标签全部有效`);
}
ok(dirty.length === 0, dirty.length ? `异常 ${dirty.length} 处：${dirty.slice(0,3).join(' | ')}` : '无 undefined 残留');

console.log('\n── 规格串与实际参数一致 ──');
// 工字钢：标签里的四段数字应能还原出 h b tw tf
for (const k of ['ibeam', 'channel', 'hsteel']) {
  const rows = stdRows(k);
  let allOk = true, sample = '';
  for (const r of rows) {
    const nums = r.label.split('　')[1].split('×').map(Number);
    if (nums.length !== 4 || nums.some(n => !isFinite(n))) { allOk = false; break; }
    const [h, b, tw, tf] = nums;
    if (h !== r.params.h || b !== r.params.b || tw !== r.params.d || tf !== r.params.t) { allOk = false; break; }
    if (!sample) sample = r.label;
  }
  ok(allOk, `${k.padEnd(9)} 规格串 ↔ 参数一致　示例：${sample}`);
}

console.log('\n── 表值与几何计算自洽 ──');
// 国标模式取表值单重，几何模式按参数算，两者应接近
for (const [k, geo] of [['ibeam', r => G.iSection(r.params.h, r.params.b, r.params.d, r.params.t, r.params.r, r.params.r1)],
                        ['channel', r => G.channel(r.params.h, r.params.b, r.params.d, r.params.t, r.params.R, r.params.r)]]) {
  const rows = stdRows(k);
  let maxDev = 0, worst = '';
  for (const r of rows) {
    const calc = G.solve(geo(r), 7.85).mass;
    const dev = Math.abs(calc - r.mass) / r.mass * 100;
    if (dev > maxDev) { maxDev = dev; worst = r.label.split('　')[0]; }
  }
  ok(maxDev < 4, `${k.padEnd(9)} 表值 vs 几何最大偏差 ${maxDev.toFixed(1)}%（${worst}）`);
}

console.log('\n── 型号名称无重复前缀 ──');
const dup = [...STD.ibeam, ...STD.channel, ...STD.hsteel].filter(x =>
  /^(.)(.)\1/.test(x.name) && x.name[1] === x.name[0]);
ok(dup.length === 0, dup.length ? `重复前缀：${dup.slice(0,3).map(x=>x.name).join(', ')}` : '工字钢/槽钢/H型钢名称均无重复前缀');
ok(STD.hsteel.every(x => /^H(W|M|N)/.test(x.name)), 'H型钢保持 HW/HM/HN 标准前缀');

console.log('\n── 槽钢圆角已接入 ──');
ok(STD.channel.every(x => x.R > 0 && x.rr > 0), `槽钢 ${STD.channel.length} 条均带 R/r 圆角`);

console.log('\n── 用户报告的场景复现 ──');
const i20a = stdRows('ibeam').find(r => r.label.startsWith('I20a'));
ok(!/undefined/.test(i20a.label), `I20a 标签：${i20a.label}`);
console.log(`         此前会显示： I20a　200×100×undefined×11.4`);
const h = stdRows('hsteel').find(r => r.label.includes('HW300×300'));
ok(!/undefined/.test(h.label), `H型钢标签：${h.label}`);

console.log('\n' + (bad === 0 ? `全部通过 ✅（共校验 ${total} 条型号标签）` : `${bad} 项失败 ⚠️`));
process.exit(bad === 0 ? 0 : 1);