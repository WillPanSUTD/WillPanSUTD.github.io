// GCMA6D schematic: segment and crop the object from the RGB-D frame ->
// colour branch (ResNet18 + PSP + Large Kernel Attention) -> geometry branch (3DGCN + PointNet) ->
// CMA-Net (two cross-attentions with Q/K/V from F1, F2, F3, then SE reweighting, concat) ->
// pixel-wise fusion + global feature -> per-pixel pose and confidence, most confident pose refined.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A PoseCNN segmentation network finds the object in the RGB image. Its mask crops the colour patch and cuts the object out of the depth map, which the camera intrinsics turn into a 3D point cloud.",
        "Colour branch: ResNet18 and a pyramid pooling module extract multi-scale features. Large Kernel Attention (depth-wise conv, depth-wise dilated conv, 1×1 conv) builds an attention map that multiplies the features, giving colour features F1.",
        "Geometry branch: 3DGCN applies learnable graph-convolution kernels to each point's neighbourhood, then graph max pooling, giving local geometric features F2. PointNet adds point features F3 and a global shape feature via max pooling.",
        "CMA-Net: one attention takes Q, K, V from F1, F2, F3 to enhance the colour features; a second takes them from F2, F1, F3 to enhance the point features. A Squeeze-and-Excitation module reweights the channels, and the results are concatenated.",
        "The fused features of each pixel are joined with a global feature (MLP + average pooling). Every pixel predicts a rotation, a translation and a confidence; the most confident pose is kept and refined iteratively.",
      ],
      rgbd: "RGB-D frame", mask: "mask", rgbCrop: "RGB crop", depthCrop: "depth crop", cloud: "point cloud",
      intr: "intrinsics",
      crop: "crop", psp: "PSP", lka: "Large Kernel Attention", dw: "DW conv", dwd: "DW-D conv", pw: "1×1 conv",
      attn: "attention", colour: "colour",
      graph: "neighbourhood graph", gmax: "graph max-pool", local: "local", pnet: "PointNet", mpool: "max-pool",
      global: "global",
      se: "SE", concat: "concat",
      fused: "per-pixel fused features", glob: "global", mlp: "MLP + avg pool", conf: "confidence c",
      best: "max c", pose: "R, t", refine: "refine", predictor: "pose",
    },
    zh: {
      steps: [
        "PoseCNN 语义分割网络在 RGB 图像中找出目标物体；用其掩码裁剪出彩色图像块，并从深度图中抠出物体区域，再借助相机内参转换为三维点云。",
        "颜色分支：ResNet18 与金字塔池化模块提取多尺度特征；大核注意力（深度卷积、深度空洞卷积、1×1 卷积）生成注意力图，与特征逐元素相乘，得到颜色特征 F1。",
        "几何分支：3DGCN 在每个点的邻域上施加可学习的图卷积核，再经图最大池化，得到局部几何特征 F2；PointNet 提供点特征 F3，并通过最大池化得到全局形状特征。",
        "CMA-Net：第一次注意力以 F1、F2、F3 作为 Q、K、V，增强颜色特征；第二次以 F2、F1、F3 作为 Q、K、V，增强点云特征。随后由 SE 模块对通道重新加权，再拼接在一起。",
        "每个像素的融合特征再与全局特征（MLP + 平均池化）拼接。每个像素都预测旋转、平移和置信度，保留置信度最高的位姿，并进行迭代精化。",
      ],
      rgbd: "RGB-D 图像", mask: "掩码", rgbCrop: "RGB 图像块", depthCrop: "深度图块", cloud: "点云",
      intr: "相机内参",
      crop: "图像块", psp: "PSP", lka: "大核注意力", dw: "深度卷积", dwd: "深度空洞卷积", pw: "1×1 卷积",
      attn: "注意力图", colour: "颜色",
      graph: "邻域图", gmax: "图最大池化", local: "局部", pnet: "PointNet", mpool: "最大池化",
      global: "全局",
      se: "SE", concat: "拼接",
      fused: "逐像素融合特征", glob: "全局", mlp: "MLP + 平均池化", conf: "置信度 c",
      best: "最大 c", pose: "R, t", refine: "精化", predictor: "位姿",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal feature colours (as in the paper's figures): colour F1, 3DGCN F2, PointNet F3, global feature.
  const C1 = "#4a6fb3";
  const C2 = "#1a9a9c";
  const C3 = "#d2702a";
  const CG = "#5b8f3a";

  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6, head: 9 });
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  // --- Object (a duck-like toy, local units) and its sampled surface points -----------------
  const inBody = (x, y) => ((x + 6) / 34) ** 2 + ((y - 8) / 22) ** 2 <= 1;
  const inHead = (x, y) => (x - 20) ** 2 + (y + 20) ** 2 <= 14 * 14;
  const inObj = (x, y) => inBody(x, y) || inHead(x, y);
  const objPath = (cx, cy, s) => {
    const pts = [];
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      pts.push([cx + s * (-6 + 34 * Math.cos(a)), cy + s * (8 + 22 * Math.sin(a))]);
    }
    const body = "M" + pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L") + "Z";
    const r = 14 * s;
    const hx = cx + 20 * s, hy = cy - 20 * s;
    return `${body} M${(hx - r).toFixed(1)},${hy.toFixed(1)} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
  };
  const rnd = kit.rng(7);
  const cloud = [];
  for (let y = -34; y <= 30; y += 7) {
    for (let x = -40; x <= 34; x += 7) {
      const px = x + (rnd() - 0.5) * 4, py = y + (rnd() - 0.5) * 4;
      if (inObj(px, py)) cloud.push({ x: px, y: py, d: rnd() });
    }
  }
  const centre = cloud.reduce((b, p) => (Math.hypot(p.x + 8, p.y - 6) < Math.hypot(b.x + 8, b.y - 6) ? p : b));
  const nbrs = cloud
    .filter((p) => p !== centre)
    .sort((a, b) => Math.hypot(a.x - centre.x, a.y - centre.y) - Math.hypot(b.x - centre.x, b.y - centre.y))
    .slice(0, 6);
  const P = (p, cx, cy, s) => [cx + p.x * s, cy + p.y * s];
  const conf = [0.42, 0.66, 0.5, 0.92, 0.58, 0.35]; // schematic per-pixel confidences
  const best = conf.indexOf(Math.max(...conf));

  // --- Small drawing helpers --------------------------------------------------------------
  const box = (g, x, y, w, h, label, o = {}) => {
    kit.svg("rect", {
      x, y, width: w, height: h, rx: 6, fill: o.fill ?? bg, stroke: o.stroke ?? body,
      "stroke-width": o.sw ?? 1.6, opacity: o.opacity ?? 1, ...(o.dash && { "stroke-dasharray": o.dash }),
    }, g);
    if (label) text(g, x + w / 2, y + h / 2 + 6, label, { size: o.size ?? 17, opacity: o.opacity ?? 1, fill: o.tfill ?? ink, halo: false });
  };
  const fbar = (g, x, y, w, h, colour, label, opacity = 1, below = false) => {
    kit.svg("rect", { x, y, width: w, height: h, rx: 3, fill: colour, opacity }, g);
    if (label) text(g, x + w / 2, below ? y + h + 22 : y - 8, label, { size: 18, weight: 600, opacity });
  };
  const sub = (g, x, y, base, s, o = {}) => {
    // "F" + subscript digit, subscript kept >= 14 units.
    const size = o.size ?? 18;
    const t = text(g, x, y, base, { size, weight: 600, opacity: o.opacity, fill: o.fill, halo: o.halo });
    const ts = kit.svg("tspan", { "font-size": Math.max(14, Math.round(size * 0.8)), dy: 4 }, t);
    ts.textContent = s;
    return t;
  };
  const runs = (g, x, y, parts, o = {}) => {
    // Text built from [str, "sub" | "sup" | undefined] runs; sub/superscripts kept >= 14 units.
    const size = o.size ?? 18;
    const small = Math.max(14, Math.round(size * 0.8));
    const t = text(g, x, y, "", { size, opacity: o.opacity, fill: o.fill, halo: o.halo });
    let shift = 0;
    for (const [str, kind] of parts) {
      const want = kind === "sub" ? 5 : kind === "sup" ? -7 : 0;
      const ts = kit.svg("tspan", { dy: want - shift, ...(kind && { "font-size": small }) }, t);
      ts.textContent = str;
      shift = want;
    }
    return t;
  };
  const cloudDots = (g, cx, cy, s, o = {}) => {
    for (const p of cloud) {
      const [x, y] = P(p, cx, cy, s);
      kit.svg("circle", { cx: x, cy: y, r: o.r ?? 3, fill: o.fill ?? accent, opacity: (o.opacity ?? 1) * (o.alpha ? o.alpha(p) : 1) }, g);
    }
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
        // RGB-D frame with three objects; the mask isolates the duck-like target.
        text(g, 128, 50, L.rgbd, { weight: 600 });
        box(g, 24, 64, 208, 176, "", { fill: "none" });
        const fade = 1 - 0.7 * e;
        kit.svg("rect", { x: 46, y: 100, width: 54, height: 72, rx: 4, fill: mute, opacity: 0.55 * fade }, g);
        kit.svg("ellipse", { cx: 196, cy: 196, rx: 20, ry: 26, fill: mute, opacity: 0.55 * fade }, g);
        kit.svg("path", { d: objPath(140, 168, 1), fill: accent, opacity: 0.85, "fill-rule": "nonzero" }, g);
        kit.svg("rect", { x: 96, y: 128, width: 84, height: 74, rx: 4, fill: "none", stroke: ink, "stroke-width": 1.8, "stroke-dasharray": "5 4", opacity: e }, g);
        text(g, 138, 270, L.mask, { size: 18, opacity: e, fill: accent, weight: 600 });
        line(g, [138, 254], [138, 206], { stroke: accent, w: 1.2, opacity: e, dash: "3 3" });

        // Crops.
        const c1 = seg01(t, 0.15, 0.6);
        arrow(g, [236, 120], [236 + 44 * c1, 104], { opacity: c1 });
        arrow(g, [236, 200], [236 + 44 * c1, 214], { opacity: c1 });
        box(g, 288, 64, 116, 82, "", { fill: "none", opacity: c1 });
        kit.svg("path", { d: objPath(352, 112, 0.85), fill: accent, opacity: 0.85 * c1 }, g);
        text(g, 346, 168, L.rgbCrop, { size: 17, opacity: c1 });
        box(g, 288, 190, 116, 82, "", { fill: "none", opacity: c1 });
        kit.svg("path", { d: objPath(352, 238, 0.85), fill: body, opacity: 0.6 * c1 }, g);
        text(g, 346, 294, L.depthCrop, { size: 17, opacity: c1 });

        // Back-projection to a point cloud.
        const c2 = seg01(t, 0.45, 1);
        arrow(g, [410, 231], [410 + 50 * c2, 210], { opacity: c2 });
        text(g, 440, 252, L.intr, { size: 15, fill: body, opacity: c2 });
        cloudDots(g, 556, 176, 1.25, { opacity: c2, r: 3.2 });
        text(g, 556, 262, L.cloud, { weight: 600, opacity: c2 });
      }

      if (i === 1) {
        // Colour branch: crop -> ResNet18 -> PSP -> LKA (DW, DW-D, 1x1 -> attention map) x features -> F1.
        const y0 = 130;
        box(g, 14, 90, 76, 80, "", { fill: "none" });
        kit.svg("path", { d: objPath(54, 134, 0.62), fill: accent, opacity: 0.85 }, g);
        text(g, 52, 194, L.crop, { size: 16, fill: body });
        arrow(g, [92, y0], [114, y0]);
        kit.svg("path", { d: `M116 90 L196 104 L196 156 L116 170 Z`, fill: bg, stroke: body, "stroke-width": 1.6 }, g);
        text(g, 156, y0 + 6, "ResNet18", { size: 16, halo: false });
        arrow(g, [198, y0], [218, y0]);
        box(g, 220, y0 - 24, 50, 48, L.psp, { size: 16 });

        const a1 = seg01(t, 0, 0.45);
        const a2 = seg01(t, 0.25, 0.7);
        const a3 = seg01(t, 0.5, 0.95);
        // LKA group (title below the dashed frame)
        box(g, 290, 92, 216, 230, "", { fill: "none", dash: "6 5", stroke: mute });
        text(g, 398, 346, L.lka, { size: 18, weight: 600, fill: accent });
        line(g, [272, y0], [282, y0], {});
        arrow(g, [282, y0], [306, y0]);
        box(g, 308, 111, 108, 38, L.dw, { size: 16, opacity: a1 });
        box(g, 308, 182, 108, 38, L.dwd, { size: 16, opacity: a2 });
        box(g, 308, 253, 108, 38, L.pw, { size: 16, opacity: a3 });
        arrow(g, [362, 151], [362, 180], { opacity: a2 });
        arrow(g, [362, 222], [362, 251], { opacity: a3 });
        // attention map from the 1x1 conv into the multiply node
        const mx = 468, my = y0;
        arrow(g, [418, 272], [mx, 272], { opacity: a3 });
        line(g, [mx, 272], [mx, my + 16], { opacity: a3 });
        text(g, 440, 306, L.attn, { size: 15, fill: body, opacity: a3 });
        // identity path: the PSP features bypass the convolutions and meet the attention map
        line(g, [282, y0], [282, 72], { stroke: mute, dash: "4 4" });
        line(g, [282, 72], [mx, 72], { stroke: mute, dash: "4 4" });
        arrow(g, [mx, 72], [mx, my - 16], { stroke: mute, dash: "4 4" });
        kit.svg("circle", { cx: mx, cy: my, r: 14, fill: bg, stroke: ink, "stroke-width": 1.8 }, g);
        text(g, mx, my + 7, "×", { size: 22, weight: 700, halo: false });
        // F1 output
        const a4 = seg01(t, 0.7, 1);
        arrow(g, [mx + 16, my], [mx + 16 + 50 * a4, my], { opacity: a4 });
        fbar(g, 546, 74, 26, 112, C1, "", a4);
        sub(g, 559, 62, "F", "1", { opacity: a4 });
        text(g, 559, 210, L.colour, { size: 16, fill: body, opacity: a4 });
      }

      if (i === 2) {
        // Geometry branch: neighbourhood graph -> 3DGCN -> graph max-pool -> F2 ; PointNet -> F3 (+ global).
        const cx = 118, cy = 186, sc = 2.1;
        cloudDots(g, cx, cy, sc, { alpha: (p) => (p === centre || nbrs.includes(p) ? 1 : 0.35), r: 3.4 });
        const c = P(centre, cx, cy, sc);
        const gE = seg01(t, 0, 0.5);
        for (const n of nbrs) line(g, c, mix(c, P(n, cx, cy, sc), gE), { stroke: C2, w: 2.2 });
        kit.svg("circle", { cx: c[0], cy: c[1], r: 30 * gE + 1, fill: "none", stroke: C2, "stroke-width": 1.4, "stroke-dasharray": "4 3" }, g);
        kit.svg("circle", { cx: c[0], cy: c[1], r: 5.5, fill: C2, stroke: ink, "stroke-width": 1.6 }, g);
        text(g, cx, 300, L.graph, { size: 16, fill: C2, opacity: gE, weight: 600 });

        // Upper path: 3DGCN
        const u = seg01(t, 0.25, 0.75);
        arrow(g, [204, 140], [262, 112], { opacity: u, stroke: C2 });
        box(g, 266, 88, 100, 44, "3DGCN", { size: 17, opacity: u });
        arrow(g, [368, 110], [394, 110], { opacity: u });
        box(g, 390, 88, 128, 44, L.gmax, { size: 15, opacity: u });
        arrow(g, [520, 110], [536, 110], { opacity: u });
        fbar(g, 540, 66, 24, 90, C2, "", u);
        sub(g, 584, 106, "F", "2", { opacity: u });
        text(g, 594, 132, L.local, { size: 15, fill: body, opacity: u });

        // Lower path: PointNet
        const d = seg01(t, 0.5, 1);
        arrow(g, [cx + 80, 232], [262, 252], { opacity: d });
        box(g, 266, 230, 100, 44, L.pnet, { size: 16, opacity: d });
        arrow(g, [368, 252], [536, 252], { opacity: d });
        fbar(g, 540, 208, 24, 90, C3, "", d);
        sub(g, 584, 250, "F", "3", { opacity: d });
        arrow(g, [452, 252], [452, 300], { opacity: d });
        box(g, 396, 302, 112, 36, L.mpool, { size: 15, opacity: d });
        text(g, 556, 326, L.global, { size: 15, fill: body, opacity: d });
        line(g, [510, 320], [528, 320], { opacity: d });
      }

      if (i === 3) {
        // CMA-Net: two cross-attentions and SE reweighting.
        const inY = { F1: 82, F2: 182, F3: 282 };
        const col = { F1: C1, F2: C2, F3: C3 };
        for (const k of ["F1", "F2", "F3"]) {
          fbar(g, 24, inY[k] - 22, 54, 44, col[k], "", 0.9);
          sub(g, 51, inY[k] + 6, "F", k[1], { fill: "#ffffff", halo: false });
        }
        const blocks = [
          { y: 54, q: "F1", k: "F2", v: "F3", out: 1 },
          { y: 196, q: "F2", k: "F1", v: "F3", out: 2 },
        ];
        blocks.forEach((b, bi) => {
          const u = seg01(t, bi * 0.25, 0.5 + bi * 0.25);
          const x0 = 214, w = 128, h = 110;
          box(g, x0, b.y, w, h, "", { opacity: Math.max(0.25, u) });
          text(g, x0 + w / 2 + 10, b.y + 50, "softmax", { size: 16, opacity: Math.max(0.25, u), halo: false });
          runs(g, x0 + w / 2 + 10, b.y + 76, [["(QK"], ["T", "sup"], ["/√d)·V"]], { size: 18, opacity: Math.max(0.25, u), halo: false });
          ["q", "k", "v"].forEach((r, ri) => {
            const py = b.y + 22 + ri * 33;
            text(g, x0 + 14, py + 6, r.toUpperCase(), { size: 15, weight: 600, opacity: Math.max(0.25, u), halo: false });
            const src = b[r];
            const from = [80, inY[src]];
            const mid = [140 + ri * 14 + bi * 6, inY[src]];
            const mid2 = [140 + ri * 14 + bi * 6, py];
            line(g, from, mid, { stroke: col[src], w: 2, opacity: u });
            line(g, mid, mid2, { stroke: col[src], w: 2, opacity: u });
            arrow(g, mid2, [x0 - 2, py], { stroke: col[src], w: 2, opacity: u, head: 7 });
          });
          // output
          arrow(g, [x0 + w + 2, b.y + h / 2], [384, b.y + h / 2], { opacity: u });
          fbar(g, 386, b.y + h / 2 - 18, 36, 36, b.out === 1 ? C1 : C2, "", u);
          sub(g, 400, b.y + h / 2 - 28, "F", `out${b.out}`, { size: 17, opacity: u });
        });
        // F3 skip into SE
        const v = seg01(t, 0.55, 1);
        line(g, [80, 300], [80, 330], { stroke: C3, w: 2, opacity: v });
        line(g, [80, 330], [446, 330], { stroke: C3, w: 2, opacity: v });
        arrow(g, [446, 330], [446, 278], { stroke: C3, w: 2, opacity: v });
        arrow(g, [424, 109], [434, 140], { opacity: v });
        arrow(g, [424, 251], [434, 226], { opacity: v });
        box(g, 432, 140, 34, 136, L.se, { size: 16, opacity: v });
        // Concatenated, reweighted output: segment heights follow SE weights.
        const w8 = [0.9, 1, 0.75];
        let yy = 92;
        arrow(g, [468, 208], [522, 208], { opacity: v });
        [C1, C2, C3].forEach((cc, k) => {
          const h = 58 * (1 - v * (1 - w8[k]));
          kit.svg("rect", { x: 526, y: yy, width: 30, height: h - 3, fill: cc, opacity: v }, g);
          yy += h;
        });
        text(g, 541, 80, L.concat, { size: 16, opacity: v, weight: 600 });
      }

      if (i === 4) {
        // Dense fusion + global feature -> per-pixel pose (R_i, t_i, c_i) -> argmax c -> refinement.
        const n = 6, x0 = 34, dx = 34, top = 96;
        const gU = seg01(t, 0, 0.45);
        text(g, 128, 34, L.fused, { size: 16, weight: 600 });
        for (let k = 0; k < n; k++) {
          const x = x0 + k * dx;
          [C1, C2, C3].forEach((cc, j) => kit.svg("rect", { x, y: top + j * 34, width: 22, height: 32, fill: cc, opacity: 0.9 }, g));
          kit.svg("rect", { x, y: top + 3 * 34, width: 22, height: 32, fill: CG, opacity: gU }, g);
        }
        // MLP + avg pool -> global feature
        box(g, 30, 284, 196, 36, L.mlp, { size: 15, opacity: gU });
        arrow(g, [128, top + 3 * 34 + 36], [128, 280], { opacity: gU, head: 7 });
        text(g, x0 + n * dx + 6, top + 3 * 34 + 22, L.glob, { size: 15, fill: CG, anchor: "start", opacity: gU, weight: 600 });

        // confidence bars above the columns
        const cU = seg01(t, 0.3, 0.75);
        for (let k = 0; k < n; k++) {
          const x = x0 + k * dx;
          const h = 26 * conf[k] * cU;
          kit.svg("rect", { x: x + 4, y: top - 8 - h, width: 14, height: h, fill: k === best ? accent : mute }, g);
        }
        text(g, x0 + best * dx + 11, 58, L.best, { size: 15, fill: accent, weight: 600, opacity: cU });
        text(g, x0 + n * dx + 4, 84, L.conf, { size: 15, fill: body, anchor: "start", opacity: cU });

        // Pose predictor and refinement on the object.
        const pU = seg01(t, 0.5, 1);
        arrow(g, [256, 190], [300, 190], { opacity: cU });
        box(g, 302, 162, 96, 56, L.predictor, { size: 16, opacity: cU });
        runs(g, 350, 242, [["R"], ["i", "sub"], [", t"], ["i", "sub"], [", c"], ["i", "sub"]], { size: 18, fill: body, opacity: cU });
        arrow(g, [400, 190], [440, 190], { opacity: pU });
        // object outline (true pose) and model points moving from a coarse to the refined pose
        const ox = 536, oy = 190, sc = 1.6;
        kit.svg("path", { d: objPath(ox, oy, sc), fill: mute, opacity: 0.35 }, g);
        const off = 1 - pU;
        const ang = (14 * off * Math.PI) / 180;
        for (const p of cloud) {
          const xr = p.x * Math.cos(ang) - p.y * Math.sin(ang);
          const yr = p.x * Math.sin(ang) + p.y * Math.cos(ang);
          kit.svg("circle", { cx: ox + 16 * off + xr * sc, cy: oy - 10 * off + yr * sc, r: 2.8, fill: accent, opacity: 0.4 + 0.5 * pU }, g);
        }
        text(g, ox, 292, `${L.pose} · ${L.refine}`, { size: 17, weight: 600, opacity: pU });
        // small loop arrow for iterative refinement
        kit.svg("path", { d: `M${ox + 52} 108 a16 16 0 1 1 -10 -14`, fill: "none", stroke: body, "stroke-width": 1.6, opacity: pU }, g);
        kit.svg("polygon", { points: `${ox + 46},92 ${ox + 36},90 ${ox + 42},100`, fill: body, opacity: pU }, g);
      }
    },
  });
}
