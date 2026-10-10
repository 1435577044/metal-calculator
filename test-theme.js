/* ============================================================
 *  主题对比度校验
 *  ------------------------------------------------------------
 *  从 index.html 直接解析 CSS 变量（不手抄，避免与实际样式脱节）
 *  校验两套主题：文字 ≥4.5:1 (WCAG AA)，分层/描边满足辨识阈值
 * ==========================================================*/
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/* ---------- 解析 ---------- */
function block(re) {
  const m = html.match(re);
  if (!m) { console.error(`❌ 未找到变量块: ${re}`); process.exit(1); }
  return m[1];
}
function parseVars(b) {
  const d = {};
  for (const m of b.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) d[m[1]] = m[2];
  return d;
}
const LIGHT = parseVars(block(/:root\{([\s\S]*?)\n\}/));
const DARK  = parseVars(block(/:root\[data-theme="dark"\]\{([\s\S]*?)\n\}/));

/* ---------- 对比度（WCAG 2.1 相对亮度公式） ---------- */
function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const f = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map(i => f(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/* ---------- 校验项 ---------- */
// [用途, 前景变量, 背景变量, 阈值]
const CHECKS = [
  ['正文 / 卡片面板',   'txt',    'panel',     4.5],
  ['正文 / 页面底色',   'txt',    'bg',        4.5],
  ['次要文字 / 面板',   'txt-2',  'panel',     4.5],
  ['次要文字 / 控件',   'txt-2',  'ctl',       4.5],
  ['弱化文字 / 面板',   'txt-3',  'panel',     4.5],
  ['弱化文字 / 底色',   'txt-3',  'bg',        4.5],
  ['弱化文字 / 控件',   'txt-3',  'ctl',       4.5],
  ['输入框文字 / 控件', 'txt',    'ctl',       4.5],
  ['表头 / 次面板',     'txt-2',  'panel-2',   4.5],
  ['强调色 / 面板',     'accent', 'panel',     4.5],
  ['强调色 / 强调底',   'accent', 'accent-soft', 4.5],
  ['成功色 / 面板',     'ok',     'panel',     4.5],
  ['大样图文字 / 图底', 'txt',    'fig-bg',    4.5],
  ['代码块 / 次控件',   'txt-2',  'ctl-2',     4.5],   // ctl-2 仅配 txt-2 使用
  ['控件描边 / 控件',   'ctl-line','ctl',      1.5],
  ['分隔线 / 面板',     'line-2', 'panel',     1.3],
  ['控件层 vs 面板',    'ctl',    'panel',     1.12],
  ['面板 vs 底色',      'panel',  'bg',        1.08],
  ['次面板 vs 面板',    'panel-2','panel',     1.05],
];

let pass = 0, fail = 0;
for (const [name, pal] of [['亮色模式', LIGHT], ['暗色模式', DARK]]) {
  console.log(`\n═══ ${name} ═══`);
  console.log('用途                   前景       背景        对比度   判定');
  console.log('─'.repeat(64));
  for (const [label, f, b, thr] of CHECKS) {
    if (!pal[f] || !pal[b]) {
      console.log(`${label.padEnd(18)} 缺少变量 ${f} / ${b}`);
      fail++;
      continue;
    }
    const r = contrast(pal[f], pal[b]);
    const ok = r >= thr;
    ok ? pass++ : fail++;
    console.log(`${label.padEnd(18)} ${pal[f].padEnd(9)} ${pal[b].padEnd(10)} ${r.toFixed(2).padStart(7)}:1  ${ok ? 'ok  ' : 'FAIL'}`);
  }
}

/* ---------- 结构检查 ---------- */
console.log('\n═══ 主题结构 ═══');
const STRUCT = [
  ['暗色主题块存在',      /:root\[data-theme="dark"\]/],
  ['声明 color-scheme',   /color-scheme:\s*light/],
  ['暗色也声明 scheme',   /:root\[data-theme="dark"\]\{[^}]*color-scheme:\s*dark/s],
  ['主题按钮存在',        /id="btnTheme"/],
  ['主题记忆 localStorage', /mz-theme/],
  ['SVG 用 CSS 变量',     /var\(--fig-/],
  ['option 显式配色',     /select\.inp option\{/],
  ['optgroup 显式配色',   /select\.inp optgroup\{/],
  ['下拉箭头暗色适配',    /dark"\] select\.inp\{/],
  ['滚动条主题化',        /-webkit-scrollbar-thumb/],
  ['表格暗色斑马纹',      /dark"\] tbody tr:nth-child\(even\)/],
];
for (const [label, re] of STRUCT) {
  const ok = re.test(html) || re.test(fs.readFileSync(path.join(__dirname, 'js/app.js'), 'utf8'));
  ok ? pass++ : fail++;
  console.log(` ${ok ? 'ok  ' : 'FAIL'} ${label}`);
}

/* ---------- 硬编码颜色检查 ---------- */
console.log('\n═══ 硬编码颜色残留 ═══');
const hard = [];
for (const [i, line] of html.split('\n').entries()) {
  const t = line.trim();
  if (t.startsWith('--') || t.startsWith('*') || t.startsWith('/*')) continue;
  if (/background:\s*(#fff\b|#ffffff\b|white\b)/i.test(line)) {
    // 主题变量定义行与注释不计
    hard.push(`第 ${i + 1} 行: ${t.slice(0, 62)}`);
  }
}
hard.length === 0 ? pass++ : fail++;
console.log(` ${hard.length === 0 ? 'ok  ' : 'FAIL'} 不硬编码白底${hard.length ? `：\n     ${hard.join('\n     ')}` : ''}`);

console.log('\n' + '═'.repeat(64));
console.log(`  ${fail === 0 ? '主题对比度全部达标' : fail + ' 项未通过'}   通过 ${pass} / ${pass + fail}`);
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
