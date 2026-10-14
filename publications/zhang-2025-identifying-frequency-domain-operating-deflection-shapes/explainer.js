// Geometric-vision ODS sensing schematic:
// RANSAC calibration rejects imprecise checkerboard corners ->
// spatial DIC on the rectified reference pair + temporal DIC tracking (only POI coordinates are rectified) ->
// depth parameterization: one disparity per point, state vector xi(t) = x1(t) / delta(t) ->
// Fourier transform of xi(t): U(omega) = B f . delta-xi(omega), one full-field ODS map per frequency ->
// Haar wavelet on the ODS field: the coefficient peaks where a step marks the internal damage.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Calibration: Zhang's method runs inside a RANSAC loop. Random subsets of checkerboard corners are tried until the re-projection error meets a threshold, so a few imprecise corners no longer distort the camera parameters.",
        "Matching: the reference stereo pair is rectified, so each point of interest is found in the right image by a 1D search along the epipolar line. Temporal DIC then tracks both points through the original image sequences; only the point coordinates are rectified.",
        "Depth parameterization: in the rectified geometry a point's 3D position depends on a single unknown, its disparity δ. The image motion of each point is packed into a state vector ξ(t) = x₁(t) / δ(t).",
        "Fourier transform: the ODS is a linear function of the state-vector change, U(ω) = B f · Δξ(ω), with no triangulation per frame. Every frequency gives a full-field ODS map.",
        "Damage identification: the ODS field is treated as an image, and a Haar wavelet slides over it. Internal damage leaves a step in the ODS; the normalized wavelet coefficient peaks there, and the peak gives the damage degree.",
      ],
      target: "calibration target", inlier: "corner kept", outlier: "corner rejected",
      loop: ["random corner subset", "Zhang's calibration", "error < threshold?"], no: "no", yes: "yes: keep",
      reproj: "re-projection error 0.088 → 0.039",
      left: "left image", right: "right image", epi: "epipolar line after rectification",
      spatial: "spatial DIC (1D search)", temporal: "temporal DIC tracking", rect: "only POI coordinates are rectified",
      track: "u(t)",
      planeL: "image plane", depth: "d", base: "B", focal: "f", obj: "X",
      eqD: "d = B f / δ", eqX: ["X(δ) = B f · x", { sub: "1" }, " / δ"], eqXi: ["ξ(t) = x", { sub: "1" }, "(t) / δ(t)"], trace: "ξ(t) of one point", one: "one unknown per point",
      time: "ξ(t)", dft: "DFT", spec: "ODS spectrum", hz: "Hz", eqU: "U(ω) = B f · Δξ(ω)", noTri: "no per-frame triangulation",
      map: "ODS field at 17.0 Hz", amp: "17 Hz: 1.84 mm vs transducer 1.86 mm",
      ods: "ODS along the specimen", step: "damage step", haar: "Haar ψ", coef: "wavelet coefficient",
      peak: "peak", deg: "plate: degree 20.8% (theory 18.9%)",
    },
    zh: {
      steps: [
        "标定：把张正友标定法嵌入 RANSAC 循环，随机抽取棋盘格角点子集反复标定，直到重投影误差满足阈值。少数定位不准的角点因此不再干扰相机参数。",
        "匹配：先对参考状态的立体图像对做极线校正，使右图中的对应点只需沿极线做一维搜索；随后在原始图像序列中用时序 DIC 分别跟踪左右两点，只对点坐标做校正。",
        "深度参数化：在校正后的几何中，一个点的三维位置只取决于一个未知量——视差 δ。每个点的图像运动被打包为状态向量 ξ(t) = x₁(t) / δ(t)。",
        "傅里叶变换：ODS 是状态向量变化量的线性函数 U(ω) = B f · Δξ(ω)，无需逐帧三角化。每个频率对应一幅全场 ODS 图。",
        "损伤识别：把 ODS 场当作图像，用 Haar 小波在其上滑动。内部损伤会在 ODS 中留下阶跃，归一化小波系数在该处出现峰值，峰值大小给出损伤程度。",
      ],
      target: "标定板", inlier: "保留的角点", outlier: "剔除的角点",
      loop: ["随机抽取角点子集", "张正友标定", "误差 < 阈值？"], no: "否", yes: "是：保留",
      reproj: "重投影误差 0.088 → 0.039",
      left: "左图像", right: "右图像", epi: "校正后的极线",
      spatial: "空间 DIC（一维搜索）", temporal: "时序 DIC 跟踪", rect: "只校正兴趣点坐标",
      track: "u(t)",
      planeL: "像平面", depth: "d", base: "B", focal: "f", obj: "X",
      eqD: "d = B f / δ", eqX: ["X(δ) = B f · x", { sub: "1" }, " / δ"], eqXi: ["ξ(t) = x", { sub: "1" }, "(t) / δ(t)"], trace: "单点的 ξ(t)", one: "每个点只有一个未知量",
      time: "ξ(t)", dft: "DFT", spec: "ODS 频谱", hz: "Hz", eqU: "U(ω) = B f · Δξ(ω)", noTri: "无需逐帧三角化",
      map: "17.0 Hz 处的 ODS 场", amp: "17 Hz：1.84 mm，位移传感器 1.86 mm",
      ods: "沿试件的 ODS", step: "损伤阶跃", haar: "Haar ψ", coef: "小波系数",
      peak: "峰值", deg: "平板：损伤程度 20.8%（理论 18.9%）",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: rejected corners / damage, and the two ends of the paper's ODS colour map.
  const RED = "#d64545";
  const CYAN = "#22d3ee";
  const MAGENTA = "#d946ef";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const P = kit.pen({ textSize: 17, stroke: body, head: 9 });
  const { line, arrow } = P;
  // Text from parts: plain strings, or { sub: "…" } for a subscript (kept at >= 14 viewBox units).
  const text = (parent, x, y, parts, o = {}) => {
    if (!Array.isArray(parts)) return P.text(parent, x, y, parts, o);
    const size = o.size ?? 17;
    const n = P.text(parent, x, y, "", o);
    for (const p of parts) {
      const sp = typeof p === "string"
        ? kit.svg("tspan", {}, n)
        : kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      sp.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");
  const dim = (g, a, b, o = {}) => { arrow(g, a, b, o); arrow(g, b, a, o); };
  const dot = (g, x, y, r, fill, o = {}) => kit.svg("circle", { cx: x, cy: y, r, fill, ...o }, g);
  const box = (g, x, y, w, h, o = {}) => kit.svg("rect", {
    x, y, width: w, height: h, rx: o.rx ?? 0, fill: o.fill ?? "none", stroke: o.stroke ?? mute, "stroke-width": o.w ?? 1.3,
    ...(o.opacity !== undefined && { opacity: o.opacity }),
  }, g);

  // --- Deterministic geometry, built once -------------------------------------
  const rnd = kit.rng(19);
  // Step 1: checkerboard 6 x 5 cells; interior corners 5 x 4; three imprecise corners.
  const BD = { x: 40, y: 52, c: 40, nx: 6, ny: 5 };
  const corners = [];
  for (let r = 1; r < BD.ny; r++) for (let q = 1; q < BD.nx; q++) {
    corners.push({ x: BD.x + q * BD.c, y: BD.y + r * BD.c, bad: false, dx: 0, dy: 0 });
  }
  [3, 10, 17].forEach((k) => {
    corners[k].bad = true;
    corners[k].dx = (rnd() < 0.5 ? -1 : 1) * (7 + rnd() * 4);
    corners[k].dy = (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 4);
  });
  // Step 2: speckle in both image frames.
  const FL = { x: 30, y: 50, w: 260, h: 170 }, FR = { x: 350, y: 50, w: 260, h: 170 };
  const speckle = Array.from({ length: 150 }, () => [rnd(), rnd(), 1 + rnd() * 1.6]);
  // Step 3/4: a two-tone vibration trace (main mode plus a weaker higher one), and a little noise.
  const xiAt = (u) => 0.75 * Math.sin(2 * Math.PI * 6 * u) + 0.25 * Math.sin(2 * Math.PI * 18 * u + 0.6);
  // Step 5: ODS profile with a step at the damage, and coefficient noise.
  const XD = 420, X0 = 60, X1 = 600;
  const noise = Array.from({ length: 109 }, () => rnd());

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // left: checkerboard with detected corners; right: the RANSAC loop around Zhang's method
        text(g, BD.x + (BD.nx * BD.c) / 2, 34, L.target, { fill: body, weight: 600, size: 18 });
        for (let r = 0; r < BD.ny; r++) for (let q = 0; q < BD.nx; q++) {
          kit.svg("rect", {
            x: BD.x + q * BD.c, y: BD.y + r * BD.c, width: BD.c, height: BD.c,
            fill: (r + q) % 2 ? bg : ink, "fill-opacity": (r + q) % 2 ? 1 : 0.6, stroke: mute, "stroke-width": 0.8,
          }, g);
        }
        const shown = Math.round(e * corners.length);
        const vRej = kit.easeOut(seg01(t, 0.55, 1));
        corners.slice(0, shown).forEach((c) => {
          const cx = c.x + c.dx, cy = c.y + c.dy;
          dot(g, cx, cy, 5, c.bad ? RED : accent, { stroke: bg, "stroke-width": 1.5 });
          if (c.bad) kit.svg("circle", { cx, cy, r: 11, fill: "none", stroke: RED, "stroke-width": 2.2, opacity: vRej }, g);
        });
        dot(g, 52, 284, 5, accent);
        text(g, 64, 290, L.inlier, { anchor: "start", size: 16, fill: body });
        dot(g, 180, 284, 5, RED);
        kit.svg("circle", { cx: 180, cy: 284, r: 10, fill: "none", stroke: RED, "stroke-width": 2 }, g);
        text(g, 196, 290, L.outlier, { anchor: "start", size: 16, fill: body });

        // loop
        const LX = 370, LW = 240, LH = 40, LY = [52, 122, 192];
        const hot = Math.min(2, Math.floor(t * 3));
        LY.forEach((y, k) => {
          box(g, LX, y, LW, LH, { rx: 6, fill: bg, stroke: k === hot && t < 1 ? accent : body, w: k === hot && t < 1 ? 2.4 : 1.4 });
          text(g, LX + LW / 2, y + 26, L.loop[k], { size: 17, fill: ink });
        });
        arrow(g, [LX + LW / 2, LY[0] + LH], [LX + LW / 2, LY[1] - 2], { stroke: body, w: 1.6 });
        arrow(g, [LX + LW / 2, LY[1] + LH], [LX + LW / 2, LY[2] - 2], { stroke: body, w: 1.6 });
        // "no" goes back to sampling
        kit.svg("path", { d: path([[LX, LY[2] + LH / 2], [LX - 22, LY[2] + LH / 2], [LX - 22, LY[0] + LH / 2]]), fill: "none", stroke: body, "stroke-width": 1.6 }, g);
        arrow(g, [LX - 22, LY[0] + LH / 2], [LX - 2, LY[0] + LH / 2], { stroke: body, w: 1.6 });
        text(g, LX - 30, 148, L.no, { anchor: "end", size: 16, fill: body });
        arrow(g, [LX + LW / 2, LY[2] + LH], [LX + LW / 2, 262], { stroke: accent, w: 1.8 });
        text(g, LX + LW / 2, 284, L.yes, { size: 17, fill: accent, weight: 600 });
        text(g, 320, 336, L.reproj, { size: 18, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
      }

      if (i === 1) {
        // rectified reference pair: one horizontal epipolar line; POI found by 1D search, then tracked in time
        const EY = 135, x1 = FL.x + 110, xg = FR.x + 110, x2 = FR.x + 160;
        [[FL, L.left], [FR, L.right]].forEach(([F, lab]) => {
          box(g, F.x, F.y, F.w, F.h, { fill: rule, stroke: mute, w: 1.2 });
          speckle.forEach(([u, v, r]) => dot(g, F.x + 6 + u * (F.w - 12), F.y + 6 + v * (F.h - 12), r, mute, { opacity: 0.55 }));
          text(g, F.x + F.w / 2, 36, lab, { fill: body, weight: 600, size: 18 });
        });
        line(g, [FL.x, EY], [FL.x + FL.w, EY], { stroke: accent, w: 1.6, dash: "7 5" });
        line(g, [FR.x, EY], [FR.x + FR.w, EY], { stroke: accent, w: 1.6, dash: "7 5" });
        text(g, 320, 244, L.epi, { size: 16, fill: accent });
        // temporal tracking: a short vertical trail through each matched point (the specimen vibrates)
        const m = kit.easeOut(seg01(t, 0, 0.5));
        const v = kit.easeOut(seg01(t, 0.5, 1));
        [x1, x2].forEach((x) => {
          line(g, [x, EY - 44], [x, EY + 44], { stroke: accent, w: 1.2, opacity: v * 0.6 });
          for (let k = 0; k < 5; k++) {
            if (k === 2) continue;
            dot(g, x, EY - 40 + 20 * k, 3.5, accent, { opacity: v * (0.35 + 0.13 * k) });
          }
          text(g, x, EY - 54, L.track, { size: 17, fill: accent, opacity: v });
        });
        // POI and its match
        dot(g, x1, EY, 6, ink);
        text(g, x1 - 12, EY - 8, ["x", { sub: "1" }], { size: 18, anchor: "end" });
        kit.svg("circle", { cx: xg, cy: EY, r: 6, fill: "none", stroke: mute, "stroke-width": 1.6, "stroke-dasharray": "3 3" }, g);
        const xs = xg + (x2 - xg) * m;
        dot(g, xs, EY, 6, ink);
        text(g, xs + 12, EY - 8, ["x", { sub: "2" }], { size: 18, anchor: "start" });
        if (m > 0.98) {
          line(g, [xg, EY + 8], [xg, EY + 62], { stroke: mute, w: 1, dash: "3 3" });
          dim(g, [xg, EY + 56], [x2, EY + 56], { stroke: body, w: 1.3, head: 7 });
          text(g, (xg + x2) / 2, EY + 78, "δ", { size: 19, fill: body });
        }
        text(g, 160, 284, L.spatial, { size: 17, fill: body });
        text(g, 480, 284, L.temporal, { size: 17, fill: accent, opacity: v });
        text(g, 320, 334, L.rect, { size: 18, fill: ink, weight: 600, opacity: v });
      }

      if (i === 2) {
        // rectified two-view geometry: depth from disparity, then the state vector over time
        const C1 = [90, 300], C2 = [250, 300], PY = 250;
        const X = [170, 84];
        const hit = (C) => [C[0] + (X[0] - C[0]) * ((C[1] - PY) / (C[1] - X[1])), PY];
        [C1, C2].forEach((C, k) => {
          line(g, [C[0] - 38, PY], [C[0] + 38, PY], { stroke: body, w: 2.4 });
          kit.svg("path", { d: path([[C[0] - 12, C[1] + 12], [C[0], C[1]], [C[0] + 12, C[1] + 12]]) + "Z", fill: ink }, g);
          text(g, C[0] + (k ? 22 : -22), C[1] + 14, ["C", { sub: String(k + 1) }], { size: 17, anchor: k ? "start" : "end", fill: body });
        });
        const v = kit.easeOut(seg01(t, 0, 0.6));
        [C1, C2].forEach((C) => {
          const h = hit(C);
          line(g, C, [C[0] + (X[0] - C[0]) * v, C[1] + (X[1] - C[1]) * v], { stroke: accent, w: 1.6 });
          if (v > 0.3) dot(g, h[0], h[1], 4.5, accent);
          line(g, [C[0], PY - 6], [C[0], PY + 6], { stroke: body, w: 1.2 });
        });
        dot(g, X[0], X[1], 6, ink);
        text(g, X[0], X[1] - 14, L.obj, { size: 18, weight: 600 });
        const h1 = hit(C1), h2 = hit(C2);
        text(g, h1[0] - 4, PY - 12, ["x", { sub: "1" }], { size: 17, anchor: "end", fill: accent });
        text(g, h2[0] + 4, PY - 12, ["x", { sub: "2" }], { size: 17, anchor: "start", fill: accent });
        dim(g, [C1[0], 330], [C2[0], 330], { stroke: body, w: 1.3, head: 7 });
        text(g, 170, 352, L.base, { size: 17, fill: body });
        dim(g, [40, PY], [40, C1[1]], { stroke: body, w: 1.3, head: 6 });
        text(g, 30, 282, L.focal, { size: 17, fill: body, anchor: "end" });
        dim(g, [318, X[1]], [318, C2[1]], { stroke: body, w: 1.3, head: 7 });
        text(g, 326, 196, L.depth, { size: 18, fill: body, anchor: "start" });

        const vE = kit.easeOut(seg01(t, 0.3, 0.8));
        text(g, 492, 60, L.eqD, { size: 20, weight: 600, opacity: vE });
        text(g, 492, 96, L.eqX, { size: 19, fill: body, opacity: vE });
        text(g, 492, 140, L.eqXi, { size: 20, weight: 700, fill: accent, opacity: kit.easeOut(seg01(t, 0.5, 1)) });
        // the state-vector trace, drawn progressively
        const PB = { x: 380, y: 160, w: 225, h: 110 };
        line(g, [PB.x, PB.y + PB.h / 2], [PB.x + PB.w, PB.y + PB.h / 2], { stroke: mute, w: 1 });
        line(g, [PB.x, PB.y], [PB.x, PB.y + PB.h], { stroke: mute, w: 1 });
        const n = Math.max(2, Math.round(120 * kit.easeOut(seg01(t, 0.4, 1))));
        const pts = Array.from({ length: n }, (_, j) => {
          const u = j / 119;
          return [PB.x + u * PB.w, PB.y + PB.h / 2 - xiAt(u) * (PB.h / 2 - 8)];
        });
        kit.svg("path", { d: path(pts), fill: "none", stroke: accent, "stroke-width": 2 }, g);
        text(g, PB.x + PB.w + 14, PB.y + PB.h / 2 + 6, "t", { size: 17, anchor: "end", fill: body, italic: true });
        text(g, 492, 296, L.trace, { size: 16, fill: body });
        text(g, 492, 336, L.one, { size: 18, fill: ink, weight: 600, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
      }

      if (i === 3) {
        // time trace -> DFT -> spectrum; the 17 Hz peak opens a full-field ODS map
        const TB = { x: 30, y: 60, w: 200, h: 100 };
        text(g, TB.x + TB.w / 2, 40, L.time, { size: 18, fill: body, weight: 600 });
        line(g, [TB.x, TB.y + TB.h / 2], [TB.x + TB.w, TB.y + TB.h / 2], { stroke: mute, w: 1 });
        kit.svg("path", {
          d: path(Array.from({ length: 120 }, (_, j) => [TB.x + (j / 119) * TB.w, TB.y + TB.h / 2 - xiAt(j / 119) * (TB.h / 2 - 6)])),
          fill: "none", stroke: accent, "stroke-width": 2,
        }, g);
        arrow(g, [240, 112], [292, 112], { stroke: body, w: 2 });
        text(g, 266, 100, L.dft, { size: 16, fill: body });

        // spectrum: peaks at the frequencies marked in Fig. 7 of the paper
        const SX = 305, SW = 305, SY = 170, fx = (f) => SX + (f / 500) * SW;
        text(g, SX + SW / 2, 40, L.spec, { size: 18, fill: body, weight: 600 });
        line(g, [SX, SY], [SX + SW, SY], { stroke: body, w: 1.3 });
        text(g, SX + SW, SY + 20, "500 " + L.hz, { size: 15, anchor: "end", fill: body });
        text(g, SX, SY + 20, "0", { size: 15, anchor: "middle", fill: body });
        const peaks = [[8.6, 22], [17.0, 105], [34.4, 13], [51.2, 24], [150.6, 20], [248.8, 17]];
        const grow = kit.easeOut(seg01(t, 0, 0.6));
        peaks.forEach(([f, h]) => {
          line(g, [fx(f), SY], [fx(f), SY - h * grow], { stroke: f === 17.0 ? accent : ink, w: f === 17.0 ? 3 : 2 });
        });
        text(g, fx(17.0) + 8, SY - 105 * grow + 6, "17.0", { size: 15, anchor: "start", fill: accent, weight: 600 });
        text(g, fx(51.2), SY - 24 * grow - 8, "51.2", { size: 15, fill: body });
        text(g, fx(150.6), SY - 20 * grow - 8, "150.6", { size: 15, fill: body });
        text(g, fx(248.8), SY - 17 * grow - 8, "248.8", { size: 15, fill: body });

        // ODS map for the 17 Hz peak (amplitude rises toward one end, as in Fig. 8a)
        const vm = kit.easeOut(seg01(t, 0.45, 1));
        const defs = kit.svg("defs", {}, s);
        const grad = kit.svg("linearGradient", { id: "ods19-grad", x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
        kit.svg("stop", { offset: "0", "stop-color": CYAN }, grad);
        kit.svg("stop", { offset: "0.45", "stop-color": CYAN }, grad);
        kit.svg("stop", { offset: "1", "stop-color": MAGENTA }, grad);
        line(g, [fx(17.0), SY + 4], [400, 222], { stroke: accent, w: 1.4, dash: "5 4", opacity: vm });
        kit.svg("rect", { x: 330, y: 226, width: 270, height: 64, fill: "url(#ods19-grad)", stroke: body, "stroke-width": 1.2, opacity: vm }, g);
        text(g, 465, 314, L.map, { size: 17, fill: ink, weight: 600, opacity: vm });

        text(g, 140, 236, L.eqU, { size: 20, weight: 700, fill: accent });
        text(g, 140, 270, L.noTri, { size: 16, fill: body });
        text(g, 320, 346, L.amp, { size: 17, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.7, 1)) });
      }

      if (i === 4) {
        // top: ODS profile with a step at the damage; middle: Haar window sliding; bottom: coefficient peaks there
        const PY0 = 120;
        const prof = (x) => {
          const u = (x - X0) / (X1 - X0);
          return PY0 - 52 * Math.sin(Math.PI * u) + (x > XD ? 10 : 0);
        };
        text(g, 320, 30, L.ods, { size: 18, fill: body, weight: 600 });
        const pp = [];
        for (let x = X0; x <= X1; x += 4) {
          if (x > XD && pp.length && pp[pp.length - 1][0] <= XD) pp.push([XD, prof(XD - 0.01)], [XD, prof(XD + 0.01)]);
          pp.push([x, prof(x)]);
        }
        kit.svg("path", { d: path(pp), fill: "none", stroke: ink, "stroke-width": 2.4 }, g);
        const vS = kit.easeOut(seg01(t, 0.75, 1));
        kit.svg("circle", { cx: XD, cy: prof(XD) + 5, r: 14, fill: "none", stroke: RED, "stroke-width": 2, opacity: vS }, g);
        text(g, XD - 22, prof(XD) + 34, L.step, { size: 16, fill: RED, anchor: "end", opacity: vS });

        // Haar wavelet window, centre moving from the left end to the damage
        const xw = X0 + 30 + (XD - X0 - 30) * kit.easeOut(seg01(t, 0, 0.8));
        const HB = 182, HW = 60;
        line(g, [X0, HB], [X1, HB], { stroke: mute, w: 1 });
        kit.svg("path", {
          d: path([[xw - HW / 2, HB], [xw - HW / 2, HB - 18], [xw, HB - 18], [xw, HB + 18], [xw + HW / 2, HB + 18], [xw + HW / 2, HB]]),
          fill: "none", stroke: accent, "stroke-width": 2.4,
        }, g);
        text(g, xw - HW / 2 - 8, HB + 6, L.haar, { size: 16, fill: accent, anchor: "end" });

        // coefficient trace up to the window position
        const CB = 300;
        line(g, [X0, CB], [X1, CB], { stroke: body, w: 1.3 });
        text(g, X0, 324, L.coef, { size: 16, fill: body, anchor: "start" });
        const cpts = [];
        noise.forEach((r, k) => {
          const x = X0 + k * 5;
          if (x > xw + (X1 - XD) * seg01(t, 0.8, 1)) return;
          const near = Math.max(0, 1 - Math.abs(x - XD) / 12);
          cpts.push([x, CB - 4 - r * 6 - near * 70]);
        });
        if (cpts.length > 1) kit.svg("path", { d: path(cpts), fill: "none", stroke: RED, "stroke-width": 2 }, g);
        text(g, XD + 14, CB - 62, L.peak, { size: 16, fill: RED, anchor: "start", opacity: vS });
        text(g, 320, 350, L.deg, { size: 17, fill: accent, weight: 600, opacity: vS });
      }
    },
  });
}
