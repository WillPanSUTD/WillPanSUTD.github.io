// IWPCA schematic (2D cross-section of a closed surface with sharp edges):
// PCA plane fit per kNN neighbourhood -> bilateral spatial/normal weights -> iterate ->
// centroid pre-flip -> MST propagation of orientation (flip child if n_parent . n_child < 0).
// All normals below are computed from the sampled points following the paper's formulas (5)-(7), (9), (11), (12),
// with one departure from eq. (6): the normal weight uses |n . n_i| instead of n . n_i, because normal signs are
// arbitrary before re-orientation.

// Closed outline (screen coordinates): an elongated hexagon with a trapezoidal notch in its top face.
const OUTLINE = [
  [200, 92], [262, 92], [284, 150], [356, 150], [378, 92], [440, 92],
  [500, 192], [440, 292], [200, 292], [140, 192],
];
const K = 6;               // neighbours per point (kNN)
const SIGMA_N = (30 * Math.PI) / 180; // normal-weight parameter sigma_n = 30 deg (Table 1)
const ITER = 3;            // IWPCA iterations (paper recommends 2 or 3)

function build(rnd) {
  // ---- sample the outline with small noise ----------------------------------
  const pts = [];
  const n = OUTLINE.length;
  for (let s = 0; s < n; s++) {
    const [x0, y0] = OUTLINE[s];
    const [x1, y1] = OUTLINE[(s + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const m = Math.max(1, Math.round(len / 12));
    const nx = (y1 - y0) / len, ny = -(x1 - x0) / len; // outward for clockwise-on-screen order
    for (let k = 0; k < m; k++) {
      const u = (k + 0.5 + (rnd() - 0.5) * 0.3) / m;
      const d = (rnd() - 0.5) * 3;
      pts.push({ x: x0 + (x1 - x0) * u + nx * d, y: y0 + (y1 - y0) * u + ny * d, out: [nx, ny] });
    }
  }
  // ---- kNN (brute force; schematic size) -----------------------------------
  for (const p of pts) {
    const ds = pts.map((q, j) => [Math.hypot(q.x - p.x, q.y - p.y), j]).sort((a, b) => a[0] - b[0]);
    p.nb = ds.slice(1, K + 1).map((d) => d[1]);
    p.r = ds[K][0];               // search radius of the kNN neighbourhood
    p.sd = p.r / 2;               // sigma_d: half the kNN search radius
  }
  // smallest-eigenvalue eigenvector of a symmetric 2x2 matrix [a b; b c]
  const minEig = (a, b, c) => {
    const lam = (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b);
    let v = Math.abs(b) > 1e-12 ? [b, lam - a] : a < c ? [1, 0] : [0, 1];
    const l = Math.hypot(v[0], v[1]);
    return [v[0] / l, v[1] / l];
  };
  const spatialW = (p, q) => Math.exp(-((Math.hypot(q.x - p.x, q.y - p.y) / p.sd) ** 2));
  const normalW = (n0, n1) => {
    if (!n0) return 1; // first pass: n and n_i share the default value, so the normal weight is 1
    const c = Math.abs(n0[0] * n1[0] + n0[1] * n1[1]);
    return Math.exp(-(((1 - c) / (1 - Math.cos(SIGMA_N))) ** 2));
  };
  // weighted covariance around the vertex itself, formula (7); weighted=false gives classical PCA
  const fit = (prev, weighted) => pts.map((p, i) => {
    let a = 0, b = 0, c = 0;
    for (const j of [i, ...p.nb]) {
      const q = pts[j];
      const ox = weighted ? p.x : p.cx, oy = weighted ? p.y : p.cy;
      const w = weighted ? spatialW(p, q) * normalW(prev && prev[i], prev && prev[j]) : 1;
      const dx = q.x - ox, dy = q.y - oy;
      a += w * dx * dx; b += w * dx * dy; c += w * dy * dy;
    }
    return minEig(a, b, c);
  });
  for (const p of pts) {
    const ids = [pts.indexOf(p), ...p.nb];
    p.cx = ids.reduce((s, j) => s + pts[j].x, 0) / ids.length;
    p.cy = ids.reduce((s, j) => s + pts[j].y, 0) / ids.length;
  }
  const pca = fit(null, false);
  const its = [];
  let prev = null;
  for (let k = 0; k < ITER; k++) { prev = fit(prev, true); its.push(prev); }
  // PCA gives no sign: give each point an arbitrary (seeded) sign and keep it stable over iterations
  const sgn = pts.map(() => (rnd() < 0.5 ? -1 : 1));
  const align = (v, ref) => (v[0] * ref[0] + v[1] * ref[1] < 0 ? [-v[0], -v[1]] : v);
  const N0 = pca.map((v, i) => [v[0] * sgn[i], v[1] * sgn[i]]);
  const NI = [];
  let last = N0;
  for (const it of its) { last = it.map((v, i) => align(v, last[i])); NI.push(last); }
  const N3 = NI[NI.length - 1];
  // ---- centroid pre-flip, formula (9) --------------------------------------
  const C = [pts.reduce((s, p) => s + p.x, 0) / pts.length, pts.reduce((s, p) => s + p.y, 0) / pts.length];
  const pre = N3.map((v, i) => {
    const d = [pts[i].x - C[0], pts[i].y - C[1]];
    return v[0] * d[0] + v[1] * d[1] < 0 ? [-v[0], -v[1]] : v;
  });
  const preFlip = N3.map((v, i) => v !== pre[i]);
  // ---- MST (Prim) on the kNN graph, edge weight 1 - |n_i . n_j|, formula (11) ----
  const adj = pts.map(() => new Set());
  pts.forEach((p, i) => p.nb.forEach((j) => { adj[i].add(j); adj[j].add(i); }));
  const ew = (i, j) => 1 - Math.abs(pre[i][0] * pre[j][0] + pre[i][1] * pre[j][1])
    + 1e-4 * Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
  let root = 0;
  pts.forEach((p, i) => { if (p.y > pts[root].y) root = i; }); // a point on the bottom face
  const inT = pts.map(() => false);
  const parent = pts.map(() => -1);
  const depth = pts.map(() => 0);
  inT[root] = true;
  for (let added = 1; added < pts.length; added++) {
    let best = null;
    for (let i = 0; i < pts.length; i++) {
      if (!inT[i]) continue;
      for (const j of adj[i]) {
        if (inT[j]) continue;
        const w = ew(i, j);
        if (!best || w < best[0]) best = [w, i, j];
      }
    }
    if (!best) break;
    const [, i, j] = best;
    inT[j] = true; parent[j] = i; depth[j] = depth[i] + 1;
  }
  // propagate orientation from the root, formula (12): flip child if n_parent . n_child < 0
  const order = pts.map((_, i) => i).sort((a, b) => depth[a] - depth[b]);
  const fin = pre.map((v) => v.slice());
  const mstFlip = pts.map(() => false);
  for (const j of order) {
    const i = parent[j];
    if (i < 0) continue;
    if (fin[i][0] * fin[j][0] + fin[i][1] * fin[j][1] < 0) { fin[j] = [-fin[j][0], -fin[j][1]]; mstFlip[j] = true; }
  }
  const maxDepth = Math.max(...depth);
  return { pts, N0, NI, N3, pre, preFlip, fin, mstFlip, parent, depth, maxDepth, root, C };
}

export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Classical PCA: fit a plane to each point's k nearest neighbours; the normal is the eigenvector of the smallest covariance eigenvalue. Near a sharp edge the fitted normals blend across the corner instead of following the edge, and neighbouring normals may point inside or outside.",
        "IWPCA weights every neighbour twice: a spatial weight that decreases with its distance from the point, and a normal weight that decreases as its normal departs from the point's normal. Larger dots carry more weight.",
        "The weighted fit is repeated, each pass using the normals from the previous one (the paper recommends 2 or 3). In this schematic the normals at the edges settle onto their faces.",
        "Orientation, first pass: compute the centre of the cloud and flip every normal that points towards it.",
        "A minimum spanning tree over neighbouring points, with edge weight 1 − |n·n'|, carries the root's orientation to its children; a child is flipped when its dot product with its parent is negative.",
      ],
      knn: "k nearest neighbours", plane: "fitted plane", tilted: "tilted normal",
      wS: "spatial weight", wN: "normal weight", size: "dot size =", low: "low weight",
      iter: "iteration", pca: "PCA", centre: "centre c", inward: "points inward",
      root: "root", rule: "parent · child < 0 → flip", consistent: "consistent",
    },
    zh: {
      steps: [
        "经典 PCA：对每个点的 k 近邻拟合平面，取协方差矩阵最小特征值对应的特征向量作为法向。在尖锐边附近，拟合出的法向在拐角两侧之间过渡，不能反映边缘处的真实朝向；相邻点的法向也可能有的指向内侧、有的指向外侧。",
        "IWPCA 为每个邻点赋予双边权重：空间权重随邻点与中心点距离的增大而减小，法向权重随邻点法向与中心点法向偏差的增大而减小。圆点越大，权重越高。",
        "重复进行加权拟合，每一轮都使用上一轮得到的法向（论文建议迭代 2 到 3 次）。在本示意图中，边缘处的法向逐渐贴合各自所在的面。",
        "法向定向的预处理：计算点云中心，将所有指向中心的法向翻转。",
        "在相邻点之间构建最小生成树，边权为 1 − |n·n'|，从根节点起将法向朝向传播给子节点；若子节点法向与父节点法向的点积为负，则将其翻转。",
      ],
      knn: "k 近邻", plane: "拟合平面", tilted: "倾斜的法向",
      wS: "空间权重", wN: "法向权重", size: "圆点大小 =", low: "低权重",
      iter: "迭代", pca: "PCA", centre: "中心 c", inward: "指向内部",
      root: "根节点", rule: "父 · 子 < 0 → 翻转", consistent: "朝向一致",
    },
  }, lang);

  const { ink, body, accent, mute } = kit.palette();
  const WARN = "#c2410c"; // literal semantic colour: an inward-pointing (inconsistent) normal
  const G = build(kit.rng(7));
  const { pts } = G;
  const LEN = 17;
  const { text, line, arrow } = kit.pen({ textSize: 16, stroke: accent, width: 1.6, head: 6 });

  // focus neighbourhood: a top-face point next to the notch's upper-left edge
  const focus = pts.reduce((b, p, i) => (Math.hypot(p.x - 256, p.y - 91) < Math.hypot(pts[b].x - 256, pts[b].y - 91) ? i : b), 0);
  const F = pts[focus];

  const isIn = (v, p) => v[0] * p.out[0] + v[1] * p.out[1] < 0;
  const rot = (a, b, u) => { // interpolate two unit vectors by angle
    const a0 = Math.atan2(a[1], a[0]);
    let d = Math.atan2(b[1], b[0]) - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return [Math.cos(a0 + d * u), Math.sin(a0 + d * u)];
  };
  const drawNormal = (g, p, v, o = {}) => {
    const b = [p.x + v[0] * (o.len ?? LEN), p.y + v[1] * (o.len ?? LEN)];
    line(g, [p.x, p.y], b, { stroke: o.stroke ?? accent, w: o.w ?? 1.5, opacity: o.opacity ?? 0.9 });
  };
  const drawPoints = (g, o = {}) => {
    pts.forEach((p, i) => kit.svg("circle", { cx: p.x, cy: p.y, r: o.r?.(i) ?? 2.6, fill: o.fill?.(i) ?? ink, opacity: o.opacity?.(i) ?? 0.85 }, g));
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
        // all PCA normals, arbitrary signs
        pts.forEach((p, k) => drawNormal(g, p, G.N0[k], { opacity: 0.35 + 0.55 * e }));
        drawPoints(g);
        // focus neighbourhood
        kit.svg("circle", { cx: F.x, cy: F.y, r: F.r * e + 1, fill: accent, opacity: 0.08 }, g);
        kit.svg("circle", { cx: F.x, cy: F.y, r: F.r * e + 1, fill: "none", stroke: accent, "stroke-width": 1.3, "stroke-dasharray": "4 4" }, g);
        const n0 = G.N0[focus];
        const tg = [-n0[1], n0[0]];
        line(g, [F.x - tg[0] * 52 * e, F.y - tg[1] * 52 * e], [F.x + tg[0] * 52 * e, F.y + tg[1] * 52 * e], { stroke: body, w: 1.4, dash: "6 4" });
        const up = n0[1] < 0 ? n0 : [-n0[0], -n0[1]];
        arrow(g, [F.x, F.y], [F.x + up[0] * 46 * e, F.y + up[1] * 46 * e], { stroke: ink, w: 2.6, head: 8 });
        kit.svg("circle", { cx: F.x, cy: F.y, r: 4.5, fill: ink }, g);
        text(g, 180, 176, L.knn, { anchor: "start", fill: accent, opacity: e });
        line(g, [222, 160], [F.x - 18, F.y + 30], { stroke: mute, w: 1.1, opacity: e });
        text(g, F.x + up[0] * 46 + 12, 46, L.tilted, { anchor: "start", fill: ink, weight: 600, opacity: e });
        line(g, [262, 330], [300, 330], { stroke: body, w: 1.4, dash: "6 4", opacity: e });
        text(g, 308, 336, L.plane, { anchor: "start", fill: body, opacity: e });
      }

      if (i === 1) {
        // weights of the focus neighbourhood, computed with the first-pass normals
        const n1 = G.NI[0];
        const ws = new Map();
        for (const j of F.nb) {
          const q = pts[j];
          const sw = Math.exp(-((Math.hypot(q.x - F.x, q.y - F.y) / F.sd) ** 2));
          const c = Math.abs(n1[focus][0] * n1[j][0] + n1[focus][1] * n1[j][1]);
          const nw = Math.exp(-(((1 - c) / (1 - Math.cos((30 * Math.PI) / 180))) ** 2));
          ws.set(j, sw * nw);
        }
        const wmax = Math.max(...ws.values());
        pts.forEach((p, k) => drawNormal(g, p, G.N0[k], { opacity: ws.has(k) || k === focus ? 0.15 : 0.3, stroke: mute }));
        drawPoints(g, {
          r: (k) => (ws.has(k) ? 2.4 + 5 * e * (ws.get(k) / wmax) : 2.4),
          fill: (k) => (ws.has(k) ? accent : ink),
          opacity: (k) => (ws.has(k) ? 0.35 + 0.6 * (ws.get(k) / wmax) : 0.25),
        });
        // the point's current normal (unchanged here; refitting is step 3)
        const a = G.N0[focus][1] < 0 ? G.N0[focus] : [-G.N0[focus][0], -G.N0[focus][1]];
        arrow(g, [F.x, F.y], [F.x + a[0] * 46, F.y + a[1] * 46], { stroke: ink, w: 2.6, head: 8 });
        kit.svg("circle", { cx: F.x, cy: F.y, r: 4.5, fill: ink }, g);
        // weakest neighbour (on the notch wall)
        let lowJ = F.nb[0];
        for (const j of F.nb) if (ws.get(j) < ws.get(lowJ)) lowJ = j;
        const lq = pts[lowJ];
        line(g, [lq.x + 6, lq.y + 4], [330, 196], { stroke: mute, w: 1.1, opacity: e });
        text(g, 336, 202, L.low, { anchor: "start", fill: body, opacity: e });
        // legend: what the dot size encodes (formula 7 multiplies the two weights)
        kit.svg("circle", { cx: 372, cy: 34, r: 2.8, fill: accent, opacity: 0.5 * e }, g);
        kit.svg("circle", { cx: 388, cy: 34, r: 5.5, fill: accent, opacity: 0.9 * e }, g);
        text(g, 402, 40, L.size, { anchor: "start", fill: body, opacity: e });
        text(g, 362, 64, `${L.wS} × ${L.wN}`, { anchor: "start", fill: accent, opacity: e });
      }

      if (i === 2) {
        // morph PCA -> iteration 1 -> 2 -> 3
        const seq = [G.N0.map((v, k) => (isIn(v, pts[k]) === isIn(G.NI[0][k], pts[k]) ? v : [-v[0], -v[1]])), ...G.NI];
        const span = t * (seq.length - 1);
        const k0 = Math.min(seq.length - 2, Math.floor(span));
        const u = kit.easeOut(span - k0);
        pts.forEach((p, k) => drawNormal(g, p, rot(seq[k0][k], seq[k0 + 1][k], u)));
        drawPoints(g);
        const lbl = t <= 0 ? L.pca : `${L.iter} ${Math.min(ITER, Math.max(1, Math.ceil(span)))} / ${ITER}`;
        text(g, 320, 335, lbl, { weight: 600, fill: ink });
      }

      if (i === 3) {
        const [cx, cy] = G.C;
        pts.forEach((p, k) => {
          if (k % 4 === 0) line(g, [cx, cy], [p.x, p.y], { stroke: mute, w: 0.8, dash: "3 4", opacity: 0.6 * e });
        });
        pts.forEach((p, k) => {
          const v0 = G.N3[k];
          const v = G.preFlip[k] ? rot(v0, G.pre[k], e) : v0;
          drawNormal(g, p, v, { stroke: isIn(v, p) ? WARN : accent, w: isIn(v, p) ? 2.2 : 1.5 });
        });
        drawPoints(g);
        kit.svg("circle", { cx, cy, r: 5, fill: ink }, g);
        text(g, cx, cy + 26, L.centre, { fill: ink });
        const left = G.pre.reduce((n, v, k) => n + (isIn(v, pts[k]) ? 1 : 0), 0);
        if (left > 0) {
          line(g, [150, 40], [172, 40], { stroke: WARN, w: 2.4, opacity: e });
          text(g, 180, 46, L.inward, { anchor: "start", fill: WARN, opacity: e });
        }
      }

      if (i === 4) {
        const reach = e * (G.maxDepth + 1);
        pts.forEach((p, k) => {
          const j = G.parent[k];
          if (j < 0 || G.depth[k] > reach) return;
          line(g, [pts[j].x, pts[j].y], [p.x, p.y], { stroke: body, w: 2.4, opacity: 0.55 });
        });
        pts.forEach((p, k) => {
          const done = G.depth[k] <= reach;
          const v = done ? G.fin[k] : G.pre[k];
          drawNormal(g, p, v, { stroke: isIn(v, p) ? WARN : accent, w: isIn(v, p) ? 2.2 : 1.5 });
        });
        drawPoints(g);
        const R = pts[G.root];
        kit.svg("circle", { cx: R.x, cy: R.y, r: 6, fill: ink }, g);
        text(g, R.x, R.y + 30, L.root, { fill: ink, weight: 600 });
        text(g, 150, 46, L.rule, { anchor: "start", fill: body });
        if (t >= 1) text(g, 490, 46, `✓ ${L.consistent}`, { anchor: "middle", fill: accent, weight: 600 });
      }
    },
  });
}
