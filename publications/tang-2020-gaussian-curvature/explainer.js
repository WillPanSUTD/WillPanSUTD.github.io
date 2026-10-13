// Gaussian Curvature Filter schematic: Theorem 1 (a developable surface has a neighbour on the
// tangent plane) -> domain decomposition -> projection distance to the tangent plane (no constraint)
// -> constrained distance over all 1-ring normals -> vertex update v' = v + |d|·δ.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Theorem 1: on a developable surface, every point x has a nearby point x0 on its tangent plane. At the noisy vertex shown here, no neighbour lies on its tangent plane.",
        "Domain decomposition colours the vertices so that no two neighbours share a colour. One colour set moves at a time; its 1-ring neighbours stay fixed.",
        "Without constraint: measure the distance from each 1-ring neighbour to the tangent plane of vi and take the smallest, |d|.",
        "With constraint: project each edge vi→vj onto the normal of vi and the normals of its neighbours (5 × 6 = 30 distances); |d| is the smallest. On a plane, edge or corner it is 0, so the vertex stays.",
        "Update: vi moves by |d| along δ, the reversed differential coordinate (v′ = v + |d|·δ). A neighbour now lies on its tangent plane. Repeating this over all domains lowers the Gaussian curvature.",
      ],
      dev: "developable", noisy: "noisy vertex", plane: "tangent plane", none: "no neighbour on plane",
      dom: ["moves", "fixed", "fixed"], domTitle: "domain", colon: ": ", min: "smallest",
      thirty: "distances", feat: "plane / edge / corner → |d| = 0",
    },
    zh: {
      steps: [
        "定理 1：可展曲面上任一点 x 的附近，总存在一点 x0 位于其切平面上。而在图中这个带噪声的顶点处，没有任何邻点落在其切平面上。",
        "区域分解为顶点着色，使相邻顶点颜色互不相同。每次只移动同一颜色的顶点集合，其一环邻域顶点保持不动。",
        "无约束策略：计算一环邻域中各邻点到 vi 切平面的距离，取其中最小值作为 |d|。",
        "带约束策略：把每条边 vi→vj 投影到 vi 及各邻点的法向上（5 × 6 = 30 个距离），取最小值作为 |d|。在平面、棱边和角点处该值为 0，顶点保持不动。",
        "更新：vi 沿 δ（微分坐标的反方向）移动 |d|，即 v′ = v + |d|·δ，此时有一个邻点落在其切平面上。对所有区域反复迭代，高斯曲率随之降低。",
      ],
      dev: "可展曲面", noisy: "噪声顶点", plane: "切平面", none: "无邻点在切平面上",
      dom: ["移动", "固定", "固定"], domTitle: "区域", colon: "：", min: "最小",
      thirty: "个候选距离", feat: "平面 / 棱边 / 角点 → |d| = 0",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the moving vertex / chosen distance, and two further domain colours.
  const RED = "#d1453b";
  const DOM = [accent, "#d9822b", "#2e9e6b"];

  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: body, width: 1.6 });

  // Text with an optional subscript (tspan >= 14 viewBox units).
  const lab = (g, x, y, base, sub, o = {}) => {
    const size = o.size ?? 22;
    const n = text(g, x, y, base, { size, fill: o.fill ?? ink, anchor: o.anchor, italic: true, opacity: o.opacity });
    if (sub) {
      const s = kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = sub;
    }
    return n;
  };

  // Oblique projection: X right, Y up, Z toward the viewer (down-left on screen).
  const proj = (cx, cy, k) => ([X, Y, Z]) => [cx + k * (X - 0.3 * Z), cy - k * (Y - 0.34 * Z)];
  const poly = (g, pts, attrs) => kit.svg("polygon", { points: pts.map((p) => p.join(",")).join(" "), ...attrs }, g);

  // 1-ring: vertex vi on top, five neighbours on a ring (evenly spaced, so the centroid is directly below vi
  // and δ points straight down). Heights below vi; the smallest gap belongs to v_j1.
  const R = 120;
  const ANG = [0, 72, 144, 216, 288].map((a) => (a * Math.PI) / 180);
  const DROP = [42, 84, 108, 120, 96];
  const ring = ANG.map((a, k) => [R * Math.cos(a), -DROP[k], R * Math.sin(a)]);
  const VI = [0, 0, 0];
  const PLANE = [[-150, 0, -70], [150, 0, -70], [150, 0, 70], [-150, 0, 70]];

  const drawRing = (g, P, vi, o = {}) => {
    const pv = P(vi);
    // back edges dashed, front edges solid
    ring.forEach((p, k) => {
      const q = ring[(k + 1) % ring.length];
      const back = p[2] + q[2] < -40;
      line(g, P(p), P(q), { stroke: o.edge ?? ink, w: 1.8, dash: back ? "5 5" : null, opacity: o.opacity ?? 1 });
    });
    ring.forEach((p) => line(g, pv, P(p), { stroke: o.edge ?? ink, w: 1.8, dash: p[2] < -60 ? "5 5" : null, opacity: o.opacity ?? 1 }));
    ring.forEach((p) => kit.svg("circle", { cx: P(p)[0], cy: P(p)[1], r: 4.5, fill: ink, opacity: o.opacity ?? 1 }, g));
  };
  const drawPlane = (g, P, y, opacity = 1) => {
    const pts = PLANE.map(([X, , Z]) => P([X, y, Z]));
    poly(g, pts, { fill: accent, opacity: 0.13 * opacity });
    poly(g, pts, { fill: "none", stroke: accent, "stroke-width": 1.2, opacity: 0.6 * opacity });
    return pts;
  };
  const vertexDot = (g, p, r = 7) => kit.svg("circle", { cx: p[0], cy: p[1], r, fill: RED, stroke: ink, "stroke-width": 1.6 }, g);

  // Step 2: triangular lattice, 3-coloured with (i - j) mod 3 so that no two neighbours share a colour.
  const LAT = [];
  const rnd = kit.rng(35);
  for (let j = 0; j < 5; j++) {
    for (let i = 0; i < 9; i++) {
      const x = 92 + i * 58 + j * 29 - 58 + (rnd() - 0.5) * 8;
      const y = 92 + j * 48 + (rnd() - 0.5) * 8;
      LAT.push({ i, j, x, y, c: (((i - j) % 3) + 3) % 3 });
    }
  }
  const at = (i, j) => LAT.find((p) => p.i === i && p.j === j);
  const LEDGE = [];
  for (const p of LAT) {
    for (const [di, dj] of [[1, 0], [0, 1], [-1, 1]]) {
      const q = at(p.i + di, p.j + dj);
      if (q) LEDGE.push([p, q]);
    }
  }
  const inView = (p) => p.x > 20 && p.x < 620;

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // Left: cylinder (developable), axis along X; its top ruling lies in the tangent plane.
        const P = proj(160, 205, 1);
        const Rc = 62;
        const plane = [[-120, Rc, -55], [120, Rc, -55], [120, Rc, 55], [-120, Rc, 55]].map(P);
        const C = (X, a) => { const r = (a * Math.PI) / 180; return P([X, Rc * Math.cos(r), Rc * Math.sin(r)]); };
        // shaded strips of a lying half-cylinder, back to front
        for (let a = -90; a < 90; a += 15) {
          const quad = [C(-95, a), C(95, a), C(95, a + 15), C(-95, a + 15)];
          const mid = ((a + 7.5) * Math.PI) / 180;
          const shade = Math.max(0, 0.7 * Math.cos(mid) + 0.7 * Math.sin(mid)) / 0.99;
          poly(g, quad, { fill: bg });
          poly(g, quad, { fill: mute, opacity: 0.55 - 0.4 * shade, stroke: body, "stroke-width": 0.8 });
        }
        const arc = [];
        for (let a = -90; a <= 90; a += 10) arc.push(C(95, a));
        kit.svg("polyline", { points: arc.map((q) => q.join(",")).join(" "), fill: "none", stroke: body, "stroke-width": 1.6 }, g);
        poly(g, plane, { fill: accent, opacity: 0.13 * e });
        poly(g, plane, { fill: "none", stroke: accent, "stroke-width": 1.2, opacity: 0.6 * e });
        line(g, P([-95, Rc, 0]), P([95, Rc, 0]), { stroke: accent, w: 2.4 });
        const x = P([-28, Rc, 0]);
        const x0 = P([34, Rc, 0]);
        vertexDot(g, x, 6.5);
        kit.svg("circle", { cx: x0[0], cy: x0[1], r: 6.5, fill: accent, stroke: ink, "stroke-width": 1.6, opacity: e }, g);
        lab(g, x[0] - 4, x[1] - 14, "x");
        lab(g, x0[0] + 6, x0[1] - 14, "x", "0", { opacity: e });
        text(g, 160, 300, L.dev, { weight: 600, size: 22 });

        // Right: noisy vertex; every neighbour is below its tangent plane.
        const Q = proj(470, 150, 0.72);
        drawPlane(g, Q, 0, e);
        drawRing(g, Q, VI);
        vertexDot(g, Q(VI));
        lab(g, Q(VI)[0] + 10, Q(VI)[1] - 12, "v", "i", { anchor: "start" });
        text(g, 470, 300, L.noisy, { weight: 600, size: 22 });
        text(g, 470, 330, L.none, { size: 19, fill: body, opacity: e });
        line(g, [320, 40], [320, 320], { stroke: rule, w: 1.2 });
      }

      if (i === 1) {
        for (const [p, q] of LEDGE) {
          if (inView(p) && inView(q)) line(g, [p.x, p.y], [q.x, q.y], { stroke: mute, w: 1.2 });
        }
        for (const p of LAT) {
          if (!inView(p)) continue;
          const moving = p.c === 0;
          const r = moving ? 6 + 2.5 * e : 6;
          kit.svg("circle", { cx: p.x, cy: p.y, r, fill: bg }, g);
          kit.svg("circle", { cx: p.x, cy: p.y, r, fill: DOM[p.c], stroke: moving ? ink : "none", "stroke-width": 1.4, opacity: moving ? 1 : 1 - 0.45 * e }, g);
          if (moving && e > 0.05) arrow(g, [p.x, p.y + 9], [p.x, p.y + 9 + 14 * e], { stroke: ink, w: 1.6, head: 6 });
        }
        // legend
        const lx = [92, 280, 468];
        L.dom.forEach((name, k) => {
          kit.svg("circle", { cx: lx[k], cy: 332, r: 8, fill: DOM[k] }, g);
          text(g, lx[k] + 16, 339, `${L.domTitle} ${k + 1}${L.colon}${name}`, { anchor: "start", size: 19, fill: k === 0 ? ink : body, weight: k === 0 ? 600 : 400 });
        });
      }

      if (i === 2 || i === 3 || i === 4) {
        const P = proj(230, 92, 1);
        const shift = i === 4 ? DROP[0] * e : 0;
        const vi = [0, -shift, 0];
        drawPlane(g, P, -shift);
        const corner = P([150, -shift, -70]);
        text(g, corner[0] + 10, corner[1] + 12, L.plane, { anchor: "start", size: 19, fill: accent });
        if (i === 4 && e > 0.02) {
          // ghost of the original position
          kit.svg("circle", { cx: P(VI)[0], cy: P(VI)[1], r: 6, fill: "none", stroke: RED, "stroke-width": 1.6, "stroke-dasharray": "3 3" }, g);
        }
        drawRing(g, P, vi);

        // normal of vi
        if (i !== 4) {
          arrow(g, P(vi), [P(vi)[0], P(vi)[1] - 62], { stroke: RED, w: 2.4, head: 10 });
          lab(g, P(vi)[0] + 10, P(vi)[1] - 46, "n", "vi", { anchor: "start", size: 20, fill: RED });
        }

        if (i === 2) {
          // distance from each neighbour up to the tangent plane
          ring.forEach((p, k) => {
            const a = P(p);
            const b = P([p[0], 0, p[2]]);
            const best = k === 0;
            const tip = [a[0], a[1] + (b[1] - a[1]) * e];
            line(g, a, tip, { stroke: best ? RED : body, w: best ? 2.8 : 1.4, dash: best ? null : "4 4" });
          });
          const a = P(ring[0]);
          const b = P([ring[0][0], 0, ring[0][2]]);
          lab(g, a[0] + 12, (a[1] + b[1]) / 2 + 8, "|d|", null, { anchor: "start", size: 22, fill: RED, opacity: e });
          const c = P(ring[2]);
          lab(g, c[0] - 10, c[1] - 60, "d", "j", { anchor: "end", size: 20, fill: body, opacity: e });
          text(g, 450, 230, `|d| = ${L.min}`, { anchor: "start", size: 20, fill: RED, opacity: e });
        }

        if (i === 3) {
          // normals of the neighbours (cross product of the two edges at each neighbour, Eq. 7)
          ring.forEach((p, k) => {
            const len = 56 * e;
            // the front neighbour's normal would run along the spoke vi -> vj; tilt it sideways so it reads
            const dir = [(p[0] / R) * 0.45 + (k === 1 ? 0.75 : 0), 1, (p[2] / R) * 0.45];
            const nrm = Math.hypot(...dir);
            const tip = [p[0] + (dir[0] / nrm) * len, p[1] + (dir[1] / nrm) * len, p[2] + (dir[2] / nrm) * len];
            if (len > 4) arrow(g, P(p), P(tip), { stroke: accent, w: 2, head: 8 });
          });
          // one edge vi -> vj, projected onto every normal
          line(g, P(vi), P(ring[2]), { stroke: RED, w: 3 });
          text(g, 450, 200, "5 × 6 = 30", { anchor: "start", size: 20, fill: ink, opacity: e });
          text(g, 450, 226, L.thirty, { anchor: "start", size: 20, fill: ink, opacity: e });
          text(g, 450, 258, `|d| = ${L.min}`, { anchor: "start", size: 20, fill: RED, opacity: e });
          text(g, 320, 336, L.feat, { size: 20, fill: ink, weight: 600, opacity: e });
        }

        if (i === 4) {
          const p0 = P(VI);
          const p1 = P(vi);
          if (shift > 2) arrow(g, [p0[0] - 18, p0[1]], [p1[0] - 18, p1[1]], { stroke: RED, w: 2.4, head: 8 });
          lab(g, p0[0] - 28, p0[1] + 30, "δ", null, { anchor: "end", size: 22, fill: RED, opacity: e });
          // the closest neighbour now lies on the tangent plane
          const n1 = P(ring[0]);
          kit.svg("circle", { cx: n1[0], cy: n1[1], r: 9 * e + 4, fill: "none", stroke: accent, "stroke-width": 2.2, opacity: e }, g);
          lab(g, n1[0] + 8, n1[1] + 34, "v", "j1", { anchor: "start", size: 20, fill: accent, opacity: e });
          text(g, 450, 230, "v′ = v + |d|·δ", { anchor: "start", size: 22, fill: ink, weight: 600, opacity: e });
        }

        vertexDot(g, P(vi));
        if (i === 4) lab(g, P(vi)[0] + 12, P(vi)[1] - 12, "v′", "i", { anchor: "start" });
        else lab(g, P(vi)[0] - 14, P(vi)[1] - 8, "v", "i", { anchor: "end" });
      }
    },
  });
}
