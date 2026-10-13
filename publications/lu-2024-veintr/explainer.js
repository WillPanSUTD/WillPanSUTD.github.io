// VeinTr schematic:
// conventional pipelines crop a palm ROI and drop the vein pattern outside it ->
// VeinTr takes the full-hand image; conv blocks + 3 residual blocks give a 64×64×64 local feature map ->
// the map is cut into 16 patches of 16×16 and 3 multi-head attention layers relate every patch to every other ->
// a two-layer MLP decoder turns the global features into one 512-d hand vein feature V ->
// probe-to-database matching: C = argmax(D · ‖V‖).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Conventional hand-vein pipelines first locate the hand and crop a palm region of interest (ROI). Only the ROI is used, so the vein pattern in the fingers and thumb is thrown away, and accuracy depends on how well the crop is made.",
        "VeinTr takes the whole hand image as it is. Convolution blocks shrink the 256×256 image and extract local features; three residual blocks refine them into a 64×64×64 local feature map.",
        "The feature map is cut into 16 patches of 16×16. A lightweight transformer (3 attention layers, 8 heads) lets every patch attend to every other one, enlarging the receptive field to aggregate global features from the local ones.",
        "A global feature decoder flattens the attention output and passes it through a two-layer MLP with batch normalisation, giving one 512-dimensional hand vein feature V. Training uses the ArcFace loss.",
        "To identify a probe hand, its normalised feature is compared with every enrolled feature in the database matrix D; the identity with the highest score is the answer, C = argmax(D · ‖V‖).",
      ],
      conv: "Conventional: crop a palm ROI",
      roi: "ROI", roiOnly: "palm ROI only", lost: "finger veins discarded",
      full: "VeinTr: the full hand goes in",
      img: "256×256", convs: "conv ×2", res: "residual ×3", fmap: "64×64×64",
      local: "local features",
      patches: "16 patches (16×16)", every: "each patch attends", every2: "to all the others",
      layers: "3 layers · 8 heads", query: "query patch",
      dec: "Global feature decoder", flat: "flatten", mlp: "MLP + BN ×2", vec: "V: 512-d",
      arc: "trained with ArcFace loss",
      match: "C = argmax(D · ‖V‖)", probe: "probe", db: "database D", score: "score",
      ids: ["ID 1", "ID 2", "ID 3", "ID 4", "ID 5"],
    },
    zh: {
      steps: [
        "传统手部静脉识别流程先定位手部，再裁剪出手掌感兴趣区域（ROI），只用 ROI 提取特征。手指和拇指上的静脉纹路因此被丢弃，识别精度也取决于裁剪的质量。",
        "VeinTr 直接输入整幅手部图像。卷积块在提取局部特征的同时把 256×256 的图像缩小，再经三个残差块增强，得到 64×64×64 的局部特征图。",
        "特征图被切分为 16 个 16×16 的图块。轻量 Transformer（3 层注意力、8 个头）让每个图块与其余所有图块建立关联，从而扩大感受野，由局部特征聚合出全局特征。",
        "全局特征解码器将注意力输出展平，经过带批归一化的两层 MLP，得到一个 512 维的手部静脉特征 V。训练采用 ArcFace 损失。",
        "识别待测手（probe）时，将其归一化特征与数据库矩阵 D 中每个已注册特征比较，得分最高的身份即为结果：C = argmax(D · ‖V‖)。",
      ],
      conv: "传统方法：裁剪手掌 ROI",
      roi: "ROI", roiOnly: "仅保留手掌 ROI", lost: "手指静脉被丢弃",
      full: "VeinTr：整只手直接输入",
      img: "256×256", convs: "卷积 ×2", res: "残差块 ×3", fmap: "64×64×64",
      local: "局部特征",
      patches: "16 个图块（16×16）", every: "每个图块都与", every2: "其余图块计算注意力",
      layers: "3 层 · 8 个头", query: "查询图块",
      dec: "全局特征解码器", flat: "展平", mlp: "MLP + BN ×2", vec: "V：512 维",
      arc: "训练采用 ArcFace 损失",
      match: "C = argmax(D · ‖V‖)", probe: "待测手", db: "数据库 D", score: "得分",
      ids: ["ID 1", "ID 2", "ID 3", "ID 4", "ID 5"],
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: discarded vein information; the feature-encoder blocks.
  const LOST = "#c2410c";
  const CONV = "#b45309";

  const rnd = kit.rng(7);
  const clipId = `veintr-roi-${Math.floor(rnd() * 1e9)}`;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6, head: 9 });

  // --- Hand geometry (local units, palm centre near (0, 30)) -------------------
  const FINGERS = [
    { x: -46, y: -70, w: 20, h: 76 }, // index
    { x: -22, y: -85, w: 20, h: 91 }, // middle
    { x: 2, y: -78, w: 20, h: 84 },   // ring
    { x: 26, y: -55, w: 19, h: 61 },  // little
  ];
  const jit = () => (rnd() - 0.5) * 3;
  const VEINS = [
    [[0, 70], [-4, 45], [-18, 18], [-34, -8], [-36, -60]],
    [[-4, 45], [4, 15], [-10, -10], [-12, -75]],
    [[4, 15], [18, -5], [12, -68]],
    [[18, -5], [34, -18], [35, -45]],
    [[-18, 18], [-50, 26], [-80, 12]],
    [[14, 70], [26, 40], [38, 10]],
  ].map((v) => v.map(([x, y], k) => (k === 0 ? [x, y] : [x + jit(), y + jit()])));
  const ROI = { x: -42, y: -8, w: 84, h: 72 };

  const silhouette = (g, attrs) => {
    for (const f of FINGERS) kit.svg("rect", { x: f.x, y: f.y, width: f.w, height: f.h, rx: f.w / 2, ...attrs }, g);
    kit.svg("rect", { x: -10, y: -55, width: 20, height: 60, rx: 10, transform: "translate(-48,38) rotate(-55)", ...attrs }, g);
    kit.svg("rect", { x: -50, y: -15, width: 98, height: 85, rx: 18, ...attrs }, g);
  };
  const veins = (g, attrs) => {
    for (const v of VEINS) {
      kit.svg("polyline", {
        points: v.map((p) => p.join(",")).join(" "), fill: "none", "stroke-linejoin": "round", "stroke-linecap": "round",
        "vector-effect": "non-scaling-stroke", ...attrs,
      }, g);
    }
  };
  // Hand drawn at (tx, ty) with scale s; returns the inner (local-coordinate) group.
  const hand = (parent, tx, ty, s, { opacity = 1, veinOpacity = 1, veinWidth = 2.2 } = {}) => {
    const g = kit.svg("g", { transform: `translate(${tx},${ty}) scale(${s})`, opacity }, parent);
    silhouette(g, { fill: body, stroke: body, "stroke-width": 3, "vector-effect": "non-scaling-stroke" });
    silhouette(g, { fill: rule });
    if (veinOpacity > 0) veins(g, { stroke: accent, "stroke-width": veinWidth, opacity: veinOpacity });
    return g;
  };
  const toWorld = (tx, ty, s, x, y) => [tx + x * s, ty + y * s];

  // --- Step 4/5 data -------------------------------------------------------------
  const V = Array.from({ length: 10 }, () => 0.15 + 0.85 * rnd());
  const DB = Array.from({ length: 5 }, (_, r) =>
    V.map((v) => (r === 2 ? clamp01(v + (rnd() - 0.5) * 0.18) : 0.15 + 0.85 * rnd())));
  const cos = (a, b) => {
    const ma = a.reduce((s, x) => s + x - 0.5, 0) / a.length, mb = b.reduce((s, x) => s + x - 0.5, 0) / b.length;
    let d = 0, na = 0, nb = 0;
    a.forEach((x, k) => { const u = x - 0.5 - ma, w = b[k] - 0.5 - mb; d += u * w; na += u * u; nb += w * w; });
    return d / Math.sqrt(na * nb);
  };
  const SCORES = DB.map((row) => cos(V, row));
  const S_MAX = Math.max(...SCORES), S_MIN = Math.min(...SCORES);
  const BEST = SCORES.indexOf(S_MAX);
  const ATT = Array.from({ length: 16 }, () => 0.25 + 0.75 * rnd());

  const cells = (g, x, y, vals, { cw = 13, ch = 18, vertical = false, opacity = 1, fill = accent } = {}) => {
    vals.forEach((v, k) => {
      const cx = vertical ? x : x + k * cw, cy = vertical ? y + k * ch : y;
      kit.svg("rect", { x: cx, y: cy, width: cw, height: ch, fill: bg, stroke: body, "stroke-width": 1, opacity }, g);
      kit.svg("rect", { x: cx, y: cy, width: cw, height: ch, fill, opacity: opacity * (0.12 + 0.8 * v) }, g);
    });
  };
  const block = (g, x, y, w, h, colour, opacity) => {
    const d = 8;
    kit.svg("path", { d: `M${x} ${y} l${d} ${-d} h${w} v${h} l${-d} ${d} z`, fill: colour, opacity: 0.18 * opacity }, g);
    kit.svg("rect", { x, y, width: w, height: h, fill: colour, "fill-opacity": 0.28, stroke: colour, "stroke-width": 1.5, opacity }, g);
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const defs = kit.svg("defs", {}, s);
      const cp = kit.svg("clipPath", { id: clipId }, defs);
      kit.svg("rect", { x: ROI.x, y: ROI.y, width: ROI.w, height: ROI.h }, cp);

      if (i === 0) {
        text(g, 320, 36, L.conv, { weight: 600, size: 22 });
        const [tx, ty, sc] = [170, 200, 1.3];
        const h = hand(g, tx, ty, sc, { veinOpacity: 0 });
        veins(h, { stroke: accent, "stroke-width": 2.2, opacity: 1 - e });
        veins(h, { stroke: LOST, "stroke-width": 2, "stroke-dasharray": "4 4", opacity: 0.85 * e });
        const inner = kit.svg("g", { "clip-path": `url(#${clipId})` }, h);
        veins(inner, { stroke: accent, "stroke-width": 2.6 });
        kit.svg("rect", {
          x: ROI.x, y: ROI.y, width: ROI.w, height: ROI.h, fill: "none", stroke: ink, "stroke-width": 2,
          "stroke-dasharray": "6 4", "vector-effect": "non-scaling-stroke",
        }, h);
        const [rx, ry] = toWorld(tx, ty, sc, ROI.x + ROI.w, ROI.y + ROI.h / 2);
        const lab = toWorld(tx, ty, sc, 52, ROI.y + 6);
        text(g, lab[0], lab[1], L.roi, { size: 16, anchor: "start" });
        // Enlarged crop on the right.
        const S2 = 1.9, cx = 480, cy = 196;
        const crop = kit.svg("g", { opacity: e }, g);
        const z = kit.svg("g", { transform: `translate(${cx - (ROI.x + ROI.w / 2) * S2},${cy - (ROI.y + ROI.h / 2) * S2}) scale(${S2})` }, crop);
        const zi = kit.svg("g", { "clip-path": `url(#${clipId})` }, z);
        silhouette(zi, { fill: rule });
        veins(zi, { stroke: accent, "stroke-width": 2.6 });
        kit.svg("rect", {
          x: ROI.x, y: ROI.y, width: ROI.w, height: ROI.h, fill: "none", stroke: ink, "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
        }, z);
        arrow(g, [rx + 10, ry], [rx + 10 + (cx - ROI.w * S2 / 2 - 22 - rx) * e, ry - (ry - cy) * e], { w: 1.8 });
        text(crop, cx, cy + (ROI.h * S2) / 2 + 30, L.roiOnly, { size: 18 });
        text(g, tx - 10, 336, L.lost, { size: 18, fill: LOST, opacity: e, weight: 600 });
      }

      if (i === 1) {
        text(g, 320, 36, L.full, { weight: 600, size: 22 });
        const a = (k) => seg01(t, k * 0.18, k * 0.18 + 0.35);
        // Full-hand image.
        kit.svg("rect", { x: 24, y: 120, width: 120, height: 120, fill: ink, opacity: 0.9 }, g);
        hand(g, 84, 188, 0.58, { veinWidth: 1.6 });
        text(g, 84, 266, L.img, { size: 16, fill: body });
        // Two conv blocks.
        arrow(g, [150, 180], [176, 180], { opacity: a(0) });
        block(g, 182, 112, 22, 136, CONV, a(0));
        block(g, 222, 128, 20, 104, CONV, a(0));
        text(g, 216, 278, L.convs, { size: 16, opacity: a(0) });
        // Residual blocks.
        arrow(g, [250, 180], [276, 180], { opacity: a(1) });
        block(g, 282, 144, 64, 72, CONV, a(1));
        kit.svg("path", { d: "M300 222 v12 h28 v-12", fill: "none", stroke: CONV, "stroke-width": 1.4, opacity: a(1) }, g);
        text(g, 316, 278, L.res, { size: 16, opacity: a(1) });
        // Local feature map 64×64×64 (drawn as a stack with a coarse grid).
        arrow(g, [356, 180], [384, 180], { opacity: a(2) });
        const fm = kit.svg("g", { opacity: a(2) }, g);
        for (let k = 3; k >= 0; k--) {
          const o = k * 10;
          kit.svg("rect", { x: 400 + o, y: 110 - o, width: 140, height: 140, fill: bg, stroke: accent, "stroke-width": 1.4 }, fm);
        }
        for (let k = 1; k < 8; k++) {
          line(fm, [400 + k * 17.5, 110], [400 + k * 17.5, 250], { stroke: mute, w: 0.8 });
          line(fm, [400, 110 + k * 17.5], [540, 110 + k * 17.5], { stroke: mute, w: 0.8 });
        }
        const fh = hand(fm, 470, 192, 0.6, { veinWidth: 1.8, opacity: 0.55 });
        fh.setAttribute("opacity", 0.55);
        text(g, 485, 278, L.fmap, { size: 16, opacity: a(2) });
        text(g, 485, 310, L.local, { size: 18, weight: 600, opacity: a(2) });
      }

      if (i === 2) {
        const gx = 40, gy = 60, gs = 240, ps = gs / 4;
        hand(g, 188, 196, 1.3, { opacity: 0.85 });
        for (let k = 0; k <= 4; k++) {
          line(g, [gx + k * ps, gy], [gx + k * ps, gy + gs], { stroke: ink, w: 1.4, opacity: 0.8 });
          line(g, [gx, gy + k * ps], [gx + gs, gy + k * ps], { stroke: ink, w: 1.4, opacity: 0.8 });
        }
        const q = { r: 1, c: 1 };
        const qc = [gx + (q.c + 0.5) * ps, gy + (q.r + 0.5) * ps];
        kit.svg("rect", { x: gx + q.c * ps, y: gy + q.r * ps, width: ps, height: ps, fill: accent, opacity: 0.22 }, g);
        for (let k = 0; k < 16; k++) {
          const r = Math.floor(k / 4), c = k % 4;
          if (r === q.r && c === q.c) continue;
          const b = [gx + (c + 0.5) * ps, gy + (r + 0.5) * ps];
          const end = [qc[0] + (b[0] - qc[0]) * e, qc[1] + (b[1] - qc[1]) * e];
          line(g, qc, end, { stroke: accent, w: 1 + 3 * ATT[k], opacity: 0.35 + 0.55 * ATT[k] });
          kit.svg("circle", { cx: b[0], cy: b[1], r: 3 + 3 * ATT[k] * e, fill: accent, opacity: e }, g);
        }
        kit.svg("circle", { cx: qc[0], cy: qc[1], r: 7, fill: accent, stroke: bg, "stroke-width": 2 }, g);
        text(g, gx + gs / 2, gy + gs + 34, L.patches, { size: 18 });
        // Right-hand notes.
        const tx = 330;
        text(g, tx, 120, L.query, { anchor: "start", size: 18, fill: accent, weight: 600 });
        line(g, [tx - 6, 114], [qc[0] + 10, qc[1]], { stroke: accent, w: 1.2, dash: "4 4" });
        text(g, tx, 176, L.every, { anchor: "start", size: 20, opacity: e });
        text(g, tx, 204, L.every2, { anchor: "start", size: 20, opacity: e });
        // Stacked layer badges.
        for (let k = 2; k >= 0; k--) {
          kit.svg("rect", { x: tx + k * 8, y: 240 - k * 8, width: 190, height: 40, rx: 4, fill: bg, stroke: accent, "stroke-width": 1.4, opacity: e }, g);
        }
        text(g, tx + 95, 266, L.layers, { size: 18, opacity: e, weight: 600 });
      }

      if (i === 3) {
        text(g, 320, 36, L.dec, { weight: 600, size: 22 });
        // 4×4 token grid.
        const tg = { x: 24, y: 120, s: 120 };
        for (let k = 0; k < 16; k++) {
          const r = Math.floor(k / 4), c = k % 4;
          kit.svg("rect", { x: tg.x + c * 30, y: tg.y + r * 30, width: 30, height: 30, fill: accent, opacity: 0.12 + 0.6 * ATT[k], stroke: bg, "stroke-width": 2 }, g);
        }
        // Flatten into a column.
        const a1 = seg01(t, 0, 0.4), a2 = seg01(t, 0.3, 0.7), a3 = seg01(t, 0.6, 1);
        arrow(g, [152, 180], [190, 180], { opacity: a1 });
        text(g, 170, 104, L.flat, { size: 16, opacity: a1 });
        cells(g, 200, 84, ATT.map((v) => v * 0.9), { cw: 18, ch: 12, vertical: true, opacity: a1 });
        // MLP: two layers.
        const L1 = Array.from({ length: 7 }, (_, k) => [290, 108 + k * 24]);
        const L2 = Array.from({ length: 5 }, (_, k) => [370, 132 + k * 24]);
        for (let k = 0; k < 16; k += 3) for (const p of L1) line(g, [218, 90 + k * 12], p, { stroke: mute, w: 0.7, opacity: a2 * 0.8 });
        for (const p of L1) for (const q of L2) line(g, p, q, { stroke: mute, w: 0.7, opacity: a2 * 0.8 });
        for (const p of [...L1, ...L2]) kit.svg("circle", { cx: p[0], cy: p[1], r: 7, fill: bg, stroke: body, "stroke-width": 1.5, opacity: a2 }, g);
        text(g, 330, 292, L.mlp, { size: 16, opacity: a2 });
        // Output vector V.
        arrow(g, [384, 180], [440, 180], { opacity: a3 });
        cells(g, 452, 108, V.slice(0, 8), { cw: 18, ch: 18, vertical: true, opacity: a3 });
        text(g, 461, 292, L.vec, { size: 18, weight: 600, opacity: a3 });
        text(g, 320, 336, L.arc, { size: 16, fill: body, opacity: a3 });
      }

      if (i === 4) {
        text(g, 320, 36, L.match, { weight: 600, size: 22 });
        // Probe hand -> V
        kit.svg("rect", { x: 20, y: 132, width: 96, height: 96, fill: ink, opacity: 0.9 }, g);
        hand(g, 68, 186, 0.46, { veinWidth: 1.4 });
        text(g, 68, 254, L.probe, { size: 16 });
        arrow(g, [122, 180], [142, 180]);
        cells(g, 150, 171, V, { cw: 13, ch: 18 });
        text(g, 215, 160, "‖V‖", { size: 18, weight: 600 });
        // Database rows.
        const dx = 360, dy = 94, rh = 38;
        text(g, dx + 65, dy - 18, L.db, { size: 16 });
        text(g, 551, dy - 18, L.score, { size: 16 });
        DB.forEach((row, r) => {
          const y = dy + r * rh;
          const best = r === BEST;
          text(g, dx - 8, y + 15, L.ids[r], { size: 15, anchor: "end", fill: best && t > 0.7 ? ink : body, weight: best && t > 0.7 ? 700 : undefined });
          cells(g, dx, y, row, { cw: 13, ch: 18 });
          const len = (16 + 72 * (SCORES[r] - S_MIN) / (S_MAX - S_MIN)) * e;
          kit.svg("rect", { x: 506, y: y + 2, width: Math.max(0, len), height: 14, fill: best ? accent : mute, opacity: best ? 1 : 0.7 }, g);
          line(g, [284, 180], [dx - 46, y + 9], { stroke: mute, w: 1, opacity: 0.5 * e });
        });
        if (t > 0.7) {
          const y = dy + BEST * rh;
          kit.svg("rect", { x: dx - 50, y: y - 5, width: 290, height: 28, rx: 5, fill: "none", stroke: accent, "stroke-width": 2 }, g);
          text(g, 470, dy + 5 * rh + 26, `argmax → ${L.ids[BEST]}`, { size: 18, weight: 600, fill: accent });
        }
      }
    },
  });
}
