// Weighted normal estimation schematic (side view of one patch across a sharp edge):
// patch -> uniform-weight regression drifts -> learned point weights (target (n_i·n_j)^2)
// -> contrastive pre-training of patch/normal pairs -> weighted regression close to ground truth.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A patch of the N nearest neighbours of a central point, here straddling a sharp edge. The patch is normalised to a unit sphere and rotated by R, computed with PCA.",
        "Regressing the normal with uniform weights on all points lets less relevant neighbours pull the estimate away from the ground-truth normal.",
        "A weight regressor predicts a weight for every point. Its training target is the squared cosine between the central point's normal and each neighbour's normal, so points whose normals agree with the central point's get high weights.",
        "Contrastive pre-training: the weighted patch features and the central point's ground-truth normal are encoded separately; each patch–normal pair is pulled together and pushed away from the other pairs in the batch.",
        "Fine-tuning: the weighted features F′ = W ⊙ F feed a normal regressor, and the prediction, mapped back with R⁻¹, lies close to the ground truth.",
      ],
      centre: "central point", edge: "sharp edge", knn: "N nearest neighbours", norm: "normalise · rotate R",
      gt: "ground truth", uni: "uniform weights", wpred: "learned weights",
      low: "low", high: "high", weight: "weight", target: "target weight",
      patches: "patches", normals: "normals", penc: "point encoder + weight regressor", nenc: "normal encoder",
      pull: "solid: pull together · dashed: push apart", reg: "normal regressor",
    },
    zh: {
      steps: [
        "以中心点为中心、由 N 个最近邻点组成的局部块，此处跨越一条尖锐边。局部块被归一化到单位球内，并用 PCA 求得的旋转矩阵 R 对齐。",
        "若对所有点赋予相同权重来回归法向，相关性较低的邻域点会把预测结果拉离真实法向。",
        "权重回归器为每个点预测一个权重，训练目标是中心点法向与各邻点法向夹角余弦的平方，因此法向与中心点法向一致的点权重高。",
        "对比预训练：加权后的局部块特征与中心点的真实法向分别编码；每个“局部块–法向”对相互拉近，并与同一批次中的其他配对相互推远。",
        "微调：加权特征 F′ = W ⊙ F 输入法向回归器，预测结果经 R⁻¹ 变换回原始朝向后，与真实法向十分接近。",
      ],
      centre: "中心点", edge: "尖锐边", knn: "N 个最近邻点", norm: "归一化 · 旋转 R",
      gt: "真实法向", uni: "均匀权重", wpred: "学习得到的权重",
      low: "低", high: "高", weight: "权重", target: "目标权重",
      patches: "局部块", normals: "法向", penc: "点编码器 + 权重回归器", nenc: "法向编码器",
      pull: "实线：拉近 · 虚线：推远", reg: "法向回归器",
    },
  }, lang);

  const { ink, body, accent, mute } = kit.palette();
  const GT = "#3f8f3f";   // ground-truth normal (green, as in Fig. 1 of the paper)
  const PRED = "#c0392b"; // predicted normal (red, as in Fig. 1)
  const HIGH = "#d9822b"; // high point weight

  // --- Deterministic patch geometry (screen units) ---------------------------
  const rnd = kit.rng(11);
  const R = [380, 140];                 // ridge (sharp edge)
  const A = [130, 250];                 // start of the left face
  const B = [520, 290];                 // end of the right face
  const unit = (v) => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  const dL = unit([R[0] - A[0], R[1] - A[1]]);
  const dR = unit([B[0] - R[0], B[1] - R[1]]);
  const nL = [dL[1], -dL[0]];           // upward normal of the left face
  const nR = [dR[1], -dR[0]];           // upward normal of the right face
  const C = [R[0] - 110 * dL[0], R[1] - 110 * dL[1]]; // central point on the left face
  const RAD = 150;
  const cos2 = (nL[0] * nR[0] + nL[1] * nR[1]) ** 2; // ground-truth weight across the edge
  const pts = [];
  const face = (p0, d, len, n, w) => {
    for (let s = 0; s <= len; s += 11) {
      const off = (rnd() - 0.5) * 7;
      const x = p0[0] + d[0] * s + n[0] * off, y = p0[1] + d[1] * s + n[1] * off;
      if (Math.hypot(x - C[0], y - C[1]) < RAD - 6) pts.push({ x, y, w, n });
    }
  };
  face(A, dL, Math.hypot(R[0] - A[0], R[1] - A[1]), nL, 1);
  face(R, dR, Math.hypot(B[0] - R[0], B[1] - R[1]), nR, cos2);
  const ang = Math.atan2(nL[1], nL[0]);
  const dir = (deg) => [Math.cos(ang + (deg * Math.PI) / 180), Math.sin(ang + (deg * Math.PI) / 180)];
  const tip = (v, len) => [C[0] + v[0] * len, C[1] + v[1] * len];
  const sameS = pts.filter((p) => p.w === 1).reduce((b, p) => (Math.hypot(p.x - C[0] + 75, p.y - C[1]) < Math.hypot(b.x - C[0] + 75, b.y - C[1]) ? p : b));
  const otherS = pts.filter((p) => p.w < 1).reduce((b, p) => (Math.abs(Math.hypot(p.x - R[0], p.y - R[1]) - 34) < Math.abs(Math.hypot(b.x - R[0], b.y - R[1]) - 34) ? p : b));

  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: body, width: 1.6, head: 11 });

  // Text with subscript / superscript runs: parts are strings or { sub } / { sup } objects.
  const rich = (g, x, y, parts, o = {}) => {
    const size = o.size ?? 20;
    const n = kit.text(g, x, y, "", { size, fill: o.fill ?? ink, anchor: o.anchor ?? "middle", opacity: o.opacity, halo: true });
    for (const p of parts) {
      const small = { "font-size": Math.max(14, Math.round(size * 0.8)) };
      const t = typeof p === "string" ? kit.svg("tspan", {}, n)
        : kit.svg("tspan", { ...small, "baseline-shift": p.sub !== undefined ? "sub" : "super" }, n);
      t.textContent = typeof p === "string" ? p : (p.sub ?? p.sup);
    }
    return n;
  };

  const drawPatch = (g, { weightMix = 0, circle = 1, dim = 1 } = {}) => {
    kit.svg("circle", { cx: C[0], cy: C[1], r: RAD, fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "5 5", opacity: circle }, g);
    for (const p of pts) {
      kit.svg("circle", { cx: p.x, cy: p.y, r: 4, fill: mute, opacity: dim * (1 - weightMix * p.w) }, g);
      if (weightMix > 0) kit.svg("circle", { cx: p.x, cy: p.y, r: 4, fill: HIGH, opacity: dim * weightMix * p.w }, g);
    }
    kit.svg("circle", { cx: C[0], cy: C[1], r: 6.5, fill: accent, stroke: ink, "stroke-width": 1.6 }, g);
  };
  const legendRow = (g, y, colour, label, { dash = false, opacity = 1 } = {}) => {
    line(g, [430, y - 7], [462, y - 7], { stroke: colour, w: 3, dash: dash ? "6 5" : undefined, opacity });
    text(g, 470, y, label, { anchor: "start", size: 19, fill: body, opacity });
  };
  const gtArrow = (g, e) => arrow(g, C, tip(dir(0), 30 + 70 * e), { stroke: GT, w: 3 });
  const weightLegend = (g, opacity) => {
    text(g, 430, 332, `${L.weight}${lang === "zh" ? "：" : ":"}`, { anchor: "start", size: 19, fill: body, opacity });
    const x0 = lang === "zh" ? 502 : 506;
    kit.svg("circle", { cx: x0, cy: 325, r: 6, fill: mute, opacity }, g);
    text(g, x0 + 11, 332, L.low, { anchor: "start", size: 19, fill: body, opacity });
    kit.svg("circle", { cx: x0 + 60, cy: 325, r: 6, fill: HIGH, opacity }, g);
    text(g, x0 + 71, 332, L.high, { anchor: "start", size: 19, fill: body, opacity });
  };

  // --- Contrastive step: mini patches and normals -----------------------------
  const ROWS = [118, 200, 282];
  const miniShapes = [
    [[-40, 6], [-20, 6], [0, 6], [20, 6], [40, 6]],            // flat
    [[-40, 14], [-20, 4], [0, -6], [20, 6], [40, 18]],         // edge
    [[-40, 14], [-20, 2], [0, -2], [20, 2], [40, 14]],         // curved
  ];
  const miniNormals = [-90, -112, -90];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        drawPatch(g, { circle: e, dim: 1 });
        text(g, C[0] + 14, C[1] + 74, L.centre, { size: 20 });
        line(g, [C[0] + 8, C[1] + 52], [C[0] + 1, C[1] + 10], { stroke: mute, w: 1.2 });
        text(g, R[0] + 6, R[1] - 22, L.edge, { size: 20, opacity: e });
        text(g, 520, 316, L.knn, { size: 19, fill: body, opacity: e });
        line(g, [470, 300], [C[0] + RAD * 0.72, C[1] + RAD * 0.66], { stroke: mute, w: 1.2, opacity: e });
        kit.svg("rect", { x: 432, y: 46, width: 200, height: 40, rx: 6, fill: "none", stroke: body, "stroke-width": 1.4, opacity: e }, g);
        text(g, 532, 72, L.norm, { size: 18, fill: body, opacity: e });
      }

      if (i === 1) {
        drawPatch(g, {});
        gtArrow(g, 1);
        arrow(g, C, tip(dir(24 * e), 100), { stroke: PRED, w: 3 });
        legendRow(g, 70, GT, L.gt);
        legendRow(g, 104, PRED, L.uni, { opacity: e });
      }

      if (i === 2) {
        drawPatch(g, { weightMix: e });
        gtArrow(g, 1);
        // sample neighbour normals: same surface vs. across the edge
        for (const p of [sameS, otherS]) {
          arrow(g, [p.x, p.y], [p.x + p.n[0] * 42 * e, p.y + p.n[1] * 42 * e], { stroke: body, w: 1.8, head: 8, opacity: e });
        }
        legendRow(g, 70, GT, L.gt);
        text(g, 442, 170, L.target, { anchor: "start", size: 19, fill: body, opacity: e });
        rich(g, 442, 204, ["w", { sub: "j" }, " = (n", { sub: "i" }, " · n", { sub: "j" }, ")", { sup: "2" }], { anchor: "start", size: 22, opacity: e });
        weightLegend(g, e);
      }

      if (i === 3) {
        text(g, 105, 52, L.patches, { size: 19, fill: body });
        text(g, 560, 52, L.normals, { size: 19, fill: body });
        rich(g, 255, 52, ["z", { sub: "i" }], { size: 20 });
        rich(g, 385, 52, ["z", { sub: "j" }], { size: 20 });
        // encoders as tall boxes with rotated labels
        for (const [x, label] of [[170, L.penc], [426, L.nenc]]) {
          kit.svg("rect", { x, y: 70, width: 44, height: 260, rx: 6, fill: "none", stroke: body, "stroke-width": 1.4 }, g);
          kit.text(g, x + 28, 200, label, { size: 15, fill: body, transform: `rotate(-90 ${x + 28} 200)` });
        }
        ROWS.forEach((y, r) => {
          for (const [dx, dy] of miniShapes[r]) {
            kit.svg("circle", { cx: 105 + dx, cy: y + dy, r: 4, fill: r === 1 && dx > 0 ? mute : HIGH }, g);
          }
          const v = [Math.cos((miniNormals[r] * Math.PI) / 180), Math.sin((miniNormals[r] * Math.PI) / 180)];
          arrow(g, [560 - v[0] * 18, y + 22], [560 + v[0] * 22, y + 22 + v[1] * 46], { stroke: GT, w: 3, head: 10 });
          arrow(g, [150, y], [168, y], { w: 1.4, head: 7 });
          arrow(g, [216, y], [246, y], { w: 1.4, head: 7 });
          arrow(g, [530, y], [472, y], { w: 1.4, head: 7 });
          arrow(g, [424, y], [394, y], { w: 1.4, head: 7 });
        });
        // pairs: matching (solid) and non-matching (dashed)
        ROWS.forEach((ya, a) => ROWS.forEach((yb, b) => {
          if (a === b) return;
          line(g, [256, ya], [256 + (384 - 256) * e, ya + (yb - ya) * e], { stroke: mute, w: 1.3, dash: "4 5", opacity: 0.9 });
        }));
        ROWS.forEach((y) => {
          const gap = 30 * (1 - e);
          line(g, [256 + gap, y], [384 - gap, y], { stroke: accent, w: 3 });
          kit.svg("circle", { cx: 256 + gap, cy: y, r: 7, fill: HIGH, stroke: ink, "stroke-width": 1.2 }, g);
          kit.svg("circle", { cx: 384 - gap, cy: y, r: 7, fill: GT, stroke: ink, "stroke-width": 1.2 }, g);
        });
        text(g, 320, 348, L.pull, { size: 18, fill: body, opacity: e });
      }

      if (i === 4) {
        drawPatch(g, { weightMix: 1 });
        arrow(g, C, tip(dir(24), 100), { stroke: mute, w: 2, dash: "6 5", head: 9, opacity: 1 - 0.5 * e });
        gtArrow(g, 1);
        arrow(g, C, tip(dir(24 - 21 * e), 100), { stroke: PRED, w: 3 });
        legendRow(g, 70, GT, L.gt);
        legendRow(g, 104, PRED, L.wpred);
        legendRow(g, 138, mute, L.uni, { dash: true, opacity: 1 - 0.5 * e });
        rich(g, 442, 214, ["F′ = W ⊙ F"], { anchor: "start", size: 22, opacity: e });
        text(g, 442, 248, `→ ${L.reg}`, { anchor: "start", size: 19, fill: body, opacity: e });
        weightLegend(g, 1);
      }
    },
  });
}
