// Mesh denoising schematic (cross-section of a noisy surface with one sharp edge):
// normal tensor over the r-ring of face i -> drop faces that deviate by more than theta_th ->
// collect similar co-aligned structures in the wider R-ring -> stack their normals in a matrix and
// fit it with discrete Legendre bases in X and Y -> move vertices along the filtered normals.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A noisy mesh, seen in cross-section. A single face normal is unreliable, so a normal tensor over the r-ring around face i, weighted by distance and angle, gives a principal direction.",
        "Faces whose normals deviate from that direction by more than the threshold θth are removed. What is left is a co-aligned local structure.",
        "The search widens to an R-ring (R > r). The co-aligned structures of nearby faces whose direction is close to face i's are collected as non-local similar structures.",
        "Their face normals are stacked as rows of a matrix M, reshaped to a near-square matrix R, and fitted with discrete Legendre bases in X and Y. The fitted matrix Z gives the filtered normals.",
        "Each vertex moves along the filtered normals of its incident faces. The noise is removed while the sharp edge is kept.",
      ],
      face: "face i", ring: "r-ring", dir: "tensor direction",
      kept: "co-aligned", removed: "removed (> θth)",
      wide: "R-ring (R > r)", similar: "similar structures", other: "different direction",
      M: "M (k × 3)", reshape: "reshape", R: "R", fit: "Legendre fit", Z: "Z → filtered normals",
      filtered: "filtered normals", edge: "sharp edge kept",
    },
    zh: {
      steps: [
        "带噪网格的截面示意。单个面片的法向并不可靠，因此在面片 i 的 r 邻域内按距离和夹角加权构造法向张量，取其主方向。",
        "法向与该主方向夹角超过阈值 θth 的面片被剔除，剩下的是一个同向的局部结构。",
        "将搜索范围扩大到 R 邻域（R > r）。与面片 i 方向相近的邻近面片的同向结构，被收集为非局部相似结构。",
        "将这些面片的法向作为行堆叠成矩阵 M，重排为近似方阵 R，再用 X、Y 两个方向的离散 Legendre 正交基进行拟合，拟合得到的矩阵 Z 即给出滤波后的法向。",
        "每个顶点沿其相邻面片的滤波后法向移动。噪声被去除，尖锐边得以保留。",
      ],
      face: "面片 i", ring: "r 邻域", dir: "张量主方向",
      kept: "同向结构", removed: "剔除（> θth）",
      wide: "R 邻域（R > r）", similar: "非局部相似结构", other: "方向不同",
      M: "M（k × 3）", reshape: "重排", R: "R", fit: "Legendre 拟合", Z: "Z → 滤波后法向",
      filtered: "滤波后法向", edge: "尖锐边保留",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  const rnd = kit.rng(12);
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.4, head: 6 });

  // ---- Cross-section: flat plane on the left, a 35-degree plane on the right, crease at x = 340 ----
  const NV = 27, X0 = 60, DX = 20, CREASE = 340, KC = 14, Y0 = 245, SLOPE = Math.tan((35 * Math.PI) / 180);
  const clean = [], noisy = [];
  for (let k = 0; k < NV; k++) {
    const x = X0 + k * DX;
    const y = x <= CREASE ? Y0 : Y0 - (x - CREASE) * SLOPE;
    clean.push([x, y]);
    const d = (rnd() - 0.5) * 6;
    noisy.push(k === KC ? [x, y] : [x, y + d]);
  }
  const NF = NV - 1;
  const faceNormal = (P, k) => {
    const dx = P[k + 1][0] - P[k][0], dy = P[k + 1][1] - P[k][1], n = Math.hypot(dx, dy);
    return [dy / n, -dx / n];
  };
  const centroid = (P, k) => [(P[k][0] + P[k + 1][0]) / 2, (P[k][1] + P[k + 1][1]) / 2];
  const N = Array.from({ length: NF }, (_, k) => faceNormal(noisy, k));
  const C = Array.from({ length: NF }, (_, k) => centroid(noisy, k));
  const angle = (a, b) => (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) / Math.PI;

  // Normal tensor over the r-ring (Eqs. 1-4), principal eigenvector as the representative direction.
  const r = 3, Rr = 9, TH = 20, SIG_T = (30 * Math.PI) / 180;
  const ringOf = (i, w) => { const a = []; for (let j = Math.max(0, i - w); j <= Math.min(NF - 1, i + w); j++) a.push(j); return a; };
  const tensorDir = (i) => {
    const ring = ringOf(i, r);
    const sp = 2 * Math.hypot(C[ring[ring.length - 1]][0] - C[ring[0]][0], C[ring[ring.length - 1]][1] - C[ring[0]][1]);
    let a = 0, b = 0, d = 0;
    for (const j of ring) {
      const dist = Math.hypot(C[i][0] - C[j][0], C[i][1] - C[j][1]);
      const cos = N[i][0] * N[j][0] + N[i][1] * N[j][1];
      const w = Math.exp(-((dist / sp) ** 2)) * Math.exp(-(((1 - cos) / (1 - Math.cos(SIG_T))) ** 2));
      a += w * N[j][0] * N[j][0]; b += w * N[j][0] * N[j][1]; d += w * N[j][1] * N[j][1];
    }
    const th = 0.5 * Math.atan2(2 * b, a - d);
    let v = [Math.cos(th), Math.sin(th)];
    if (v[1] > 0) v = [-v[0], -v[1]];
    return v;
  };
  const coAligned = (i, v) => ringOf(i, r).filter((j) => angle(N[j], v) <= TH);
  const meanDir = (faces) => {
    let x = 0, y = 0;
    for (const j of faces) { x += N[j][0]; y += N[j][1]; }
    const n = Math.hypot(x, y) || 1;
    return [x / n, y / n];
  };
  const I0 = 12;
  const V0 = tensorDir(I0);
  const iso0 = coAligned(I0, V0);
  const dir0 = meanDir(iso0);
  const wide = ringOf(I0, Rr);
  const similar = new Set();
  for (const j of wide) {
    const iso = coAligned(j, tensorDir(j));
    if (iso.length && angle(meanDir(iso), dir0) <= TH) iso.forEach((f) => { if (wide.includes(f)) similar.add(f); });
  }

  // Vertex update (Eq. 12) with the filtered normals, iterated (viter = 10).
  const NC = Array.from({ length: NF }, (_, k) => faceNormal(clean, k));
  let P = noisy.map((p) => p.slice());
  for (let it = 0; it < 10; it++) {
    const Cc = Array.from({ length: NF }, (_, k) => centroid(P, k));
    P = P.map((x, v) => {
      const inc = [v - 1, v].filter((k) => k >= 0 && k < NF);
      let dx = 0, dy = 0;
      for (const k of inc) {
        const s = NC[k][0] * (Cc[k][0] - x[0]) + NC[k][1] * (Cc[k][1] - x[1]);
        dx += NC[k][0] * s; dy += NC[k][1] * s;
      }
      return [x[0] + dx / inc.length, x[1] + dy / inc.length];
    });
  }
  const denoised = P;

  // ---- Matrix panel: a noisy near-square matrix and its discrete Legendre projection (Eq. 11) ----
  const G = 6;
  const Rm = [];
  for (let a = 0; a < G; a++) {
    const row = [];
    for (let b = 0; b < G; b++) {
      const u = -1 + (2 * a) / (G - 1), w = -1 + (2 * b) / (G - 1);
      row.push(0.55 + 0.18 * u - 0.12 * w * w + (rnd() - 0.5) * 0.55);
    }
    Rm.push(row);
  }
  const basis = (n, order) => {
    const nodes = Array.from({ length: n }, (_, i) => -1 + (2 * i) / (n - 1));
    const cols = [];
    for (let p = 0; p <= order; p++) {
      let c = nodes.map((x) => x ** p);
      for (const q of cols) { const s = c.reduce((acc, v, i) => acc + v * q[i], 0); c = c.map((v, i) => v - s * q[i]); }
      const nn = Math.hypot(...c);
      cols.push(c.map((v) => v / nn));
    }
    return cols; // orthonormal columns, i.e. B with B^T B = I
  };
  const project = (vec, cols) => {
    const out = new Array(vec.length).fill(0);
    for (const q of cols) { const s = vec.reduce((acc, v, i) => acc + v * q[i], 0); q.forEach((v, i) => { out[i] += s * v; }); }
    return out;
  };
  const By = basis(G, 2), Bx = basis(G, 2);
  const rowsP = Rm.map((row) => project(row, Bx));
  const Zm = Rm.map((row) => row.slice());
  for (let b = 0; b < G; b++) {
    const col = project(rowsP.map((row) => row[b]), By);
    for (let a = 0; a < G; a++) Zm[a][b] = col[a];
  }
  const Mcol = Array.from({ length: 12 }, () => [rnd(), rnd(), rnd()].map((v) => 0.2 + 0.7 * v));
  const shade = (v) => 0.12 + 0.8 * Math.max(0, Math.min(1, v));
  const legendre = [(x) => 1, (x) => x, (x) => 1.5 * x * x - 0.5, (x) => 2.5 * x ** 3 - 1.5 * x];

  // ---- Drawing helpers ----
  const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const profile = (g, pts, o = {}) => {
    kit.svg("polyline", {
      points: pts.map((p) => p.join(",")).join(" "), fill: "none", stroke: o.stroke ?? mute,
      "stroke-width": o.w ?? 2.4, "stroke-linejoin": "round", opacity: o.opacity ?? 1,
    }, g);
    if (o.dots !== false) for (const p of pts) kit.svg("circle", { cx: p[0], cy: p[1], r: 2.6, fill: o.dotFill ?? body, opacity: o.opacity ?? 1 }, g);
  };
  const faceSeg = (g, pts, k, o) => line(g, pts[k], pts[k + 1], o);
  const normals = (g, pts, faces, o = {}) => {
    for (const k of faces) {
      const c = centroid(pts, k), n = o.normal ? o.normal(k) : faceNormal(pts, k), len = o.len ?? 24;
      arrow(g, c, [c[0] + n[0] * len, c[1] + n[1] * len], { stroke: o.stroke ?? body, w: o.w ?? 1.3, opacity: o.opacity ?? 0.8, head: 6 });
    }
  };
  const bracket = (g, x1, x2, y, label, opacity = 1) => {
    line(g, [x1, y - 8], [x1, y], { stroke: ink, w: 1.4, opacity });
    line(g, [x1, y], [x2, y], { stroke: ink, w: 1.4, opacity });
    line(g, [x2, y - 8], [x2, y], { stroke: ink, w: 1.4, opacity });
    text(g, (x1 + x2) / 2, y + 24, label, { opacity, fill: ink });
  };
  const allFaces = Array.from({ length: NF }, (_, k) => k);
  const ring0 = ringOf(I0, r);
  const ringX = (faces) => [noisy[faces[0]][0], noisy[faces[faces.length - 1] + 1][0]];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        profile(g, noisy);
        normals(g, noisy, allFaces.filter((k) => !ring0.includes(k)), { stroke: mute, opacity: 0.7 });
        normals(g, noisy, ring0, { stroke: body, opacity: 0.9 });
        faceSeg(g, noisy, I0, { stroke: ink, w: 4.5 });
        const [x1, x2] = ringX(ring0);
        bracket(g, x1, x2, 290, L.ring, e);
        text(g, C[I0][0], 274, L.face, { size: 16, fill: ink });
        const tip = [C[I0][0] + V0[0] * 78 * e, C[I0][1] + V0[1] * 78 * e];
        if (e > 0.05) arrow(g, C[I0], tip, { stroke: accent, w: 3.2, head: 10 });
        text(g, C[I0][0] - 4, C[I0][1] - 92, L.dir, { fill: accent, weight: 600, opacity: e });
      }

      if (i === 1) {
        profile(g, noisy);
        const removed = ring0.filter((k) => !iso0.includes(k));
        normals(g, noisy, iso0, { stroke: accent, opacity: 0.95 });
        normals(g, noisy, removed, { stroke: mute, opacity: 1 - 0.65 * e });
        for (const k of iso0) faceSeg(g, noisy, k, { stroke: accent, w: 4 });
        for (const k of removed) {
          const c = centroid(noisy, k), q = 6 * e;
          if (q > 0.5) kit.svg("path", { d: `M${c[0] - q} ${c[1] - q} L${c[0] + q} ${c[1] + q} M${c[0] + q} ${c[1] - q} L${c[0] - q} ${c[1] + q}`, stroke: ink, "stroke-width": 2.2, "stroke-linecap": "round" }, g);
        }
        arrow(g, C[I0], [C[I0][0] + V0[0] * 78, C[I0][1] + V0[1] * 78], { stroke: accent, w: 3.2, head: 10, opacity: 0.5 });
        const [x1] = ringX(iso0);
        const x2 = noisy[iso0[iso0.length - 1] + 1][0];
        bracket(g, x1, x2, 290, L.kept);
        const rx = removed.filter((k) => k > I0).map((k) => C[k][0]);
        if (rx.length) {
          const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
          text(g, mx + 40, 132, L.removed, { opacity: e });
          line(g, [mx + 10, 140], [mx, 188], { stroke: mute, w: 1.2, opacity: e });
        }
      }

      if (i === 2) {
        profile(g, noisy);
        const others = wide.filter((k) => !similar.has(k));
        normals(g, noisy, allFaces.filter((k) => !wide.includes(k)), { stroke: mute, opacity: 0.4 });
        normals(g, noisy, others, { stroke: mute, opacity: 0.9 });
        const shown = [...similar].sort((a, b) => Math.abs(a - I0) - Math.abs(b - I0));
        const n = Math.round(shown.length * e);
        for (const k of shown.slice(0, Math.max(1, n))) faceSeg(g, noisy, k, { stroke: accent, w: 4 });
        normals(g, noisy, shown.slice(0, Math.max(1, n)), { stroke: accent, opacity: 0.95 });
        faceSeg(g, noisy, I0, { stroke: ink, w: 4.5 });
        const x1 = noisy[wide[0]][0], x2 = noisy[wide[wide.length - 1] + 1][0];
        bracket(g, x1, x2, 290, L.wide);
        text(g, 180, 190, L.similar, { fill: accent, weight: 600, opacity: e });
        text(g, 440, 60, L.other, { fill: body, opacity: e });
      }

      if (i === 3) {
        // M: stacked normals (k x 3)
        const cw = 18, mx0 = 40, my0 = 80;
        Mcol.forEach((row, a) => row.forEach((v, b) => {
          kit.svg("rect", { x: mx0 + b * cw, y: my0 + a * cw, width: cw - 2, height: cw - 2, fill: accent, opacity: shade(v) }, g);
        }));
        text(g, mx0 + 26, 326, L.M, { fill: ink });
        arrow(g, [102, 188], [150, 188], { stroke: ink, w: 1.6 });
        text(g, 126, 170, L.reshape, { size: 15 });
        const grid = (x0, y0, Mx, op) => {
          const c = 24;
          Mx.forEach((row, a) => row.forEach((v, b) => {
            kit.svg("rect", { x: x0 + b * c, y: y0 + a * c, width: c - 2, height: c - 2, fill: accent, opacity: shade(v) * op }, g);
          }));
          kit.svg("rect", { x: x0 - 3, y: y0 - 3, width: G * c + 4, height: G * c + 4, fill: "none", stroke: rule, "stroke-width": 1.2, opacity: op }, g);
        };
        grid(162, 116, Rm, 1);
        text(g, 232, 296, L.R, { fill: ink, weight: 600 });
        // Legendre basis sketch above the arrow
        const px0 = 326, px1 = 420, py = 120, ph = 30;
        line(g, [px0, py], [px1, py], { stroke: rule, w: 1 });
        legendre.forEach((f, p) => {
          const pts = [];
          for (let q = 0; q <= 24; q++) { const x = -1 + q / 12; pts.push([px0 + ((x + 1) / 2) * (px1 - px0), py - f(x) * ph * 0.9]); }
          kit.svg("polyline", { points: pts.map((v) => v.join(",")).join(" "), fill: "none", stroke: p === 0 ? ink : accent, "stroke-width": 1.6, opacity: 0.45 + 0.15 * p }, g);
        });
        arrow(g, [322, 188], [424, 188], { stroke: ink, w: 1.6 });
        text(g, 373, 216, L.fit, { size: 16, fill: ink });
        grid(436, 116, Zm, e);
        text(g, 508, 296, L.Z, { fill: ink, weight: 600, opacity: e });
      }

      if (i === 4) {
        const cur = noisy.map((p, k) => mix(p, denoised[k], e));
        profile(g, noisy, { opacity: 0.35 * (1 - e), dots: false });
        profile(g, cur, { stroke: ink, w: 2.4 });
        normals(g, cur, allFaces, { stroke: accent, opacity: 0.85, normal: (k) => NC[k] });
        if (e < 0.9) {
          for (let k = 2; k < NV - 1; k += 4) {
            const a = noisy[k], b = denoised[k];
            if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 2.5) line(g, a, b, { stroke: ink, w: 1.2, opacity: 0.6 * (1 - e), dash: "3 3" });
          }
        }
        text(g, 170, 190, L.filtered, { fill: accent, weight: 600 });
        const cr = cur[KC];
        line(g, [cr[0], cr[1] + 10], [cr[0], 292], { stroke: mute, w: 1.2, opacity: e });
        text(g, cr[0], 316, L.edge, { fill: ink, weight: 600, opacity: e });
      }
    },
  });
}
