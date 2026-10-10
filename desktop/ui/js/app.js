/* ============================================================
 *  金属算量 · 应用逻辑
 * ==========================================================*/
(function () {
  'use strict';

  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const G = window.Geo, STD = window.STD, SEC = window.Section;

  /* ---------------- 截面定义 ---------------- *
   * f 字段：[键, 标签, 默认值, 步长, 分组]                            */
  const TYPES = {
    round:    { name: '圆钢',      std: 'bars',    stdName: 'GB/T 702 圆钢',
                f: [['d', '直径 d', 20, 1]] },
    square:   { name: '方钢',      std: 'bars',    stdName: 'GB/T 702 方钢',
                f: [['a', '边长 a', 20, 1]] },
    flat:     { name: '扁钢 / 钢板', std: null,    stdName: '',
                f: [['B', '宽度 B', 100, 5], ['t', '厚度 t', 10, 0.5]] },
    hex:      { name: '六角钢',    std: null,      stdName: '',
                f: [['s', '对边距 s', 12, 0.5]] },
    hexHollow:{ name: '六角中空钢', std: null,     stdName: '',
                f: [['s', '对边距 s', 30, 0.5], ['d', '芯孔内切圆 d', 16, 0.5]] },
    pipe:     { name: '钢管',      std: 'pipe',    stdName: 'GB/T 8163 无缝钢管',
                f: [['D', '外径 D', 108, 1], ['t', '壁厚 t', 4, 0.5]] },
    tube:     { name: '矩形管',    std: null,      stdName: '',
                f: [['B', '外宽 B', 100, 5], ['H', '外高 H', 50, 5], ['t', '壁厚 t', 3, 0.5]] },
    squareTube:{name: '方管',      std: null,      stdName: '',
                f: [['a', '边长 a', 100, 5], ['t', '壁厚 t', 4, 0.5]] },
    angleEq:  { name: '等边角钢',  std: 'angleEq', stdName: 'GB/T 706',
                f: [['B', '两肢宽 B', 50, 1], ['t', '厚度 t', 5, 0.5], ['r', '内圆角 r', 7, 0.5]] },
    angleNe:  { name: '不等边角钢', std: 'angleNe', stdName: 'GB/T 706',
                f: [['B1', '长肢宽 B1', 100, 1], ['B2', '短肢宽 B2', 63, 1],
                    ['t', '厚度 t', 8, 0.5], ['r', '内圆角 r', 10, 0.5]] },
    channel:  { name: '槽钢',      std: 'channel', stdName: 'GB/T 707',
                f: [['h', '高度 h', 200, 1], ['b', '腿宽 b', 73, 1], ['d', '腰厚 d', 7, 0.5],
                    ['t', '腿厚 t', 11, 0.5], ['R', '外圆角 R', 7, 0.5], ['r', '内圆角 r', 2.5, 0.5]] },
    ibeam:    { name: '工字钢',    std: 'ibeam',   stdName: 'GB/T 706',
                f: [['h', '高度 h', 200, 1], ['b', '翼宽 b', 100, 1], ['d', '腹板厚 d', 7, 0.5],
                    ['t', '翼缘厚 t', 11.4, 0.1], ['r', '根部圆角 r', 11.5, 0.5], ['r1', '翼缘角 r1', 5.75, 0.25]] },
    hsteel:   { name: 'H型钢',     std: 'hsteel',  stdName: 'GB/T 11263',
                f: [['h', '高度 h', 300, 1], ['b', '翼宽 b', 300, 1], ['d', '腹板厚 d', 10, 0.5],
                    ['t', '翼缘厚 t', 15, 0.5], ['r', '根部圆角 r', 12, 0.5], ['r1', '翼缘角 r1', 6, 0.25]] },
    ibeamAsym:{ name: '不对称工字钢', std: null,   stdName: '',
                f: [['h', '总高 h', 200, 1], ['b1', '上翼宽 b1', 150, 1], ['b2', '下翼宽 b2', 100, 1],
                    ['d', '腹板厚 d', 8, 0.5], ['t1', '上翼厚 t1', 12, 0.5], ['t2', '下翼厚 t2', 10, 0.5],
                    ['r', '根部圆角 r', 12, 0.5], ['r1', '翼缘角 r1', 6, 0.25]] },
    tbeam:   { name: 'T 型钢',      std: null,      stdName: '',
                f: [['h', '总高 h', 200, 1], ['b', '翼缘宽 b', 100, 1],
                    ['tw', '腹板厚 tw', 8, 0.5], ['tf', '翼缘厚 tf', 12, 0.5]] },
    box:     { name: '箱形截面',    std: null,      stdName: '',
                f: [['B', '外宽 B', 100, 5], ['t', '壁厚 t', 6, 0.5]] },
    csteel:  { name: 'C 型钢（冷弯）', std: null,    stdName: '',
                f: [['b', '翼缘宽 b', 75, 5], ['h', '截面高 h', 50, 5],
                    ['t', '板厚 t', 1.5, 0.1], ['l', '卷边长 l', 20, 1]] },
    roundFlat:{ name: '圆头扁钢',   std: null,      stdName: '',
                f: [['B', '总宽 B', 40, 1], ['t', '厚 t', 10, 0.5]] },
    plate:   { name: '钢板',        std: null,      stdName: '',
                f: [['B', '宽 B', 100, 5], ['t', '厚 t', 10, 0.5]] }
  };

  /* 截面特性页额外支持矩形管族（利用 TYPES 已有定义） */
  const SECT_TYPES = ['ibeam','ibeamAsym','channel','hsteel','squareTube','tube','box',
                      'angleEq','angleNe','tbeam','csteel','roundFlat','pipe','round'];

  /* 所有截面类型的稳定顺序（与下拉框 option 索引一致） */
  const TYPE_KEYS = Object.keys(TYPES);

  /* ---------------- 工具 ---------------- *
   * select.value 为字符串，数组下标需归一化为整数                     */
  const selIdx = (sel, keys) => {
    const i = parseInt(sel.value, 10);
    return keys[Number.isNaN(i) ? 0 : i];
  };

  /* ---------------- 材质 ---------------- */
  /* 材质按「钢 → 铸铁 → 有色 → 其他」分组排序，
     分组顺序与 geo.js 的 DENSITY_GROUPS 一致                */
  const MATS = G.DENSITY_GROUPS.flatMap(grp =>
    Object.keys(G.DENSITY)
      .filter(k => G.DENSITY[k].grp === grp)
      .map(k => ({ key: k, ...G.DENSITY[k] })));

  /* ---------------- 几何构建 ---------------- *
   * 统一入口：按类型 + 数值参数构造截面，并给出边缘纤维距离        */
  function build(type, p) {
    const v = k => Number(p[k]) || 0;
    switch (type) {
      case 'round':     return { g: G.roundBar(v('d')),      ext: null };
      case 'square':    return { g: G.flatBar(v('a'), v('a')), ext: null };
      case 'flat':      return { g: G.flatBar(v('B'), v('t')), ext: null };
      case 'hex':       return { g: G.hexBar(v('s')),        ext: null };
      case 'hexHollow': return { g: G.hexHollow(v('s'), v('d')), ext: null };
      case 'pipe':      return { g: G.pipe(v('D'), v('t')),  ext: null };
      case 'tube':      return { g: G.rectTube(v('B'), v('H'), v('t')), ext: null };
      case 'squareTube':return { g: G.squareTube(v('a'), v('t')), ext: null };
      case 'angleEq':   return { g: G.angleEq(v('B'), v('t'), v('r')), ext: null };
      case 'angleNe':   return { g: G.angleNe(v('B1'), v('B2'), v('t'), v('r')), ext: null };
      case 'channel':   return { g: G.channel(v('h'), v('b'), v('d'), v('t'), v('R'), v('r')),
                                ext: { ytop: v('h') / 2, ybot: v('h') / 2, xrt: v('b'), xlf: v('d') / 2 } };
      case 'ibeam':
      case 'hsteel':    return { g: G.iSection(v('h'), v('b'), v('d'), v('t'), v('r'), v('r1')),
                                ext: { ytop: v('h') / 2, ybot: v('h') / 2, xrt: v('b') / 2, xlf: v('b') / 2 } };
      case 'plate':     return { g: G.plate(v('B'), v('t')), ext: null };
      case 'roundFlat': return { g: G.roundFlat(v('B'), v('t')), ext: null };
      case 'box':       return { g: G.boxAngle(v('B'), v('t')), ext: null };
      case 'tbeam':     return { g: G.tBeam(v('h'), v('b'), v('tw'), v('tf')),
                                ext: { ytop: v('h') / 2, ybot: v('h') / 2,
                                       xrt: v('b') / 2, xlf: v('tw') / 2 } };
      case 'csteel':    return { g: G.cSection(v('b'), v('h'), v('t'), v('l')),
                                ext: { ytop: v('h') / 2, ybot: v('h') / 2,
                                       xrt: v('b') / 2, xlf: -(v('b') / 2 - v('t')) } };
      case 'ibeamAsym': {
        const h = v('h'), t1 = v('t1'), t2 = v('t2');
        return { g: G.iSectionAsym(h, v('b1'), v('b2'), v('d'), t1, t2, v('r'), v('r1')),
                 ext: { ytop: h / 2, ybot: h / 2, xrt: Math.max(v('b1'), v('b2')) / 2, xlf: Math.max(v('b1'), v('b2')) / 2 } };
      }
      default: return { g: G.rect(1, 1), ext: null };
    }
  }

  /* ---------------- 型号查表 ---------------- */

  /** 不等边角钢内圆角：国标表未给出，按肢宽与厚度的经验值取 */
  function t2r(B1, B2, t) { return Math.max(1, Math.min(t, (B1 - t) * .6, (B2 - t) * .6)); }

  /** 从国标表行提取截面特性字段（国标模式下直接采用表值） */
  const sectVals = x => ({
    mass: x.m, A: x.A, Ix: x.Ix, Iy: x.Iy,
    Wx: x.Wx, Wy: x.Wy, ix: x.ix, iy: x.iy
  });

  function stdRows(typeKey) {
    const t = TYPES[typeKey];
    if (!t || !t.std) return [];
    const k = t.std;
    switch (k) {
      // 工字钢 / H型钢：r·r1 为内弧与腿端圆角
      case 'ibeam': case 'hsteel':
        return STD[k].map(x => ({
          label: `${x.name}　${x.h}×${x.b}×${x.tw}×${x.tf}`,
          params: { h: x.h, b: x.b, d: x.tw, t: x.tf, r: x.r, r1: x.r1 },
          ...sectVals(x)
        }));
      // 槽钢：R·rr 为内弧与腿端圆角，语义不同故单独映射
      case 'channel':
        return STD.channel.map(x => ({
          label: `${x.name}　${x.h}×${x.b}×${x.tw}×${x.tf}`,
          params: { h: x.h, b: x.b, d: x.tw, t: x.tf, R: x.R, r: x.rr },
          ...sectVals(x)
        }));
      case 'angleEq':
        return STD.angleEq.map(x => ({
          label: x.name, params: { B: x.B, t: x.t, r: x.r }, mass: x.m
        }));
      case 'angleNe':
        return STD.angleNe.map(x => ({
          label: x.name, params: { B1: x.B1, B2: x.B2, t: x.t, r: t2r(x.B1, x.B2, x.t) },
          mass: x.m
        }));
      case 'bars': {
        const rows = [];
        if (typeKey === 'round') STD.bars.round.forEach(x => rows.push({
          label: 'Φ' + x.d, params: { d: x.d }, mass: x.m
        }));
        else STD.bars.square.forEach(x => rows.push({
          label: x.a + '×' + x.a, params: { a: x.a }, mass: x.m
        }));
        return rows;
      }
      case 'pipe':
        return STD.pipe.map(x => ({
          label: 'Φ' + x.D + '×' + x.t, params: { D: x.D, t: x.t }, mass: x.m
        }));
      default: return [];
    }
  }

  /* ---------------- 截面大样图 ---------------- *
   * 轮廓由 section.js 生成（已通过图形/计算面积一致性自检），
   * 本处负责：等比例缩放、剖面线填充、形心标注、尺寸标注线。        */
  
  /** 各截面的关键标注尺寸（世界坐标 mm） */
  function dimInfo(type, p) {
    const n = k => Number(p[k]) || 0;
    switch (type) {
      case 'round': case 'pipe':
        return { h: [0, n('d') / 2], v: [0, n('D') / 2], hLabel: 'D', vLabel: 'D' };
      case 'square':case 'flat':
        return { h: [0, n('B') / 2 || n('a') / 2], v: [0, n('t') / 2 || n('a') / 2],
                 hLabel: n('B') ? 'B' : 'a', vLabel: n('t') ? 't' : 'a' };
      case 'hex': case 'hexHollow':
        return { h: [0, n('s') / 2], v: [0, n('s') * Math.sqrt(3) / 4],
                 hLabel: 's', vLabel: 's×0.866' };
      case 'squareTube': case 'tube': {
        const B = type === 'tube' ? n('B') : n('a');
        const H = type === 'tube' ? n('H') : n('a');
        return { h: [0, B / 2], v: [0, H / 2], hLabel: 'B', vLabel: 'H',
                 inner: { h: B / 2 - n('t'), v: H / 2 - n('t') } };
      }
      case 'angleEq':
        return { h: [0, n('B')], v: [0, n('B')], hLabel: 'B', vLabel: 'B',
                 tLabel: 't', tAt: [n('B') / 2, 0] };
      case 'angleNe':
        return { h: [0, n('B1')], v: [0, n('B2')], hLabel: 'B1', vLabel: 'B2',
                 tLabel: 't', tAt: [n('B1') / 2, 0] };
      case 'channel':
        return { h: [0, n('b') / 2], v: [0, n('h') / 2], hLabel: 'b', vLabel: 'h',
                 tLabel: 't', tAt: [n('b') - n('d') / 2, 0] };
      case 'plate': case 'roundFlat':
        return { h: [0, n('B') / 2], v: [0, n('t') / 2], hLabel: 'B', vLabel: 't' };
      case 'box':
        return { h: [0, n('B') / 2], v: [0, n('B') / 2], hLabel: 'B', vLabel: 'B' };
      case 'tbeam':
        return { h: [0, n('b') / 2], v: [0, n('h') / 2], hLabel: 'b', vLabel: 'h' };
      case 'csteel':
        return { h: [0, n('b') / 2], v: [0, n('h') / 2], hLabel: 'b', vLabel: 'h' };
      case 'ibeam': case 'hsteel': case 'ibeamAsym': {
        const b1 = p.b1 != null ? n('b1') : n('b');
        return { h: [0, b1 / 2], v: [0, n('h') / 2], hLabel: 'b', vLabel: 'h',
                 dLabel: 'd', dAt: [0, 0], dVal: n('d'),
                 tfLabel: 't', tfAt: [b1 / 2, n('h') / 2 - n('t') / 2], tfVal: n('t') };
      }
      default: return {};
    }
  }

  function drawFig(el, type, p, g) {
    const S = SEC;
    const box = S.bounds(type, p);
    const w = Math.max(box.w, 1e-6), h = Math.max(box.h, 1e-6);
    const VW = 300, VH = 250, padX = 58, padY = 40;
    const k = Math.min((VW - padX * 2) / w, (VH - padY * 2) / h);
    const cx = VW / 2, cy = VH / 2;              // 视口中心
    const tf = `translate(${cx} ${cy}) scale(${k.toFixed(6)} ${(-k).toFixed(6)})`;
    const hp = (7 / k).toFixed(3);
    const info = dimInfo(type, p);

    let s = `<svg viewBox="0 0 ${VW} ${VH}" width="100%" height="100%" role="img" aria-label="截面大样图">`;
    // 剖面线
    s += `<defs><pattern id="hatch" width="${hp}" height="${hp}" patternTransform="rotate(45)"
         patternUnits="userSpaceOnUse">
         <line x1="0" y1="0" x2="0" y2="${hp}" stroke="var(--fig-hatch)" stroke-width="${(1.15 / k).toFixed(3)}" opacity=".62"/></pattern>
         <marker id="arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
           <path d="M0,1 L9,5 L0,9" fill="none" stroke="var(--fig-dim)" stroke-width="1.6"/></marker></defs>`;
    // 中心轴
    s += `<g stroke="var(--fig-axis)" stroke-width="1" stroke-dasharray="7 4 1.6 4">`;
    s += `<line x1="10" y1="${cy}" x2="${VW - 10}" y2="${cy}"/>`;
    s += `<line x1="${cx}" y1="8" x2="${cx}" y2="${VH - 8}"/></g>`;
    // 截面
    s += `<path d="${S.pathFor(type, p)}" transform="${tf}" fill="url(#hatch)" fill-rule="evenodd"
         stroke="var(--fig-line)" stroke-width="${(1.6 / k).toFixed(3)}" stroke-linejoin="round"/>`;
    // 形心 + 形心到坐标轴距离
    if (g && isFinite(g.cx) && isFinite(g.cy)) {
      const gx = (cx + g.cx * k).toFixed(2), gy = (cy - g.cy * k).toFixed(2);
      if (Math.abs(g.cx) > 0.05 || Math.abs(g.cy) > 0.05) {
        s += `<line x1="${cx}" y1="${cy}" x2="${gx}" y2="${gy}" stroke="var(--fig-cent)" stroke-width="1" stroke-dasharray="4 3" opacity=".8"/>`;
              }
      s += `<circle cx="${gx}" cy="${gy}" r="4.2" fill="var(--fig-cent)"/>`;
      s += `<circle cx="${gx}" cy="${gy}" r="8" fill="none" stroke="var(--fig-cent)" stroke-width="1" opacity=".35"/>`;
      s += `<text x="${(parseFloat(gx) + 9).toFixed(2)}" y="${(parseFloat(gy) + 4).toFixed(2)}" font-size="10.5" fill="var(--fig-cent)" font-weight="600" font-family="ui-monospace,Consolas,monospace">G</text>`;
    }
    s += `</svg>`;
    // 尺寸线在 SVG 外层（屏幕坐标）
    let dl = '';
    if (info && info.h && info.v) {
      const px = x => cx + x * k, py = y => cy - y * k;
      const m = 6;
      // 水平总宽
      const yb = py(info.v[1]) + m + 9;
      const x1 = px(-info.h[1]), x2 = px(info.h[1]);
      dl += `<g stroke="var(--fig-dim)" stroke-width="1">`;
      dl += `<line x1="${x1.toFixed(2)}" y1="${(yb + 2.5).toFixed(2)}" x2="${x2.toFixed(2)}" y2="${(yb + 2.5).toFixed(2)}" marker-start="url(#arw)" marker-end="url(#arw)"/>`;
      dl += `<line x1="${x1.toFixed(2)}" y1="${(py(info.v[1]) + 1).toFixed(2)}" x2="${x1.toFixed(2)}" y2="${(yb + 7).toFixed(2)}" stroke-dasharray="3 2"/>`;
      dl += `<line x1="${x2.toFixed(2)}" y1="${(py(info.v[1]) + 1).toFixed(2)}" x2="${x2.toFixed(2)}" y2="${(yb + 7).toFixed(2)}" stroke-dasharray="3 2"/>`;
      dl += `</g>`;
      dl += `<text x="${cx}" y="${(yb - 3).toFixed(2)}" font-size="10.5" fill="var(--fig-dim-txt)" text-anchor="middle" font-family="ui-monospace,Consolas,monospace">${info.hLabel} = ${+(info.h[1] * 2).toFixed(1)}</text>`;
      // 垂直总高
      const xv = px(info.h[1]) + m + 8;
      const ya = py(info.v[1]), yb2 = py(-info.v[1]);
      dl += `<g stroke="var(--fig-dim)" stroke-width="1">`;
      dl += `<line x1="${xv.toFixed(2)}" y1="${ya.toFixed(2)}" x2="${xv.toFixed(2)}" y2="${yb2.toFixed(2)}" marker-start="url(#arw)" marker-end="url(#arw)"/>`;
      dl += `<line x1="${(px(info.h[1]) + 1).toFixed(2)}" y1="${ya.toFixed(2)}" x2="${(xv + 5).toFixed(2)}" y2="${ya.toFixed(2)}" stroke-dasharray="3 2"/>`;
      dl += `<line x1="${(px(info.h[1]) + 1).toFixed(2)}" y1="${yb2.toFixed(2)}" x2="${(xv + 5).toFixed(2)}" y2="${yb2.toFixed(2)}" stroke-dasharray="3 2"/>`;
      dl += `</g>`;
      dl += `<text x="${(xv + 4).toFixed(2)}" y="${cy.toFixed(2)}" font-size="10.5" fill="var(--fig-dim-txt)" dominant-baseline="middle" transform="rotate(90 ${(xv + 4).toFixed(2)} ${cy.toFixed(2)})" text-anchor="middle" font-family="ui-monospace,Consolas,monospace">${info.vLabel} = ${+(info.v[1] * 2).toFixed(1)}</text>`;
    }
    s += dl + `</svg>`;
    el.innerHTML = s;
  }

  /* ---------------- 格式化 ---------------- */
  const fx = (v, n) => (Math.abs(v) < 1e-12 ? '0' : v.toFixed(n));

  /* ---------------- 初始化下拉框 ---------------- */
  function fillSel(el, items, val) {
    el.innerHTML = items.map((x, i) => `<option value="${i}">${x}</option>`).join('');
    if (val != null) el.value = val;
  }

  /** 材质下拉：按 optgroup 分组（钢 / 铸铁 / 有色 / 其他） */
  function fillMatSel(el) {
    const html = G.DENSITY_GROUPS.map(grp => {
      const items = MATS.map((m, k) => m.grp === grp ? k : -1).filter(k => k >= 0);
      if (!items.length) return '';
      const opts = items.map(k =>
        `<option value="${k}">${MATS[k].name}（${MATS[k].rho}）</option>`).join('');
      return `<optgroup label="${grp}">${opts}</optgroup>`;
    }).join('');
    el.innerHTML = html;
    el.value = 0;
  }

  /* ---------------- 主题 ---------------- */

  /**
   * 应用主题并持久化。
   * @param {string} theme  'dark' 或 ''（亮色）
   * @param {boolean} [save=true] 是否写入 localStorage
   */
  function applyTheme(theme, save = true) {
    const dark = theme === 'dark';
    if (dark) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    if (save) localStorage.setItem('mz-theme', dark ? 'dark' : '');
    syncTitleBar(dark);
  }

  /**
   * 同步原生窗口标题栏配色。
   * 网页 CSS 管不到 Win32 标题栏，桌面版需通过 pywebview 桥接通知原生层。
   *
   * 坑：pywebview 的 js_api 是**异步注入**的，页面 init 时往往还不存在。
   * 若此刻直接 return，首帧的主题就永远同步不到原生标题栏，
   * 因此未就绪时记下 pending，pywebviewready 后补发一次。
   */
  let titlebarPending = null;
  let themeFromSystemDone = false;

  function syncTitleBar(dark) {
    const api = window.pywebview && window.pywebview.api;
    if (!api || typeof api.set_titlebar !== 'function') {
      titlebarPending = dark;
      return;
    }
    titlebarPending = null;
    try { Promise.resolve(api.set_titlebar(dark)).catch(() => {}); } catch { /* 忽略 */ }
  }

  /** pywebview 就绪后补发一次标题栏同步，并让首启跟随系统主题 */
  function onPywebviewReady() {
    if (titlebarPending !== null) {
      const dark = titlebarPending;
      titlebarPending = null;
      syncTitleBar(dark);
    }
    if (!themeFromSystemDone) {
      themeFromSystemDone = true;
      initThemeFromSystem();
    }
  }

  /** 桌面版首次启动：若用户没选过主题，跟随系统偏好 */
  async function initThemeFromSystem() {
    if (localStorage.getItem('mz-theme')) return;      // 用户已明确选择过
    const api = window.pywebview && window.pywebview.api;
    if (!api || typeof api.get_theme !== 'function') return;
    try {
      if (await api.get_theme()) applyTheme('dark', false);
    } catch { /* 忽略 */ }
  }

  function init() {
    // 材质：optgroup 分组下拉，value 为 MATS 索引
    fillMatSel($('#uMat'));
    fillMatSel($('#tMat'));
    // 亮 / 暗主题切换（记忆到 localStorage，并同步原生标题栏）
    applyTheme(localStorage.getItem('mz-theme') || '', false);
    $('#btnTheme').onclick = () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? '' : 'dark');
    };
    // 截面类型
    fillSel($('#uType'), TYPE_KEYS.map(k => TYPES[k].name), TYPE_KEYS.indexOf('ibeam'));
    fillSel($('#tType'), TYPE_KEYS.map(k => TYPES[k].name), TYPE_KEYS.indexOf('ibeam'));
    fillSel($('#sType'), SECT_TYPES.map(k => TYPES[k].name), SECT_TYPES.indexOf('ibeam'));

    // 导航
    const TITLES = {
      unit: ['理论单重计算', '按材质与截面尺寸计算每米重量'],
      sect: ['截面特性计算', '面积、惯性矩、截面模量与回转半径'],
      batch:['批量算量', '多规格材料清单与汇总'],
      std:  ['国标型钢规格表', 'GB/T 706 · 707 · 11263 · 702 · 8163'],
      mat:  ['材质理论重量换算', '密度与换算关系'],
      help: ['使用说明', '功能来源、算法与精度']
    };
    $$('.nav-item').forEach(b => b.onclick = () => {
      $$('.nav-item').forEach(x => x.classList.toggle('on', x === b));
      $$('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + b.dataset.p));
      $('#pgTitle').textContent = TITLES[b.dataset.p][0];
      $('#pgSub').textContent = TITLES[b.dataset.p][1];
      if (b.dataset.p === 'std') renderStd();
      if (b.dataset.p === 'mat') renderMat();
    });

    // 单位制页面
    $('#uMat').onchange = calcUnit;
    $('#uLen').oninput = calcUnit;
    $('#uType').onchange = () => onTypeUnit(true);
    $('#uMode').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      $$('#uMode .chip').forEach(x => x.classList.toggle('on', x === b));
      onTypeUnit(true);
    };
    $('#uStdSel').onchange = calcUnit;

    // 截面特性页面
    $('#sType').onchange = () => onTypeSect(true);
    $('#sMode').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      $$('#sMode .chip').forEach(x => x.classList.toggle('on', x === b));
      onTypeSect(true);
    };
    $('#sStdSel').onchange = calcSect;

    // 批量
    $('#tMat').onchange = () => { $('#tHint').textContent = ''; fillBatchStd(); previewEntry(); };
    $('#tType').onchange = () => { fillBatchStd(); $('#tHint').textContent = ''; previewEntry(); };
    $('#tStd').onchange = () => { $('#tHint').textContent = ''; previewEntry(); };
    $('#tAdd').onclick = addBatch;
    $('#tClr').onclick = () => { BATCH.length = 0; renderBatch(); $('#tHint').textContent = ''; };
    // 任一输入变动都实时刷新预览
    ['#tLen', '#tQty', '#tLoss', '#tPrice', '#tPaint'].forEach(sel => {
      $(sel).oninput = previewEntry;
    });

    // 定尺长度下拉（30 档常用规格）+ 快捷长度按钮
    fillSel($('#tPreset'), STD_LENGTHS.map(v => v.toFixed(v % 1 ? 1 : 0) + ' m'),
            STD_LENGTHS.indexOf(6));
    $('#tPreset').onchange = () => {
      $('#tLen').value = $('#tPreset').value;
      previewEntry();
    };
    $('#tQuick').innerHTML = QUICK_LENGTHS.map((v, i) =>
      `<button class="chip${i === 0 ? ' on' : ''}" data-len="${v}">${v} m</button>`).join('');
    $$('#tQuick .chip').forEach(b => b.onclick = () => {
      $$('#tQuick .chip').forEach(x => x.classList.toggle('on', x === b));
      $('#tLen').value = b.dataset.len;
      previewEntry();
    });
    renderBatch();
    $('#btnExport').onclick = showExport;
    $('#stdQ').oninput = renderStd;

    onTypeUnit(true);
    onTypeSect(true);
    fillBatchStd();
    previewEntry();
    $('#bStd').textContent = STD.ibeam.length + STD.channel.length + STD.hsteel.length +
      STD.angleEq.length + STD.angleNe.length + STD.bars.round.length + STD.bars.square.length + STD.pipe.length;
    $('#bUnit').textContent = Object.keys(TYPES).length;

    // 快捷键
    document.addEventListener('keydown', e => {
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); window.print(); return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const map = { '1': 'unit', '2': 'sect', '3': 'batch' };
      if (map[e.key]) $$('.nav-item').find(b => b.dataset.p === map[e.key]).click();
    });
  }

  /* ---------------- 理论单重 ---------------- */
  let USTATE = {};

  function onTypeUnit(reset) {
    const key = selIdx($('#uType'), TYPE_KEYS);
    const t = TYPES[key];
    const mode = ($('#uMode .chip.on') || {}).dataset?.m || 'std';
    const has = stdRows(key).length > 0;

    // 模式可用性
    $('#uMode').style.display = has ? '' : 'none';
    if (!has) { $$('#uMode .chip').forEach(c => c.classList.toggle('on', c.dataset.m === 'custom')); }

    if (has && mode === 'std') {
      $('#uStdBox').style.display = '';
      $('#uStdSpec').textContent = t.stdName;
      fillSel($('#uStdSel'), stdRows(key).map(r => r.label), reset ? 0 : undefined);
      $('#uDims').innerHTML = `<div class="note info">已载入${t.stdName}标准尺寸，直接取值计算。</div>`;
      $('#uCatHint').textContent = '国标型号';
    } else {
      $('#uStdBox').style.display = 'none';
      $('#uDims').innerHTML = t.f.map(([k, lb, dv, st]) => `
        <div class="field"><div class="lbl">${lb} <span class="u">mm</span></div>
        <input class="inp mono" type="number" data-k="${k}" value="${dv}" step="${st}" min="0"></div>`).join('');
      $('#uDims').querySelectorAll('input').forEach(i => i.oninput = calcUnit);
      $('#uCatHint').textContent = '自定义尺寸';
    }
    calcUnit();
  }

  function calcUnit() {
    const key = selIdx($('#uType'), TYPE_KEYS);
    const mat = MATS[Math.min(parseInt($('#uMat').value, 10) || 0, MATS.length - 1)];
    const mode = ($('#uMode .chip.on') || {}).dataset?.m || 'custom';

    let p, stdM = null, name = '';
    if (mode === 'std' && stdRows(key).length) {
      const row = stdRows(key)[Number($('#uStdSel').value)];
      p = { ...row.params };
      stdM = row.mass; name = row.label.split('　')[0];
    } else {
      p = {};
      $('#uDims').querySelectorAll('input').forEach(i => p[i.dataset.k] = Number(i.value));
      name = TYPES[key].name;
    }
    USTATE = { p, mat, type: key, name, stdM, mode };

    $('#uRho').innerHTML = `${mat.rho}<u>g/cm³</u>`;
    $('#uMod').textContent = mat.mod;

    const { g, ext } = build(key, p);
    const geo = G.solve(g, mat.rho, ext);
    const mass = stdM != null ? stdM : geo.mass;      // 国标模式优先表值

    const L = Number(($('#uLen') || {}).value) || 0;
    const per = SEC.perimeters(key, p);

    $('#uMass').innerHTML = `${fx(mass, 3)}<small>kg/m</small>`;
    $('#uMassN').textContent = `${name}　ρ = ${mat.rho} g/cm³　${stdM != null ? '国标表值' : '几何计算值'}`;

    const kpi = [
      ['截面积',       fx(geo.Acm2, 2),               'cm²',  0],
      ['每米重量',     fx(mass, 3),                   'kg/m', 1],
      ['每米体积',     fx(geo.Acm2 / 1e4, 6),        'm³/m', 0],
      ['外表面积',     fx(per.outer / 1e3 * L, 3),    'm²',   0],
      ['内表面积',     fx(per.inner / 1e3 * L, 3),    'm²',   0],
      ['合计涂装面积', fx((per.outer + per.inner) / 1e3 * L, 3), 'm²', 0]
    ];
    $('#uKpi').innerHTML = kpi.map(([k, v, un, hi]) =>
      `<div class="kpi-i ${hi ? 'hi' : ''}"><div class="k">${k}</div><div class="v">${v}<u>${un}</u></div></div>`).join('');

    drawFig($('#uFig'), key, p, geo);

    const labels = Object.entries(p).filter(([k, v]) => v > 0)
      .map(([k, v]) => `${FIELD_CN[k] || k} = ${fx(v, k === 'r1' ? 2 : 1)}`);
    labels.push(`外周长 ${fx(per.outer, 1)}`);
    if (per.inner > 0.05) labels.push(`内周长 ${fx(per.inner, 1)}`);
    $('#uDims2').innerHTML = labels.map(l => `<span class="dim">${l}</span>`).join('');

    const LENS = [1, 3, 6, 9, 11.9, 12];
    const ao = per.outer / 1000, ai = per.inner / 1000;
    $('#uLenTb').innerHTML =
      '<thead><tr><th>长度 m</th><th class="n">单根 kg</th><th class="n">10 根 t</th>' +
      '<th class="n">外表面积 m²</th><th class="n">内表面积 m²</th></tr></thead><tbody>' +
      LENS.map(L => `<tr><td class="mono">${L}</td><td class="n">${fx(mass * L, 3)}</td>` +
        `<td class="n">${fx(mass * L * 10 / 1000, 4)}</td>` +
        `<td class="n">${fx(ao * L, 3)}</td><td class="n">${fx(ai * L, 3)}</td></tr>`).join('') +
      '</tbody>';
  }

  const FIELD_CN = {
    d:'直径', a:'边长', B:'宽', t:'厚', s:'对边距', D:'外径', H:'高', r:'内圆角', R:'外圆角',
    h:'高', b:'翼宽', r1:'翼缘角', B1:'长肢', B2:'短肢', t1:'上翼厚', t2:'下翼厚'
  };

  /* ---------------- 截面特性 ---------------- */
  function onTypeSect(reset) {
    const key = selIdx($('#sType'), SECT_TYPES);
    const t = TYPES[key];
    const mode = ($('#sMode .chip.on') || {}).dataset?.m || 'std';
    const has = stdRows(key).length > 0;

    $('#sMode').style.display = has ? '' : 'none';
    if (!has) $$('#sMode .chip').forEach(c => c.classList.toggle('on', c.dataset.m === 'custom'));

    if (has && mode === 'std') {
      $('#sStdBox').style.display = '';
      $('#sStdSpec').textContent = t.stdName;
      fillSel($('#sStdSel'), stdRows(key).map(r => r.label), reset ? 0 : undefined);
      $('#sDims').innerHTML = `<div class="note ok">采用${t.stdName}表值：惯性矩、截面模量、回转半径均为规范给定值。</div>`;
    } else {
      $('#sStdBox').style.display = 'none';
      $('#sDims').innerHTML = t.f.map(([k, lb, dv, st]) => `
        <div class="field"><div class="lbl">${lb} <span class="u">mm</span></div>
        <input class="inp mono" type="number" data-k="${k}" value="${dv}" step="${st}" min="0"></div>`).join('');
      $('#sDims').querySelectorAll('input').forEach(i => i.oninput = calcSect);
    }
    calcSect();
  }

  function calcSect() {
    const key = selIdx($('#sType'), SECT_TYPES);
    const mode = ($('#sMode .chip.on') || {}).dataset?.m || 'custom';
    let p, row = null;
    if (mode === 'std' && stdRows(key).length) {
      row = stdRows(key)[Number($('#sStdSel').value)];
      p = { ...row.params };
    } else {
      p = {};
      $('#sDims').querySelectorAll('input').forEach(i => p[i.dataset.k] = Number(i.value));
    }

    const { g, ext } = build(key, p);
    const s = G.solve(g, 7.85, ext);

    $('#sArea').innerHTML = `${fx(s.Acm2, 2)}<small>cm²</small>`;
    $('#sAreaN').textContent = `${TYPES[key].name}　${row ? '国标表值' : '几何计算值'}`;

    const src = row ? { Ix: row.Ix, Iy: row.Iy, Wx: row.Wx, Wy: row.Wy, ix: row.ix, iy: row.iy, A: row.A } : null;

    const val = (geo, tableV) => tableV != null ? tableV : geo;
    const Ix = val(s.Ixcm4, src?.Ix), Iy = val(s.Iycm4, src?.Iy);
    const Wx = val(s.Wxcm3, src?.Wx), Wy = val(s.Wycm3, src?.Wy);
    const ix = val(s.ixcm, src?.ix), iy = val(s.iycm, src?.iy);

    const rows = [
      ['A', '截面面积', fx(s.Acm2, 3), 'cm²'],
      ['I<sub>x</sub>', '对 x 轴惯性矩', fx(Ix, 1), 'cm⁴'],
      ['I<sub>y</sub>', '对 y 轴惯性矩', fx(Iy, 1), 'cm⁴'],
      ['W<sub>x</sub>', '对 x 轴截面模量', fx(Wx, 1), 'cm³'],
      ['W<sub>y</sub>', '对 y 轴截面模量', fx(Wy, 2), 'cm³'],
      ['i<sub>x</sub>', '对 x 轴回转半径', fx(ix, 2), 'cm'],
      ['i<sub>y</sub>', '对 y 轴回转半径', fx(iy, 2), 'cm'],
      ['—', '形心位置 yc', fx(s.cy, 2), 'mm'],
      ['—', '形心偏移 e', fx(s.cx, 2), 'mm'],
      ['—', '理论单重', fx(s.mass, 3), 'kg/m'],
      ['—', '密度（碳钢）', '7.85', 'g/cm³']
    ];
    $('#sTb').innerHTML = '<thead><tr><th style="width:52px">符号</th><th>特性</th><th class="n">数值</th><th class="n" style="width:64px">单位</th></tr></thead><tbody>' +
      rows.map(r => `<tr><td class="mono" style="font-weight:600;color:var(--accent)">${r[0]}</td><td>${r[1]}</td><td class="n">${r[2]}</td><td class="n" style="color:var(--txt-3)">${r[3]}</td></tr>`).join('') +
      '</tbody>';
    $('#sUnitHint').textContent = `cm · cm² · cm³ · cm⁴　${row ? '（国标表值）' : '（几何计算值）'}`;

    drawFig($('#sFig'), key, p, s);
    const labels = Object.entries(p).filter(([k, v]) => v > 0)
      .map(([k, v]) => `${FIELD_CN[k] || k} = ${fx(v, 1)}`);
    $('#sDims2').innerHTML = labels.map(l => `<span class="dim">${l}</span>`).join('') +
      `<span class="dim">A = ${fx(s.Acm2, 2)} cm²</span>`;
  }

  /* ---------------- 批量 ---------------- */
  /* ---------------- 批量算量 ---------------- *
   * 录入 → 实时预览 → 入清单 → 汇总导出
   * 清单同时给出：总长、净重、表面积（涂装）、金额、油漆用量        */

  const BATCH = [];

  /** 常用定尺长度（m）—— 建材行业标准规格 */
  const STD_LENGTHS = [
    1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0,
    10.0, 11.0, 11.5, 11.9, 12.0, 12.5, 13.0, 13.5, 14.0, 15.0, 16.0, 17.0, 18.0, 20.0,
  ];
  /** 快捷长度按钮（现场最常用的几档） */
  const QUICK_LENGTHS = [6, 9, 11.9, 12];

  /** 当前录入项的完整参数（含长度、数量、损耗、单价、油漆） */
  function readEntry() {
    const key = selIdx($('#tType'), TYPE_KEYS);
    const rows = stdRows(key);
    if (!rows.length) return null;
    const i = Math.min(parseInt($('#tStd').value, 10) || 0, rows.length - 1);
    const row = rows[i];
    const mat = MATS[Math.min(parseInt($('#tMat').value, 10) || 0, MATS.length - 1)];
    const L = Number($('#tLen').value) || 0;
    const Q = Number($('#tQty').value) || 0;
    const loss = Number($('#tLoss').value) || 0;
    const price = Number($('#tPrice').value) || 0;
    const paint = Number($('#tPaint').value) || 0;
    if (!(L > 0)) return null;

    // 单重按所选材质的密度换算（国标表值对应 ρ = 7.85）
    const m = row.mass * (mat.rho / 7.85);
    const net = m * L * Q;                       // 净重 kg
    const gross = net * (1 + loss / 100);        // 计损耗 kg

    // 表面积：按轮廓周长 × 长度 × 数量
    const per = SEC.perimeters(key, { ...row.params });
    const aOut = per.outer / 1000 * L * Q;        // 外表面积 m²
    const aIn = per.inner / 1000 * L * Q;         // 内表面积 m²

    const amount = gross / 1000 * price;          // 金额 元
    const paintKg = gross / 1000 * paint;        // 油漆 kg

    return {
      name: row.label.split('\u3000')[0], spec: row.label.split('\u3000')[1] || '',
      mat: mat.name, rho: mat.rho, m, L, Q, loss, price, paint,
      net, gross, aOut, aIn, aTotal: aOut + aIn,
      lenTotal: L * Q, amount, paintKg,
    };
  }

  function fillBatchStd() {
    const key = selIdx($('#tType'), TYPE_KEYS);
    const rows = stdRows(key);
    if (!rows.length) {
      $('#tStd').innerHTML = '<option>— 无国标表 —</option>';
      $('#tStd').disabled = true;
      return;
    }
    $('#tStd').disabled = false;
    fillSel($('#tStd'), rows.map(r => r.label), 0);
  }

  /** 录入区实时预览：把当前输入的全部换算结果显示出来 */
  function previewEntry() {
    const box = $('#tPreview');
    const key = selIdx($('#tType'), TYPE_KEYS);
    if (!stdRows(key).length) {
      box.innerHTML = '<div class="note">该截面类型无国标表，请到「理论单重」页自定义尺寸后使用单根数据。</div>';
      return;
    }
    const e = readEntry();
    if (!e) {
      box.innerHTML = '<div class="note">请填写大于 0 的长度。</div>';
      return;
    }
    const per = SEC.perimeters(key, stdRows(key)[Math.min(parseInt($('#tStd').value, 10) || 0, 1e9)].params);
    const cell = (k, v, u, hi) =>
      `<div class="kpi-i ${hi ? 'hi' : ''}"><div class="k">${k}</div><div class="v">${v}<u>${u}</u></div></div>`;
    box.innerHTML =
      `<div class="kpi" style="grid-template-columns:repeat(auto-fit,minmax(112px,1fr))">` +
      cell('单根单重', fx(e.m, 3), 'kg/m') +
      cell('总长度', fx(e.lenTotal, 3), 'm') +
      cell('净重', fx(e.net, 2), 'kg', true) +
      cell('计损耗', fx(e.gross, 2), 'kg', true) +
      cell('外表面积', fx(e.aOut, 3), 'm²') +
      cell('内表面积', fx(e.aIn, 3), 'm²') +
      cell('涂装总面积', fx(e.aTotal, 3), 'm²') +
      cell('周长', fx(per.outer, 1), 'mm') +
      (e.price > 0 ? cell('金额', fx(e.amount, 2), '元', true) : '') +
      (e.paint > 0 ? cell('油漆用量', fx(e.paintKg, 2), 'kg') : '') +
      `</div>`;
  }

  function addBatch() {
    const key = selIdx($('#tType'), TYPE_KEYS);
    if (!stdRows(key).length) {
      $('#tHint').innerHTML = '<span style="color:var(--warn)">该截面类型无国标表，请改用「理论单重」页自定义尺寸。</span>';
      return;
    }
    const e = readEntry();
    if (!e) {
      $('#tHint').innerHTML = '<span style="color:var(--warn)">长度须大于 0</span>';
      return;
    }
    BATCH.push(e);
    $('#tHint').innerHTML = `<span style="color:var(--ok)">已加入 ${e.name}　${e.L} m × ${e.Q} 根</span>`;
    renderBatch();
  }

  function renderBatch() {
    const cnt = BATCH.length;
    const qty = BATCH.reduce((s, r) => s + r.Q, 0);
    $('#tCnt').textContent = cnt ? `共 ${cnt} 条 · ${qty} 根` : '共 0 条';
    if (!cnt) {
      $('#tTb').innerHTML = '<tbody><tr><td class="empty">暂无记录，从上方选择型号与长度后点击「加入清单」</td></tr></tbody>';
      return;
    }

    let tNet = 0, tGross = 0, tOut = 0, tIn = 0, tLen = 0, tAmt = 0, tPaint = 0;
    const rows = BATCH.map((r, i) => {
      tNet += r.net; tGross += r.gross; tOut += r.aOut; tIn += r.aIn;
      tLen += r.lenTotal; tAmt += r.amount; tPaint += r.paintKg;
      return `<tr><td class="n">${i + 1}</td>
        <td class="mono" style="font-weight:600">${r.name}</td>
        <td class="mono">${r.spec}</td>
        <td>${r.mat}</td>
        <td class="n">${fx(r.m, 3)}</td>
        <td class="n">${r.L}</td>
        <td class="n">${r.Q}</td>
        <td class="n">${fx(r.lenTotal, 3)}</td>
        <td class="n">${r.loss}%</td>
        <td class="n">${fx(r.net, 1)}</td>
        <td class="n" style="font-weight:600">${fx(r.gross, 1)}</td>
        <td class="n">${fx(r.aOut, 3)}</td>
        <td class="n">${fx(r.aIn, 3)}</td>
        <td class="n">${r.price > 0 ? fx(r.amount, 0) : '—'}</td>
        <td class="n">${r.paint > 0 ? fx(r.paintKg, 1) : '—'}</td>
        <td class="n"><button class="btn" data-del="${i}" style="padding:2px 8px" title="删除该行">✕</button></td></tr>`;
    }).join('');

    $('#tTb').innerHTML =
      '<thead><tr><th class="n">#</th><th>型号</th><th>规格</th><th>材质</th>' +
      '<th class="n">单重 kg/m</th><th class="n">单根长 m</th><th class="n">数量</th>' +
      '<th class="n">总长 m</th><th class="n">损耗</th>' +
      '<th class="n">净重 kg</th><th class="n">计损耗 kg</th>' +
      '<th class="n">外表 m²</th><th class="n">内表 m²</th>' +
      '<th class="n">金额 元</th><th class="n">油漆 kg</th><th></th></tr></thead><tbody>' +
      rows +
      `<tr style="background:var(--accent-soft);font-weight:700">
        <td colspan="7">合计</td>
        <td class="n">${fx(tLen, 2)}</td><td></td>
        <td class="n">${fx(tNet, 1)}</td><td class="n">${fx(tGross, 1)}</td>
        <td class="n">${fx(tOut, 3)}</td><td class="n">${fx(tIn, 3)}</td>
        <td class="n">${tAmt > 0 ? fx(tAmt, 0) : '—'}</td>
        <td class="n">${tPaint > 0 ? fx(tPaint, 1) : '—'}</td>
        <td></td></tr></tbody>`;

    $$('#tTb [data-del]').forEach(b => b.onclick = () => {
      BATCH.splice(+b.dataset.del, 1);
      renderBatch();
    });
  }

  /* ---------------- 国标表 ---------------- */
  const STD_VIEWS = [
    ['ibeam', '工字钢'], ['channel', '槽钢'], ['hsteel', 'H型钢'],
    ['angle', '角钢'], ['round', '圆钢'], ['square', '方钢'], ['pipe', '钢管']
  ];
  let stdView = 'ibeam';
  function renderStd() {
    $('#stdSeg').innerHTML = STD_VIEWS.map(([k, n]) =>
      `<button data-v="${k}" class="${k === stdView ? 'on' : ''}">${n}</button>`).join('');
    $$('#stdSeg button').forEach(b => b.onclick = () => { stdView = b.dataset.v; renderStd(); });

    const q = ($('#stdQ').value || '').trim().toLowerCase();
    let head = '', body = [];
    const hit = s => !q || s.toLowerCase().includes(q);

    if (stdView === 'ibeam' || stdView === 'channel' || stdView === 'hsteel') {
      const src = STD[stdView], spec = STD.spec[stdView];
      head = `<tr><th>型号</th><th class="n">h</th><th class="n">b</th><th class="n">d</th><th class="n">t</th>
        <th class="n">A cm²</th><th class="n">Ix cm⁴</th><th class="n">Iy cm⁴</th><th class="n">Wx cm³</th>
        <th class="n">Wy cm³</th><th class="n">ix cm</th><th class="n">iy cm</th><th class="n">单重 kg/m</th><th></th></tr>`;
      body = src.filter(x => hit(x.name)).map(x => `<tr>
        <td class="mono" style="font-weight:600">${x.name}</td><td class="n">${x.h}</td><td class="n">${x.b}</td>
        <td class="n">${x.tw}</td><td class="n">${x.tf}</td><td class="n">${x.A}</td><td class="n">${x.Ix}</td>
        <td class="n">${x.Iy}</td><td class="n">${x.Wx}</td><td class="n">${x.Wy}</td>
        <td class="n">${x.ix}</td><td class="n">${x.iy}</td><td class="n" style="font-weight:600">${x.m}</td>
        <td><button class="btn" data-use="${x.name}|${stdView}" style="padding:2px 9px">采用</button></td></tr>`).join('');
      if (!body) body = `<tr><td colspan="14" class="empty">无匹配规格</td></tr>`;
      $('#stdTb').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    } else if (stdView === 'angle') {
      head = `<tr><th>型号</th><th class="n">肢宽 mm</th><th class="n">厚度 mm</th><th class="n">单重 kg/m</th><th class="n">A cm²</th><th></th></tr>`;
      const eq = STD.angleEq.filter(x => hit(x.name)).map(x => {
        const s = G.solve(G.angleEq(x.B, x.t, x.r), 7.85);
        return { n: x.name, p: `B=${x.B}  t=${x.t}`, m: x.m, A: s.Acm2, use: `${x.name}|angleEq` };
      });
      const ne = STD.angleNe.filter(x => hit(x.name)).map(x => {
        const s = G.solve(G.angleNe(x.B1, x.B2, x.t, t2r(x.B1, x.B2, x.t)), 7.85);
        return { n: x.name, p: `${x.B1}×${x.B2}×${x.t}`, m: x.m, A: s.Acm2, use: `${x.name}|angleNe` };
      });
      const all = [...eq, ...ne];
      body = all.length ? all.map(x => `<tr><td class="mono" style="font-weight:600">${x.n}</td>
        <td class="n">${x.p}</td><td class="n" style="font-weight:600">${x.m}</td><td class="n">${fx(x.A, 2)}</td>
        <td><button class="btn" data-use="${x.use}" style="padding:2px 9px">采用</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="empty">无匹配规格</td></tr>`;
      $('#stdTb').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    } else if (stdView === 'round' || stdView === 'square') {
      const arr = STD.bars[stdView];
      head = `<tr><th>规格</th><th class="n">直径/边长 mm</th><th class="n">A cm²</th><th class="n">理论单重 kg/m</th><th></th></tr>`;
      const list = arr.filter(x => hit(String(x.d || x.a)));
      body = list.length ? list.map(x => {
        const v = x.d || x.a, s = G.solve(stdView === 'round' ? G.roundBar(v) : G.flatBar(v, v), 7.85);
        const nm = stdView === 'round' ? 'Φ' + v : v + '×' + v;
        const useKey = stdView === 'round' ? 'round' : 'square';
        return `<tr><td class="mono" style="font-weight:600">${nm}</td><td class="n">${v}</td>
          <td class="n">${fx(s.Acm2, 3)}</td><td class="n" style="font-weight:600">${x.m}</td>
          <td><button class="btn" data-use="${nm}|${useKey}" style="padding:2px 9px">采用</button></td></tr>`;
      }).join('') : `<tr><td colspan="5" class="empty">无匹配规格</td></tr>`;
      $('#stdTb').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    } else {
      head = `<tr><th>规格</th><th class="n">外径 mm</th><th class="n">壁厚 mm</th><th class="n">A cm²</th>
        <th class="n">理论单重 kg/m</th><th></th></tr>`;
      const list = STD.pipe.filter(x => hit('Φ' + x.D + '×' + x.t));
      body = list.length ? list.map(x => {
        const s = G.solve(G.pipe(x.D, x.t), 7.85);
        return `<tr><td class="mono" style="font-weight:600">Φ${x.D}×${x.t}</td><td class="n">${x.D}</td>
          <td class="n">${x.t}</td><td class="n">${fx(s.Acm2, 3)}</td>
          <td class="n" style="font-weight:600">${x.m}</td>
          <td><button class="btn" data-use="Φ${x.D}×${x.t}|pipe" style="padding:2px 9px">采用</button></td></tr>`;
      }).join('') : `<tr><td colspan="6" class="empty">无匹配规格</td></tr>`;
      $('#stdTb').innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
    }

    $$('#stdTb [data-use]').forEach(b => b.onclick = () => {
      const [nm, kind] = b.dataset.use.split('|');
      jumpTo(nm, kind);
    });
  }

  function jumpTo(name, kind) {
    const key = kind;
    if (!TYPES[key]) return;
    const rows = stdRows(key);
    const i = rows.findIndex(r => r.label.split('　')[0] === name);
    // 跳到「理论单重」，切到对应类型与型号
    $$('.nav-item').find(b => b.dataset.p === 'unit').click();
    const list = TYPE_KEYS.indexOf(key);
    if (list < 0) return;
    $('#uType').value = list;
    const want = rows.length ? 'std' : 'custom';
    const chip = $$('#uMode .chip').find(c => c.dataset.m === want);
    if (chip) chip.click();
    if (i >= 0) { $('#uStdSel').value = i; }
    calcUnit();
  }

  /* ---------------- 材质表 ---------------- */
  function renderMat() {
    const head = `<tr><th>材质</th><th class="n">密度 g/cm³</th><th class="n">每 cm² 截面每米重量 kg</th>
      <th class="n">相对碳钢</th><th>弹性模量</th></tr>`;
    const body = MATS.map(m => `<tr><td style="font-weight:600">${m.name}</td>
      <td class="n" style="font-weight:600">${m.rho}</td><td class="n">${fx(m.rho / 1000, 5)}</td>
      <td class="n">${fx(m.rho / 7.85, 4)}</td><td style="color:var(--txt-2)">${m.mod}</td></tr>`).join('');
    // 示例对照：以 I20a 为例
    let rows2 = '';
    const sec = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75), 7.85,
      { ytop: 100, ybot: 100, xrt: 50, xlf: 50 });
    for (const m of MATS) {
      const s = G.solve(G.iSection(200, 100, 7, 11.4, 11.5, 5.75), m.rho,
        { ytop: 100, ybot: 100, xrt: 50, xlf: 50 });
      rows2 += `<tr><td>${m.name}</td><td class="n">${m.rho}</td>
        <td class="n">${fx(s.mass, 3)}</td><td class="n">${fx(s.Acm2, 3)}</td>
        <td class="n">${fx(mass6(s.mass), 3)}</td></tr>`;
    }
    $('#matTb').innerHTML =
      `<thead><tr><th colspan="5" style="padding-top:12px">基本换算关系</th></tr>${head}</thead><tbody>${body}</tbody>` +
      `<thead><tr><th colspan="5" style="border-top:2px solid var(--line-2);padding-top:14px">
        示例：I20a（h200 b100 d7 t11.4，A = ${fx(sec.Acm2, 2)} cm²）各材质理论单重</th></tr>
        <tr><th>材质</th><th class="n">ρ g/cm³</th><th class="n">单重 kg/m</th><th class="n">A cm²</th><th class="n">6m 一根 kg</th></tr></thead>
        <tbody>${rows2}</tbody>`;
  }
  const mass6 = m => m * 6;

  /* ---------------- 导出：弹窗表格 ---------------- *
   * 生成二维数据表 → 弹窗展示，支持一键复制为制表符分隔文本，
   * 可直接粘贴进 Excel / WPS 保持表格结构；也可另存为 CSV。      */

  /** 采集当前页面数据为 {title, head:[], body:[[]]} */
  function collectTable() {
    const page = $$('.page').find(p => p.classList.contains('on'))?.id;
    const grab = (sel, name) => {
      const t = $(sel);
      if (!t) return null;
      const th = Array.from(t.querySelectorAll('thead tr:last-child th')).map(x => x.textContent.trim());
      const rows = Array.from(t.querySelectorAll('tbody tr'))
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))
        .filter(r => r.length && !r[0].startsWith('暂无'));
      return { title: name, head: th, body: rows };
    };

    if (page === 'p-std') return grab('#stdTb', '国标型钢规格表');
    if (page === 'p-mat') {
      const t = $('#matTb');
      if (!t) return null;
      const heads = Array.from(t.querySelectorAll('thead tr')).map(tr =>
        Array.from(tr.querySelectorAll('th')).map(x => x.textContent.trim()));
      const rows = Array.from(t.querySelectorAll('tbody tr'))
        .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim()))
        .filter(r => r.length);
      return { title: '材质理论重量换算表', groups: heads.filter(h => h.length > 1), body: rows };
    }
    if (page === 'p-batch') {
      if (!BATCH.length) return null;
      const sum = k => fx(BATCH.reduce((s, r) => s + r[k], 0), 2);
      const body = BATCH.map((r, i) => [
        i + 1, r.name, r.spec, r.mat, fx(r.m, 3), r.L, r.Q, fx(r.lenTotal, 3),
        r.loss + '%', fx(r.net, 2), fx(r.gross, 2),
        fx(r.aOut, 3), fx(r.aIn, 3), fx(r.aTotal, 3),
        r.price > 0 ? r.price : '', r.price > 0 ? fx(r.amount, 2) : '',
        r.paint > 0 ? r.paint : '', r.paint > 0 ? fx(r.paintKg, 2) : '',
      ]);
      // 合计行
      body.push(['', '合计', '', '',
        fx(BATCH.reduce((s, r) => s + r.m * 0, 0), 3) || '',
        '', BATCH.reduce((s, r) => s + r.Q, 0), sum('lenTotal'), '',
        sum('net'), sum('gross'), sum('aOut'), sum('aIn'), sum('aTotal'),
        '', sum('amount'), '', sum('paintKg')]);
      return {
        title: '材料汇总表（含涂装面积与金额）',
        head: ['序号', '型号', '规格', '材质', '单重 kg/m', '单根长 m', '数量 根', '总长 m',
          '损耗率', '净重 kg', '计损耗 kg', '外表面积 m²', '内表面积 m²', '涂装总面积 m²',
          '单价 元/t', '金额 元', '油漆 kg/t', '油漆 kg'],
        body
      };
    }
    if (page === 'p-sect') return grab('#sTb', '截面特性计算');
    return grab('#uLenTb', '理论单重与表面积');
  }

  /* ---------------- 文件导出 ---------------- *
   * 1) 首选 Excel 工作簿（SpreadsheetML .xls）—— Excel / WPS 双击即可打开，
   *    带样式与列宽，比 CSV 实用得多。
   * 2) 桌面版（pywebview）走原生保存对话框；浏览器环境回退 Blob 下载。
   * 3) 另提供「复制表格」，TSV 粘贴进 Excel 同样保持结构。            */

  const xmlEsc = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** 数值型单元格识别：纯数字（可含负号与小数）才作为 Excel 数值写入 */
  const isNum = v => v !== '' && v !== null && !isNaN(Number(v)) &&
                    /^-?[\d.]+$/.test(String(v).trim());

  /** 生成 Excel 2003 XML（SpreadsheetML）工作簿内容 */
  function toExcelXml(title, rows) {
    const colCount = Math.max(...rows.map(r => r.length));
    const grid = rows.map((r, ri) => {
      const cells = [];
      for (let ci = 0; ci < colCount; ci++) {
        const v = r[ci] ?? '';
        // 首行为标题（加粗底色），其余按内容类型判定
        const style = ri === 0 ? 'ttl' : 'txt';
        cells.push(isNum(v)
          ? `<Cell ss:StyleID="sNum"><Data ss:Type="Number">${Number(v)}</Data></Cell>`
          : `<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`);
      }
      return `<Row>${cells.join('')}</Row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default"><Font ss:Size="11" ss:Name="宋体"/>
    <Interior/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="ttl"><Font ss:Size="13" ss:Bold="1" ss:Name="宋体"/>
    <Interior ss:Color="#EFF4FF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="txt"><Alignment ss:Horizontal="Left" ss:Vertical="Center"/></Style>
  <Style ss:ID="sNum"><NumberFormat ss:Format="General"/>
    <Alignment ss:Horizontal="Right" ss:Vertical="Center"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEsc(title).slice(0, 28)}">
  <Table>${grid}</Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/><PageSetup><Layout Orientation="Landscape"/></PageSetup>
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal>
   <TopRowBottomPane>1</TopRowBottomPane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
  }

  /** 0 → A, 1 → B, …, 26 → AA */
  function colName(i) {
    let s = '';
    for (i = i + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
    return s;
  }

  /** 组装当前页表格为二维数组 */
  function tableRows(data) {
    const rows = [[data.title]];
    (data.groups || []).forEach(g => rows.push(g));
    if (data.head && data.head.length) rows.push(data.head);
    data.body.forEach(r => rows.push(r));
    return rows;
  }

  /** UTF-8 → base64（中文文件名与内容均安全） */
  function toB64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  }

  /** 保存文件：桌面版走原生对话框，浏览器走 Blob 下载 */
  async function saveAs(filename, text, mime, fileTypes) {
    const api = window.pywebview && window.pywebview.api;
    if (api && typeof api.save_file === 'function') {
      try {
        const path = await api.save_file(filename, toB64(text), fileTypes);
        return path ? 'saved:' + path : 'cancel';
      } catch (e) {
        alert('保存失败：' + e);
        return 'error';
      }
    }
    // XML 工作簿不能加 BOM（会破坏 <?xml?> 声明），文本类则需要 BOM 保证 Excel 识别 UTF-8
    const needBom = !text.startsWith('<?xml');
    const blob = new Blob([needBom ? '\ufeff' + text : text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved:' + filename;
  }

  function showExport() {
    const data = collectTable();
    if (!data || !data.body.length) {
      alert('当前页面暂无可导出的表格数据');
      return;
    }
    const rows = tableRows(data);
    const tsv = rows.map(r => r.map(c => String(c ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
    const stamp = new Date().toISOString().slice(0, 10);
    const base = data.title + '_' + stamp;

    const host = document.createElement('div');
    host.innerHTML =
      '<div class="dlg-wrap"><div class="dlg" role="dialog" aria-modal="true">' +
      '<div class="dlg-h"><h3>' + data.title + '</h3>' +
      '<button class="dlg-x" title="关闭">×</button></div>' +
      '<div class="dlg-b"><pre id="dlgText"></pre></div>' +
      '<div class="dlg-f">' +
      '<span class="tip">共 ' + data.body.length + ' 行 · 可导出 Excel，或复制后粘贴到 Excel / WPS</span>' +
      '<button class="btn" id="dlgCopy">复制表格</button>' +
      '<button class="btn" id="dlgCsv">导出 CSV</button>' +
      '<button class="btn btn-p" id="dlgXls">导出 Excel</button>' +
      '</div></div></div>';
    document.body.appendChild(host);
    host.querySelector('#dlgText').textContent = tsv;

    const close = () => host.remove();
    host.querySelector('.dlg-x').onclick = close;
    host.onclick = e => { if (e.target === host) close(); };

    host.querySelector('#dlgCopy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(tsv);
        flash(host.querySelector('#dlgCopy'), '已复制');
      } catch { selectText(host); }
    };

    // CSV：加引号转义，Excel 打开不乱列
    host.querySelector('#dlgCsv').onclick = async () => {
      const csv = rows.map(r => r.map(c => {
        const v = String(c ?? '');
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',')).join('\r\n');
      flash(host.querySelector('#dlgCsv'), '导出中…');
      const r = await saveAs(base + '.csv', csv, 'text/csv', [['CSV 文件', '.csv']]);
      host.querySelector('#dlgCsv').textContent = r === 'cancel' ? '导出 CSV' : '已导出';
      if (r.startsWith('saved:')) setTimeout(close, 500);
    };

    host.querySelector('#dlgXls').onclick = async () => {
      flash(host.querySelector('#dlgXls'), '导出中…');
      const xml = toExcelXml(data.title, rows);
      const r = await saveAs(base + '.xls', xml, 'application/vnd.ms-excel',
                            [['Excel 工作簿', '.xls']]);
      host.querySelector('#dlgXls').textContent = r === 'cancel' ? '导出 Excel' : '已导出';
      if (r.startsWith('saved:')) setTimeout(close, 500);
    };
  }

  function selectText(host) {
    const pre = host.querySelector('#dlgText');
    const r = document.createRange();
    r.selectNodeContents(pre);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
    flash(host.querySelector('#dlgCopy'), '已选中，请按 Ctrl+C');
  }

  function flash(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = old; }, 1600);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    // pywebview 注入 js_api 后会派发 pywebviewready，以此为准确认原生层就绪。
    // 该事件在 window 上派发、会冒泡到 document，两处都监听更稳妥。
    window.addEventListener('pywebviewready', onPywebviewReady, { once: true });
    document.addEventListener('pywebviewready', onPywebviewReady, { once: true });
    // 兜底：某些版本/环境下事件可能不触发，轮询等待 API 出现
    let tries = 0;
    const waitApi = setInterval(() => {
      const api = window.pywebview && window.pywebview.api;
      if (api && typeof api.set_titlebar === 'function') {
        clearInterval(waitApi);
        onPywebviewReady();
      } else if (++tries > 100) {
        clearInterval(waitApi);
      }
    }, 100);
  });
})();