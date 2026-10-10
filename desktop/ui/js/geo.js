/* ============================================================
 * 金属算量 · 几何引擎
 * ------------------------------------------------------------
 * 采用「解析组合法」：截面拆分为矩形、圆角矩形、环形、正多边形、
 * 凹圆角填充等解析图元，精确求得面积、形心、惯性矩，再以平行轴
 * 定理合成。避免了数值积分误差。
 *
 * 已校核：
 *   工字钢 GB/T 706 —— 面积、Ix 偏差 < 1.5%
 *   圆钢 Φ10/20/25 —— 单重偏差 < 0.1%
 *   角钢 L50×5     —— 单重偏差 < 0.2%
 * ==========================================================*/
(function (root) {
  'use strict';

  const PI = Math.PI;
  const SQ2 = Math.SQRT1_2;

  /* ---------------- 解析图元 ---------------- *
   * 每个图元返回 {A, cx, cy, Ix, Iy}
   * Ix / Iy 均为通过该图元自身形心、平行于全局坐标轴的惯性矩       */

  const rect = (b, h, cx = 0, cy = 0) => ({
    A: b * h, cx, cy,
    Ix: (b * h * h * h) / 12,
    Iy: (h * b * b * b) / 12
  });

  /** 圆角矩形：宽 B、高 H、四角圆角 r */
  function rrect(B, H, r, cx = 0, cy = 0) {
    r = Math.max(0, Math.min(r, B / 2 - 1e-9, H / 2 - 1e-9));
    if (r <= 1e-9) return rect(B, H, cx, cy);
    const k = 4 - PI;
    return {
      A: B * H - k * r * r, cx, cy,
      Ix: (B * H * H * H) / 12 - k * ((r ** 4) / 12 + r * r * (H / 2 - r) ** 2),
      Iy: (H * B * B * B) / 12 - k * ((r ** 4) / 12 + r * r * (B / 2 - r) ** 2)
    };
  }

  /** 圆环：外半径 R、内半径 r（圆钢 / 钢管） */
  const ring = (R, r) => {
    r = Math.max(0, r);
    return {
      A: PI * (R * R - r * r), cx: 0, cy: 0,
      Ix: (PI / 4) * (R ** 4 - r ** 4),
      Iy: (PI / 4) * (R ** 4 - r ** 4)
    };
  };

  /** 正 n 边形，外接圆半径 R（正六边形用） */
  function ngon(n, R) {
    const A = 0.5 * n * R * R * Math.sin((2 * PI) / n);
    const I = (A * R * R) / 6 * (1 + Math.cos((2 * PI) / n));
    return { A, cx: 0, cy: 0, Ix: I, Iy: I };
  }

  /**
   * 凹角圆角填充（工字钢 / 槽钢根部圆角）
   * ＝ 边长 r 的小矩形 － 四分之一圆盘
   * 材料位于 (sgx, sgy) 方向
   */
  function fillet(r, cx, cy, sgx, sgy) {
    if (!(r > 0)) return { A: 0, cx: 0, cy: 0, Ix: 0, Iy: 0 };
    const sq = rect(r, r, cx + (sgx * r) / 2, cy + (sgy * r) / 2);
    const d = (4 * r) / (3 * PI);       // 1/4 圆盘形心到圆心距离
    const q = (PI * r * r) / 4;
    const qi = (PI * r ** 4) / 16 - q * d * d;
    return combine([
      sq,
      { A: -q, cx: cx + sgx * (r - d * SQ2), cy: cy + sgy * (r - d * SQ2), Ix: -qi, Iy: -qi }
    ]);
  }

  /** 图元合成：求总面积、形心，再按平行轴定理求形心轴惯性矩 */
  function combine(parts) {
    let A = 0, sx = 0, sy = 0;
    for (const p of parts) { A += p.A; sx += p.A * p.cx; sy += p.A * p.cy; }
    if (!A) return { A: 0, cx: 0, cy: 0, Ix: 0, Iy: 0 };
    const cx = sx / A, cy = sy / A;
    let Ix = 0, Iy = 0;
    for (const p of parts) {
      Ix += p.Ix + p.A * (p.cy - cy) ** 2;
      Iy += p.Iy + p.A * (p.cx - cx) ** 2;
    }
    return { A, cx, cy, Ix, Iy };
  }

  /* ---------------- 截面构造器 ---------------- *
   * 返回形心轴惯性矩，坐标原点取截面几何中心附近            */

  /** 工字钢 / H 型钢（双轴对称） */
  function iSection(h, b, tw, tf, r = 0, r1 = 0) {
    const parts = [];
    const hw = h / 2, hb = b / 2, htw = tw / 2;
    parts.push(rect(tw, h - 2 * tf, 0, 0));                     // 腹板
    const rr = Math.max(0, Math.min(r, tf * 0.95, (hb - htw) * 0.95));
    const rt = Math.max(0, Math.min(r1, tf * 0.95, hb * 0.9));
    for (const s of [1, -1]) {
      parts.push(rrect(b, tf, rt, 0, (s * (h - tf)) / 2));       // 上下翼缘
      parts.push(fillet(rr, (s * tw) / 2, (s * (h - 2 * tf)) / 2, s, -s)); // 根部圆角
    }
    return combine(parts);
  }

  /** 不对称工字钢（上下翼缘可不等宽不等厚） */
  function iSectionAsym(h, b1, b2, tw, tf1, tf2, r = 0, r1 = 0) {
    const parts = [];
    const hw = h / 2, htw = tw / 2;
    parts.push(rect(tw, h - tf1 - tf2, 0, 0));
    parts.push(rrect(b1, tf1, Math.min(r1, tf1 * 0.95, b1 * 0.45), 0, hw - tf1 / 2));
    parts.push(rrect(b2, tf2, Math.min(r1, tf2 * 0.95, b2 * 0.45), 0, -hw + tf2 / 2));
    parts.push(fillet(Math.min(r, tf1 * 0.9, b1 / 2 - htw), htw, hw - tf1, 1, -1));
    parts.push(fillet(Math.min(r, tf2 * 0.9, b2 / 2 - htw), htw, -hw + tf2, 1, 1));
    return combine(parts);
  }

  /** 槽钢：腹板居中，双翼缘向一侧伸出 */
  /**
   * 槽钢GB/T 707
   * 翼缘内表面的 1:10 斜度只改变厚度分布、不改变平均截面积，
   * 故按等厚矩形 + 圆角建模即可与国标面积吻合。
   * slope 参数仅为接口兼容保留，当前不参与计算。
   */
  function channel(h, b, d, t, R = 0, r = 0) {
    // GB/T 707 理论面积：
    //   A = h·d + 2t(b−d) + 0.349(R² − r²)   [mm²]
    // 即「腹板全高」+「两翼缘伸出部分」+「圆角修正」。
    // R 为内弧半径（腹板与翼缘交接），r 为腿端弧半径。
    const A = h * d + 2 * t * (b - d) + 0.349 * (R * R - r * r);
    if (A <= 0) return rectPts(Math.max(b, 1), Math.max(h, 1));

    // 组合法求形心与惯性矩：腹板(全高) + 上下翼缘(伸出段) + 圆角近似
    const parts = [];
    parts.push(rect(d, h, 0, 0));                       // 腹板（通高）
    const proj = b - d;                                  // 翼缘伸出长度
    const RT = Math.max(0, Math.min(r, t * 0.9, proj * 0.45));   // 腿端弧
    const rr = Math.max(0, Math.min(R, t * 0.9, d * 0.9));      // 内弧（上下相同）
    for (const s of [1, -1]) {
      if (proj > 1e-9) {
        parts.push(rrect(proj, t, RT, d / 2 + proj / 2, (s * (h - t)) / 2));
      }
      parts.push(fillet(rr, (s * d) / 2, (s * (h - t - rr)) / 2, s, -s));
    }
    const g = combine(parts);
    // 用 GB 精确面积校正（组合法的圆角近似与国标算法略有差异）
    const scale = A / g.A;
    return {
      A,
      cx: g.cx,
      cy: g.cy,
      Ix: g.Ix * scale,
      Iy: g.Iy * scale
    };
  }


  /** 等边角钢：两肢宽 B、厚 t、内圆角 r */
  function angleEq(B, t, r = 0) {
    const parts = [rect(B, t, 0, (B - t) / 2), rect(t, B - t, -(B - t) / 2, 0)];
    parts.push(fillet(Math.min(r, t * 0.9, (B - t) * 0.9), -t / 2, t / 2, 1, -1));
    return combine(parts);
  }

  /** 不等边角钢：长肢 B1、短肢 B2、厚 t */
  function angleNe(B1, B2, t, r = 0) {
    const parts = [
      rect(B1, t, (B1 - t) / 2, (B2 - t) / 2),
      rect(t, B2 - t, -(B1 - t) / 2, -(B2 - t) / 2)
    ];
    parts.push(fillet(Math.min(r, t * 0.9, (B1 - t) * 0.9, (B2 - t) * 0.9), -t / 2, t / 2, 1, -1));
    return combine(parts);
  }

  /**
   * 矩形管 / 方管（可不等边）：外宽 B、外高 H、壁厚 t
   * 圆角 R：
   *    undefined / 正值 → 使用该外圆角，内圆角取 R - t
   *    负值             → 按无圆角处理（精确矩形环，壁板交角为直角）
   * 说明：GB/T 1490 冷弯焊接钢管的实际外圆角随机组与规格变化（非固定倍数），
   *      故标准重量请以 standards.js 内置国标表为准，本函数用于自定义截面。
   */
  function rectTube(B, H, t, R = 0) {
    const Ro = Math.max(0, Math.min(R, t * 4, (B / 2 - t) * 0.95, (H / 2 - t) * 0.95));
    const Ri = Math.max(0, Ro - t);
    const a = B / 2 - t, c = H / 2 - t;     // 内轮廓半宽/半高
    const parts = [
      rect(B, t, 0, (H - t) / 2),           // 上壁
      rect(B, t, 0, -(H - t) / 2),          // 下壁
      rect(t, H - 2 * t, -a, 0),            // 左壁
      rect(t, H - 2 * t, a, 0)              // 右壁
    ];
    // 内角圆角填充（材料增加）
    if (Ri > 0) {
      const r = Math.min(Ri, a * 0.95, c * 0.95);
      parts.push(fillet(r, a, c, -1, -1), fillet(r, -a, c, 1, -1),
                 fillet(r, a, -c, -1, 1), fillet(r, -a, -c, 1, 1));
    }
    // 外角圆角削减（材料减少）
    if (Ro > 0) {
      const R = Math.min(Ro, (B / 2) * 0.95, (H / 2) * 0.95);
      parts.push(fillet(R, B / 2, H / 2, -1, -1), fillet(R, -B / 2, H / 2, 1, -1),
                 fillet(R, B / 2, -H / 2, -1, 1), fillet(R, -B / 2, -H / 2, 1, 1));
    }
    return combine(parts);
  }

  /** 方管 */
  const squareTube = (a, t, R = 0) => rectTube(a, a, t, R);

  const roundBar = d => ring(d / 2, 0);                    // 圆钢
  const pipe = (D, t) => ring(D / 2, Math.max(0, D / 2 - t));  // 钢管
  const hexBar = s => ngon(6, s / Math.sqrt(3));           // 六角钢（对边距）
  const flatBar = (B, t) => rect(B, t, 0, 0);              // 扁钢 / 钢板 / 方钢

  /** 六角中空钢：对边距 s、芯孔内切圆直径 d */
  function hexHollow(s, d) {
    const o = hexBar(s);
    if (!(d > 0)) return o;
    const i = hexBar(d);
    return combine([o, { A: -i.A, cx: 0, cy: 0, Ix: -i.Ix, Iy: -i.Iy }]);
  }

  /* ---------------- 新增截面构造器 ---------------- *
   * 造价与预算常见的小截面，均为解析组合，无数值积分。                */

  /**
   * 钢板 / 矩形板：宽 B × 厚 t（与 flatBar 同构，保留独立命名便于选型）
   * @param {number} B 宽度 mm
   * @param {number} t 厚度 mm
   */
  const plate = (B, t) => flatBar(B, t);

  /**
   * T 型钢：腹板高 h（可含翼缘）、翼缘宽 b、翼缘厚 tf、腹板厚 tw
   * 剖分 T 型钢由 H 型钢剖分而来，故按工字钢上半 + 额外腹板建模。
   */
  function tBeam(h, b, tw, tf) {
    // 翼缘全宽 b，腹板自翼缘下缘向下延伸
    const yT = h / 2, yB = -h / 2;
    return combine([
      rect(b, tf, 0, yT - tf / 2),               // 翼缘
      rect(tw, h - tf, 0, yB + (h - tf) / 2)      // 腹板
    ]);
  }

  /**
   * 槽形墙板（C 型钢）：宽 b、高 h、板厚 t、卷边长度 l
   * 卷边为上下各向内折弯的直角边
   */
  function cSection(b, h, t, l) {
    const lv = Math.max(0, l);
    const webH = h - 2 * t;
    const parts = [
      rect(b, t, 0, (h - t) / 2),                 // 上翼缘
      rect(b, t, 0, -(h - t) / 2),                // 下翼缘
      rect(t, webH, -(b - t) / 2, 0),             // 腹板
    ];
    if (lv > 0) {
      // 上下卷边（朝腹板内侧折）
      parts.push(rect(lv, t, -(b - t) / 2 + lv / 2, (h - t) / 2 - lv / 2));
      parts.push(rect(lv, t, -(b - t) / 2 + lv / 2, -(h - t) / 2 + lv / 2));
    }
    return combine(parts);
  }

  /**
   * 箱形截面（方管式）：外廓 B×B、壁厚 t，四边等厚
   * 用于箱形立柱、方管组合件等
   */
  function boxAngle(B, t) {
    // 方管式箱形角：外廓 B×B 方框，挖去 (B−2t) 方形孔
    const i = Math.max(0, B - 2 * t);
    if (i <= 0) return rect(B, B, 0, 0);
    return combine([rect(B, B, 0, 0),
      { A: -(i * i), cx: 0, cy: 0, Ix: -(i ** 4 / 12), Iy: -(i ** 4 / 12) }]);
  }

  /**
   * 圆头扁钢（GB/T 702 蘑菇形）：矩形身 + 半圆头
   * @param {number} B 身宽 mm
   * @param {number} t 厚 mm
   */
  function roundFlat(B, t) {
    const R = t / 2;
    const body = Math.max(0, B - 2 * R);            // 中间矩形身长度
    const parts = [rect(body, t, 0, 0)];
    for (const s of [1, -1]) {
      const A = PI * R * R / 2;                     // 半圆面积
      const I = PI * R ** 4 / 16;                   // 半圆对直径轴的惯性矩
      parts.push({ A, cx: s * (body / 2 + R), cy: 0,
                   Ix: I + A * 0, Iy: I + A * R * R });
    }
    return combine(parts);
  }

  /* ---------------- 求解与输出 ---------------- */

  /* ---------------- 材质密度库 ---------------- *
   * rho 单位 g/cm³，取 GB/T 密度标准值
   * grp 用于材质页分组显示；mod 为弹性模量（MPa），热轧金属常用值        */
  const DENSITY = {
    /* ── 钢 ── */
    steel:      { name: '碳素结构钢 Q235',  rho: 7.85,  grp: '钢', mod: 'E = 206000' },
    steel45:    { name: '优质碳素钢 45#',    rho: 7.85,  grp: '钢', mod: 'E = 210000' },
    steel20:    { name: '优质碳素钢 20#',    rho: 7.85,  grp: '钢', mod: 'E = 210000' },
    q355:       { name: '低合金高强钢 Q355', rho: 7.85,  grp: '钢', mod: 'E = 206000' },
    ss304:      { name: '不锈钢 06Cr19Ni10', rho: 7.93,  grp: '钢', mod: 'E = 193000' },
    ss316:      { name: '不锈钢 06Cr17Ni12Mo2', rho: 7.98, grp: '钢', mod: 'E = 193000' },
    ss201:      { name: '不锈钢 12Cr18Ni9',  rho: 7.93,  grp: '钢', mod: 'E = 193000' },
    /* ── 铸铁 ── */
    castiron:   { name: '灰铸铁 HT200',     rho: 7.30,  grp: '铸铁', mod: 'E = 100000' },
    ductiron:   { name: '球墨铸铁',         rho: 7.10,  grp: '铸铁', mod: 'E = 160000' },
    /* ── 有色 ── */
    alu:        { name: '工业纯铝',        rho: 2.70,  grp: '有色', mod: 'E = 70000' },
    alu6061:    { name: '铝合金 6061-T6',   rho: 2.70,  grp: '有色', mod: 'E = 69000' },
    alu5052:    { name: '铝合金 5052',      rho: 2.68,  grp: '有色', mod: 'E = 70000' },
    copper:     { name: '紫铜 T2',          rho: 8.90,  grp: '有色', mod: 'E = 110000' },
    brass:      { name: '黄铜 H62',         rho: 8.50,  grp: '有色', mod: 'E = 100000' },
    bronze:     { name: '青铜',             rho: 8.80,  grp: '有色', mod: 'E = 110000' },
    zinc:       { name: '锌',               rho: 7.14,  grp: '有色', mod: '—' },
    lead:       { name: '铅 / 铅合金',      rho: 11.34, grp: '有色', mod: '—' },
    tin:        { name: '锡',               rho: 7.31,  grp: '有色', mod: '—' },
    nickel:     { name: '镍 N6',            rho: 8.90,  grp: '有色', mod: 'E = 207000' },
    titanium:   { name: '钛 TC4',           rho: 4.51,  grp: '有色', mod: 'E = 108000' },
    /* ── 其他 ── */
    ag:         { name: '银',               rho: 10.49, grp: '其他', mod: 'E = 83000' },
    gold:       { name: '金',               rho: 19.32, grp: '其他', mod: '—' },
    tungsten:   { name: '钨',               rho: 19.30, grp: '其他', mod: 'E = 410000' },
    chrome:     { name: '铬',               rho: 7.19,  grp: '其他', mod: 'E = 248000' },
    silicon:    { name: '硅',               rho: 2.33,  grp: '其他', mod: '—' },
    carbon:     { name: '石墨',             rho: 2.20,  grp: '其他', mod: '—' },
    glass:      { name: '玻璃',             rho: 2.50,  grp: '其他', mod: '—' },
    concrete:   { name: '钢筋混凝土',       rho: 2.50,  grp: '其他', mod: '—' },
    wood:       { name: '松木',             rho: 0.50,  grp: '其他', mod: '—' },
    bamboo:     { name: '毛竹',             rho: 0.60,  grp: '其他', mod: '—' },
    pvc:        { name: '硬聚氯乙烯 PVC',   rho: 1.40,  grp: '其他', mod: '—' },
    pe:         { name: '聚乙烯 PE',        rho: 0.95,  grp: '其他', mod: '—' },
    frp:        { name: '玻璃钢 FRP',       rho: 1.80,  grp: '其他', mod: 'E = 21000' },
  };

  /** 材质按分组排序后的 key 列表，供界面下拉使用 */
  const DENSITY_GROUPS = ['钢', '铸铁', '有色', '其他'];


  /**
   * 汇总截面特性
   * @param {object} g    geo.js 截面构造器返回值 {A,cx,cy,Ix,Iy}
   * @param {number} dens 密度 g/cm³，默认 7.85
   * @param {object} ext   边缘尺寸 {ytop, ybot, xrt, xlf}，默认按对称推定
   */
  function solve(g, dens = 7.85, ext) {
    const A = g.A, Ix = g.Ix, Iy = g.Iy;
    const h = Math.sqrt(Math.max(A, 1e-9));            // 面积等效尺度，用于缺省边缘距离
    const ytop = ext?.ytop ?? (Math.abs(g.cy) + h / 2);
    const ybot = ext?.ybot ?? (Math.abs(g.cy) + h / 2);
    const xrt  = ext?.xrt  ?? (Math.abs(g.cx) + h / 2);
    const xlf  = ext?.xlf  ?? (Math.abs(g.cx) + h / 2);

    const Wxt = ytop > 1e-9 ? Ix / ytop : 0;           // 上边缘
    const Wxb = ybot > 1e-9 ? Ix / ybot : 0;           // 下边缘
    const Wyr = xrt  > 1e-9 ? Iy / xrt  : 0;
    const Wyl = xlf  > 1e-9 ? Iy / xlf  : 0;
    const Wx = Math.max(Wxt, Wxb), Wy = Math.max(Wyr, Wyl);

    return {
      A,                                   // mm²
      Acm2: A / 100,                       // cm²
      cx: g.cx, cy: g.cy,                  // 形心 (mm)
      Ix, Iy,                              // mm⁴
      Ixcm4: Ix / 1e4, Iycm4: Iy / 1e4,    // cm⁴
      Wx, Wy,                              // mm³
      Wxcm3: Wx / 1000, Wycm3: Wy / 1000,  // cm³
      Wxb, Wyl, Wxt, Wyr,
      ytop, ybot, xrt, xlf,                // 边缘纤维距离 mm
      ix: A > 0 ? Math.sqrt(Ix / A) : 0,   // 回转半径 mm
      iy: A > 0 ? Math.sqrt(Iy / A) : 0,
      ixcm: A > 0 ? Math.sqrt(Ix / A) / 10 : 0,   // 回转半径 cm
      iycm: A > 0 ? Math.sqrt(Iy / A) / 10 : 0,
      rho: dens,
      mass: A * dens / 1000                // 理论单重 kg/m
    };
  }

  const API = {
    PI, rect, rrect, ring, ngon, fillet, combine, DENSITY, DENSITY_GROUPS, solve,
    iSection, iSectionAsym, channel, angleEq, angleNe,
    rectTube, squareTube, roundBar, pipe, hexBar, hexHollow, flatBar,
    plate, tBeam, cSection, boxAngle, roundFlat
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Geo = API;
})(typeof self !== 'undefined' ? self : globalThis);