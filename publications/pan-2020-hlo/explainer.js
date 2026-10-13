// HLO schematic on one vertex v0 and its 1-ring (cf. Fig. 4 of the paper):
// full-window uniform Laplacian -> pair vA with vD to split into two half windows ->
// half-window Laplacians d1, d2 -> project onto the full-window direction n ->
// keep the candidate with the least energy and update the vertex.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The uniform Laplacian compares a vertex v₀ with the centroid v′₀ of all its neighbours (the full window). At a vertex on a sharp edge the surface is not differentiable, so this operator is not applicable there; in practice it wipes out features and shrinks the mesh.",
        "Half windows: start from a neighbour vA and pair it with vD, the neighbour closest to the plane through v₀, vA and v′₀. The line vA–vD splits the neighbours into a left and a right half window.",
        "The uniform Laplacian is applied to each half window separately, giving the half-window Laplacians d₁ and d₂.",
        "Each one is projected onto the full-window direction n: δ = (d·n)n. This removes the tangential shift that would otherwise cause flipped and degenerate triangles.",
        "Every neighbour serves once as the start, giving 2|NV(v₀)| candidates. The one with the least energy (its length plus the vertex's distance from its original position) moves the vertex; this repeats for a set number of iterations, the only parameter.",
      ],
      full: ["full window", "features wiped,", "mesh shrinks"],
      halves: ["left half window", "right half window"],
      proj: ["removes the", "tangential part"],
      energy: "energy E", cands: "14 candidates", repeat: "repeat k times",
    },
    zh: {
      steps: [
        "均匀拉普拉斯算子把顶点 v₀ 与其全部邻点（完整窗口）的质心 v′₀ 作比较。在尖锐边上的顶点处，曲面不可微，该算子并不适用；实际光顺时，它会抹平特征并使网格收缩。",
        "半窗口：从邻点 vA 出发，与到 v₀、vA、v′₀ 所在平面距离最短的邻点 vD 配对，直线 vA–vD 把邻域分成左、右两个半窗口。",
        "在每个半窗口上分别计算均匀拉普拉斯，得到半窗口拉普拉斯 d₁ 和 d₂。",
        "将它们投影到完整窗口的方向 n 上：δ = (d·n)n，以去除切向偏移，否则会产生三角面片翻转和退化。",
        "每个邻点轮流作为起点，共得到 2|NV(v₀)| 个候选。取能量（自身长度加上顶点与初始位置的距离）最小者更新顶点；如此迭代若干次，迭代次数是唯一的参数。",
      ],
      full: ["完整窗口", "抹平特征，", "网格收缩"],
      halves: ["左半窗口", "右半窗口"],
      proj: ["去除切向分量"],
      energy: "能量 E", cands: "共 14 个候选", repeat: "重复迭代 k 次",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  // Literal semantic colours: the two half windows (as in the paper's Fig. 4).
  const LEFT = "#6b8cba";
  const RIGHT = "#d9822b";

  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: accent, width: 2 });
  const sub = (g, x, y, base, s, o = {}) => {
    const size = o.size ?? 20;
    const node = text(g, x, y, base, { ...o, size });
    const t = kit.svg("tspan", { "font-size": Math.max(14, Math.round(size * 0.8)), dy: 5 }, node);
    t.textContent = s;
    return node;
  };

  // --- 1-ring geometry (screen space, schematic) --------------------------------
  const V0 = [245, 125];
  const N = { // neighbours in cyclic order: D C B A G F E
    D: [155, 80], C: [325, 85], B: [425, 170], A: [345, 270],
    G: [215, 310], F: [100, 278], E: [70, 185],
  };
  const order = ["D", "C", "B", "A", "G", "F", "E"];
  const ringPts = order.map((k) => N[k]);
  const mean = (ps) => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
  const C0 = mean(ringPts); // v'0
  const R = ["D", "C", "B", "A"]; // right half window (incl. the split pair)
  const Lw = ["A", "G", "F", "E", "D"]; // left half window
  const cR = mean(R.map((k) => N[k]));
  const cL = mean(Lw.map((k) => N[k]));
  const nx = V0[0] - C0[0], ny = V0[1] - C0[1];
  const nl = Math.hypot(nx, ny);
  const n = [nx / nl, ny / nl]; // full-window direction
  const foot = (c) => { // projection of c onto the line through v0 along n
    const k = (c[0] - V0[0]) * n[0] + (c[1] - V0[1]) * n[1];
    return [V0[0] + k * n[0], V0[1] + k * n[1]];
  };
  const fR = foot(cR), fL = foot(cL);
  const perp = [-n[1], n[0]];
  const off = (p, s) => [p[0] + perp[0] * s, p[1] + perp[1] * s];
  const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  const shorten = (a, b, px) => { // move b towards a by px
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return lerp(a, b, Math.max(0, (d - px) / d));
  };

  const poly = (g, keys, attrs) => kit.svg("polygon", {
    points: keys.map((k) => N[k].join(",")).join(" ") + " " + V0.join(","), ...attrs,
  }, g);

  const drawMesh = (g, v, { split = 0, ghost = null } = {}) => {
    kit.svg("polygon", { points: ringPts.map((p) => p.join(",")).join(" "), fill: rule, opacity: 0.45 }, g);
    if (split > 0) {
      poly(g, R, { fill: RIGHT, opacity: 0.18 * split });
      poly(g, Lw, { fill: LEFT, opacity: 0.18 * split });
    }
    for (let k = 0; k < order.length; k++) {
      line(g, ringPts[k], ringPts[(k + 1) % order.length], { stroke: body, w: 1.6 });
    }
    if (ghost) {
      for (const p of ringPts) line(g, ghost, p, { stroke: mute, w: 1, dash: "3 4" });
    }
    for (const key of order) {
      let stroke = body;
      if (split > 0.5) stroke = key === "A" || key === "D" ? ink : (R.includes(key) ? RIGHT : LEFT);
      line(g, v, N[key], { stroke, w: split > 0.5 ? 1.8 : 1.3 });
    }
    for (const key of order) {
      const p = N[key];
      let fill = mute;
      if (split > 0.5) fill = key === "A" || key === "D" ? ink : (R.includes(key) ? RIGHT : LEFT);
      kit.svg("circle", { cx: p[0], cy: p[1], r: 5, fill }, g);
      const dx = p[0] - 245, dy = p[1] - 195;
      const dl = Math.hypot(dx, dy);
      // vD and vA sit on the split line: put their labels beside it, not on it.
      const at = key === "D" ? [p[0] - 26, p[1] + 6] : key === "A" ? [p[0] + 26, p[1] + 6]
        : [p[0] + (dx / dl) * 24, p[1] + (dy / dl) * 22 + 6];
      sub(g, at[0], at[1], "v", key, { fill: body, size: 19 });
    }
    kit.svg("circle", { cx: v[0], cy: v[1], r: 6.5, fill: ink }, g);
    sub(g, v[0] - 12, v[1] - 21, "v", "0", { weight: 600 });
  };

  const centroid = (g, c, label, fill, opacity = 1, dx = -26) => {
    kit.svg("circle", { cx: c[0], cy: c[1], r: 5, fill: "none", stroke: fill, "stroke-width": 2, opacity }, g);
    if (label) sub(g, c[0] + dx, c[1] + 6, label[0], label[1], { fill, size: 19, opacity });
  };

  const panel = (g, lines, opacity, y0 = 150, fill = body, x = 545) => {
    lines.forEach((s, k) => text(g, x, y0 + k * 28, s, { size: 19, fill, opacity }));
  };

  // Deterministic energies for the candidate bars; candidate 1 (right half window) is the least.
  const rnd = kit.rng(34);
  const E = [0.3, 0.86];
  for (let k = 0; k < 4; k++) E.push(0.45 + 0.5 * rnd());

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        drawMesh(g, V0);
        for (const p of ringPts) line(g, p, lerp(p, C0, e), { stroke: accent, w: 1, dash: "3 4", opacity: 0.7 });
        centroid(g, C0, ["v′", "0"], accent, e);
        arrow(g, C0, lerp(C0, shorten(C0, V0, 9), e), { w: 2.4 });
        text(g, (C0[0] + V0[0]) / 2 + 18, (C0[1] + V0[1]) / 2 + 12, "d", { italic: true, fill: accent, opacity: e, size: 22 });
        panel(g, L.full, e);
      }

      if (i === 1) {
        drawMesh(g, V0, { split: e });
        const dir = [N.A[0] - N.D[0], N.A[1] - N.D[1]];
        const a = [N.D[0] - dir[0] * 0.35, N.D[1] - dir[1] * 0.35];
        const b = [N.A[0] + dir[0] * 0.3, N.A[1] + dir[1] * 0.3];
        line(g, lerp(a, b, 0), lerp(a, b, e), { stroke: ink, w: 2, dash: "7 5" });
        centroid(g, C0, ["v′", "0"], body);
        panel(g, [L.halves[1]], e, 110, RIGHT);
        panel(g, [L.halves[0]], e, 345, LEFT, 95);
      }

      if (i === 2) {
        drawMesh(g, V0, { split: 1 });
        centroid(g, cR, null, RIGHT);
        centroid(g, cL, null, LEFT);
        arrow(g, cR, lerp(cR, shorten(cR, V0, 9), e), { stroke: RIGHT, w: 2.6 });
        arrow(g, cL, lerp(cL, shorten(cL, V0, 9), e), { stroke: LEFT, w: 2.6 });
        sub(g, cR[0] + 24, cR[1] + 26, "d", "1", { fill: RIGHT, opacity: e, size: 22, weight: 600 });
        sub(g, (cL[0] + V0[0]) / 2 - 22, (cL[1] + V0[1]) / 2 + 4, "d", "2", { fill: LEFT, opacity: e, size: 22, weight: 600 });
      }

      if (i === 3) {
        drawMesh(g, V0, { split: 1 });
        const top = [V0[0] + n[0] * 70, V0[1] + n[1] * 70];
        const bot = [V0[0] - n[0] * 150, V0[1] - n[1] * 150];
        line(g, top, bot, { stroke: ink, w: 1.2, dash: "4 4", opacity: 0.8 });
        arrow(g, V0, [V0[0] + n[0] * 52, V0[1] + n[1] * 52], { stroke: ink, w: 2 });
        text(g, V0[0] + n[0] * 52 + 18, V0[1] + n[1] * 52 + 4, "n", { italic: true, weight: 600, size: 22 });
        // faded d1, d2 with dashed drop to the axis
        arrow(g, cR, shorten(cR, V0, 9), { stroke: RIGHT, w: 1.6, opacity: 0.35 });
        arrow(g, cL, shorten(cL, V0, 9), { stroke: LEFT, w: 1.6, opacity: 0.35 });
        line(g, cR, lerp(cR, off(fR, 7), e), { stroke: RIGHT, w: 1.4, dash: "3 3" });
        line(g, cL, lerp(cL, off(fL, -7), e), { stroke: LEFT, w: 1.4, dash: "3 3" });
        if (e > 0.05) {
          arrow(g, off(fR, 7), off(V0, 7), { stroke: RIGHT, w: 3, head: 8, opacity: e });
          arrow(g, off(fL, -7), off(shorten(fL, V0, 8), -7), { stroke: LEFT, w: 3, opacity: e });
        }
        sub(g, fR[0] + 46, fR[1] + 30, "δ", "1", { fill: RIGHT, opacity: e, size: 22, weight: 600, italic: true });
        sub(g, fL[0] - 34, fL[1] + 6, "δ", "2", { fill: LEFT, opacity: e, size: 22, weight: 600, italic: true });
        text(g, 545, 150, "δ = (d·n) n", { size: 20, fill: ink, opacity: e, italic: true });
        panel(g, L.proj, e, 184);
      }

      if (i === 4) {
        const shift = [fR[0] - V0[0], fR[1] - V0[1]];
        const v = [V0[0] + shift[0] * e, V0[1] + shift[1] * e];
        drawMesh(g, v, { ghost: V0 });
        text(g, 560, 66, L.energy, { size: 20, fill: ink, weight: 600 });
        E.forEach((val, k) => {
          const y = 96 + k * 30;
          const best = k === 0;
          sub(g, 500, y + 6, "δ", String(k + 1), { size: 18, italic: true, fill: best ? accent : body });
          kit.svg("rect", { x: 520, y: y - 8, width: 100 * val * Math.max(0, Math.min(1, t * 1.6)), height: 16, rx: 2, fill: best ? accent : mute, opacity: best ? 1 : 0.6 }, g);
        });
        text(g, 510, 96 + 6 * 30 - 4, "…", { size: 18, fill: body });
        text(g, 560, 96 + 6 * 30 + 22, L.cands, { size: 17, fill: body });
        text(g, 560, 330, L.repeat, { size: 18, fill: accent, weight: 600, opacity: e });
      }
    },
  });
}
