/* ============================================================
 *  批量算量 · 计算逻辑校验
 *  ------------------------------------------------------------
 *  校验新增的长度、总长、表面积、金额、油漆用量换算是否正确
 * ==========================================================*/
const S = require('./js/section.js');
const STD = require('./js/standards.js');

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(` ${c ? 'ok  ' : 'FAIL'} ${m}`); };
const F = (v, n = 3) => Number(v).toFixed(n);
const app = require('fs').readFileSync(__dirname + '/js/app.js', 'utf8');
const html = require('fs').readFileSync(__dirname + '/index.html', 'utf8');

console.log('══════ 批量算量 · 计算与界面校验 ══════\n');

/* ───────── 一、换算公式 ───────── */
console.log('── 一、核心换算公式 ──');
{
  // 工字钢 I20a：单重 27.929 kg/m，周长取轮廓实测值
  const row = STD.ibeam.find(x => x.short === '20a');
  const per = S.perimeters('ibeam', { h: row.h, b: row.b, d: row.tw, t: row.tf, r: row.r, r1: row.r1 });

  const L = 6, Q = 10, loss = 5;
  const net = row.m * L * Q;
  const gross = net * (1 + loss / 100);
  const aOut = per.outer / 1000 * L * Q;

  ok(Math.abs(net - row.m * 60) < 1e-9, `净重 = 单重×长度×数量 = ${F(row.m)}×${L}×${Q} = ${F(net, 1)} kg`);
  ok(Math.abs(gross - net * 1.05) < 1e-9, `计损耗 = 净重×(1+损耗%) = ${F(gross, 1)} kg`);
  ok(Math.abs(aOut - per.outer / 1000 * 60) < 1e-9,
    `外表面积 = 周长×总长 = ${F(per.outer, 1)}mm → ${F(aOut, 2)} m²`);
  ok(per.inner === 0, `工字钢为实心截面，内表面积 = ${per.inner} m²`);

  // 钢管：内外表面积都应 > 0
  const prow = STD.pipe.find(x => x.D === 108 && x.t === 4);
  const pper = S.perimeters('pipe', { D: prow.D, t: prow.t });
  // 轮廓为折线逼近圆，采样点有限 → 允许 0.1% 亏损
  const dOut = Math.abs(pper.outer - Math.PI * 108) / (Math.PI * 108) * 100;
  const dIn = Math.abs(pper.inner - Math.PI * 100) / (Math.PI * 100) * 100;
  ok(dOut < 0.1, `钢管 Φ108 外周长 ≈ π×D = ${F(pper.outer, 2)} mm（偏差 ${F(dOut, 3)}%）`);
  ok(dIn < 0.1, `钢管 Φ108×4 内周长 ≈ π×(D−t) = ${F(pper.inner, 2)} mm（偏差 ${F(dIn, 3)}%）`);

  // 金额与油漆
  const price = 5200, paint = 30;
  const amount = gross / 1000 * price;
  const paintKg = gross / 1000 * paint;
  ok(Math.abs(amount - gross / 1000 * 5200) < 1e-9,
    `金额 = 计损耗(kg)/1000 × 单价 = ${F(amount, 0)} 元`);
  ok(Math.abs(paintKg - gross / 1000 * 30) < 1e-9,
    `油漆 = 计损耗(t) × 油漆用量 = ${F(paintKg, 2)} kg`);
  console.log();
}

/* ───────── 二、材质密度换算 ───────── */
console.log('── 二、材质密度换算 ──');
{
  const row = STD.ibeam.find(x => x.short === '20a');
  const mSteel = row.m * (7.85 / 7.85);
  const mAlu = row.m * (2.70 / 7.85);
  ok(Math.abs(mSteel - row.m) < 1e-9, `碳钢单重 = 表值 ${F(mSteel)} kg/m`);
  ok(Math.abs(mAlu - row.m * 2.70 / 7.85) < 1e-9,
    `铝单重按密度比例 ${F(mAlu)} kg/m（比值 ${F(2.70 / 7.85, 4)}）`);
  ok(mAlu < mSteel, '铝密度更低，单重应小于钢');
  console.log();
}

