// FS6D schematic: detect + crop ROI -> viewpoint encoder retrieves top-K views from a
// 4,000-view codebook -> in-plane rotation regression per candidate -> orientation
// verification picks the best rotation -> translation regressed from dense geometric maps.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "An object detector finds the object in the RGB image and crops a 128×128 region of interest (ROI). Rotation and translation are then estimated separately from this crop.",
        "A viewpoint encoder, trained only on synthetic images, turns the ROI into a 64-dimensional vector v. Cosine similarity against a codebook of 4,000 views rendered from the object's mesh retrieves the top-K candidate viewpoints.",
        "For each candidate, an in-plane regressor compares the ROI with the rendered view and predicts the rotation about the camera's optical axis. Combining the two gives a full 3D rotation hypothesis.",
        "An orientation verification head scores how consistent each rotation hypothesis is with the ROI; the highest-scoring one is kept as the rotation.",
        "Translation branch, built on GDR-Net: from the ROI, ResNet-34 predicts 64×64 geometric maps, and a light network regresses the scale-invariant translation from the 2D–3D and surface-region maps. It needs only 600 real images per object.",
      ],
      image: "RGB image", det: "detector", roi: "ROI 128×128", enc: "viewpoint", enc2: "encoder",
      vec: "64-d", book: "codebook · 4,000 views", topk: "top-K", cos: "cosine",
      inplane: "in-plane θ", score: "consistency score", keep: "kept",
      maps: ["2D–3D", "SRA", "mask"], reg: ["translation", "regression"], pose: "6D pose",
    },
    zh: {
      steps: [
        "目标检测器在 RGB 图像中找到物体，并裁剪出 128×128 的感兴趣区域（ROI）。随后，旋转和平移分别基于该区域独立估计。",
        "视角编码器仅用合成图像训练，把 ROI 编码为 64 维向量 v；与由物体网格渲染的 4,000 个视角组成的码本计算余弦相似度，检索出前 K 个候选视角。",
        "对每个候选视角，平面内旋转回归模块比较 ROI 与该视角的渲染图，预测绕相机光轴的旋转；两者组合得到一个完整的三维旋转假设。",
        "姿态验证模块为每个旋转假设计算与 ROI 的一致性分数，保留得分最高的假设作为旋转估计。",
        "平移分支基于 GDR-Net：ResNet-34 从 ROI 预测 64×64 的几何特征图，再由轻量网络根据 2D–3D 对应图和表面区域注意力图回归尺度不变的平移参数。该分支每个物体只需 600 张真实图像。",
      ],
      image: "RGB 图像", det: "检测器", roi: "ROI 128×128", enc: "视角", enc2: "编码器",
      vec: "64 维", book: "码本 · 4,000 个视角", topk: "前 K 个", cos: "余弦相似度",
      inplane: "平面内 θ", score: "一致性分数", keep: "保留",
      maps: ["2D–3D", "SRA", "掩膜"], reg: ["平移", "回归"], pose: "6D 位姿",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal colours, only for the schematic geometric feature maps.
  const C = ["#3b6fd8", "#36a37e", "#d9822b", "#b0457a"];
  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: body, width: 1.6 });
  const rnd = kit.rng(7);
  const rad = (d) => (d * Math.PI) / 180;

  // ---- A small asymmetric 3D object (two stacked boxes), orthographic view ----
  const box = (x0, x1, y0, y1, z0, z1) => {
    const v = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) v.push([x, y, z]);
    // vertex index = xi*4 + yi*2 + zi
    return [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]].map((f) => f.map((k) => v[k]));
  };
  // object frame: y is up
  const centroid = (f) => f.reduce((s, p) => [s[0] + p[0] / f.length, s[1] + p[1] / f.length, s[2] + p[2] / f.length], [0, 0, 0]);
  const BOXES = [box(-1.2, 1.2, -0.75, 0.05, -0.7, 0.7), box(0.2, 1.2, 0.05, 0.85, -0.7, 0.7)].map((faces) => {
    const c = centroid(faces.flat());
    // outward normal of each face (fixes the winding once, in object space)
    return { c, faces: faces.map((f) => ({ f, n: centroid(f).map((v, k) => v - c[k]) })) };
  });
  const rot = (p, { az, el, th }) => {
    // R = Rθ (about the optical axis) · Rγ (viewpoint: azimuth about object up, then elevation)
    let [x, y, z] = p;
    const a = rad(az), b = rad(el), c = rad(th);
    [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
    [y, z] = [y * Math.cos(b) - z * Math.sin(b), y * Math.sin(b) + z * Math.cos(b)];
    [x, y] = [x * Math.cos(c) - y * Math.sin(c), x * Math.sin(c) + y * Math.cos(c)];
    return [x, y, z];
  };
  const drawObj = (g, cx, cy, s, pose, { opacity = 1, stroke = ink } = {}) => {
    // back-face culling per convex box. The two boxes are separated by the plane y = 0.05
    // (the top box sits on it), so whichever side faces the viewer is drawn last.
    const fs = [];
    const order = rot([0, 1, 0], pose)[2] > 0 ? BOXES : [BOXES[1], BOXES[0]];
    for (const b of order) {
      for (const { f, n: n0 } of b.faces) {
        const n = rot(n0, pose);
        const len = Math.hypot(...n) || 1;
        if (n[2] / len <= 0.01) continue;
        fs.push({ r: f.map((p) => rot(p, pose)), n: n.map((q) => q / len) });
      }
    }
    for (const f of fs) {
      const shade = 0.18 + 0.55 * Math.abs(f.n[2] * 0.8 + f.n[1] * 0.45);
      const d = f.r.map((p, k) => `${k ? "L" : "M"}${(cx + p[0] * s).toFixed(1)} ${(cy - p[1] * s).toFixed(1)}`).join(" ") + "Z";
      kit.svg("path", { d, fill: bg, stroke: "none", opacity }, g);
      kit.svg("path", { d, fill: accent, "fill-opacity": shade, stroke, "stroke-width": 1.3, "stroke-linejoin": "round", opacity }, g);
    }
  };
  const TRUE = { az: 35, el: 25, th: 28 };
  const CAND = [
    { az: 32, el: 22, th: 27, score: 0.9 },
    { az: 62, el: 34, th: 12, score: 0.58 },
    { az: 215, el: 24, th: 118, score: 0.33 },
  ];

  // Panels
  const roiPanel = (g, cx, cy, size, sc, opacity = 1) => {
    kit.svg("rect", { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: 4, fill: bg, stroke: body, "stroke-width": 1.4, opacity }, g);
    drawObj(g, cx, cy + size * 0.04, sc, TRUE, { opacity });
  };
  const synPanel = (g, cx, cy, size, sc, pose, opacity = 1) => {
    kit.svg("rect", { x: cx - size / 2, y: cy - size / 2, width: size, height: size, rx: 4, fill: rule, opacity }, g);
    drawObj(g, cx, cy, sc, pose, { opacity });
  };
  // Text with subscript/superscript tspans: parts = ["R", ["θ", "sub"], ...]
  const rich = (g, x, y, parts, { size = 20, fill = ink, anchor = "middle", opacity = 1 } = {}) => {
    const n = kit.text(g, x, y, "", { size, fill, anchor, opacity, halo: true });
    for (const p of parts) {
      if (typeof p === "string") { kit.svg("tspan", {}, n).textContent = p; continue; }
      const sz = Math.max(14, Math.round(size * 0.8));
      const t = kit.svg("tspan", { "baseline-shift": p[1] === "sub" ? "sub" : "super", "font-size": sz }, n);
      t.textContent = p[0];
    }
    return n;
  };

  // Scene clutter for step 1 (built once)
  const clutter = Array.from({ length: 9 }, () => ({
    x: 50 + rnd() * 250, y: 75 + rnd() * 210, w: 16 + rnd() * 26, h: 12 + rnd() * 22, round: rnd() > 0.5,
  })).filter((c) => Math.hypot(c.x - 205, c.y - 200) > 62);
  // Codebook sphere dots (Fibonacci sphere, a visual stand-in for the 4,000 sampled views)
  const DOTS = [];
  const ND = 260;
  for (let k = 0; k < ND; k++) {
    const y = 1 - (2 * (k + 0.5)) / ND, r = Math.sqrt(1 - y * y), ph = k * 2.399963;
    DOTS.push([Math.cos(ph) * r, y, Math.sin(ph) * r]);
  }
  const tilt = (p) => { const b = rad(-20); return [p[0], p[1] * Math.cos(b) - p[2] * Math.sin(b), p[1] * Math.sin(b) + p[2] * Math.cos(b)]; };
  const viewDot = (c) => tilt([Math.sin(rad(c.az)) * Math.cos(rad(c.el)), Math.sin(rad(c.el)), Math.cos(rad(c.az)) * Math.cos(rad(c.el))]);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        kit.svg("rect", { x: 30, y: 60, width: 300, height: 250, rx: 6, fill: bg, stroke: body, "stroke-width": 1.4 }, g);
        for (const c of clutter) {
          if (c.round) kit.svg("ellipse", { cx: c.x, cy: c.y, rx: c.w / 2, ry: c.h / 2, fill: mute, opacity: 0.35 }, g);
          else kit.svg("rect", { x: c.x - c.w / 2, y: c.y - c.h / 2, width: c.w, height: c.h, rx: 3, fill: mute, opacity: 0.35 }, g);
        }
        drawObj(g, 205, 205, 26, TRUE);
        const half = 20 + 30 * e;
        kit.svg("rect", { x: 205 - half, y: 202 - half, width: half * 2, height: half * 2, fill: "none", stroke: accent, "stroke-width": 2.2, "stroke-dasharray": "6 4", opacity: e }, g);
        text(g, 180, 44, L.image, { weight: 600 });
        text(g, 205, 202 - half - 10, L.det, { size: 18, fill: accent, opacity: e });
        arrow(g, [262, 202], [262 + 140 * e, 202], { w: 1.8, opacity: e });
        if (t > 0.3) {
          const o = Math.min(1, (t - 0.3) / 0.5);
          roiPanel(g, 500, 202, 170, 52, o);
          text(g, 500, 98, L.roi, { weight: 600, opacity: o });
        }
      }

      if (i === 1) {
        roiPanel(g, 70, 180, 96, 30);
        text(g, 70, 116, "ROI", { weight: 600 });
        arrow(g, [122, 180], [146, 180], {});
        kit.svg("path", { d: "M150 140 L216 158 L216 202 L150 220 Z", fill: rule, stroke: body, "stroke-width": 1.4 }, g);
        text(g, 183, 177, L.enc, { size: 16 });
        text(g, 183, 196, L.enc2, { size: 16 });
        arrow(g, [218, 180], [234, 180], {});
        for (let k = 0; k < 8; k++) {
          kit.svg("rect", { x: 238, y: 144 + k * 9, width: 12, height: 8, fill: k % 3 === 1 ? accent : mute, opacity: k % 3 === 1 ? 0.9 : 0.6 }, g);
        }
        rich(g, 244, 132, ["v"], { size: 20, fill: ink });
        text(g, 244, 238, L.vec, { size: 16, fill: body });
        // codebook sphere
        const SX = 400, SY = 182, SR = 92;
        kit.svg("circle", { cx: SX, cy: SY, r: SR, fill: "none", stroke: rule, "stroke-width": 1.4 }, g);
        for (const p of DOTS) {
          const q = tilt(p);
          kit.svg("circle", { cx: SX + q[0] * SR, cy: SY - q[1] * SR, r: 1.8, fill: mute, opacity: q[2] > 0 ? 0.85 : 0.25 }, g);
        }
        drawObj(g, SX, SY, 12, { az: 0, el: 0, th: 0 });
        text(g, SX, 54, L.book, { size: 18, weight: 600 });
        const hit = CAND.map((c) => { const q = viewDot(c); return [SX + q[0] * SR, SY - q[1] * SR]; });
        hit.forEach((h, k) => {
          line(g, [256, 180], [256 + (h[0] - 256) * e, 180 + (h[1] - 180) * e], { stroke: accent, w: 1.3, dash: "4 4", opacity: 0.7 });
          kit.svg("circle", { cx: h[0], cy: h[1], r: 3 + 3 * e, fill: accent, stroke: bg, "stroke-width": 1.2 }, g);
        });
        text(g, 300, 290, L.cos, { size: 16, fill: accent, opacity: e });
        // top-K thumbnails (in-plane rotation not yet known)
        CAND.forEach((c, k) => {
          const o = Math.max(0, Math.min(1, (t - 0.35 - k * 0.12) / 0.35));
          synPanel(g, 580, 92 + k * 90, 74, 18, { az: c.az, el: c.el, th: 0 }, o);
          if (o > 0) rich(g, 532, 98 + k * 90, ["R", ["γ", "sup"], ["" + (k + 1), "sub"]], { size: 18, opacity: o, anchor: "end" });
        });
        text(g, 580, 40, L.topk, { size: 18, weight: 600, opacity: e });
      }

      if (i === 2) {
        roiPanel(g, 82, 180, 120, 36);
        text(g, 82, 104, "ROI", { weight: 600 });
        rich(g, 82, 312, ["R = R", ["θ", "sup"], " R", ["γ", "sup"]], { size: 20 });
        text(g, 300, 36, L.inplane, { size: 18, weight: 600, fill: accent });
        CAND.forEach((c, k) => {
          const y = 92 + k * 92;
          synPanel(g, 230, y, 76, 19, { az: c.az, el: c.el, th: 0 });
          rich(g, 184, y + 6, ["R", ["γ", "sup"], ["" + (k + 1), "sub"]], { size: 18, anchor: "end" });
          arrow(g, [274, y], [334, y], {});
          rich(g, 304, y - 16, ["θ", ["" + (k + 1), "sub"]], { size: 18, fill: accent, opacity: e });
          synPanel(g, 384, y, 76, 19, { az: c.az, el: c.el, th: c.th * e });
          rich(g, 432, y + 6, ["R", ["est", "sup"], ["" + (k + 1), "sub"]], { size: 18, anchor: "start", opacity: e });
        });
      }

      if (i === 3) {
        roiPanel(g, 70, 180, 110, 33);
        text(g, 70, 110, "ROI", { weight: 600 });
        text(g, 420, 40, L.score, { size: 18, weight: 600 });
        const best = 0;
        CAND.forEach((c, k) => {
          const y = 92 + k * 92;
          const isBest = k === best;
          synPanel(g, 200, y, 76, 19, c);
          line(g, [128, 180], [160, y], { stroke: mute, w: 1.2, dash: "3 4" });
          kit.svg("rect", { x: 260, y: y - 13, width: 260, height: 26, rx: 3, fill: rule }, g);
          kit.svg("rect", { x: 260, y: y - 13, width: 260 * c.score * e, height: 26, rx: 3, fill: isBest ? accent : mute }, g);
          if (isBest && t > 0.6) {
            const o = Math.min(1, (t - 0.6) / 0.3);
            kit.svg("rect", { x: 160, y: y - 40, width: 80, height: 80, rx: 6, fill: "none", stroke: accent, "stroke-width": 2.6, opacity: o }, g);
            text(g, 540, y + 7, "✓ " + L.keep, { size: 18, anchor: "start", fill: accent, weight: 600, opacity: o });
          }
        });
      }

      if (i === 4) {
        roiPanel(g, 45, 180, 76, 22);
        text(g, 45, 128, "ROI", { weight: 600 });
        // ROI -> ResNet-34 -> bus feeding the three maps
        line(g, [85, 180], [156, 180], {});
        text(g, 117, 170, "ResNet-34", { size: 14, fill: body });
        line(g, [156, 86], [156, 274], { stroke: mute, w: 1.2 });
        // three 64×64 maps
        const MX = 192, MS = 60, ys = [86, 180, 274];
        ys.forEach((y, k) => {
          const o = Math.max(0, Math.min(1, (t - k * 0.15) / 0.4));
          const gm = kit.svg("g", { opacity: o }, g);
          kit.svg("rect", { x: MX - MS / 2, y: y - MS / 2, width: MS, height: MS, rx: 3, fill: "#000" }, gm);
          if (k === 0) {
            const N = 6;
            for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
              const u = (a + b) / (2 * N - 2);
              kit.svg("rect", { x: MX - MS / 2 + a * MS / N, y: y - MS / 2 + b * MS / N, width: MS / N + 0.4, height: MS / N + 0.4, fill: u < 0.5 ? C[0] : C[1], opacity: 0.35 + 0.65 * Math.abs(u - 0.5) * 2 }, gm);
            }
          } else {
            const blob = `M${MX - 20} ${y + 16} L${MX - 22} ${y - 4} L${MX - 6} ${y - 18} L${MX + 14} ${y - 14} L${MX + 22} ${y + 4} L${MX + 12} ${y + 18} Z`;
            if (k === 2) kit.svg("path", { d: blob, fill: "#fff" }, gm);
            else {
              const parts = [[MX - 22, y - 18, 22, 18], [MX, y - 18, 22, 18], [MX - 22, y, 22, 18], [MX, y, 22, 18]];
              parts.forEach((p, q) => kit.svg("rect", { x: p[0], y: p[1], width: p[2], height: p[3], fill: C[q], opacity: 0.9 }, gm));
              kit.svg("path", { d: `${blob} M${MX - 30} ${y - 30} h60 v60 h-60 Z`, fill: "#000", "fill-rule": "evenodd" }, gm);
            }
          }
          text(g, MX + MS / 2 + 8, y + 7, L.maps[k], { size: 17, anchor: "start", opacity: o });
          arrow(g, [156, y], [MX - MS / 2 - 2, y], { stroke: mute, w: 1.2, head: 6, opacity: o });
        });
        // regression box fed by 2D–3D and SRA only
        const RX = 318, RY = 140, RW = 100, RH = 80;
        const o2 = Math.max(0, Math.min(1, (t - 0.45) / 0.4));
        arrow(g, [294, 86], [RX - 4, RY + 16], { opacity: o2 });
        arrow(g, [270, 180], [RX - 4, RY + RH / 2 + 4], { opacity: o2 });
        kit.svg("rect", { x: RX, y: RY, width: RW, height: RH, rx: 8, fill: rule, stroke: body, "stroke-width": 1.4, opacity: o2 }, g);
        text(g, RX + RW / 2, RY + 35, L.reg[0], { size: 16, opacity: o2 });
        text(g, RX + RW / 2, RY + 57, L.reg[1], { size: 16, opacity: o2 });
        arrow(g, [RX + RW + 4, 180], [452, 180], { opacity: o2 });
        rich(g, 368, 252, ["t", ["SITE", "sub"], " = [δx, δy, δz]"], { size: 18, opacity: o2 });
        // final pose in the image
        const o3 = Math.max(0, Math.min(1, (t - 0.65) / 0.35));
        kit.svg("rect", { x: 458, y: 100, width: 162, height: 160, rx: 6, fill: bg, stroke: body, "stroke-width": 1.4, opacity: o3 }, g);
        drawObj(g, 539, 186, 30, TRUE, { opacity: o3 });
        text(g, 539, 88, L.pose, { weight: 600, opacity: o3 });
        rich(g, 539, 292, ["R", ["est", "sub"], " + t"], { size: 20, opacity: o3 });
      }
    },
  });
}
