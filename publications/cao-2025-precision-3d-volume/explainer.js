// Transparent-adhesive volume measurement schematic:
// CSBO: a green-yellow substrate absorbs the violet laser light that passes through the bead ->
// per image row, gradient-checked candidate regions each give a gray-level centroid ->
// DWMF-SS scores the candidates (continuity, intensity, history) and keeps one per row ->
// short jumps are removed, short gaps are filled linearly, calibrated profiles stack into a depth map ->
// datum-plane rectification, segmentation and prism summation give the volume.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Complementary spectral background (CSBO): violet laser light that passes through the clear bead reaches the substrate, where it causes scattering artifacts. A green-yellow substrate, the complementary colour of violet, absorbs it instead.",
        "Each laser image is mean-filtered. In every row, a gradient test finds candidate regions where the gray level rises and then falls by at least K, and a weighted gray-level centroid gives one sub-pixel candidate centre per region.",
        "DWMF-SS scores every candidate in a row from its continuity with neighbouring rows, its intensity and its distance to the point kept in the previous row (weights 0.1, 0.8, 0.1). Weak or wide candidates score zero; the best one is kept.",
        "Secondary screening removes short anomalous jumps, and short gaps are filled by linear interpolation. With the calibration parameters, each centre line becomes a 3D profile, and the profiles are stacked into a depth map.",
        "A datum plane fitted by PCA to the substrate rectifies the depth map, segmentation isolates the bead, and the volume is the sum of one prism per pixel: V = Δx·Δy·Σz.",
      ],
      laser: "violet laser", camera: "camera", spot: "surface spot", falseSpot: "scattering artifacts",
      blue: "blue substrate", gy: "green-yellow substrate", absorbed: "absorbed",
      comp: "green-yellow is the complementary colour of violet (Table 1)",
      profile: "one image row, mean-filtered", gray: "gray level", col: "column",
      centroid: "x", centroidSub: "c", weight: "w(I) = I / (256 − I)",
      rule: "candidate region: rise ≥ K, then fall ≥ K",
      result3: "three candidate centres in this row",
      score: "S = 0.1·S", sCont: "cont", plus1: " + 0.8·S", sInt: "int", plus2: " + 0.1·S", sHist: "hist",
      ia: "I(a) = 200", ib: "I(b) = 150",
      lCont: "continuity", lInt: "intensity", lHist: "history",
      zero: "I < 0.1·I", zeroSub: "max", zeroTail: " or width > 20 px → 0",
      keep: "keep the highest score",
      removed: "removed: short jump", filled: "filled: short gap (linear)",
      calib: "calibration → (x, y, z)", stack: "profiles → depth map",
      roi: "ROI", plane: "PCA datum plane", thr: "depth threshold",
      vol: "V = Δx · Δy · Σ z", res: "green-yellow substrate: 1.62% mean relative error (Table 4)",
    },
    zh: {
      steps: [
        "互补光谱背景优化（CSBO）：穿过透明胶体的紫色激光到达基板后，会产生散射伪影。改用紫色的互补色——黄绿色基板，这部分透射光就被吸收掉了。",
        "每幅激光图像先做均值滤波。在每一行中，梯度检测找出灰度先上升、再下降至少 K 的候选区域，再用加权灰度重心法在每个区域内求出一个亚像素候选中心。",
        "DWMF-SS 对同一行中的每个候选点打分：与相邻行的连续性、灰度强度、与上一行保留点的距离，权重分别为 0.1、0.8、0.1。过暗或过宽的候选点记零分，保留得分最高者。",
        "二次筛选剔除短的异常跳变段，短的断裂处用线性插值补齐。借助标定参数，每条中心线转换为三维轮廓，所有轮廓再拼合成深度图。",
        "以 PCA 在基板区域拟合基准平面，对深度图进行校正；连通域分割提取出胶体；体积即每个像素对应棱柱的体积之和：V = Δx·Δy·Σz。",
      ],
      laser: "紫色激光", camera: "相机", spot: "表面光斑", falseSpot: "散射伪影",
      blue: "蓝色基板", gy: "黄绿色基板", absorbed: "被吸收",
      comp: "黄绿色是紫色的互补色（表 1）",
      profile: "图像中的一行（均值滤波后）", gray: "灰度", col: "列",
      centroid: "x", centroidSub: "c", weight: "w(I) = I / (256 − I)",
      rule: "候选区域：先上升 ≥ K，再下降 ≥ K",
      result3: "该行得到三个候选中心",
      score: "S = 0.1·S", sCont: "cont", plus1: " + 0.8·S", sInt: "int", plus2: " + 0.1·S", sHist: "hist",
      ia: "I(a) = 200", ib: "I(b) = 150",
      lCont: "连续性", lInt: "强度", lHist: "历史位置",
      zero: "I < 0.1·I", zeroSub: "max", zeroTail: " 或宽度 > 20 像素 → 0",
      keep: "保留得分最高的点",
      removed: "剔除：短跳变段", filled: "补齐：短断裂（线性插值）",
      calib: "标定 → (x, y, z)", stack: "轮廓 → 深度图",
      roi: "ROI", plane: "PCA 基准平面", thr: "深度阈值",
      vol: "V = Δx · Δy · Σ z", res: "黄绿色基板：平均相对误差 1.62%（表 4）",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the violet laser, the two substrates, and false / rejected points.
  const VIOLET = "#7c3aed";
  const GREENYELLOW = "#9acd32";
  const BLUE = "#3b6fd6";
  const RED = "#d64545";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { line, arrow } = kit.pen({ stroke: body, head: 9 });
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Text made of parts: plain strings, or { sub: "…" } for a real subscript.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 16;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo ?? true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };

  // Partial polyline: the first fraction f of its length.
  const partial = (pts, f) => {
    if (f <= 0) return [pts[0], pts[0]];
    const lens = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      lens.push(d);
      total += d;
    }
    let left = total * Math.min(1, f);
    const out = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      if (left >= lens[k - 1]) { out.push(pts[k]); left -= lens[k - 1]; continue; }
      const r = left / lens[k - 1];
      out.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * r, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * r]);
      break;
    }
    return out;
  };
  const ray = (g, pts, f, o = {}) => {
    if (f <= 0) return;
    kit.svg("path", {
      d: path(partial(pts, f)), fill: "none", stroke: o.stroke || VIOLET, "stroke-width": o.w || 2.5,
      "stroke-linecap": "round", "stroke-linejoin": "round", ...(o.dash && { "stroke-dasharray": o.dash }),
      ...(o.opacity !== undefined && { opacity: o.opacity }),
    }, g);
  };

  // ---- Step 0 geometry: a bead cross-section in a 320-wide panel ----
  const BX0 = 50, BX1 = 270, SUB_Y = 262;
  const beadH = (x) => (x <= BX0 || x >= BX1 ? 0 : 62 * (1 + Math.cos((Math.PI * (x - 160)) / 110)));
  const beadY = (x) => SUB_Y - beadH(x);
  const beadPts = Array.from({ length: 45 }, (_, k) => { const x = BX0 + (k * (BX1 - BX0)) / 44; return [x, beadY(x)]; });
  const HIT = [135, beadY(135)], FLOOR = [152, SUB_Y], EXIT = [212, beadY(212)], CAM = [262, 52];

  // ---- Step 1: one mean-filtered row profile with three peaks ----
  const rnd = kit.rng(7);
  const PX0 = 60, PX1 = 610, PBASE = 262, PH = 190;
  const peaks = [[0.2, 0.42, 0.035], [0.5, 0.95, 0.022], [0.76, 0.3, 0.028]];
  const NCOL = 140;
  const smooth = Array.from({ length: NCOL }, (_, k) => {
    const u = k / (NCOL - 1);
    return 0.04 + peaks.reduce((s, [c, a, w]) => s + a * Math.exp(-((u - c) ** 2) / (2 * w * w)), 0);
  });
  const raw = smooth.map((v) => v + (rnd() - 0.5) * 0.08);
  const colX = (k) => PX0 + ((PX1 - PX0) * k) / (NCOL - 1);
  const valY = (v) => PBASE - PH * v;

  // ---- Step 2: candidate points per row on a small image grid ----
  const ROWS = 9, GX0 = 30, GX1 = 310, GY0 = 50, RH = 26;
  const trueX = (r) => 150 + 38 * Math.sin(0.55 * r);
  const cand = Array.from({ length: ROWS }, (_, r) => {
    const list = [{ x: trueX(r), win: true }];
    if (r === 4) list.push({ x: trueX(r) + 70, win: false, b: true });
    else if (rnd() < 0.6) list.push({ x: 50 + rnd() * 240, win: false });
    return list.filter((c) => c.win || Math.abs(c.x - trueX(r)) > 22);
  });
  cand[4][0].a = true;

  // ---- Step 3: a centre line with one short jump and one short gap ----
  const NC = 40;
  const clX = (k) => 40 + (k * 250) / (NC - 1);
  const clY = (k) => 250 - 105 * (0.5 * (1 + Math.cos((Math.PI * (k - 19.5)) / 15))) * (Math.abs(k - 19.5) < 15 ? 1 : 0);
  const JUMP = [7, 8, 9], GAP = [25, 26, 27, 28];

  // ---- Step 4: bar columns of one depth-map row ----
  const NB = 30, VX0 = 60, VX1 = 580, VBASE = 270;
  const bw = (VX1 - VX0) / NB;
  const bh = Array.from({ length: NB }, (_, k) => {
    const u = (k + 0.5) / NB;
    const bead = Math.abs(u - 0.5) < 0.27 ? 150 * Math.pow(Math.cos((Math.PI * (u - 0.5)) / 0.54), 0.8) : 0;
    return bead + 4 + rnd() * 5;
  });

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        const fIn = kit.easeOut(seg01(t, 0, 0.35)), fRef = kit.easeOut(seg01(t, 0.3, 0.6)), fOut = kit.easeOut(seg01(t, 0.55, 1));
        [[0, BLUE, L.blue, true], [320, GREENYELLOW, L.gy, false]].forEach(([ox, sub, title, stray]) => {
          const p = kit.svg("g", { transform: `translate(${ox},0)` }, g);
          kit.svg("rect", { x: 20, y: SUB_Y, width: 280, height: 18, fill: sub, "fill-opacity": 0.85, stroke: body, "stroke-width": 1 }, p);
          kit.svg("path", { d: path(beadPts) + "Z", fill: rule, "fill-opacity": 0.35, stroke: body, "stroke-width": 1.6 }, p);
          // laser head and camera
          kit.svg("rect", { x: HIT[0] - 9, y: 30, width: 18, height: 24, rx: 3, fill: bg, stroke: ink, "stroke-width": 1.4 }, p);
          kit.svg("rect", { x: CAM[0] - 16, y: CAM[1] - 14, width: 32, height: 24, rx: 3, fill: bg, stroke: ink, "stroke-width": 1.4 }, p);
          kit.svg("circle", { cx: CAM[0] - 10, cy: CAM[1] + 6, r: 5, fill: bg, stroke: ink, "stroke-width": 1.4 }, p);
          text(p, HIT[0] - 16, 47, L.laser, { size: 15, anchor: "end", fill: VIOLET });
          text(p, CAM[0], 28, L.camera, { size: 15, fill: body });
          // incident ray, surface spot seen by the camera, refracted ray to the substrate
          ray(p, [[HIT[0], 54], HIT], fIn, { w: 3 });
          if (fIn > 0.98) {
            kit.svg("circle", { cx: HIT[0], cy: HIT[1], r: 5, fill: VIOLET }, p);
            ray(p, [HIT, [CAM[0] - 10, CAM[1] + 10]], fRef, { w: 1.6, dash: "5 4" });
            text(p, HIT[0] - 10, HIT[1] - 10, L.spot, { size: 15, anchor: "end", fill: body, opacity: fRef });
          }
          ray(p, [HIT, FLOOR], fRef, { w: 2, opacity: 0.8 });
          if (fRef > 0.98) {
            if (stray) {
              ray(p, [FLOOR, EXIT, [CAM[0] - 10, CAM[1] + 10]], fOut, { stroke: RED, w: 2, dash: "6 4" });
              ray(p, [FLOOR, [116, SUB_Y - 34]], fOut, { stroke: RED, w: 1.5, opacity: 0.6 });
              ray(p, [FLOOR, [184, SUB_Y - 40]], fOut, { stroke: RED, w: 1.5, opacity: 0.6 });
              if (fOut > 0.5) {
                kit.svg("circle", { cx: EXIT[0], cy: EXIT[1], r: 5, fill: RED, opacity: kit.easeOut(seg01(t, 0.75, 1)) }, p);
                text(p, 232, EXIT[1] + 30, L.falseSpot, { size: 15, anchor: "middle", fill: RED, weight: 600, opacity: kit.easeOut(seg01(t, 0.75, 1)) });
              }
            } else {
              kit.svg("rect", { x: FLOOR[0] - 16, y: SUB_Y - 8, width: 32, height: 22, fill: "none", stroke: VIOLET, "stroke-width": 1.4, "stroke-dasharray": "4 3", opacity: fOut }, p);
              text(p, FLOOR[0] + 22, SUB_Y - 14, L.absorbed, { size: 15, anchor: "start", fill: accent, weight: 600, opacity: fOut });
            }
          }
          text(p, 160, 310, title, { size: 17, fill: ink, weight: 600 });
        });
        line(g, [320, 24], [320, 320], { stroke: rule, w: 1.2 });
        text(g, 320, 346, L.comp, { size: 15, fill: body, opacity: fOut });
      }

      if (i === 1) {
        const fReg = kit.easeOut(seg01(t, 0.2, 0.6)), fCen = kit.easeOut(seg01(t, 0.5, 0.9));
        line(g, [PX0, PBASE], [PX1, PBASE], { stroke: body, w: 1.2 });
        line(g, [PX0, PBASE], [PX0, 52], { stroke: body, w: 1.2 });
        text(g, PX0 + 6, 44, L.gray, { size: 15, anchor: "start", fill: body });
        text(g, PX1, PBASE + 22, L.col, { size: 15, anchor: "end", fill: body });
        // candidate regions I, II, III
        ["I", "II", "III"].forEach((lab, r) => {
          const [c, a, w] = peaks[r];
          const x0 = PX0 + (PX1 - PX0) * (c - 2.2 * w), x1 = PX0 + (PX1 - PX0) * (c + 2.2 * w);
          kit.svg("rect", { x: x0, y: valY(a + 0.04) - 4, width: x1 - x0, height: PBASE - valY(a + 0.04) + 4, fill: accent, "fill-opacity": 0.1 * fReg, stroke: accent, "stroke-width": 1, "stroke-dasharray": "4 3", opacity: fReg }, g);
          text(g, (x0 + x1) / 2, valY(a + 0.04) - 12, lab, { size: 16, fill: accent, weight: 700, opacity: fReg });
        });
        kit.svg("path", { d: path(raw.map((v, k) => [colX(k), valY(v)])), fill: "none", stroke: mute, "stroke-width": 1, opacity: 0.7 }, g);
        kit.svg("path", { d: path(partial(smooth.map((v, k) => [colX(k), valY(v)]), kit.easeOut(seg01(t, 0, 0.4)))), fill: "none", stroke: VIOLET, "stroke-width": 2.4 }, g);
        // sub-pixel centroids
        peaks.forEach(([c, a]) => {
          const x = PX0 + (PX1 - PX0) * c;
          line(g, [x, PBASE], [x, valY(a + 0.04)], { stroke: ink, w: 1.4, dash: "3 3", opacity: fCen });
          kit.svg("circle", { cx: x, cy: PBASE, r: 5.5, fill: accent, opacity: fCen }, g);
        });
        const xc = PX0 + (PX1 - PX0) * peaks[1][0];
        text(g, xc + 10, PBASE + 24, [L.centroid, { sub: L.centroidSub }], { size: 16, anchor: "start", fill: ink, opacity: fCen });
        text(g, PX1, 66, L.weight, { size: 16, anchor: "end", fill: ink });
        text(g, PX1, 92, L.profile, { size: 15, anchor: "end", fill: VIOLET });
        text(g, 320, 312, L.rule, { size: 16, fill: body, opacity: fReg });
        text(g, 320, 342, L.result3, { size: 16, fill: accent, weight: 600, opacity: fCen });
      }

      if (i === 2) {
        // left: image rows with candidates, resolved row by row
        kit.svg("rect", { x: GX0, y: GY0 - 14, width: GX1 - GX0, height: ROWS * RH + 4, fill: rule, "fill-opacity": 0.3, stroke: mute, "stroke-width": 1 }, g);
        const done = t * (ROWS + 1);
        let prev = null;
        cand.forEach((list, r) => {
          const y = GY0 + r * RH;
          line(g, [GX0, y + 7], [GX1, y + 7], { stroke: rule, w: 1 });
          const resolved = done > r + 0.5;
          list.forEach((c) => {
            const lose = resolved && !c.win;
            kit.svg("circle", {
              cx: c.x, cy: y, r: 5.5, fill: resolved ? (c.win ? accent : bg) : body,
              stroke: lose ? RED : (resolved ? accent : body), "stroke-width": 1.6, opacity: lose ? 0.7 : 1,
            }, g);
            if (lose) line(g, [c.x - 7, y - 7], [c.x + 7, y + 7], { stroke: RED, w: 1.6 });
            if (c.a) text(g, c.x - 12, y + 5, "a", { size: 15, anchor: "end", fill: ink, weight: 700 });
            if (c.b) text(g, c.x + 12, y + 5, "b", { size: 15, anchor: "start", fill: ink, weight: 700 });
          });
          const w = list.find((c) => c.win);
          if (resolved && prev) line(g, [prev, y - RH], [w.x, y], { stroke: accent, w: 1.8 });
          if (resolved) prev = w.x;
        });
        // right: the score of a and b
        const RX = 345;
        text(g, RX, 52, [L.score, { sub: L.sCont }, L.plus1, { sub: L.sInt }, L.plus2, { sub: L.sHist }], { size: 16, anchor: "start", fill: ink, weight: 600 });
        const fB = kit.easeOut(seg01(t, 0.1, 0.7));
        const parts = { a: [1, 1, 0.95], b: [0.45, 0.75, 0.7] };
        const W = [0.1, 0.8, 0.1], COL = [mute, accent, body], BW = 200;
        [["a", L.ia, 92], ["b", L.ib, 152]].forEach(([k, lab, y]) => {
          text(g, RX, y, k, { size: 16, anchor: "start", fill: ink, weight: 700 });
          let x = RX + 20;
          parts[k].forEach((v, j) => {
            const w = BW * W[j] * v * fB;
            kit.svg("rect", { x, y: y - 14, width: Math.max(0, w), height: 18, fill: COL[j], stroke: bg, "stroke-width": 1 }, g);
            x += w;
          });
          text(g, RX + 20, y + 26, lab, { size: 15, anchor: "start", fill: body });
        });
        // legend
        [[L.lCont, 0], [L.lInt, 1], [L.lHist, 2]].forEach(([lab, j], q) => {
          const lx = RX + q * 92;
          kit.svg("rect", { x: lx, y: 202, width: 12, height: 12, fill: COL[j] }, g);
          text(g, lx + 16, 213, lab, { size: 14, anchor: "start", fill: body });
        });
        text(g, RX, 256, [L.zero, { sub: L.zeroSub }, L.zeroTail], { size: 15, anchor: "start", fill: RED });
        text(g, RX, 290, L.keep, { size: 16, anchor: "start", fill: accent, weight: 600 });
      }

      if (i === 3) {
        const fJ = kit.easeOut(seg01(t, 0.15, 0.5)), fG = kit.easeOut(seg01(t, 0.45, 0.8));
        kit.svg("rect", { x: 25, y: 40, width: 280, height: 236, fill: rule, "fill-opacity": 0.3, stroke: mute, "stroke-width": 1 }, g);
        const pts = [];
        for (let k = 0; k < NC; k++) {
          if (GAP.includes(k)) continue;
          const jump = JUMP.includes(k);
          const y = clY(k) - (jump ? 52 : 0);
          if (!jump) pts.push([clX(k), y]);
          kit.svg("circle", { cx: clX(k), cy: y, r: 3.6, fill: jump ? RED : VIOLET, opacity: jump ? 1 - 0.85 * fJ : 1 }, g);
          if (jump && fJ > 0.4) line(g, [clX(k) - 5, y - 5], [clX(k) + 5, y + 5], { stroke: RED, w: 1.5, opacity: fJ });
        }
        // linear fill across the gap
        const a = [clX(GAP[0] - 1), clY(GAP[0] - 1)], b = [clX(GAP[GAP.length - 1] + 1), clY(GAP[GAP.length - 1] + 1)];
        line(g, a, [a[0] + (b[0] - a[0]) * fG, a[1] + (b[1] - a[1]) * fG], { stroke: accent, w: 1.6, dash: "4 3" });
        GAP.forEach((k, q) => {
          const r = (q + 1) / (GAP.length + 1);
          if (fG >= r) kit.svg("circle", { cx: a[0] + (b[0] - a[0]) * r, cy: a[1] + (b[1] - a[1]) * r, r: 3.6, fill: bg, stroke: accent, "stroke-width": 1.6 }, g);
        });
        kit.svg("circle", { cx: 40, cy: 302, r: 5, fill: RED }, g);
        text(g, 52, 307, L.removed, { size: 15, anchor: "start", fill: body });
        kit.svg("circle", { cx: 40, cy: 332, r: 5, fill: bg, stroke: accent, "stroke-width": 1.6 }, g);
        text(g, 52, 337, L.filled, { size: 15, anchor: "start", fill: body });

        arrow(g, [318, 158], [356, 158], { stroke: body, w: 2 });
        // right: profiles stacked into a depth map (oblique view)
        const fS = seg01(t, 0.55, 1);
        const NP = 12;
        text(g, 495, 40, L.calib, { size: 15, fill: body });
        for (let k = NP - 1; k >= 0; k--) {
          if (fS * NP < k + 0.2) continue;
          const ox = 368 + k * 9, oy = 250 - k * 11;
          const amp = 70 * Math.sin((Math.PI * (k + 0.5)) / NP) ** 0.5;
          const prof = Array.from({ length: 30 }, (_, j) => {
            const u = j / 29;
            const h = Math.abs(u - 0.5) < 0.35 ? amp * 0.5 * (1 + Math.cos((Math.PI * (u - 0.5)) / 0.35)) : 0;
            return [ox + u * 150, oy - h];
          });
          kit.svg("path", { d: path([[prof[0][0], oy + 4], ...prof, [prof[prof.length - 1][0], oy + 4]]) + "Z", fill: bg, stroke: "none" }, g);
          kit.svg("path", { d: path(prof), fill: "none", stroke: k === NP - 1 ? accent : VIOLET, "stroke-width": 1.8, opacity: 0.55 + 0.45 * (k / NP) }, g);
        }
        text(g, 495, 300, L.stack, { size: 16, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.8, 1)) });
      }

      if (i === 4) {
        const fR = kit.easeOut(seg01(t, 0.15, 0.45)), fS = kit.easeOut(seg01(t, 0.45, 0.75)), fV = kit.easeOut(seg01(t, 0.7, 1));
        const tilt = 0.12 * (1 - fR);
        const base = (x) => VBASE + tilt * (x - 320);
        // ROI patches on the substrate for the PCA plane fit
        [[VX0, VX0 + 4 * bw], [VX1 - 4 * bw, VX1]].forEach(([x0, x1]) => {
          kit.svg("rect", { x: x0, y: Math.min(base(x0), base(x1)) - 26, width: x1 - x0, height: Math.abs(base(x1) - base(x0)) + 32, fill: "none", stroke: GREENYELLOW, "stroke-width": 2, "stroke-dasharray": "5 3", opacity: 1 - fS * 0.15 }, g);
          text(g, (x0 + x1) / 2, Math.max(base(x0), base(x1)) + 26, L.roi, { size: 15, fill: body, opacity: 1 - fS * 0.15 });
        });
        for (let k = 0; k < NB; k++) {
          const x = VX0 + k * bw;
          const xm = x + bw / 2;
          const inBead = bh[k] > 20;
          const fill = fS > 0.05 ? (inBead ? accent : mute) : body;
          kit.svg("rect", { x: x + 1, y: base(xm) - bh[k], width: bw - 2, height: bh[k], fill, "fill-opacity": inBead ? 0.25 + 0.5 * fS : 0.35, stroke: fS > 0.05 && inBead ? accent : body, "stroke-width": 1 }, g);
        }
        line(g, [VX0 - 10, base(VX0 - 10)], [VX1 + 10, base(VX1 + 10)], { stroke: ink, w: 1.6, dash: "7 4" });
        text(g, 170, base(170) + 26, L.plane, { size: 15, anchor: "start", fill: ink });
        // depth threshold for segmentation
        line(g, [VX0, VBASE - 20], [VX1, VBASE - 20], { stroke: RED, w: 1.2, dash: "3 4", opacity: fS });
        text(g, VX0 + 4, VBASE - 28, L.thr, { size: 14, anchor: "start", fill: RED, opacity: fS });
        // Δx under one bead column
        const kx = 15, x0 = VX0 + kx * bw;
        line(g, [x0 + 1, VBASE + 10], [x0 + bw - 1, VBASE + 10], { stroke: accent, w: 1.6, opacity: fV });
        text(g, x0 + bw / 2, VBASE + 30, "Δx", { size: 15, fill: accent, opacity: fV });
        text(g, x0 + bw / 2, VBASE - bh[kx] - 10, "z", { size: 16, anchor: "middle", fill: ink, weight: 700, opacity: fV });
        text(g, 320, 46, L.vol, { size: 20, fill: accent, weight: 700, opacity: fV });
        text(g, 320, 348, L.res, { size: 16, fill: ink, weight: 600, opacity: fV });
      }
    },
  });
}