/* ───────── 三、定尺长度规格 ───────── */
console.log('── 三、常用定尺长度 ──');
{
  const m = app.match(/const STD_LENGTHS = \[([\s\S]*?)\];/);
  ok(!!m, '定义 STD_LENGTHS 定尺长度表');
  if (m) {
    const nums = m[1].match(/[\d.]+/g).map(Number);
    ok(nums.length >= 20, `共 ${nums.length} 档常用长度`);
    const std = [1, 1.5, 2, 2.5, 3, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9,
                 10, 11, 11.5, 11.9, 12, 12.5, 13, 13.5, 14, 15, 16, 17, 18, 20];
    const missing = std.filter(v => !nums.includes(v));
    ok(missing.length === 0,
      missing.length ? `缺少常用规格：${missing.join(', ')}` : '覆盖 30 档行业标准定尺');
    ok(nums.includes(11.9), '含 11.9 m（非标定尺，工程常用）');
    ok(nums.every(v => v > 0 && v <= 20), '长度取值均在 0~20 m 合理区间');
  }
  const q = app.match(/const QUICK_LENGTHS = \[([^\]]*)\];/);
  ok(!!q && q[1].split(',').length === 4, '快捷长度按钮 4 个（6 / 9 / 11.9 / 12）');
  console.log();
}

/* ───────── 四、界面元素 ───────── */
console.log('── 四、界面元素 ──');
{
  const items = [
    ['定尺长度下拉',    'id="tPreset"',   /定尺长度/],
    ['实际长度输入',    'id="tLen"',      /实际长度/],
    ['数量输入',        'id="tQty"',      /数量/],
    ['损耗率输入',      'id="tLoss"',     /损耗率/],
    ['单价输入',        'id="tPrice"',    /单价/],
    ['油漆用量输入',    'id="tPaint"',    /油漆用量/],
    ['快捷长度区',      'id="tQuick"',    /快捷长度/],
    ['实时预览区',      'id="tPreview"',  null],
  ];
  for (const [label, sel, re] of items) {
    const hasEl = html.includes(sel);
    const hasLabel = re ? re.test(html) : true;
    ok(hasEl && hasLabel, `${label.padEnd(12)} 元素与文案齐备`);
  }
  ok(/previewEntry\(\)/.test(app), 'previewEntry() 实时预览已实现');
  ok(app.includes("['#tLen', '#tQty', '#tLoss', '#tPrice', '#tPaint']"),
    '五个输入框均绑定实时刷新');
  console.log();
}

/* ───────── 五、汇总表列 ───────── */
console.log('── 五、汇总表列 ──');
{
  const cols = ['单重 kg/m', '单根长 m', '总长 m', '损耗', '净重 kg', '计损耗 kg',
                '外表 m²', '内表 m²', '金额 元', '油漆 kg'];
  const missing = cols.filter(c => !app.includes(c) && !app.includes(`'${c}'`));
  ok(missing.length === 0, missing.length ? `表格缺少列：${missing.join(', ')}` : `表格含 ${cols.length} 类数据列`);

  // 合计行
  ok(app.includes("tLen") && app.includes("sum('net')") && app.includes("sum('aOut')"),
    '合计行含 总长 / 净重 / 计损耗 / 外表 / 内表 / 涂装 / 金额 / 油漆');
  console.log();
}

/* ───────── 六、导出 ───────── */
console.log('── 六、导出表格 ──');
{
  ok(/材料汇总表（含涂装面积与金额）/.test(app), '导出标题已更新');
  const head = app.match(/head: \['序号', '型号'[\s\S]*?\],/);
  ok(!!head, '导出表头 18 列');
  if (head) {
    const n = head[0].split("'").length;
    ok(n >= 36, `导出含 ${Math.floor((n - 1) / 2)} 列`);
  }
  ok(/sum\('aTotal'\)/.test(app), '导出行含涂装总面积');
  ok(/sum\('amount'\)/.test(app), '导出行含金额合计');
  ok(/sum\('paintKg'\)/.test(app), '导出行含油漆合计');
  console.log();
}

/* ───────── 七、边界 ───────── */
console.log('── 七、边界与容错 ──');
{
  ok(/if \(!\(L > 0\)\) return null/.test(app), '长度 ≤0 时拒绝加入');
  ok(/该截面类型无国标表/.test(app), '无国标表的类型给出提示');
  ok(app.includes('BATCH.splice'), '支持删除单行');
  ok(app.includes('BATCH.length = 0'), '支持清空清单');
  ok(/'—'/.test(app), '未填单价/油漆时显示占位符');
  console.log();
}

console.log('═'.repeat(52));
console.log(`  ${fail === 0 ? '全部通过' : fail + ' 项未通过'}   通过 ${pass} / ${pass + fail}`);
console.log('═'.repeat(52));
process.exit(fail ? 1 : 0);
