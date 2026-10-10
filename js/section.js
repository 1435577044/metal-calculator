/* ============================================================
 *  金属算量 · 截面几何（绘图层）
 *  ------------------------------------------------------------
 *  与 geo.js 解析引擎共用同一套尺寸定义，但轮廓顶点独立构造，
 *  保证「所见即所算」：图形采样面积与解析引擎面积一致。
 *
 *  所有轮廓均按逆时针（世界坐标 y 向上）单圈闭合，顶点不重复。
 *  圆角通过在角点链上插入圆弧实现。
 *
 *  世界坐标 mm；输出 SVG path 时 y 取负（SVG 向下为正）。
 * ==========================================================*/
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;

  /* ---------------- 基础工具 ---------------- */

  /** 圆弧采样（角度制） */
  function arc(cx, cy, r, a0, a1) {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 7));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = (a0 + (a1 - a0) * i / n) * RAD;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out;
  }

  /** 去掉连续重复点与首尾重复点（保持闭合环完整） */
  function dedup(pts, eps) {
    eps = eps == null ? 1e-7 : eps;
    const out = [];
    for (const p of pts) {
      if (!isFinite(p[0]) || !isFinite(p[1])) continue;
      const q = out[out.length - 1];
      if (!q || Math.hypot(q[0] - p[0], q[1] - p[1]) > eps) out.push([p[0], p[1]]);
    }
    // 仅当首尾几乎重合时去掉尾点（保留环）
    while (out.length > 3) {
      const a = out[0], b = out[out.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > eps) break;
      out.pop();
    }
    return out;
  }

  /** 角点倒圆：把 prev→corner→next 替换为圆弧 */
  function round(prev, corner, next, r) {
    const v1 = [prev[0] - corner[0], prev[1] - corner[1]];
    const v2 = [next[0] - corner[0], next[1] - corner[1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (!(r > 0) || l1 < 1e-9 || l2 < 1e-9) return [];
    // 切点距角点的距离 = r / tan(半角)，须小于两边长
    const bx = v1[0] / l1 + v2[0] / l2;
    const by = v1[1] / l1 + v2[1] / l2;
    const bn = Math.hypot(bx, by);
    if (bn < 1e-9) return [];
    const cosHalf = Math.min(0.9999, bn / 2);          // = cos(半角)
    const half = Math.acos(cosHalf);                    // 半角
    const tanHalf = Math.tan(half);
    if (!(tanHalf > 1e-6)) return [];
    let tan = r / tanHalf;                              // 切点退让距离
    // 退让不得超过任一相邻边长的 45%，避免圆弧跨过对边
    const maxTan = Math.min(l1, l2) * 0.45;
    if (tan > maxTan) tan = maxTan;
    r = tan * tanHalf;                                  // 反算实际可用半径
    if (!(r > 1e-9)) return [];
    const t = [corner[0] + v1[0] / l1 * tan, corner[1] + v1[1] / l1 * tan];
    const u = [corner[0] + v2[0] / l2 * tan, corner[1] + v2[1] / l2 * tan];
    const dist = r / Math.sin(half);
    const c = [corner[0] + bx / bn * dist, corner[1] + by / bn * dist];
    const a0 = Math.atan2(t[1] - c[1], t[0] - c[0]) / RAD;
    const a1 = Math.atan2(u[1] - c[1], u[0] - c[0]) / RAD;
    let dA = a1 - a0;
    while (dA > 180) dA -= 360;
    while (dA < -180) dA += 360;
    const pts = arc(c[0], c[1], r, a0, a0 + dA);
    if (pts.length) pts[pts.length - 1] = u;           // 末点吸附到精确切点
    return pts;
  }

  /**
   * 由角点链生成闭合轮廓
   * @param {Array}  corners 角点（逆时针）
   * @param {Array}  radii   各角圆角半径，0 为直角
   */
  function fromCorners(corners, radii) {
    const n = corners.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const r = (radii && radii[i]) || 0;
      if (r > 0) {
        out.push(...round(corners[(i - 1 + n) % n], corners[i], corners[(i + 1) % n], r));
      } else {
        out.push(corners[i]);
      }
    }
    return dedup(out);
  }

  /** 点列 → SVG path */
  function toPath(pts) {
    if (!pts || pts.length < 3) return '';
    let d = 'M' + pts[0][0].toFixed(3) + ' ' + (-pts[0][1]).toFixed(3);
    for (let i = 1; i < pts.length; i++) {
      d += 'L' + pts[i][0].toFixed(3) + ' ' + (-pts[i][1]).toFixed(3);
    }
    return d + 'Z';
  }

  /* ---------------- 基本形状 ---------------- */

  const circle = R => arc(0, 0, R, 0, 360);

  function rectPts(B, H) {
    const a = B / 2, c = H / 2;
    return [[-a, -c], [a, -c], [a, c], [-a, c]];
  }

  function hexPts(s, reverse) {
    const R = s / Math.sqrt(3);
    const out = [];
    const order = reverse ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
    for (const i of order) {
      const a = i * 60 * RAD;
      out.push([R * Math.cos(a), R * Math.sin(a)]);
    }
    return out;
  }

  /* ---------------- 各类截面 ---------------- */

  /** 圆管 */
  function pipe(D, t) {
    const R = D / 2, r = Math.max(0, R - t);
    return { outer: circle(R), inner: r > 1e-9 ? circle(r) : null };
  }

  /** 矩形管 / 方管：内外角均倒圆 */
  function tube(B, H, t) {
    const a = B / 2, c = H / 2;
    const ai = a - t, ci = c - t;
    if (!(t > 0) || ai <= 0 || ci <= 0) return { outer: rectPts(B, H), inner: null };
    const Ro = Math.min(1.5 * t, a * 0.45, c * 0.45);
    const Ri = Math.max(0, Ro - t);
    const outer = fromCorners(
      [[-a, -c], [a, -c], [a, c], [-a, c]], [Ro, Ro, Ro, Ro]);
    const inner = Ri > 1e-9
      ? fromCorners([[-ai, -ci], [ai, -ci], [ai, ci], [-ai, ci]], [Ri, Ri, Ri, Ri])
      : rectPts(B - 2 * t, H - 2 * t);
    return { outer, inner };
  }

  /**
   * 等边角钢：外角在原点，两腿分别向 -x（横腿）与 +y（竖腿）
   * 顶点逆时针：左下角 → 右下角 → 横腿端 → 内角 → 竖腿内 → 竖腿端 → 上左
   */
  function angleEq(B, t, r) {
    if (!(B > t) || !(t > 0)) return rectPts(Math.max(B, 1), Math.max(t, 1));
    const ri = Math.max(0, Math.min(r || 0, t * 0.9, (B - t) * 0.9));
    // 轮廓：(-t,0) → (B-t,0) → (B-t,t) → (0,t) → (0,B) → (-t,B) → 闭合
    return fromCorners(
      [[-t, 0], [B - t, 0], [B - t, t], [0, t], [0, B], [-t, B]],
      [0, 0, 0, ri, 0, 0]        // 内角 (0,t) 倒圆
    );
  }

  /** 不等边角钢：横腿长 B1，竖腿高 B2 */
  function angleNe(B1, B2, t, r) {
    if (!(B1 > t) || !(B2 > t) || !(t > 0)) {
      return rectPts(Math.max(B1, 1), Math.max(B2, 1));
    }
    const ri = Math.max(0, Math.min(r || 0, t * 0.9, (B1 - t) * 0.9, (B2 - t) * 0.9));
    return fromCorners(
      [[-t, 0], [B1 - t, 0], [B1 - t, t], [0, t], [0, B2], [-t, B2]],
      [0, 0, 0, ri, 0, 0]
    );
  }

  /**
   * 槽钢：腹板居左（x 从 xw0 到 xw1），翼缘向右伸至腿端 x1
   * 顶点逆时针：左下 → 腿端下 → 腿端上 → 腹板右上 → 腹板左上 → 上翼内 → 腿端上 → 左上
   */
  function channel(h, b, d, t, R, r) {
    if (!(h > 0) || !(d > 0) || !(t > 0) || !(b > d)) {
      return rectPts(Math.max(b, 1), Math.max(h, 1));
    }
    const xw0 = -d / 2, xw1 = d / 2, x1 = b - d / 2;
    const y0 = -h / 2, y1 = h / 2;
    const Ro = Math.max(0, Math.min(R || 0, t * 0.9, (b - d / 2) * 0.9));
    const ri = Math.max(0, Math.min(r || 0, t * 0.9, d * 0.9));
    return fromCorners(
      [
        [xw0, y0],          // 0 左下
        [x1, y0],           // 1 腿端下
        [x1, y0 + t],       // 2 腿端上
        [xw1, y0 + t],      // 3 腹板右下
        [xw1, y1 - t],      // 4 腹板右上
        [x1, y1 - t],       // 5 上翼内
        [x1, y1],           // 6 腿端上
        [xw0, y1]           // 7 左上
      ],
      [0, Ro, ri, ri, ri, ri, Ro, 0]
    );
  }

  /**
   * 工字钢 / H型钢 / 不对称工字钢
   * 上下翼缘各自从腹板两侧对称伸出，b1 为上翼宽、b2 为下翼宽。
   * 顶点逆时针一圈（无多余角点）：
   *   下翼下表面左 → 下翼下表面右 → 腹板右下 → 腹板左上 → 上翼下表面右
   *   → 右上 → 左上 → 上翼下表面左 → 腹板左上 → 腹板左下 → 下翼下表面左
   */
  function iSect(p) {
    const h = Number(p.h), d = Number(p.d);
    const b1 = p.b1 != null ? Number(p.b1) : Number(p.b);
    const b2 = p.b2 != null ? Number(p.b2) : Number(p.b);
    const t1 = p.t1 != null ? Number(p.t1) : Number(p.t);
    const t2 = p.t2 != null ? Number(p.t2) : Number(p.t);
    if (!(h > 0) || !(d > 0) || !(t1 > 0) || !(t2 > 0) || !(b1 > d) || !(b2 > d)) {
      return rectPts(Math.max(b1, b2, 1), Math.max(h, 1));
    }
    const r = Math.max(0, Math.min(p.r || 0, t1 * 0.9, t2 * 0.9, (b1 - d) * 0.45, (b2 - d) * 0.45));
    const hd = d / 2, yT = h / 2, yB = -h / 2;
    return fromCorners(
      [
        [-b2 / 2, yB],          // 0 下翼下表面左
        [b2 / 2, yB],           // 1 下翼下表面右
        [b2 / 2, yB + t2],      // 2 下翼右上
        [hd, yB + t2],          // 3 腹板右下
        [hd, yT - t1],          // 4 腹板左上
        [b1 / 2, yT - t1],      // 5 上翼右下
        [b1 / 2, yT],           // 6 右上
        [-b1 / 2, yT],          // 7 左上
        [-b1 / 2, yT - t1],     // 8 上翼左下
        [-hd, yT - t1],         // 9 腹板左上
        [-hd, yB + t2],         // 10 腹板左下
        [-b2 / 2, yB + t2]      // 11 下翼左上
      ],
      [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0]
    );
  }

  /* ---------------- 新增截面轮廓 ---------------- */

  /** 钢板（与扁钢同形，独立命名） */
  const platePts = (B, t) => rectPts(B, t);

  /** T 型钢：翼缘在上，腹板向下延伸 */
  function tBeamPts(h, b, tw, tf) {
    const hw = tw / 2, yT = h / 2, yB = -h / 2;
    return [[-b / 2, yT], [b / 2, yT], [b / 2, yT - tf], [hw, yT - tf],
            [hw, yB], [-hw, yB], [-hw, yT - tf], [-b / 2, yT - tf]];
  }

  /** 箱形截面：外方框 + 内方孔 */
  function boxPts(B, t) {
    const o = rectPts(B, B);
    const i = Math.max(0, B - 2 * t);
    return { outer: o, inner: i > 0 ? rectPts(i, i) : null };
  }

  /** C 型钢（冷弯卷边）：腹板在左竖立，上下翼缘右伸，端部各折出竖直卷边 l */
  function cPts(b, h, t, l) {
    const lv = Math.max(0, l);
    const xw = -(b - t) / 2, xr = b / 2;       // 腹板左外边 / 翼缘右端
    const yT = h / 2, yB = -h / 2;
    const yiT = yT - t, yiB = yB + t;          // 腹板净上下边
    if (!(lv > 0)) {
      // 无卷边：纯 C 形
      return [[xw, yT], [xr, yT], [xr, yiT], [xw + t, yiT],
              [xw + t, yiB], [xr, yiB], [xr, yB], [xw, yB]];
    }
    // 上翼缘右端向下折卷边，下翼缘右端向上折卷边
    return [
      [xw, yT], [xr, yT], [xr, yiT],
      [xr, yiT - lv], [xr - t, yiT - lv], [xr - t, yiT],
      [xw + t, yiT], [xw + t, yiB],
      [xr - t, yiB], [xr - t, yiB + lv], [xr, yiB + lv], [xr, yiB],
      [xr, yB], [xw, yB]
    ];
  }

  /** 圆头扁钢：矩形身 + 两侧半圆 */
  function roundFlatPts(B, t) {
    const R = t / 2;
    const body = Math.max(0, B - 2 * R);
    const pts = [];
    const N = 20;
    // 右半圆：中心 (body/2, 0)，从 +90° 走到 −90°
    for (let i = 0; i <= N; i++) {
      const a = (90 - 180 * i / N) * RAD;
      pts.push([body / 2 + R * Math.cos(a), R * Math.sin(a)]);
    }
    // 左半圆：中心 (−body/2, 0)，从 −90° 走到 −270°
    for (let i = 0; i <= N; i++) {
      const a = (-90 - 180 * i / N) * RAD;
      pts.push([-body / 2 + R * Math.cos(a), R * Math.sin(a)]);
    }
    return pts;
  }

  /* ---------------- 对外接口 ---------------- */

  /** 返回 {outer, inner} 世界坐标点列 */
  function outline(type, p) {
    const n = k => Number(p[k]) || 0;
    switch (type) {
      case 'round':
        return { outer: circle(n('d') / 2) };
      case 'pipe':
        return pipe(n('D'), n('t'));
      case 'square':
        return { outer: rectPts(n('a'), n('a')) };
      case 'flat':
        return { outer: rectPts(n('B'), n('t')) };
      case 'hex':
        return { outer: hexPts(n('s'), false) };
      case 'hexHollow':
        if (!(n('d') > 0)) return { outer: hexPts(n('s'), false) };
        return { outer: hexPts(n('s'), false), inner: hexPts(n('d'), true) };
      case 'squareTube':
        return tube(n('a'), n('a'), n('t'));
      case 'tube':
        return tube(n('B'), n('H'), n('t'));
      case 'angleEq':
        return { outer: angleEq(n('B'), n('t'), n('r')) };
      case 'angleNe':
        return { outer: angleNe(n('B1'), n('B2'), n('t'), n('r')) };
      case 'channel':
        return { outer: channel(n('h'), n('b'), n('d'), n('t'), n('R'), n('r')) };
      case 'ibeam': case 'hsteel': case 'ibeamAsym':
        return { outer: iSect(p) };
      case 'plate':
        return { outer: platePts(n('B'), n('t')) };
      case 'tbeam':
        return { outer: tBeamPts(n('h'), n('b'), n('tw'), n('tf')) };
      case 'box':
        return boxPts(n('B'), n('t'));
      case 'csteel':
        return { outer: cPts(n('b'), n('h'), n('t'), n('l')) };
      case 'roundFlat':
        return { outer: roundFlatPts(n('B'), n('t')) };
      default:
        return { outer: rectPts(10, 10) };
    }
  }

  /** 生成 path d（孔洞配合 fill-rule="evenodd"） */
  function pathFor(type, p) {
    const { outer, inner } = outline(type, p);
    let d = toPath(outer);
    if (inner && inner.length > 2) d += toPath(inner);
    return d;
  }

  /** 外接尺寸（等比例缩放、尺寸标注定位用） */
  function bounds(type, p) {
    const o = outline(type, p).outer;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of o) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!isFinite(x0)) return { w: 10, h: 10, x0: 0, x1: 10, y0: 0, y1: 10 };
    return { w: x1 - x0, h: y1 - y0, x0, x1, y0, y1 };
  }

  /**
   * 外周长（mm）与内周长（mm）
   * 用于外表面积、内表面积计算（防腐涂装、油漆核算）
   * 周长按轮廓折线 + 圆弧的精确弧长累加
   */
  function perimeters(type, p) {
    const { outer, inner } = outline(type, p);
    return { outer: loopLen(outer), inner: inner ? loopLen(inner) : 0 };
  }

  /** 闭合折线周长（mm） */
  function loopLen(pts) {
    if (!pts || pts.length < 2) return 0;
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      s += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    return s;
  }

  /** 表面积（m²）= 周长(m) × 长度(m) */
  function areas(type, p, lengthM) {
    const L = Number(lengthM) || 0;
    const per = perimeters(type, p);
    return {
      perOuter: per.outer,                    // mm
      perInner: per.inner,                    // mm
      areaOuter: per.outer / 1000 * L,        // m²
      areaInner: per.inner / 1000 * L,        // m²
      areaTotal: (per.outer + per.inner) / 1000 * L
    };
  }

  const API = {
    pathFor, outline, bounds, perimeters, areas,
    arc, toPath, dedup, round, fromCorners
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Section = API;
})(typeof self !== 'undefined' ? self : globalThis);