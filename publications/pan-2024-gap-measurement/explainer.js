// Relay gap measurement schematic:
// backlit projection image of the gap -> edge points on search lines, burr removal, fitted lines l0/l1 ->
// line-laser point cloud of the underside, outlier removal and segmentation ->
// convex hull + density-weighted centroid projected along gravity gives the support surface ->
// 2D model screens first, 3D model checks the relays that pass (Table 2).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The relay stands on its base. A highly directional backlight shines through the gap beneath it, so the camera sees the gap as a bright band between two straight edges: the relay's lower edge l₀ and the base edge l₁.",
        "After guided filtering, vertical search lines cross the gap. On each, the two largest Sobel gradients mark the edges. Points that jump away from both neighbours (burrs) are discarded, least-squares lines are fitted, and the pixel distance d becomes millimetres through D = k·d.",
        "A line-laser profiler captures the relay's lower surface as a 3D point cloud. Points with too many distant neighbours are removed as outliers, and connected-component segmentation splits the surface into separate regions.",
        "A convex hull is built around the surface points, and the density-weighted centroid is projected along gravity. The hull face it meets gives the support surface, and the gap is the vertical distance from the lower surface to that plane.",
        "In the inspection line, the fast 2D projection-line model screens every relay first, and the relays that pass are checked again by the 3D point-cloud model. Table 2 compares the setups on 11,931 relays.",
      ],
      light: "backlight", relay: "relay", base: "base", camera: "camera", image: "camera image",
      search: "search lines", grad: "max. Sobel gradient", burr: "burr point removed",
      fit: "least-squares lines", scale: "D = k · d",
      scan: "line-laser scan of the lower surface", outlier: "outliers removed", seg: "segmented regions",
      hull: "convex hull", centroid: "centroid G", support: "support surface", gap: "gap",
      tab: "Table 2: false-drop rate · avg. time",
      coarse: ["2D projection", "lines (coarse)"], fine: ["3D point cloud", "(fine)"], pass: "qualified",
      reject: "fail → reject", rows: [["Projection line", "5%", "19.8 ms"], ["Point cloud", "2%", "236.8 ms"], ["2D + 3D", "0.05%", "182.4 ms"]],
    },
    zh: {
      steps: [
        "继电器立于底座上。高指向性背光源从其下方的间隙中透过，相机看到的间隙是一条亮带，夹在两条直边之间：继电器下边缘 l₀ 与底座边缘 l₁。",
        "图像经引导滤波后，用竖直搜索线穿过间隙，每条线上 Sobel 梯度最大的两点即为边缘点。与左右相邻点都偏离过大的点（毛刺）被剔除，再用最小二乘拟合直线，像素距离 d 通过 D = k·d 换算为毫米。",
        "线激光轮廓仪把继电器下表面采集为三维点云。远距邻点过多的点作为离群点被剔除，再由连通域分割把表面分成若干独立区域。",
        "对表面点构建凸包，并将按材料密度加权的质心沿重力方向投影。投影线与凸包相交的面给出支撑面，间隙即下表面到该平面的竖直距离。",
        "在检测线上，速度快的二维投影线模型先对每个继电器进行初筛，通过的继电器再由三维点云模型复检。表 2 在 11,931 个继电器上对比了各方案。",
      ],
      light: "背光源", relay: "继电器", base: "底座", camera: "相机", image: "相机图像",
      search: "搜索线", grad: "Sobel 梯度最大点", burr: "剔除毛刺点",
      fit: "最小二乘直线", scale: "D = k · d",
      scan: "线激光扫描下表面", outlier: "剔除离群点", seg: "分割出的区域",
      hull: "凸包", centroid: "质心 G", support: "支撑面", gap: "间隙",
      tab: "表 2：误判率 · 平均耗时",
      coarse: ["二维投影线", "（粗检）"], fine: ["三维点云", "（精检）"], pass: "合格",
      reject: "不合格 → 剔除", rows: [["投影线", "5%", "19.8 ms"], ["点云", "2%", "236.8 ms"], ["二维 + 三维", "0.05%", "182.4 ms"]],
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal semantic colours: backlight, the dark silhouette in the camera image, removed points.
  const LIGHT = "#f2c94c";
  const DARK = "#2e2e2e";
  const OUT = "#d64545";

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });
  // Label with a real subscript tspan (≥ 14 units).
  const subText = (g, x, y, base, sub, o = {}) => {
    const n = text(g, x, y, base, o);
    const size = o.size ?? 18;
    const s = kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
    s.textContent = sub;
    return n;
  };
  const rect = (g, x, y, w, h, a) => kit.svg("rect", { x, y, width: w, height: h, ...a }, g);

  // ---- Step 2 data: edge points on search lines (zoomed ROI) -----------------------------------------
  const rnd = kit.rng(24);
  const TOP = 150, BOT = 232;
  const BURR = new Set([4, 9]);
  const lines2 = [];
  for (let k = 0; k < 13; k++) {
    const x = 92 + k * 38;
    const yt = BURR.has(k) ? TOP + 24 + rnd() * 6 : TOP + (rnd() - 0.5) * 3;
    const yb = BOT + (rnd() - 0.5) * 3;
    lines2.push({ x, yt, yb, burr: BURR.has(k) });
  }

  // ---- Steps 3–4 data: lower-surface profile (side view) ---------------------------------------------
  const REG = [
    { x0: 158, x1: 204, y: 240 },
    { x0: 224, x1: 264, y: 226 },
    { x0: 284, x1: 384, y: 220 },
    { x0: 404, x1: 440, y: 229 },
    { x0: 460, x1: 486, y: 236 },
  ];
  const BODY = { x: 146, y: 64, w: 352, h: 136 };
  const pts = [];
  REG.forEach((r, ri) => {
    for (let x = r.x0; x <= r.x1 + 0.1; x += 6) pts.push({ x, y: r.y + (rnd() - 0.5) * 2, r: ri });
  });
  const outliers = [[190, 290], [252, 276], [318, 296], [336, 176], [420, 286], [540, 256]].map(([x, y]) => ({ x, y }));
  // Convex hull (monotone chain) of the cleaned points.
  const hull = (() => {
    const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lo = [], up = [];
    for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  })();
  const G = { x: 322, y: 128 };
  // Hull edge on the lower side crossed by the vertical through G.
  let sup = null;
  for (let k = 0; k < hull.length; k++) {
    const a = hull[k], b = hull[(k + 1) % hull.length];
    if ((a.x - G.x) * (b.x - G.x) <= 0 && a.x !== b.x) {
      const yy = a.y + ((G.x - a.x) / (b.x - a.x)) * (b.y - a.y);
      if (!sup || yy > sup.yy) sup = { a, b, yy };
    }
  }
  const supY = (x) => sup.a.y + ((x - sup.a.x) / (sup.b.x - sup.a.x)) * (sup.b.y - sup.a.y);

  const drawBody = (g, o = 1) => {
    rect(g, BODY.x, BODY.y, BODY.w, BODY.h, { fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "5 4", opacity: o });
    REG.forEach((r) => rect(g, r.x0 - 3, BODY.y + BODY.h, r.x1 - r.x0 + 6, r.y - BODY.y - BODY.h, { fill: mute, opacity: 0.25 * o }));
    text(g, BODY.x + 14, BODY.y + 28, L.relay, { anchor: "start", fill: body, opacity: o });
  };
  const drawPts = (g, colour, o = 1) => {
    for (const p of pts) kit.svg("circle", { cx: p.x, cy: p.y, r: 3, fill: colour(p), opacity: o }, g);
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // Side scene: backlight -> relay over the base -> camera.
        rect(g, 30, 110, 16, 140, { fill: LIGHT });
        text(g, 38, 278, L.light, { size: 17 });
        rect(g, 100, 120, 110, 90, { fill: "none", stroke: ink, "stroke-width": 1.8 });
        [[104, 120], [140, 172], [182, 206]].forEach(([x0, x1]) => rect(g, x0, 210, x1 - x0, 10, { fill: ink }));
        rect(g, 86, 228, 140, 22, { fill: mute, opacity: 0.6 });
        text(g, 155, 172, L.relay, { size: 17 });
        text(g, 155, 274, L.base, { size: 17 });
        rect(g, 262, 208, 28, 28, { fill: "none", stroke: ink, "stroke-width": 1.8, rx: 3 });
        kit.svg("path", { d: "M262 214 L250 210 L250 234 L262 230 Z", fill: ink }, g);
        text(g, 276, 264, L.camera, { size: 17 });
        // Rays: blocked by the relay, passing through the gap.
        for (const y of [140, 175]) arrow(g, [50, y], [50 + (96 - 50) * e, y], { stroke: LIGHT, w: 2.2, head: 8 });
        arrow(g, [50, 224], [50 + (246 - 50) * e, 224], { stroke: LIGHT, w: 2.6, head: 9 });
        // Camera image of the gap.
        const o = kit.easeOut(seg01(t, 0.35, 1));
        const fx = 340, fy = 70, fw = 270, fh = 210;
        text(g, fx + fw / 2, 56, L.image, { weight: 600, opacity: o });
        rect(g, fx, fy, fw, fh, { fill: LIGHT, opacity: o });
        // Relay silhouette with its three feet, as one shape (no seams).
        const yb = fy + 112, yf = fy + 138;
        kit.svg("path", { d: `M${fx + 30} ${fy} H${fx + 240} V${yf} H${fx + 196} V${yb} H${fx + 160} V${yf} H${fx + 110} V${yb} H${fx + 74} V${yf} H${fx + 30} Z`, fill: DARK, opacity: o }, g);
        rect(g, fx, fy + 166, fw, fh - 166, { fill: DARK, opacity: o });
        rect(g, fx, fy, fw, fh, { fill: "none", stroke: body, "stroke-width": 1.2, opacity: o });
        line(g, [fx - 6, fy + 138], [fx + fw + 6, fy + 138], { stroke: accent, w: 2, dash: "6 4", opacity: o });
        line(g, [fx - 6, fy + 166], [fx + fw + 6, fy + 166], { stroke: accent, w: 2, dash: "6 4", opacity: o });
        subText(g, fx + fw + 12, fy + 144, "l", "0", { anchor: "start", fill: accent, weight: 600, opacity: o });
        subText(g, fx + fw + 12, fy + 178, "l", "1", { anchor: "start", fill: accent, weight: 600, opacity: o });
        text(g, fx + fw / 2, fy + fh + 30, L.gap, { size: 17, opacity: o });
        line(g, [fx + fw / 2, fy + fh + 14], [fx + fw / 2, fy + 158], { stroke: body, w: 1.2, opacity: o });
      }

      if (i === 1) {
        // Zoomed ROI: relay lower edge (top), bright gap, base (bottom).
        const x0 = 60, x1 = 580;
        rect(g, x0, 70, x1 - x0, TOP - 70, { fill: DARK });
        for (const l of lines2.filter((l) => l.burr)) {
          kit.svg("path", { d: `M${l.x - 12} ${TOP} L${l.x} ${l.yt + 2} L${l.x + 12} ${TOP} Z`, fill: DARK }, g);
        }
        rect(g, x0, TOP, x1 - x0, BOT - TOP, { fill: LIGHT });
        for (const l of lines2.filter((l) => l.burr)) {
          kit.svg("path", { d: `M${l.x - 12} ${TOP - 0.5} L${l.x} ${l.yt + 2} L${l.x + 12} ${TOP - 0.5} Z`, fill: DARK }, g);
        }
        rect(g, x0, BOT, x1 - x0, 292 - BOT, { fill: DARK });
        const a = kit.easeOut(seg01(t, 0, 0.35));
        const b = kit.easeOut(seg01(t, 0.3, 0.6));
        const c = kit.easeOut(seg01(t, 0.55, 0.85));
        const d = kit.easeOut(seg01(t, 0.75, 1));
        for (const l of lines2) {
          line(g, [l.x, 100], [l.x, 100 + (270 - 100) * a], { stroke: "#ffffff", w: 1.2, dash: "4 4", opacity: 0.85 });
        }
        for (const l of lines2) {
          const top = l.burr ? OUT : accent;
          kit.svg("circle", { cx: l.x, cy: l.yt, r: 4.5, fill: l.burr ? (c > 0 ? OUT : accent) : top, stroke: "#ffffff", "stroke-width": 1.2, opacity: b * (l.burr ? 1 - 0.55 * d : 1) }, g);
          kit.svg("circle", { cx: l.x, cy: l.yb, r: 4.5, fill: accent, stroke: "#ffffff", "stroke-width": 1.2, opacity: b }, g);
          if (l.burr && c > 0.05) {
            const k = 8 * c;
            kit.svg("path", { d: `M${l.x - k} ${l.yt - k} L${l.x + k} ${l.yt + k} M${l.x + k} ${l.yt - k} L${l.x - k} ${l.yt + k}`, stroke: OUT, "stroke-width": 2.6, "stroke-linecap": "round" }, g);
          }
        }
        line(g, [x0, TOP], [x0 + (x1 - x0) * d, TOP], { stroke: accent, w: 2.6 });
        line(g, [x0, BOT], [x0 + (x1 - x0) * d, BOT], { stroke: accent, w: 2.6 });
        text(g, x0, 54, L.search, { anchor: "start", fill: body, opacity: a });
        text(g, 320, 54, L.grad, { fill: accent, opacity: b });
        text(g, x1, 54, L.fit, { anchor: "end", fill: accent, weight: 600, opacity: d });
        text(g, lines2[9].x, 322, L.burr, { fill: OUT, weight: 600, opacity: c });
        line(g, [lines2[9].x, 304], [lines2[9].x, 294], { stroke: OUT, w: 1.4, opacity: c });
        // Dimension d and the scale conversion.
        arrow(g, [606, (TOP + BOT) / 2], [606, TOP + 2], { head: 7, opacity: d });
        arrow(g, [606, (TOP + BOT) / 2], [606, BOT - 2], { head: 7, opacity: d });
        text(g, 618, (TOP + BOT) / 2 + 6, "d", { anchor: "start", italic: true, size: 20, opacity: d });
        text(g, x0, 322, L.scale, { anchor: "start", weight: 600, fill: ink, opacity: d });
      }

      if (i === 2) {
        drawBody(g);
        text(g, 320, 40, L.scan, { weight: 600 });
        const c = kit.easeOut(seg01(t, 0, 0.5));
        const sgm = kit.easeOut(seg01(t, 0.5, 1));
        drawPts(g, (p) => (p.r % 2 ? body : accent));
        for (const q of outliers) {
          kit.svg("circle", { cx: q.x, cy: q.y, r: 3.4, fill: OUT, opacity: 1 - 0.85 * c }, g);
          if (c > 0.05) {
            const k = 6 * c;
            kit.svg("path", { d: `M${q.x - k} ${q.y - k} L${q.x + k} ${q.y + k} M${q.x + k} ${q.y - k} L${q.x - k} ${q.y + k}`, stroke: OUT, "stroke-width": 2, "stroke-linecap": "round", opacity: 1 - 0.4 * c }, g);
          }
        }
        text(g, 630, 308, L.outlier, { fill: OUT, weight: 600, opacity: c, anchor: "end" });
        REG.forEach((r, k) => {
          kit.svg("path", { d: `M${r.x0 - 4} ${r.y + 10} L${r.x0 - 4} ${r.y + 16} L${r.x1 + 4} ${r.y + 16} L${r.x1 + 4} ${r.y + 10}`, fill: "none", stroke: k % 2 ? body : accent, "stroke-width": 1.4, opacity: sgm }, g);
          text(g, (r.x0 + r.x1) / 2, r.y + 36, String(k + 1), { weight: 700, fill: k % 2 ? body : accent, opacity: sgm });
        });
        text(g, 320, 340, L.seg, { opacity: sgm });
      }

      if (i === 3) {
        drawBody(g, 0.7);
        const h = kit.easeOut(seg01(t, 0, 0.4));
        const gv = kit.easeOut(seg01(t, 0.3, 0.65));
        const sp = kit.easeOut(seg01(t, 0.6, 1));
        kit.svg("polygon", { points: hull.map((p) => `${p.x},${p.y}`).join(" "), fill: accent, "fill-opacity": 0.12 * h, stroke: accent, "stroke-width": 1.6, opacity: h }, g);
        drawPts(g, (p) => (p.r % 2 ? body : accent));
        text(g, 560, 196, L.hull, { fill: accent, weight: 600, opacity: h });
        line(g, [528, 202], [490, 230], { stroke: accent, w: 1.2, opacity: h });
        // Centroid and gravity projection.
        kit.svg("circle", { cx: G.x, cy: G.y, r: 6, fill: ink }, g);
        text(g, G.x + 14, G.y + 6, L.centroid, { anchor: "start", weight: 600 });
        arrow(g, [G.x, G.y + 8], [G.x, G.y + 8 + (sup.yy - G.y - 10) * gv], { stroke: ink, w: 2, head: 9, opacity: gv > 0.02 ? 1 : 0 });
        // Support surface: the hull face below G, extended.
        const xa = 120, xb = 520;
        line(g, [xa, supY(xa)], [xa + (xb - xa) * sp, supY(xa + (xb - xa) * sp)], { stroke: accent, w: 2.4, dash: "8 5" });
        text(g, 110, supY(110) + 40, L.support, { anchor: "start", fill: accent, weight: 600, opacity: sp });
        // Gap arrows from the lower surface down to the support plane.
        for (const k of [1, 2, 3]) {
          const r = REG[k];
          const x = (r.x0 + r.x1) / 2 + (k === 2 ? 34 : 0);
          const yp = supY(x);
          if (yp - r.y > 6) {
            arrow(g, [x, r.y + 2], [x, yp - 1], { stroke: ink, w: 1.6, head: 6, opacity: sp });
          }
        }
        text(g, 418, 300, L.gap, { fill: ink, weight: 600, opacity: sp });
        line(g, [418, 284], [REG[3].x0 + 18, supY(REG[3].x0 + 18) + 4], { stroke: body, w: 1.2, opacity: sp });
      }

      if (i === 4) {
        const box = (x, y, w, lines, o, strong) => {
          rect(g, x, y, w, 62, { rx: 6, fill: strong ? accent : bg, "fill-opacity": strong ? 0.12 : 1, stroke: strong ? accent : body, "stroke-width": 1.6, opacity: o });
          lines.forEach((s2, k) => text(g, x + w / 2, y + 26 + k * 22, s2, { size: 17, fill: ink, weight: k === 0 ? 600 : 400, opacity: o }));
        };
        const a = kit.easeOut(seg01(t, 0, 0.35));
        const b = kit.easeOut(seg01(t, 0.25, 0.6));
        const c = kit.easeOut(seg01(t, 0.5, 0.85));
        box(24, 76, 170, L.coarse, a, false);
        box(244, 76, 170, L.fine, b, true);
        rect(g, 466, 76, 150, 62, { rx: 31, fill: "none", stroke: accent, "stroke-width": 1.8, opacity: c });
        text(g, 541, 114, L.pass, { size: 18, weight: 600, fill: accent, opacity: c });
        arrow(g, [196, 107], [242, 107], { head: 8, opacity: b });
        arrow(g, [416, 107], [464, 107], { head: 8, opacity: c });
        for (const [x, o] of [[109, b], [329, c]]) {
          arrow(g, [x, 140], [x, 168], { stroke: OUT, head: 7, opacity: o });
          text(g, x, 190, L.reject, { size: 16, fill: OUT, opacity: o });
        }
        // Table 2 strip.
        const v = kit.easeOut(seg01(t, 0.6, 1));
        line(g, [60, 218], [580, 218], { stroke: mute, w: 1, opacity: v });
        text(g, 320, 242, L.tab, { size: 17, fill: body, opacity: v });
        L.rows.forEach(([n, r, ms], k) => {
          const y = 276 + k * 30;
          const last = k === 2;
          const f = last ? accent : body;
          text(g, 230, y, n, { anchor: "end", size: 18, fill: last ? accent : ink, weight: last ? 700 : 400, opacity: v });
          text(g, 330, y, r, { size: 18, fill: f, weight: last ? 700 : 400, opacity: v });
          text(g, 460, y, ms, { size: 18, fill: f, weight: last ? 700 : 400, opacity: v });
        });
      }
    },
  });
}
