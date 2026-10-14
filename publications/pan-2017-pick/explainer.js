// PnP sequencing schematic, using the paper's own worked example (Figs. 2–6):
// align + classify voxels -> cost of one move (Eq. 1) -> Hungarian on the full matrix (GOS, lower bound)
// -> top-access deadlock (Fig. 5) -> LOS: Hungarian on top-surface M and V, stage by stage (Fig. 6).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Align the source and destination voxel models, then label each voxel: M (only in the source) must move, V (only in the destination) must be filled, and overlapped voxels stay.",
        "The cost of one move is counted in voxel units: lift M to the clearance plane, travel across, lower it onto V. Here 5 → 5′ costs 4 + 3 + 2 = 9.",
        "The costs of all M–V pairs form a cost matrix. The Hungarian method finds the pairing with the minimum total cost, 27. This global strategy (GOS) gives the lower bound.",
        "The vacuum gripper can only pick and place at the top surface. Another minimum-cost pairing fails: after two moves, 8 → 8′ and 4 → 6′ can no longer be executed from the top surface (deadlock).",
        "LOS applies the Hungarian method only to the M and V on the top surface, moves that group, updates the surfaces and repeats: here two stages, total cost 27.",
      ],
      src: "source", dst: "destination",
      legend: [["M", "only in source: move"], ["V", "only in destination: fill"], ["", "in both: stay"]],
      oneMove: "cost of one move", unit: "unit: one voxel",
      matrix: "cost matrix", hung: "Hungarian method", total: "total", lower: "GOS: lower bound",
      topOnly: "top surface only", notTop: "not on top", deadlock: "deadlock",
      stage: "stage", sameBound: "= lower bound",
    },
    zh: {
      steps: [
        "先对齐源模型与目标模型，再给体素分类：M（只在源模型中）需要搬走，V（只在目标模型中）需要填补，两者重叠的体素保持不动。",
        "单次搬运的代价以体素为单位：把 M 提升到安全平面，水平移动，再放到 V 上。图中 5 → 5′ 的代价为 4 + 3 + 2 = 9。",
        "所有 M–V 配对的代价构成代价矩阵，匈牙利算法求出总代价最小的配对，总代价为 27。这一全局策略（GOS）给出代价下界。",
        "真空吸盘只能在顶面取放体素。另一组同样代价最小的配对就会失败：执行两步后，8 → 8′ 与 4 → 6′ 无法再从顶面取放，陷入死锁。",
        "局部优化策略（LOS）只对位于顶面的 M 和 V 应用匈牙利算法，搬完这一组后更新顶面，再重复。本例分两个阶段完成，总代价为 27。",
      ],
      src: "源模型", dst: "目标模型",
      legend: [["M", "仅在源模型：搬走"], ["V", "仅在目标模型：填补"], ["", "两者共有：不动"]],
      oneMove: "单次搬运代价", unit: "单位：一个体素",
      matrix: "代价矩阵", hung: "匈牙利算法", total: "总代价", lower: "GOS：代价下界",
      topOnly: "只能取放顶面", notTop: "不在顶面", deadlock: "死锁",
      stage: "阶段", sameBound: "= 下界",
    },
  }, lang);

  const P = kit.palette();
  // Literal semantic colours, as in the paper's figures.
  const GREEN = "#4caf50"; // M voxels
  const YELLOW = "#f2c94c"; // V voxels
  const RED = "#e0533d"; // top surface / blocked
  const DARK = "#0a0a0a"; // neutral text on coloured fills
  const pen = kit.pen({ textSize: 16, stroke: P.body, width: 1.6 });

  // ---- Grid geometry (side view; x = column, z = layer) ---------------------
  const CS = 40, GX = 22, BASE = 318, COLS = 7, ROWS = 5, ZMAX = 5;
  const cellX = (x) => GX + (x - 1) * CS;
  const cellY = (z) => BASE - z * CS;
  const ctr = (x, z) => [cellX(x) + CS / 2, cellY(z) + CS / 2];
  const subSize = (size) => Math.max(14, Math.round(size * 0.8));

  // Text with subscripts: parts = [["c", ""], ["ij", "sub"], ...]
  const rich = (g, x, y, parts, o = {}) => {
    const size = o.size ?? 16;
    const n = kit.text(g, x, y, "", { size, anchor: o.anchor ?? "start", fill: o.fill ?? P.ink, opacity: o.opacity, weight: o.weight });
    for (const [str, kind] of parts) {
      const sub = kind === "sub";
      kit.svg("tspan", sub ? { "font-size": subSize(size), dy: 5 } : {}, n).textContent = str;
      if (sub) kit.svg("tspan", { dy: -5 }, n).textContent = "";
    }
    return n;
  };

  // ---- The paper's worked example (Fig. 2b), aligned --------------------------
  const M0 = { 1: [1, 1], 4: [4, 1], 5: [5, 1], 8: [4, 2] };
  const V0 = { "5′": [2, 3], "6′": [3, 3], "7′": [2, 4], "8′": [3, 4] };
  const O0 = [["2, 1′", 2, 1], ["3, 2′", 3, 1], ["6, 3′", 2, 2], ["7, 4′", 3, 2]];
  // Unaligned destination (Fig. 2a) sits 4 columns to the right.
  const DEST = [["1′", 2, 1], ["2′", 3, 1], ["3′", 2, 2], ["4′", 3, 2], ["5′", 2, 3], ["6′", 3, 3], ["7′", 2, 4], ["8′", 3, 4]];
  const SRC = [["1", 1, 1], ["2", 2, 1], ["3", 3, 1], ["4", 4, 1], ["5", 5, 1], ["6", 2, 2], ["7", 3, 2], ["8", 4, 2]];

  const state = (moves = []) => {
    const cells = {};
    for (const [k, [x, z]] of Object.entries(M0)) cells[`${x},${z}`] = { kind: "M", label: k, x, z };
    for (const [k, [x, z]] of Object.entries(V0)) cells[`${x},${z}`] = { kind: "V", label: k, x, z };
    for (const [lab, x, z] of O0) cells[`${x},${z}`] = { kind: "O", label: lab, x, z };
    for (const [m, v] of moves) {
      const [mx, mz] = M0[m], [vx, vz] = V0[v];
      delete cells[`${mx},${mz}`];
      cells[`${vx},${vz}`] = { kind: "O", label: `${m}, ${v}`, x: vx, z: vz };
    }
    return cells;
  };

  const fillOf = (kind) => (kind === "M" ? GREEN : kind === "V" ? YELLOW : P.mute);
  const box = (g, x, z, kind, label, o = {}) => {
    const op = o.opacity ?? 1;
    const isV = kind === "V";
    kit.svg("rect", {
      x: cellX(x) + 1, y: cellY(z) + 1, width: CS - 2, height: CS - 2,
      fill: fillOf(kind), "fill-opacity": (kind === "O" ? 0.5 : isV ? 0.75 : 0.95) * op,
      stroke: P.body, "stroke-width": 1, "stroke-opacity": 0.6 * op,
      ...(isV && { "stroke-dasharray": "4 3" }),
    }, g);
    if (label && o.labels !== false) {
      kit.text(g, cellX(x) + CS / 2, cellY(z) + CS / 2 + 5, label, {
        size: 14, fill: kind === "O" ? P.ink : DARK, opacity: op,
      });
    }
  };
  const drawCells = (g, cells, o = {}) => {
    for (const c of Object.values(cells)) box(g, c.x, c.z, c.kind, c.label, typeof o === "function" ? o(c) : o);
  };
  const outline = (g, x, z, o = {}) => kit.svg("rect", {
    x: cellX(x) + 1, y: cellY(z) + 1, width: CS - 2, height: CS - 2, fill: "none",
    stroke: o.stroke ?? RED, "stroke-width": 3, opacity: o.opacity ?? 1,
    ...(o.dash && { "stroke-dasharray": o.dash }),
  }, g);

  const grid = (g, { zmax = true } = {}) => {
    for (let x = 0; x <= COLS; x++) pen.line(g, [GX + x * CS, BASE], [GX + x * CS, BASE - ROWS * CS], { stroke: P.rule, w: 1, dash: "3 4" });
    for (let z = 1; z <= ROWS; z++) pen.line(g, [GX, BASE - z * CS], [GX + COLS * CS, BASE - z * CS], { stroke: P.rule, w: 1, dash: "3 4" });
    pen.line(g, [GX - 4, BASE], [GX + COLS * CS + 4, BASE], { stroke: P.body, w: 1.6 });
    if (zmax) {
      const y = ctr(1, ZMAX)[1];
      pen.line(g, [GX, y], [GX + COLS * CS, y], { stroke: P.accent, w: 1.4, dash: "7 5", opacity: 0.8 });
      rich(g, GX + COLS * CS + 6, y + 5, [["z", ""], ["max", "sub"]], { fill: P.accent });
    }
  };

  // Point along the gripper path: up to z_max, across, down. u in [0,1] of path length.
  const pathPts = (a, b) => [ctr(a[0], a[1]), ctr(a[0], ZMAX), ctr(b[0], ZMAX), ctr(b[0], b[1])];
  const along = (pts, u) => {
    const segs = [];
    let tot = 0;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      segs.push(d); tot += d;
    }
    let r = u * tot;
    for (let k = 0; k < segs.length; k++) {
      if (r <= segs[k] || k === segs.length - 1) {
        const f = segs[k] ? Math.min(1, r / segs[k]) : 1;
        return [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f];
      }
      r -= segs[k];
    }
    return pts[pts.length - 1];
  };
  const flyer = (g, p, label) => {
    kit.svg("rect", { x: p[0] - CS / 2 + 1, y: p[1] - CS / 2 + 1, width: CS - 2, height: CS - 2, fill: GREEN, stroke: DARK, "stroke-width": 1.4 }, g);
    kit.text(g, p[0], p[1] + 5, label, { size: 14, fill: DARK });
  };

  // Cost matrix with row/column labels; hi = list of [r, c] cells to ring.
  const matrix = (g, x0, y0, rows, cols, vals, hi, o = {}) => {
    const w = 38, h = 28, op = o.opacity ?? 1, ring = o.ring ?? 1;
    cols.forEach((c, j) => kit.text(g, x0 + 26 + j * w + w / 2, y0, c, { size: 15, fill: P.body, opacity: op }));
    rows.forEach((r, i) => {
      const y = y0 + 10 + i * h;
      kit.text(g, x0 + 10, y + h / 2 + 5, r, { size: 15, fill: P.body, opacity: op });
      cols.forEach((_, j) => {
        const cx = x0 + 26 + j * w + w / 2;
        kit.text(g, cx, y + h / 2 + 5, String(vals[i][j]), { size: 15, fill: P.ink, opacity: op });
      });
    });
    const top = y0 + 10, left = x0 + 26, right = left + cols.length * w, bot = top + rows.length * h;
    for (const [xa, xb] of [[left + 5, left], [right - 5, right]]) {
      kit.svg("path", { d: `M${xa} ${top} L${xb} ${top} L${xb} ${bot} L${xa} ${bot}`, fill: "none", stroke: P.body, "stroke-width": 1.3, opacity: op }, g);
    }
    for (const [i, j] of hi) {
      kit.svg("rect", {
        x: left + j * w + 4, y: top + i * h + 2, width: w - 8, height: h - 4, rx: 6,
        fill: P.accent, "fill-opacity": 0.12 * ring, stroke: P.accent, "stroke-width": 1.8, opacity: ring * op,
      }, g);
    }
    return { bottom: bot, right };
  };

  const RX = 360; // right panel left edge

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        const slide = kit.easeOut(Math.min(1, t / 0.6));
        const colour = Math.max(0, Math.min(1, (t - 0.6) / 0.4));
        grid(g, { zmax: false });
        const shift = 4 * (1 - slide) * CS;
        if (colour < 1) {
          const pre = kit.svg("g", { opacity: 1 - colour }, g);
          for (const [lab, x, z] of SRC) box(pre, x, z, "O", lab);
          for (const [lab, x, z] of DEST) {
            kit.svg("rect", {
              x: cellX(x) + 3 + shift, y: cellY(z) + 3, width: CS - 6, height: CS - 6,
              fill: "none", stroke: P.accent, "stroke-width": 2, "stroke-dasharray": "5 4",
            }, pre);
            if (slide < 0.02) kit.text(pre, cellX(x) + CS / 2 + shift, cellY(z) + CS / 2 + 5, lab, { size: 14, fill: P.accent });
          }
          pen.text(pre, cellX(1) + CS * 1.5, cellY(3) + 6, L.src, { size: 16, fill: P.body });
          pen.text(pre, cellX(2) + CS + shift, cellY(5) + 6, L.dst, { size: 16, fill: P.accent });
        }
        if (colour > 0) drawCells(g, state(), { opacity: colour });
        // Legend
        const items = [[GREEN, 0.95], [YELLOW, 0.75], [P.mute, 0.5]];
        L.legend.forEach(([tag, desc], k) => {
          const y = 120 + k * 52;
          kit.svg("rect", { x: RX, y: y - 18, width: 26, height: 26, fill: items[k][0], "fill-opacity": items[k][1], stroke: P.body, "stroke-width": 1, ...(k === 1 && { "stroke-dasharray": "4 3" }) }, g);
          if (tag) kit.text(g, RX + 13, y + 1, tag, { size: 14, fill: DARK, weight: 600 });
          pen.text(g, RX + 40, y + 1, desc, { anchor: "start", size: 16, fill: P.ink, opacity: 0.25 + 0.75 * colour });
        });
      }

      if (i === 1) {
        grid(g);
        const cells = state();
        delete cells["5,1"]; // voxel 5 is in the gripper
        drawCells(g, cells, (c) => (c.label === "5" || c.label === "5′" ? { opacity: 1 } : { opacity: 0.3, labels: false }));
        kit.svg("rect", { x: cellX(5) + 1, y: cellY(1) + 1, width: CS - 2, height: CS - 2, fill: "none", stroke: GREEN, "stroke-width": 1.6, "stroke-dasharray": "4 3" }, g);
        const pts = pathPts(M0[5], V0["5′"]);
        // full path (dashed), travelled path (solid)
        for (let k = 1; k < pts.length; k++) pen.line(g, pts[k - 1], pts[k], { stroke: P.mute, w: 1.4, dash: "4 4" });
        const p = along(pts, e);
        const done = [pts[0]];
        const u9 = e * 9;
        if (u9 > 0) done.push(u9 >= 4 ? pts[1] : p);
        if (u9 > 4) done.push(u9 >= 7 ? pts[2] : p);
        if (u9 > 7) done.push(p);
        for (let k = 1; k < done.length; k++) pen.line(g, done[k - 1], done[k], { stroke: P.accent, w: 2.4 });
        flyer(g, p, "5");
        // segment lengths
        const lab = (x, y, str, show) => show && pen.text(g, x, y, str, { size: 18, weight: 700, fill: P.accent });
        lab(pts[0][0] + 34, ctr(5, 3)[1] + 6, "4", u9 > 4);
        lab((pts[1][0] + pts[2][0]) / 2, pts[1][1] - 12, "3", u9 > 7);
        lab(pts[3][0] - 34, ctr(2, 4)[1] + 6, "2", e >= 0.999);
        // right panel
        pen.text(g, RX, 92, L.oneMove, { anchor: "start", weight: 600, size: 17 });
        rich(g, RX, 132, [["c = |Δx| + |Δy|", ""]], { size: 17 });
        rich(g, RX + 14, 164, [["+ 2z", ""], ["max", "sub"], [" − z", ""], ["i", "sub"], [" − z", ""], ["j", "sub"]], { size: 17 });
        pen.text(g, RX, 214, `5 → 5′ :  4 + 3 + 2 = 9`, { anchor: "start", size: 18, weight: 600, fill: P.accent, opacity: e });
        pen.text(g, RX, 252, L.unit, { anchor: "start", size: 15, fill: P.body });
      }

      if (i === 2) {
        grid(g);
        drawCells(g, state());
        pen.text(g, RX, 52, `${L.matrix} (4 × 4)`, { anchor: "start", weight: 600, size: 17 });
        const C = [[7, 8, 6, 7], [8, 7, 7, 6], [9, 8, 8, 7], [7, 6, 6, 5]];
        const m = matrix(g, RX, 84, ["1", "4", "5", "8"], ["5′", "6′", "7′", "8′"], C, [[0, 2], [1, 3], [2, 0], [3, 1]], { ring: e });
        pen.text(g, RX, m.bottom + 34, `${L.hung}:`, { anchor: "start", size: 16, fill: P.body, opacity: e });
        pen.text(g, RX, m.bottom + 62, "1→7′  4→8′  5→5′  8→6′", { anchor: "start", size: 16, fill: P.ink, opacity: e });
        pen.text(g, RX, m.bottom + 92, `${L.total} 6 + 6 + 9 + 6 = 27`, { anchor: "start", size: 16, weight: 600, fill: P.accent, opacity: e });
        pen.text(g, RX, m.bottom + 120, L.lower, { anchor: "start", size: 16, fill: P.body, opacity: e });
      }

      if (i === 3) {
        grid(g);
        drawCells(g, state([["5", "5′"], ["1", "7′"]]));
        // top surface: accessible M (8) and V (6′)
        outline(g, 4, 2, { opacity: e });
        outline(g, 3, 3, { opacity: e });
        // blocked targets of the remaining pairs
        outline(g, 4, 1, { stroke: P.ink, dash: "4 4", opacity: e });
        outline(g, 3, 4, { stroke: P.ink, dash: "4 4", opacity: e });
        pen.text(g, RX, 72, L.topOnly, { anchor: "start", weight: 600, size: 17 });
        const rows = [["5 → 5′", "✓", ""], ["1 → 7′", "✓", ""], ["8 → 8′", "✗", `8′ ${L.notTop}`], ["4 → 6′", "✗", `4 ${L.notTop}`]];
        rows.forEach(([pair, mark, why], k) => {
          const y = 116 + k * 36;
          const op = k < 2 ? 1 : e;
          pen.text(g, RX, y, pair, { anchor: "start", size: 17, opacity: op });
          pen.text(g, RX + 74, y, mark, { anchor: "start", size: 17, weight: 700, fill: k < 2 ? P.accent : RED, opacity: op });
          if (why) pen.text(g, RX + 100, y, why, { anchor: "start", size: 16, fill: P.body, opacity: op });
        });
        pen.text(g, RX, 280, L.deadlock, { anchor: "start", size: 20, weight: 700, fill: RED, opacity: e });
      }

      if (i === 4) {
        grid(g);
        const s1 = [["1", "5′"], ["8", "6′"]];
        const s2 = [["4", "7′"], ["5", "8′"]];
        const u1 = kit.easeOut(Math.min(1, t / 0.5));
        const u2 = kit.easeOut(Math.max(0, (t - 0.5) / 0.5));
        const inStage2 = t >= 0.5;
        const placed = inStage2 ? s1 : [];
        const moving = inStage2 ? s2 : s1;
        const u = inStage2 ? u2 : u1;
        const done = u >= 0.999 ? [...placed, ...moving] : placed;
        const cells = state(done);
        if (u < 0.999) for (const [m] of moving) delete cells[`${M0[m][0]},${M0[m][1]}`];
        drawCells(g, cells);
        // top-surface sets of the current stage
        const topM = inStage2 ? ["4", "5"] : ["1", "5", "8"];
        const topV = inStage2 ? ["7′", "8′"] : ["5′", "6′"];
        if (u < 0.999) {
          for (const m of topM) if (!moving.some(([mm]) => mm === m)) outline(g, ...M0[m]);
          for (const v of topV) outline(g, ...V0[v]);
          for (const [m, v] of moving) {
            for (const [a, b] of [[M0[m], V0[v]]]) {
              const pts = pathPts(a, b);
              for (let k = 1; k < pts.length; k++) pen.line(g, pts[k - 1], pts[k], { stroke: P.mute, w: 1.2, dash: "4 4" });
            }
          }
          for (const [m, v] of moving) flyer(g, along(pathPts(M0[m], V0[v]), u), m);
        }
        // right panel: the two small matrices
        const m1 = matrix(g, RX, 72, ["1", "5", "8"], ["5′", "6′"], [[7, 8], [9, 8], [7, 6]], [[0, 0], [2, 1]], { opacity: inStage2 ? 0.55 : 1 });
        pen.text(g, RX + 64, 40, `${L.stage} 1`, { size: 16, weight: 600 });
        pen.text(g, RX + 64, m1.bottom + 26, "7 + 6", { size: 16, fill: P.accent, opacity: inStage2 ? 0.55 : 1 });
        const x2 = RX + 150;
        const op2 = inStage2 ? Math.min(1, (t - 0.5) / 0.2) : 0;
        if (op2 > 0) {
          const m2 = matrix(g, x2, 72, ["4", "5"], ["7′", "8′"], [[7, 6], [8, 7]], [[0, 0], [1, 1]], { opacity: op2 });
          pen.text(g, x2 + 64, 40, `${L.stage} 2`, { size: 16, weight: 600, opacity: op2 });
          pen.text(g, x2 + 64, m2.bottom + 26, "7 + 7", { size: 16, fill: P.accent, opacity: op2 });
        }
        const fin = t >= 0.999 ? 1 : 0;
        pen.text(g, RX, 250, `${L.total} 27 ${L.sameBound}`, { anchor: "start", size: 18, weight: 600, fill: P.accent, opacity: fin });
      }
    },
  });
}
