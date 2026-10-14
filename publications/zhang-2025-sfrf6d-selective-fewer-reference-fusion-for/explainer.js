// SFRF6D schematic: a few RGB-D references with known poses + a query ->
// coarse 3D shape from the anchor view plus the other views (R_i p + t_i), normalised to [-1, 1] ->
// coarse alignment: centre, PCA axes, then rotation/scale tuned by maximising IoU ->
// geometry-guided sparse attention: normalised direction vectors and a top-K mask keep likely matches, occluded points drop out ->
// render pose hypotheses, compare with the query, score them with self-attention, keep the top one.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Input: a few RGB-D reference images of the object, each with a known pose (four by default), and one RGB-D query image in which the object is partly occluded. No CAD model is used.",
        "Coarse 3D shape: the reference view closest to the query is the anchor, and its depth map gives a first partial point cloud. The other views are moved into the same world frame with their known poses (R·p + t) and fill in the rest; the shape is then scaled into [−1, 1].",
        "Coarse alignment: the centre of the point cloud and its principal axes (PCA) give an initial position and rotation. Rotation and scale are then adjusted to maximise IoU for the alignment, giving a coarse pose.",
        "Geometry-guided sparse attention: reference points are rendered at the coarse pose. Normalised direction vectors between reference and query points build a top-K mask, so attention keeps likely matches and drops occluded or mismatched points.",
        "Refine and select: scale and pose are refined. Each pose hypothesis is rendered and compared with the query. A self-attention module scores the comparison vectors of all hypotheses together, and top-K filtering picks the final 6D pose.",
      ],
      refs: "4 references · known poses", query: "query RGB-D", occl: "occluder", nocad: "no CAD model",
      anchor: "anchor (closest view)", others: "other views: R·p + t", norm: "scaled to [−1, 1]",
      centre: "centre", pca: "PCA axes", obs: "query", iou: "maximise IoU", coarse: "coarse pose",
      rendered: "rendered reference", qpts: "query points", dense: "all pairs", topk: "top-K: likely matches",
      dir: "direction vectors: ref − query", dropped: "occluded: dropped",
      hyp: "hypotheses", cmp: "compare with query", sa: "self-attention scores", best: "final pose",
    },
    zh: {
      steps: [
        "输入：物体的少量 RGB-D 参考图像（默认四张），每张都带有已知位姿；以及一张物体被部分遮挡的 RGB-D 查询图像。整个过程不使用 CAD 模型。",
        "粗略三维形状：选取与查询视角最接近的参考图像作为锚点，由其深度图得到初始的局部点云；其余视角利用已知位姿（R·p + t）变换到同一世界坐标系中补全形状，随后将物体缩放到 [−1, 1] 范围内。",
        "粗对齐：由点云中心和主成分分析（PCA）得到的主轴给出初始位置和旋转；再以最大化对齐的 IoU 为目标调整旋转和尺度，得到粗略位姿。",
        "几何引导的稀疏注意力：在粗略位姿下渲染参考点。参考点与查询点之间的归一化方向向量构成 Top-K 掩码，注意力只保留可能的匹配，被遮挡或无法匹配的点被剔除。",
        "精化与选择：先精化尺度和位姿；渲染每个位姿假设并与查询图像比较；自注意力模块综合所有假设的比较向量给出评分，再经 Top-K 筛选得到最终的 6D 位姿。",
      ],
      refs: "4 张参考图 · 已知位姿", query: "查询 RGB-D", occl: "遮挡物", nocad: "无需 CAD 模型",
      anchor: "锚点（最近视角）", others: "其余视角：R·p + t", norm: "缩放到 [−1, 1]",
      centre: "中心", pca: "PCA 主轴", obs: "查询", iou: "最大化 IoU", coarse: "粗略位姿",
      rendered: "渲染的参考点", qpts: "查询点", dense: "全部点对", topk: "Top-K：可能的匹配",
      dir: "方向向量：参考点 − 查询点", dropped: "被遮挡：剔除",
      hyp: "位姿假设", cmp: "与查询比较", sa: "自注意力评分", best: "最终位姿",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: occluder, final pose box.
  const OCC = "#8a8f98";
  const BOX = "#2e9e5b";

  const { text, line, arrow } = kit.pen({ stroke: body, head: 9 });
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;
  const rnd = kit.rng(7);

  // --- Object: an irregular closed shape in local units (about [-1, 1]) -------------------
  const R = (phi) => 0.78 + 0.16 * Math.cos(2 * phi + 0.4) + 0.09 * Math.sin(3 * phi);
  const NCON = 44;
  const contour = Array.from({ length: NCON }, (_, k) => {
    const phi = (k / NCON) * Math.PI * 2;
    return [R(phi) * Math.cos(phi), R(phi) * Math.sin(phi) * 0.82];
  });
  const interior = Array.from({ length: 26 }, () => {
    const phi = rnd() * Math.PI * 2, rr = 0.25 + 0.55 * Math.sqrt(rnd());
    return [rr * R(phi) * Math.cos(phi), rr * R(phi) * Math.sin(phi) * 0.82];
  });
  const cloud = contour.concat(interior);
  const place = (P, [x, y]) => {
    const r = (P.a * Math.PI) / 180;
    return [P.cx + P.s * (x * Math.cos(r) - y * Math.sin(r)), P.cy + P.s * (x * Math.sin(r) + y * Math.cos(r))];
  };
  const shape = (g, P, o = {}) => kit.svg("path", {
    d: "M" + contour.map((q) => place(P, q).map((v) => v.toFixed(1)).join(",")).join("L") + "Z",
    fill: o.fill ?? accent, "fill-opacity": o.fo ?? 0.25, stroke: o.stroke ?? accent, "stroke-width": o.w ?? 1.5,
    ...(o.dash && { "stroke-dasharray": o.dash }), opacity: o.opacity ?? 1,
  }, g);
  // "v" with a subscript tspan (subscript kept at >= 14 viewBox units).
  const vsub = (g, x, y, sub, opacity) => {
    const node = text(g, x, y, "v", { size: 18, anchor: "start", fill: accent, weight: 600, opacity });
    kit.svg("tspan", { "font-size": Math.max(14, Math.round(18 * 0.8)), dy: 5 }, node).textContent = sub;
    return node;
  };
  const dot = (g, p, r, fill, opacity = 1) => kit.svg("circle", { cx: p[0], cy: p[1], r, fill, opacity }, g);
  const frame = (g, x, y, w, h, o = {}) => kit.svg("rect", {
    x, y, width: w, height: h, rx: 4, fill: o.fill ?? ink, "fill-opacity": o.fo ?? 0.05,
    stroke: o.stroke ?? mute, "stroke-width": o.sw ?? 1.2,
  }, g);
  // pose triad (known pose marker)
  const triad = (g, x, y, a) => {
    const r = (a * Math.PI) / 180;
    arrow(g, [x, y], [x + 16 * Math.cos(r), y + 16 * Math.sin(r)], { stroke: accent, w: 1.4, head: 5 });
    arrow(g, [x, y], [x - 16 * Math.sin(r), y + 16 * Math.cos(r)], { stroke: accent, w: 1.4, head: 5 });
  };

  // Reference cameras around the object (angle of the camera seen from the object centre, degrees).
  const CAMS = [-150, -95, -30, 40];
  const ANCHOR = 2; // closest to the query view
  const visibleFrom = (p, camDeg) => {
    const r = (camDeg * Math.PI) / 180;
    const n = Math.hypot(p[0], p[1]) || 1;
    return (p[0] * Math.cos(r) + p[1] * Math.sin(r)) / n > 0.15;
  };
  // Which view first contributes each contour point (anchor first, then the others).
  const owner = contour.map((p) => {
    if (visibleFrom(p, CAMS[ANCHOR])) return ANCHOR;
    const k = CAMS.findIndex((c, j) => j !== ANCHOR && visibleFrom(p, c));
    return k < 0 ? -1 : k;
  });

  // Query layout for steps 4-5: object pose and occluder in query-image coordinates.
  const QP = { cx: 466, cy: 186, s: 86, a: 26 };
  const OCC_RECT = { x: 486, y: 176, w: 116, h: 120 };
  const inOcc = (p) => p[0] > OCC_RECT.x && p[0] < OCC_RECT.x + OCC_RECT.w && p[1] > OCC_RECT.y && p[1] < OCC_RECT.y + OCC_RECT.h;
  // Query points (a subset of the contour, as seen) and their reference partners.
  const QIDX = contour.map((_, k) => k).filter((k) => k % 3 === 0);
  const occPts = Array.from({ length: 8 }, () => [OCC_RECT.x + 10 + rnd() * (OCC_RECT.w - 20), OCC_RECT.y + 10 + rnd() * (OCC_RECT.h - 20)]);

  // Pose hypotheses for step 5: offsets in rotation and position; index 0 is the best.
  const HYP = [
    { da: 0, dx: 0, dy: 0 }, { da: 14, dx: 10, dy: -6 }, { da: -18, dx: -12, dy: 8 }, { da: 26, dx: 4, dy: 12 },
  ];
  const score = HYP.map((h) => Math.exp(-(Math.abs(h.da) / 20 + Math.hypot(h.dx, h.dy) / 18)));
  const ORDER = [2, 0, 3, 1]; // display order of hypotheses, so the best is not first

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // four reference frames (2 x 2) with known-pose triads; the query frame with an occluder
        text(g, 150, 36, L.refs, { size: 16, fill: body, weight: 600 });
        const angles = [-40, 25, 75, 150];
        for (let k = 0; k < 4; k++) {
          const x = 30 + (k % 2) * 124, y = 52 + Math.floor(k / 2) * 104;
          const o = kit.easeOut(seg01(t, k * 0.12, k * 0.12 + 0.5));
          const fg = kit.svg("g", { opacity: o }, g);
          frame(fg, x, y, 112, 90);
          shape(fg, { cx: x + 58, cy: y + 46, s: 30, a: angles[k] });
          triad(fg, x + 14, y + 76, angles[k] - 40);
        }
        text(g, 150, 290, L.nocad, { size: 16, fill: mute });
        // query
        text(g, 452, 36, L.query, { size: 16, fill: body, weight: 600 });
        frame(g, 300, 52, 304, 230);
        kit.svg("rect", { x: 320, y: 228, width: 70, height: 40, fill: mute, "fill-opacity": 0.35 }, g);
        kit.svg("circle", { cx: 560, cy: 96, r: 22, fill: mute, "fill-opacity": 0.35 }, g);
        shape(g, { cx: 440, cy: 170, s: 70, a: 12 }, { fo: 0.3 });
        const oc = kit.easeOut(seg01(t, 0.35, 1));
        kit.svg("rect", { x: 462, y: 168, width: 92, height: 86, rx: 3, fill: OCC, opacity: 0.9 * oc }, g);
        text(g, 508, 216, L.occl, { size: 15, fill: bg, weight: 600, opacity: oc, halo: false });
      }

      if (i === 1) {
        // cameras around the object; anchor points appear first, then other views fly in; normalisation box
        const C = { cx: 300, cy: 186, s: 96, a: 0 };
        CAMS.forEach((cd, k) => {
          const r = (cd * Math.PI) / 180;
          const p = [C.cx + 150 * Math.cos(r), C.cy + 128 * Math.sin(r)];
          const isA = k === ANCHOR;
          kit.svg("rect", { x: p[0] - 13, y: p[1] - 9, width: 26, height: 18, rx: 3, fill: isA ? accent : bg, stroke: isA ? accent : body, "stroke-width": 1.5 }, g);
          line(g, p, [lerp(p[0], C.cx, 0.22), lerp(p[1], C.cy, 0.22)], { stroke: isA ? accent : mute, w: 1.2, dash: "3 3" });
        });
        const ra = (CAMS[ANCHOR] * Math.PI) / 180;
        text(g, C.cx + 150 * Math.cos(ra) + 22, C.cy + 128 * Math.sin(ra) - 16, L.anchor, { size: 16, anchor: "start", fill: accent, weight: 600 });
        const a1 = kit.easeOut(seg01(t, 0, 0.45));
        const a2 = kit.easeOut(seg01(t, 0.35, 0.9));
        contour.forEach((p, k) => {
          const tgt = place(C, p);
          const o = owner[k];
          if (o < 0) return;
          if (o === ANCHOR) { dot(g, tgt, 3.6, accent, a1); return; }
          const r = (CAMS[o] * Math.PI) / 180;
          const from = [C.cx + 150 * Math.cos(r), C.cy + 128 * Math.sin(r)];
          dot(g, [lerp(from[0], tgt[0], a2), lerp(from[1], tgt[1], a2)], 3.2, body, a2 > 0 ? 0.35 + 0.65 * a2 : 0);
        });
        interior.forEach((p) => dot(g, place(C, p), 2.4, body, 0.5 * a2));
        text(g, 476, 300, L.others, { size: 16, anchor: "start", fill: body, opacity: a2 });
        const nb = kit.easeOut(seg01(t, 0.7, 1));
        kit.svg("rect", { x: C.cx - 92, y: C.cy - 92, width: 184, height: 184, fill: "none", stroke: ink, "stroke-width": 1.2, "stroke-dasharray": "6 4", opacity: nb }, g);
        text(g, C.cx, C.cy + 116, L.norm, { size: 16, fill: ink, weight: 600, opacity: nb });
      }

      if (i === 2) {
        // left: centre + PCA axes on the reconstructed cloud; right: rotate/scale to maximise IoU with the query
        const C = { cx: 150, cy: 186, s: 84, a: 0 };
        cloud.forEach((p) => dot(g, place(C, p), 2.6, body, 0.6));
        dot(g, [C.cx, C.cy], 5, accent);
        kit.svg("rect", { x: C.cx - 14 - (lang === "zh" ? 36 : 56), y: C.cy + 8, width: lang === "zh" ? 38 : 58, height: 20, fill: bg, "fill-opacity": 0.9 }, g);
        text(g, C.cx - 14, C.cy + 22, L.centre, { size: 15, anchor: "end", fill: accent, weight: 600 });
        const ax = kit.easeOut(seg01(t, 0, 0.5));
        arrow(g, [C.cx, C.cy], [C.cx + 100 * ax, C.cy], { stroke: accent, w: 2.2 });
        arrow(g, [C.cx, C.cy], [C.cx, C.cy - 72 * ax], { stroke: accent, w: 2.2 });
        vsub(g, C.cx + 104, C.cy - 8, "1", ax);
        vsub(g, C.cx + 8, C.cy - 76, "2", ax);
        text(g, 150, 46, L.pca, { size: 16, fill: body, weight: 600 });
        arrow(g, [282, 186], [330, 186], { w: 1.6 });
        // right panel: query silhouette (observed) and the object outline moving into it
        const Q = { cx: 470, cy: 186, s: 92, a: 18 };
        text(g, 470, 46, L.iou, { size: 16, fill: body, weight: 600 });
        shape(g, Q, { fill: ink, fo: 0.1, stroke: mute, w: 1.2 });
        const u = kit.easeOut(seg01(t, 0.3, 1));
        const P = { cx: lerp(452, Q.cx, u), cy: lerp(196, Q.cy, u), s: lerp(70, Q.s, u), a: lerp(-14, Q.a, u) };
        shape(g, P, { fo: 0.18, w: 2 });
        shape(g, Q, { fill: "none", stroke: ink, w: 1.2, dash: "5 4", opacity: 0.6 });
        text(g, 470, 300, L.obs, { size: 15, fill: body });
        text(g, 470, 328, L.coarse, { size: 16, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.8, 1)) });
      }

      if (i === 3) {
        // left: rendered reference points; right: query points with occluder; dense pairs -> top-K pairs
        const RP = { cx: 160, cy: 190, s: 92, a: 12 };
        text(g, 160, 46, L.rendered, { size: 16, fill: body, weight: 600 });
        text(g, 470, 46, L.qpts, { size: 16, fill: body, weight: 600 });
        frame(g, 340, 62, 270, 250);
        shape(g, QP, { fill: ink, fo: 0.08, stroke: mute, w: 1, dash: "4 4" });
        kit.svg("rect", { x: OCC_RECT.x, y: OCC_RECT.y, width: OCC_RECT.w, height: OCC_RECT.h, rx: 3, fill: OCC, "fill-opacity": 0.35 }, g);
        const dense = 1 - kit.easeOut(seg01(t, 0.15, 0.6));
        const sparse = kit.easeOut(seg01(t, 0.45, 1));
        const refAt = (k) => place(RP, contour[k]);
        const qAt = (k) => place(QP, contour[k]);
        // dense phase: each query point to several reference points
        if (dense > 0.01) {
          QIDX.forEach((k, j) => {
            for (let m = 0; m < 3; m++) {
              const kk = QIDX[(j + m * 5) % QIDX.length];
              line(g, qAt(k), refAt(kk), { stroke: mute, w: 0.8, opacity: 0.45 * dense });
            }
          });
          occPts.forEach((p, j) => line(g, p, refAt(QIDX[(j * 4) % QIDX.length]), { stroke: mute, w: 0.8, opacity: 0.45 * dense }));
        }
        // sparse phase: matched pairs only, for visible query points
        QIDX.forEach((k) => {
          const q = qAt(k);
          if (inOcc(q)) return;
          line(g, q, refAt(k), { stroke: accent, w: 1.4, opacity: 0.85 * sparse });
        });
        cloud.forEach((p) => dot(g, place(RP, p), 2.6, accent, 0.75));
        QIDX.forEach((k) => {
          const q = qAt(k);
          if (inOcc(q)) dot(g, q, 3, mute, 0.35 + 0.4 * (1 - sparse));
          else dot(g, q, 3.4, ink);
        });
        occPts.forEach((p) => kit.svg("rect", { x: p[0] - 3, y: p[1] - 3, width: 6, height: 6, fill: OCC, opacity: 0.4 + 0.5 * (1 - sparse) }, g));
        text(g, 160, 334, dense > 0.5 ? L.dense : L.topk, { size: 16, fill: dense > 0.5 ? body : accent, weight: 600 });
        text(g, 320, 26, L.dir, { size: 15, fill: body });
        text(g, OCC_RECT.x + OCC_RECT.w / 2, 334, L.dropped, { size: 15, fill: body, opacity: sparse });
      }

      if (i === 4) {
        // left: query frame with hypothesis outlines; right: score bars from self-attention; best -> final pose
        text(g, 170, 36, L.hyp + " · " + L.cmp, { size: 16, fill: body, weight: 600 });
        const QF = { cx: 170, cy: 190, s: 92, a: 12 };
        frame(g, 30, 52, 280, 270);
        shape(g, QF, { fill: ink, fo: 0.12, stroke: mute, w: 1.2 });
        kit.svg("rect", { x: 188, y: 196, width: 110, height: 96, rx: 3, fill: OCC, "fill-opacity": 0.85 }, g);
        const hv = kit.easeOut(seg01(t, 0, 0.4));
        const pick = kit.easeOut(seg01(t, 0.6, 1));
        HYP.forEach((h, k) => {
          if (k === 0) return;
          shape(g, { cx: QF.cx + h.dx, cy: QF.cy + h.dy, s: QF.s, a: QF.a + h.da }, { fill: "none", stroke: mute, w: 1.3, dash: "5 4", opacity: hv * (1 - 0.7 * pick) });
        });
        shape(g, QF, { fill: "none", stroke: pick > 0 ? BOX : mute, w: 1.3 + 1.3 * pick, dash: pick > 0.5 ? undefined : "5 4", opacity: hv });
        // scores
        text(g, 470, 72, L.sa, { size: 16, fill: body, weight: 600 });
        arrow(g, [318, 190], [356, 190], { w: 1.6 });
        const sb = kit.easeOut(seg01(t, 0.25, 0.75));
        ORDER.forEach((k, r) => {
          const y = 104 + r * 46;
          const best = k === 0;
          text(g, 380, y + 15, "H" + (r + 1), { size: 16, anchor: "start", fill: best && pick > 0 ? BOX : ink, weight: 600 });
          kit.svg("rect", { x: 418, y, width: Math.max(1, 170 * score[k] * sb), height: 20, rx: 2, fill: best && pick > 0 ? BOX : mute, "fill-opacity": 0.9 }, g);
        });
        text(g, 470, 316, "top-K → " + L.best, { size: 16, fill: BOX, weight: 600, opacity: pick });
      }
    },
  });
}
