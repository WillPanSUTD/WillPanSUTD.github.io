// Uniform feature-preserving filtering, side view of one sharp edge:
// noisy points + normals -> bilateral normal filtering -> data term (points reach the
// surface but pile up at the edge, leaving gaps) -> repulsion term (even spacing) -> iterate.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Input: noisy points near a sharp edge, each with an initial normal (estimated by PCA if the input has none).",
        "Phase one: the normals are smoothed by bilateral filtering, so each face gets a consistent normal and the two faces stay distinct at the edge.",
        "Data term: each point is moved so that the vector to each neighbour turns perpendicular to both points' normals. Points reach the surface, but drift towards the edge and leave gaps beside it.",
        "Repulsion term: neighbouring points push each other apart perpendicular to the neighbour's normal, with a weight that decays with distance; µ sets its strength. The gaps close and the spacing evens out.",
        "Both terms are applied in one update per point, on a patch of its k nearest neighbours, repeated for t iterations: smooth faces, a sharp edge, even spacing.",
      ],
      edge: "sharp edge",
      cap: ["noisy input", "bilateral normal filtering", "data term only", "data term + repulsion term", "repeat t iterations"],
      gap: "gap", pile: "pile-up", data: "to the surface", rep: "push apart", knn: "k nearest", surf: "underlying surface",
    },
    zh: {
      steps: [
        "输入：尖锐棱边附近的含噪点，每个点带有初始法向（若输入不含法向，则用 PCA 估计）。",
        "第一阶段：用双边滤波平滑法向，使每个面的法向一致，同时棱边两侧的两个面保持区分。",
        "数据项：移动每个点，使它与每个邻域点的连线趋于同时垂直于两点的法向。点回到曲面上，但会向棱边聚集，在棱边旁留下空洞。",
        "排斥项：邻域点沿垂直于邻点法向的方向相互推开，权重随距离衰减，参数 µ 控制排斥力大小。空洞被填补，点间距趋于均匀。",
        "两项在每个点的一次更新中同时作用，邻域取 k 个最近邻点，共迭代 t 次：面光滑、棱边尖锐、点分布均匀。",
      ],
      edge: "尖锐棱边",
      cap: ["含噪输入", "双边滤波平滑法向", "仅数据项", "数据项 + 排斥项", "迭代 t 次"],
      gap: "空洞", pile: "聚集", data: "回到曲面", rep: "相互推开", knn: "k 近邻", surf: "真实曲面",
    },
  }, lang);

  const { ink, body, accent, mute } = kit.palette();
  const NOISY = "#d0453a";   // noisy input points
  const POINT = "#d9822b";   // updated points
  const NORMAL = "#3b6fd6";  // filtered normals

  // --- Deterministic geometry: a roof-shaped surface with one sharp edge at B ---
  const A = [60, 300], B = [320, 110], C = [580, 300];
  const faces = [
    { end: A, n: norm([(B[1] - A[1]), -(B[0] - A[0])]) }, // left face, outward normal (up-left)
    { end: C, n: norm([(C[1] - B[1]), -(C[0] - B[0])]) }, // right face, outward normal (up-right)
  ];
  faces.forEach((f) => { f.dir = norm([f.end[0] - B[0], f.end[1] - B[1]]); f.len = Math.hypot(f.end[0] - B[0], f.end[1] - B[1]); });
  function norm(v) { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; }
  const onFace = (f, s, off = 0) => [B[0] + f.dir[0] * f.len * s + f.n[0] * off, B[1] + f.dir[1] * f.len * s + f.n[1] * off];

  const rnd = kit.rng(7);
  const N = 11;
  const pts = [];
  faces.forEach((f, fi) => {
    for (let k = 0; k < N; k++) {
      const s0 = (k + 0.5) / N + (rnd() - 0.5) * 0.05;
      const off = (rnd() - 0.5) * 34;
      const nAng = Math.atan2(f.n[1], f.n[0]) + (rnd() - 0.5) * 1.3;
      const sData = s0 < 0.33 ? 0.02 + s0 * 0.1 : s0;   // data term alone: pile-up at the edge
      const sUni = (k + 0.5) / N;                          // with repulsion: even spacing
      pts.push({
        f, fi, k,
        noisy: onFace(f, s0, off),
        data: onFace(f, sData, 0),
        uni: onFace(f, sUni, 0),
        n0: [Math.cos(nAng), Math.sin(nAng)],
      });
    }
  });

  const { text, line, arrow } = kit.pen({ textSize: 21, stroke: accent, width: 1.6 });
  const mix = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const nmix = (a, b, u) => norm(mix(a, b, u));
  const NL = 24;

  const drawSurface = (g, o = {}) => {
    kit.svg("polyline", {
      points: [A, B, C].map((p) => p.join(",")).join(" "), fill: "none",
      stroke: o.stroke ?? mute, "stroke-width": o.w ?? 1.4, "stroke-dasharray": o.dash ?? "5 5",
      "stroke-linejoin": "miter", opacity: o.opacity ?? 0.9,
    }, g);
  };
  const drawPoints = (g, posOf, nOf, colour, nColour, lenOf = () => NL) => {
    for (const p of pts) {
      const q = posOf(p), n = nOf(p), nl = lenOf(p);
      line(g, q, [q[0] + n[0] * nl, q[1] + n[1] * nl], { stroke: nColour, w: 1.6, opacity: 0.85 });
    }
    for (const p of pts) {
      const q = posOf(p);
      kit.svg("circle", { cx: q[0], cy: q[1], r: 5, fill: colour, stroke: "#ffffff", "stroke-width": 1 }, g);
    }
  };
  const header = (g, i, e) => {
    line(g, [B[0], 70], [B[0], 82], { stroke: body, w: 1.2 });
    text(g, B[0], 58, L.edge, { size: 21, fill: ink, weight: 600 });
    text(g, 320, 344, L.cap[i], { size: 22, fill: accent, weight: 600, opacity: e });
  };
  const gapMarks = (g, opacity) => {
    for (const f of faces) {
      const a = onFace(f, 0.07, -16), b = onFace(f, 0.36, -16);
      line(g, a, b, { stroke: ink, w: 1.6, dash: "3 4", opacity });
      const m = onFace(f, 0.22, -40);
      text(g, m[0] + f.dir[0] * 4, m[1] + 6, L.gap, { size: 20, fill: ink, weight: 600, opacity });
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
        drawSurface(g, { opacity: 0.6 * e });
        drawPoints(g, (p) => p.noisy, (p) => p.n0, NOISY, mute);
        text(g, 320, 250, L.surf, { size: 19, fill: body, opacity: e });
        line(g, [372, 232], [412, 182], { stroke: body, w: 1.2, opacity: e });
        header(g, i, e);
      }

      if (i === 1) {
        drawSurface(g, { opacity: 0.6 });
        drawPoints(g, (p) => p.noisy, (p) => nmix(p.n0, p.f.n, e), NOISY, e > 0.5 ? NORMAL : mute);
        header(g, i, e);
      }

      if (i === 2) {
        drawSurface(g, { opacity: 0.6 });
        for (const p of pts) line(g, p.noisy, mix(p.noisy, p.data, e), { stroke: mute, w: 1.2, opacity: 0.7 * (1 - 0.6 * e) });
        drawPoints(g, (p) => mix(p.noisy, p.data, e), (p) => p.f.n, POINT, NORMAL, (p) => (Math.hypot(p.data[0] - B[0], p.data[1] - B[1]) < 40 ? NL * (1 - 0.6 * e) : NL));
        gapMarks(g, Math.max(0, (e - 0.55) / 0.45));
        // pile-up callout
        const pe = Math.max(0, (e - 0.55) / 0.45);
        line(g, [B[0] + 46, 96], [B[0] + 8, 112], { stroke: body, w: 1.2, opacity: pe });
        text(g, B[0] + 52, 100, L.pile, { size: 19, fill: ink, anchor: "start", opacity: pe });
        arrow(g, [118, 160], [148, 202], { stroke: body, w: 1.4, opacity: e });
        text(g, 118, 150, L.data, { size: 19, fill: ink, opacity: e });
        header(g, i, e);
      }

      if (i === 3) {
        drawSurface(g, { opacity: 0.6 });
        drawPoints(g, (p) => mix(p.data, p.uni, e), (p) => p.f.n, POINT, NORMAL);
        gapMarks(g, 1 - Math.min(1, e * 1.6));
        // repulsion arrows along each face, away from the edge
        const ao = Math.min(1, e * 2) * (1 - Math.max(0, (e - 0.7) / 0.3) * 0.25);
        for (const f of faces) {
          arrow(g, onFace(f, 0.08, 46), onFace(f, 0.3, 46), { stroke: accent, w: 2, opacity: ao, head: 10 });
        }
        text(g, 150, 150, L.rep, { size: 19, fill: accent, weight: 600, opacity: ao });
        text(g, 490, 150, L.rep, { size: 19, fill: accent, weight: 600, opacity: ao });
        header(g, i, e);
      }

      if (i === 4) {
        const sp = kit.svg("polyline", {
          points: [A, B, C].map((p) => p.join(",")).join(" "), fill: "none", stroke: ink, "stroke-width": 2.4,
          "stroke-linejoin": "miter", "stroke-dasharray": "720", "stroke-dashoffset": 720 * (1 - e), opacity: 0.7,
        }, g);
        sp.setAttribute("pathLength", "720");
        drawPoints(g, (p) => p.uni, (p) => p.f.n, POINT, NORMAL);
        // k-nearest-neighbour patch around one point on the right face
        const c = onFace(faces[1], 0.68, 0);
        kit.svg("circle", { cx: c[0], cy: c[1], r: 58 * e + 2, fill: accent, opacity: 0.08 }, g);
        kit.svg("circle", { cx: c[0], cy: c[1], r: 58 * e + 2, fill: "none", stroke: accent, "stroke-width": 1.4, "stroke-dasharray": "4 4", opacity: 0.9 }, g);
        kit.svg("circle", { cx: c[0], cy: c[1], r: 6.5, fill: POINT, stroke: ink, "stroke-width": 2 }, g);
        text(g, c[0] - 66, c[1] + 30, L.knn, { size: 19, fill: accent, weight: 600, anchor: "end", opacity: e });
        header(g, i, e);
      }
    },
  });
}
