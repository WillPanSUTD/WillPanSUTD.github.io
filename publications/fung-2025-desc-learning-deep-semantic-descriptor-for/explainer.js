// DeSC schematic: two NeRFs -> sampled point clouds -> patch embeddings (inconsistent) ->
// texture-aware graph convolution (consistent descriptors) -> attention + matching -> SVD alignment.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two NeRFs of one object, trained separately in different coordinate frames. Points are sampled at occupied voxel centres whose density exceeds σt; the clouds are noisy, with floaters.",
        "Around each coarse point, a patch of nearby dense points queries its NeRF for view-independent embeddings, enriched with colour and density. Colour stands for features: the raw embeddings of the two NeRFs disagree.",
        "A texture-aware graph convolution runs on each patch. Edge weights favour points that are close but have contrasting features. Fused with geometric features, the descriptors now agree across the two NeRFs.",
        "Geometric self-attention and cross-attention add context, and coarse-to-fine matching yields correspondences. A few are still wrong.",
        "Outliers are removed, and SVD solves the rotation R and translation t that align NeRF X with NeRF Y.",
      ],
      x: "NeRF X", y: "NeRF Y", sigma: "σ > σt", floaters: "floaters",
      query: "NeRF query", emb: "e + PE([c; σ])", disagree: "raw embeddings: X ≠ Y",
      patch: "patch", gnn: "patch GNN", wjk: "close + contrasting → strong edge",
      agree: "deep semantic descriptors: X ≈ Y",
      attn: "self- + cross-attention", match: "coarse-to-fine matching",
      outlier: "outliers removed", svd: "SVD → R, t", aligned: "aligned",
    },
    zh: {
      steps: [
        "同一物体的两个 NeRF，分别在不同坐标系下独立训练。在占据体素的中心中保留密度大于 σt 的点，得到的点云含有噪声和漂浮点。",
        "以每个稀疏点为中心，取邻近的稠密点组成局部块，向各自的 NeRF 查询与视角无关的嵌入，并融入颜色和密度。图中颜色代表特征：两个 NeRF 的原始嵌入并不一致。",
        "在每个局部块上运行纹理感知图卷积：距离近而特征差异大的点之间，边权更大。再与几何特征融合后，两个 NeRF 的描述子趋于一致。",
        "几何自注意力和交叉注意力引入上下文信息，再经由粗到精匹配得到对应关系，其中仍有少量错误匹配。",
        "剔除外点后，用 SVD 求解旋转 R 和平移 t，将 NeRF X 与 NeRF Y 对齐。",
      ],
      x: "NeRF X", y: "NeRF Y", sigma: "σ > σt", floaters: "漂浮点",
      query: "查询 NeRF", emb: "e + PE([c; σ])", disagree: "原始嵌入：X ≠ Y",
      patch: "局部块", gnn: "局部图卷积", wjk: "距离近 + 特征差异大 → 强边",
      agree: "深度语义描述子：X ≈ Y",
      attn: "自注意力 + 交叉注意力", match: "粗到精匹配",
      outlier: "剔除外点", svd: "SVD → R, t", aligned: "已对齐",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal feature colours (schematic stand-ins for learned features of three object parts).
  const COL = ["#2f9e8f", "#d9822b", "#8a5cc2"];
  const RAW_X = [1, 2, 0]; // raw embedding colour per part, NeRF X
  const RAW_Y = [2, 0, 1]; // raw embedding colour per part, NeRF Y (different, independent space)

  // --- Deterministic object: occupied voxel centres of a hydrant-like shape (local units) ---
  const rnd = kit.rng(11);
  const rects = [
    [-30, -100, 30, -80, 0], [-45, -70, 45, -50, 0], // cap, arms
    [-35, -40, 35, 10, 1],                            // body
    [-20, 20, 20, 60, 2], [-45, 70, 45, 80, 2],       // neck, base
  ];
  const pts = [];
  for (const [x0, y0, x1, y1, part] of rects) {
    for (let y = y0; y <= y1; y += 10) {
      for (let x = x0; x <= x1; x += 10) {
        pts.push({ x: x + (rnd() - 0.5) * 3, y: y + (rnd() - 0.5) * 3, part });
      }
    }
  }
  pts.forEach((p, i) => { p.i = i; });
  const mkFloaters = (n) => Array.from({ length: n }, () => {
    const side = rnd() < 0.5 ? -1 : 1;
    return { x: side * (55 + rnd() * 30), y: -90 + rnd() * 180 };
  });
  const FX = mkFloaters(6);
  const FY = mkFloaters(6);

  const K = 0.92;
  const SRC = { cx: 168, cy: 186, a: -28 };
  const TGT = { cx: 472, cy: 186, a: 0 };
  const place = (p, P) => {
    const r = (P.a * Math.PI) / 180, dx = p.x * K, dy = p.y * K;
    return [P.cx + dx * Math.cos(r) - dy * Math.sin(r), P.cy + dx * Math.sin(r) + dy * Math.cos(r)];
  };
  const lerpPose = (A, B, u) => ({ cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u, a: A.a + (B.a - A.a) * u });

  // Coarse point at the body/neck boundary and its patch (k nearest dense points within tau).
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const q = pts.reduce((b, p) => (Math.hypot(p.x, p.y - 14) < Math.hypot(b.x, b.y - 14) ? p : b));
  const patch = pts.filter((p) => p !== q && dist(p, q) < 24).sort((a, b) => dist(a, q) - dist(b, q)).slice(0, 8);

  // Correspondences: a sparse subset, plus two wrong matches.
  const matches = pts.filter((p, k) => k % 9 === 4).map((p) => [p, p]);
  const wrong = [[pts[3], pts[pts.length - 4]], [pts[40], pts[12]]];

  const { text, line } = kit.pen({ textSize: 20, stroke: accent, width: 1.6 });
  const partial = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  // Draw a cloud. mix: 0 grey, 1 coloured; from/to: colour maps per part; alpha(p) per-point opacity.
  const drawCloud = (g, pose, { floaters = [], mix = 0, from = RAW_X, to = from, blend = 1, alpha = () => 1, appear = 1, ring = false }) => {
    const n = pts.length;
    pts.forEach((p, k) => {
      const a = alpha(p) * Math.max(0, Math.min(1, appear * 1.6 - (k / n) * 0.6));
      if (a <= 0.01) return;
      const [x, y] = place(p, pose);
      if (ring) {
        kit.svg("circle", { cx: x, cy: y, r: 3.8, fill: "none", stroke: COL[to[p.part]], "stroke-width": 1.3, opacity: 0.8 * a }, g);
        return;
      }
      if (mix < 1) kit.svg("circle", { cx: x, cy: y, r: 3, fill: mute, opacity: (1 - mix) * a }, g);
      if (mix > 0) {
        if (blend < 1) kit.svg("circle", { cx: x, cy: y, r: 3, fill: COL[from[p.part]], opacity: mix * (1 - blend) * a }, g);
        kit.svg("circle", { cx: x, cy: y, r: 3, fill: COL[to[p.part]], opacity: mix * blend * a }, g);
      }
    });
    for (const f of floaters) {
      const [x, y] = place(f, pose);
      kit.svg("circle", { cx: x, cy: y, r: 2.6, fill: body, opacity: 0.55 * appear }, g);
    }
  };
  const titles = (g, opacity = 1) => {
    if (opacity <= 0.01) return;
    text(g, SRC.cx, 40, L.x, { weight: 600, opacity, size: 22 });
    text(g, TGT.cx, 40, L.y, { weight: 600, opacity, size: 22 });
  };
  const patchMark = (g, pose, opacity) => {
    const c = place(q, pose);
    kit.svg("circle", { cx: c[0], cy: c[1], r: 26 * K, fill: accent, opacity: 0.1 * opacity }, g);
    kit.svg("circle", { cx: c[0], cy: c[1], r: 26 * K, fill: "none", stroke: accent, "stroke-width": 1.5, "stroke-dasharray": "4 3", opacity }, g);
    kit.svg("circle", { cx: c[0], cy: c[1], r: 5, fill: "none", stroke: ink, "stroke-width": 2, opacity }, g);
    return c;
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
        titles(g);
        drawCloud(g, SRC, { floaters: FX, appear: e });
        drawCloud(g, TGT, { floaters: FY, appear: e });
        text(g, 320, 196, L.sigma, { size: 20, fill: body, opacity: e });
        for (const [set, pose] of [[FX, SRC], [FY, TGT]]) {
          for (const f of set) {
            const [x, y] = place(f, pose);
            kit.svg("circle", { cx: x, cy: y, r: 8, fill: "none", stroke: accent, "stroke-width": 1.4, opacity: e }, g);
          }
        }
        kit.svg("circle", { cx: 262, cy: 330, r: 8, fill: "none", stroke: accent, "stroke-width": 1.4, opacity: e }, g);
        text(g, 278, 337, L.floaters, { size: 20, fill: body, anchor: "start", opacity: e });
      }

      if (i === 1) {
        titles(g);
        drawCloud(g, SRC, { floaters: FX, mix: e, from: RAW_X, alpha: (p) => (patch.includes(p) || p === q ? 1 : 0.55) });
        drawCloud(g, TGT, { floaters: FY, mix: e, from: RAW_Y, alpha: (p) => (patch.includes(p) || p === q ? 1 : 0.55) });
        const cx = patchMark(g, SRC, e);
        const cy = patchMark(g, TGT, e);
        for (const p of patch) {
          line(g, cx, partial(cx, place(p, SRC), e), { stroke: ink, w: 1, opacity: 0.6 });
          line(g, cy, partial(cy, place(p, TGT), e), { stroke: ink, w: 1, opacity: 0.6 });
        }
        text(g, 320, 178, L.query, { size: 18, fill: body, opacity: e });
        text(g, 320, 204, L.emb, { size: 20, fill: ink, opacity: e });
        text(g, 320, 336, L.disagree, { size: 20, weight: 600, opacity: e });
      }

      if (i === 2) {
        titles(g);
        const bl = Math.max(0, (t - 0.35) / 0.65);
        const eb = kit.easeOut(bl);
        drawCloud(g, SRC, { floaters: FX, mix: 1, from: RAW_X, to: [0, 1, 2], blend: eb, alpha: () => 0.85 });
        drawCloud(g, TGT, { floaters: FY, mix: 1, from: RAW_Y, to: [0, 1, 2], blend: eb, alpha: () => 0.85 });
        const cx = patchMark(g, SRC, 1);
        // Inset: zoomed patch graph between the two clouds.
        const IC = [320, 180], Z = 2.3;
        kit.svg("circle", { cx: IC[0], cy: IC[1], r: 66, fill: bg, stroke: accent, "stroke-width": 1.5, opacity: e }, g);
        line(g, [cx[0] + 24, cx[1]], [IC[0] - 66, IC[1]], { stroke: accent, dash: "3 4", w: 1.2, opacity: e });
        const pos = (p) => [IC[0] + (p.x - q.x) * Z, IC[1] + (p.y - q.y) * Z];
        const cmap = (p) => COL[(eb > 0.5 ? [0, 1, 2] : RAW_X)[p.part]];
        for (const p of patch) {
          const d = dist(p, q) / 20;
          const contrast = p.part !== q.part ? 1 : 0.25;
          const w = Math.exp(-d * d) * contrast;
          line(g, pos(q), partial(pos(q), pos(p), e), { stroke: ink, w: 0.8 + 4.2 * w, opacity: 0.35 + 0.55 * w });
        }
        for (const p of patch) {
          const [x, y] = pos(p);
          kit.svg("circle", { cx: x, cy: y, r: 6, fill: cmap(p), opacity: e }, g);
        }
        const [qx, qy] = pos(q);
        kit.svg("circle", { cx: qx, cy: qy, r: 8, fill: cmap(q), stroke: ink, "stroke-width": 2, opacity: e }, g);
        text(g, IC[0], IC[1] - 78, L.gnn, { size: 20, weight: 600, fill: accent, opacity: e });
        text(g, IC[0], 304, L.wjk, { size: 17, fill: body, opacity: e });
        text(g, 320, 340, L.agree, { size: 20, weight: 600, opacity: eb });
      }

      if (i === 3) {
        titles(g);
        drawCloud(g, SRC, { floaters: FX, mix: 1, from: [0, 1, 2], alpha: () => 0.7 });
        drawCloud(g, TGT, { floaters: FY, mix: 1, from: [0, 1, 2], alpha: () => 0.7 });
        for (const [a, b] of matches) {
          const pa = place(a, SRC), pb = place(b, TGT);
          line(g, pa, partial(pa, pb, e), { w: 1.4, opacity: 0.8 });
        }
        for (const [a, b] of wrong) {
          const pa = place(a, SRC), pb = place(b, TGT);
          line(g, pa, partial(pa, pb, e), { stroke: ink, dash: "6 5", w: 1.8, opacity: 0.85 });
        }
        text(g, 320, 76, L.attn, { size: 19, fill: body, opacity: e });
        text(g, 320, 336, L.match, { size: 20, weight: 600, opacity: e });
      }

      if (i === 4) {
        const u = kit.easeOut(Math.max(0, (t - 0.25) / 0.75));
        const sp = lerpPose(SRC, TGT, u);
        titles(g, 1 - u);
        drawCloud(g, TGT, { mix: 1, from: [0, 1, 2], ring: true, to: [0, 1, 2] });
        drawCloud(g, sp, { mix: 1, from: [0, 1, 2], alpha: () => 0.9 });
        for (const [a, b] of matches) {
          line(g, place(a, sp), place(b, TGT), { w: 1.3, opacity: 0.75 * (1 - u) });
        }
        const fade = 1 - Math.min(1, t * 4);
        for (const [a, b] of wrong) {
          if (fade > 0.01) line(g, place(a, sp), place(b, TGT), { stroke: ink, dash: "6 5", w: 1.8, opacity: 0.85 * fade });
        }
        text(g, 320, 336, u < 0.5 ? L.outlier : L.svd, { size: 20, weight: 600 });
        text(g, TGT.cx, 64, L.aligned, { size: 20, weight: 600, fill: accent, opacity: u });
      }
    },
  });
}
