// TopFormer schematic: two sparse points close in 3D but far along the surface ->
// KNN graph on the dense points (sparse ⊂ dense) -> geodesic distance by Dijkstra ->
// sine-based normal directions (sign-free) -> encoding enters self-attention, then matching.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two sparse points: p on top of a chair, q on the corner of a desk. They are close in 3D, so their local shape and relative position look alike.",
        "Sparse-through-dense: the sparse points are a subset of the dense points, and a K-nearest-neighbour graph with a radius limit is built on the dense points.",
        "Dijkstra's shortest path through the dense graph gives the geodesic distance from p to q: along the surface they are far apart.",
        "Normals add direction. PCA normals can point either way, so only the sines of the angles are used, and flipping a normal leaves them unchanged.",
        "The four values are mapped into a topological structure encoding and added to the keys of self-attention. Cross-attention, sparse matching, dense refinement and RANSAC then give R, t.",
      ],
      close: "straight line: short", geo: "geodesic: long",
      knn: "KNN graph on dense points", dense: "dense point", sparse: "sparse point",
      flip: "normal flipped", same: "sin α unchanged",
      enc: "point-pair encoding S(·)", self: "self-attention: keys + encoding",
      cross: "cross-attention (X ↔ Y)", sm: "sparse matching (top-k)",
      ot: "optimal-transport refinement", ransac: "RANSAC → R, t",
    },
    zh: {
      steps: [
        "两个稀疏点：p 位于椅子顶部，q 位于桌角。二者在三维空间中相距很近，局部形状和相对位置都很相似。",
        "稀疏–稠密策略：稀疏点是稠密点的子集；在稠密点上构建带半径约束的 K 近邻图。",
        "在稠密图上用 Dijkstra 算法求最短路径，得到 p 到 q 的测地距离：沿表面看，二者相距很远。",
        "法向提供方向信息。PCA 估计的法向朝向不定，因此只使用夹角的正弦值，法向翻转后正弦值不变。",
        "这四个量经映射得到拓扑结构编码，加到自注意力的键上；随后经交叉注意力、稀疏匹配、稠密细化和 RANSAC 求出 R, t。",
      ],
      close: "欧氏距离：短", geo: "测地距离：长",
      knn: "稠密点上的 K 近邻图", dense: "稠密点", sparse: "稀疏点",
      flip: "法向翻转", same: "sin α 不变",
      enc: "点对编码 S(·)", self: "自注意力：键 + 编码",
      cross: "交叉注意力（X ↔ Y）", sm: "稀疏匹配（top-k）",
      ot: "稠密细化（最优传输）", ransac: "RANSAC → R, t",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  const PC = "#d1495b"; // point p
  const QC = "#2e86de"; // point q

  // --- Deterministic scene: side view of a chair next to a desk -------------
  const rnd = kit.rng(7);
  const pts = [];
  const seg = (x0, y0, x1, y1, step = 9) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      if (pts.some((p) => Math.hypot(p.x - x, p.y - y) < 4)) continue; // shared corners
      pts.push({ x: x + (rnd() - 0.5) * 2.4, y: y + (rnd() - 0.5) * 2.4 });
    }
  };
  seg(80, 300, 590, 300);   // floor
  seg(245, 150, 245, 300);  // chair back (continues as rear leg)
  seg(245, 225, 168, 225);  // seat
  seg(168, 225, 168, 300);  // front leg
  seg(285, 110, 540, 110);  // desk top
  seg(285, 110, 285, 300);  // desk leg (left)
  seg(540, 110, 540, 300);  // desk leg (right)
  pts.forEach((p, i) => { p.i = i; p.sparse = i % 5 === 0; });
  const near = (x, y) => pts.reduce((b, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b));
  const P = near(245, 150), Q = near(285, 110);
  P.sparse = Q.sparse = true;

  // KNN graph with radius limit τ
  const TAU = 14, KNN = 4;
  const adj = pts.map(() => []);
  const edges = [];
  pts.forEach((a) => {
    pts.filter((b) => b !== a)
      .map((b) => ({ b, d: Math.hypot(a.x - b.x, a.y - b.y) }))
      .filter((o) => o.d < TAU).sort((u, v) => u.d - v.d).slice(0, KNN)
      .forEach(({ b, d }) => {
        if (adj[a.i].some((o) => o.j === b.i)) return;
        adj[a.i].push({ j: b.i, d }); adj[b.i].push({ j: a.i, d });
        edges.push([a, b]);
      });
  });
  // Dijkstra from P to Q
  const dist = pts.map(() => Infinity), prev = pts.map(() => -1), done = pts.map(() => false);
  dist[P.i] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < pts.length; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0 || u === Q.i) break;
    done[u] = true;
    for (const { j, d } of adj[u]) if (dist[u] + d < dist[j]) { dist[j] = dist[u] + d; prev[j] = u; }
  }
  const path = [];
  for (let k = Q.i; k >= 0; k = prev[k]) path.unshift(pts[k]);
  const cum = [0];
  for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
  const total = cum[cum.length - 1];

  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: accent, width: 1.6 });
  const xy = (p) => [p.x, p.y];
  // subscript tspan (>= 14 viewBox units)
  const sub = (node, str) => {
    const ts = kit.svg("tspan", { "baseline-shift": "sub", "font-size": 16 }, node);
    ts.textContent = str;
    return node;
  };
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  const drawScene = (g, { sparseRing = 0, faint = false } = {}) => {
    for (const p of pts) {
      if (p === P || p === Q) continue;
      kit.svg("circle", { cx: p.x, cy: p.y, r: 2.6, fill: mute, opacity: faint ? 0.55 : 0.9 }, g);
      if (p.sparse) kit.svg("circle", { cx: p.x, cy: p.y, r: 5.2, fill: "none", stroke: body, "stroke-width": 1.6, opacity: 0.25 + 0.65 * sparseRing }, g);
    }
  };
  const drawPQ = (g) => {
    kit.svg("circle", { cx: P.x, cy: P.y, r: 7, fill: PC, stroke: ink, "stroke-width": 1.5 }, g);
    kit.svg("circle", { cx: Q.x, cy: Q.y, r: 7, fill: QC, stroke: ink, "stroke-width": 1.5 }, g);
    text(g, P.x - 14, P.y + 28, "p", { anchor: "end", italic: true, size: 24, weight: 600 });
    text(g, Q.x + 14, Q.y - 12, "q", { anchor: "start", italic: true, size: 24, weight: 600 });
  };
  const euclid = (g, e, opacity = 1) => {
    line(g, xy(P), lerp(xy(P), xy(Q), e), { stroke: ink, dash: "5 4", w: 2, opacity });
  };
  const drawEdges = (g, opacity) => {
    for (const [a, b] of edges) line(g, xy(a), xy(b), { stroke: body, w: 1.1, opacity });
  };
  const drawPath = (g, u) => {
    const lim = total * u;
    const ptsStr = [];
    for (let k = 0; k < path.length; k++) {
      if (cum[k] <= lim) { ptsStr.push(`${path[k].x},${path[k].y}`); continue; }
      const a = xy(path[k - 1]), b = xy(path[k]);
      const v = (lim - cum[k - 1]) / (cum[k] - cum[k - 1]);
      const m = lerp(a, b, v);
      ptsStr.push(`${m[0]},${m[1]}`);
      break;
    }
    kit.svg("polyline", { points: ptsStr.join(" "), fill: "none", stroke: accent, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.85 }, g);
  };
  const box = (g, x, y, w, h, label, opacity, strong = false) => {
    kit.svg("rect", { x, y, width: w, height: h, rx: 6, fill: strong ? accent : bg, "fill-opacity": strong ? 0.12 : 1, stroke: strong ? accent : body, "stroke-width": 1.5, opacity }, g);
    text(g, x + w / 2, y + h / 2 + 6, label, { size: 17, opacity, halo: false });
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
        drawScene(g);
        euclid(g, e);
        drawPQ(g);
        text(g, 222, 112, L.close, { anchor: "end", opacity: e, weight: 600 });
      }

      if (i === 1) {
        drawEdges(g, 0.7 * e);
        drawScene(g, { sparseRing: e });
        drawPQ(g);
        text(g, 412, 64, L.knn, { weight: 600, opacity: e });
        // legend
        kit.svg("circle", { cx: 120, cy: 338, r: 2.6, fill: mute }, g);
        text(g, 132, 344, L.dense, { anchor: "start", size: 18, fill: body });
        kit.svg("circle", { cx: 330, cy: 338, r: 5.2, fill: "none", stroke: body, "stroke-width": 1.6 }, g);
        text(g, 344, 344, L.sparse, { anchor: "start", size: 18, fill: body });
      }

      if (i === 2) {
        drawEdges(g, 0.25);
        drawScene(g, { faint: true });
        euclid(g, 1, 0.8);
        drawPath(g, e);
        drawPQ(g);
        text(g, 222, 112, L.close, { anchor: "end", weight: 600 });
        text(g, 412, 64, "Dijkstra", { weight: 600 });
        text(g, 412, 205, L.geo, { fill: accent, weight: 600, opacity: e });
      }

      if (i === 3) {
        drawScene(g, { faint: true });
        drawPath(g, 1);
        // d_pq
        arrow(g, xy(P), [Q.x - 5, Q.y + 5], { stroke: ink, dash: "5 4", w: 2 });
        // n_q (up) and n_p (left, then flipped to the right)
        arrow(g, xy(Q), [Q.x, Q.y - 60], { stroke: QC, w: 2.6, head: 11 });
        sub(text(g, Q.x + 12, Q.y - 44, "n", { anchor: "start", italic: true, size: 22, fill: QC }), "q");
        arrow(g, xy(P), [P.x - 46, P.y], { stroke: PC, w: 2.6, head: 11, opacity: 1 - 0.6 * e });
        sub(text(g, P.x - 62, P.y - 12, "n", { anchor: "start", italic: true, size: 22, fill: PC, opacity: 1 - 0.6 * e }), "p");
        if (e > 0.05) arrow(g, xy(P), [P.x + 34 * e, P.y], { stroke: PC, w: 2.6, head: 11, dash: "5 3" });
        // angle arc α between n_p (left) and d_pq (up-right)
        const r = 26;
        const dAng = Math.atan2(Q.y - P.y, Q.x - P.x);
        const a0 = Math.PI, a1 = dAng + 2 * Math.PI; // from left, sweeping over the top to d_pq
        const arc = [];
        for (let k = 0; k <= 16; k++) {
          const a = a0 + (a1 - a0) * (k / 16);
          arc.push(`${P.x + r * Math.cos(a)},${P.y + r * Math.sin(a)}`);
        }
        kit.svg("polyline", { points: arc.join(" "), fill: "none", stroke: body, "stroke-width": 1.4 }, g);
        text(g, P.x - 14, P.y - 32, "α", { italic: true, size: 22 });
        drawPQ(g);
        text(g, 412, 180, L.flip, { opacity: e, size: 19, fill: PC, weight: 600 });
        text(g, 412, 214, L.same, { opacity: e, size: 19, weight: 600 });
        text(g, 412, 248, "sin α = sin(π − α)", { opacity: e, size: 19 });
      }

      if (i === 4) {
        const step = (k) => kit.easeOut(Math.max(0, Math.min(1, t * 5 - k)));
        // encoding vector
        const cells = ["g", "‖d‖", "sin α", "sin β"];
        cells.forEach((c, k) => box(g, 30 + k * 66, 40, 62, 42, c, 1, true));
        text(g, 160, 110, L.enc, { size: 17, fill: body });
        arrow(g, [160, 120], [160, 150], { stroke: body, opacity: step(0) });
        box(g, 30, 156, 260, 44, L.self, step(0));
        arrow(g, [160, 204], [160, 234], { stroke: body, opacity: step(1) });
        box(g, 30, 240, 260, 44, L.cross, step(1));
        line(g, [290, 262], [318, 262], { stroke: body, opacity: step(2) });
        line(g, [318, 262], [318, 62], { stroke: body, opacity: step(2) });
        arrow(g, [318, 62], [344, 62], { stroke: body, opacity: step(2) });
        box(g, 346, 40, 266, 44, L.sm, step(2));
        arrow(g, [479, 88], [479, 118], { stroke: body, opacity: step(3) });
        box(g, 346, 124, 266, 44, L.ot, step(3));
        arrow(g, [479, 172], [479, 202], { stroke: body, opacity: step(4) });
        box(g, 346, 208, 266, 44, L.ransac, step(4), true);
      }
    },
  });
}
