// Sequencing schematic, built on the thesis's own worked example (Figs. 3.2-3.6, Eqs. 3.3-3.5):
// align source and destination -> cost of one pick-and-place -> LOS stage 1 (Hungarian on the
// top-accessible movers/voids) -> LOS stage 2 (total 27 = GOS lower bound) -> the three case studies.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Align: the destination (yellow, 1′–8′) is translated against the source (green, 1–8) to maximise overlap. Voxels only in the source are movers M, voxels only in the destination are voids V; overlapped voxels (grey) stay in place.",
        "Cost of one pick-and-place: the gripper lifts a mover to the clearance plane z max, travels in x and y, and lowers it into a void. Moving voxel 1 to void 5′ costs 7.",
        "LOS, stage 1: under the top-access constraint only the top-surface movers {1, 5, 8} and voids {5′, 6′} take part. The Hungarian method pairs them at minimum cost: 1 → 5′ and 8 → 6′.",
        "Update the top surfaces and repeat: {4, 5} → {7′, 8′}. Total cost 7 + 6 + 7 + 7 = 27, equal to the lower bound given by the global strategy (GOS).",
        "The thesis treats all three case studies as source-to-destination sequencing: pick-and-place of voxels, pick-and-place of LEGO bricks (reuse rate versus cost), and folding a chain laid along a Hamiltonian path.",
      ],
      legend: ["M · source only", "V · destination only", "overlap · stays"],
      cost: "cost 1 → 5′ = 7",
      topAccess: "top-accessible",
      hungarian: "Hungarian method",
      stage: ["stage 1", "stage 2"],
      total: "total = 27 = GOS bound",
      cases: [["Voxels", "pick-and-place"], ["LEGO bricks", "pick-and-place"], ["Chain", "folding"]],
      foot: ["assignment", "reuse vs. cost", "Hamiltonian path"],
      stock: "stock",
    },
    zh: {
      steps: [
        "对齐：将目标结构（黄色，1′–8′）相对源结构（绿色，1–8）平移，使重叠体积最大。只属于源的体素为待移体素 M，只属于目标的为空位 V；重叠体素（灰色）原地保留。",
        "一次抓放的代价：夹爪把待移体素提升到安全平面 z max，沿 x、y 方向移动，再下降放入空位。把体素 1 移到空位 5′ 的代价为 7。",
        "LOS 第一阶段：受顶部抓取约束，只有顶面上的待移体素 {1, 5, 8} 和空位 {5′, 6′} 参与。匈牙利算法求出总代价最小的配对：1 → 5′、8 → 6′。",
        "更新顶面后重复：{4, 5} → {7′, 8′}。总代价 7 + 6 + 7 + 7 = 27，与全局策略（GOS）给出的下界相等。",
        "论文把三个案例都表述为从源到目标的排序问题：体素的抓放、乐高积木的抓放（权衡复用率与代价），以及沿哈密顿路径排布的链式结构折叠。",
      ],
      legend: ["M · 仅在源中", "V · 仅在目标中", "重叠 · 保留"],
      cost: "代价 1 → 5′ = 7",
      topAccess: "顶部可抓取",
      hungarian: "匈牙利算法",
      stage: ["第一阶段", "第二阶段"],
      total: "总代价 27 = GOS 下界",
      cases: [["体素", "抓放"], ["乐高积木", "抓放"], ["链式结构", "折叠"]],
      foot: ["指派问题", "复用率与代价", "哈密顿路径"],
      stock: "库存",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  // Literal semantic colours, as in the thesis figures: movers green, voids yellow, overlap grey,
  // top surface red. Labels on these fills are plain black.
  const GREEN = "#7ed957";
  const YELLOW = "#f5d547";
  const GREY = "#d4d4d4";
  const RED = "#e0483e";
  const BLACK = "#111111";

  const { line, arrow } = kit.pen({ stroke: body, width: 1.6, head: 9 });

  // Text made of parts: plain strings, or { sub: "…" } for a real subscript (>= 14 units).
  const rich = (parent, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo ?? true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };
  const label = (parent, x, y, str, o = {}) => rich(parent, x, y, [str], o);

  // --- Side-view grid of the worked example (Fig. 3.2b) ------------------------------------
  const CELL = 44;
  const GX = 40;          // x of column 0
  const GROUND = 320;     // y of the ground line
  const COLS = 7;
  const cx = (c) => GX + c * CELL;                 // left edge of column c
  const cy = (z) => GROUND - z * CELL;             // top edge of layer z (z = 1 is the bottom layer)
  const ZMAX = 5;
  const zmaxY = cy(ZMAX) + CELL / 2;

  const OVERLAP = [[2, 1, "2, 1′"], [3, 1, "3, 2′"], [2, 2, "6, 3′"], [3, 2, "7, 4′"]];
  const MOVERS = { 1: [1, 1], 4: [4, 1], 5: [5, 1], 8: [4, 2] };
  const SOURCE_REST = { 2: [2, 1], 3: [3, 1], 6: [2, 2], 7: [3, 2] };
  const DEST = { "1′": [2, 1], "2′": [3, 1], "3′": [2, 2], "4′": [3, 2], "5′": [2, 3], "6′": [3, 3], "7′": [2, 4], "8′": [3, 4] };
  const VOIDS = { "5′": [2, 3], "6′": [3, 3], "7′": [2, 4], "8′": [3, 4] };
  const STAGE1 = [[1, "5′"], [8, "6′"]];
  const STAGE2 = [[4, "7′"], [5, "8′"]];

  const grid = (g) => {
    for (let c = 0; c < COLS; c++) {
      for (let z = 1; z <= ZMAX; z++) {
        kit.svg("rect", { x: cx(c), y: cy(z), width: CELL, height: CELL, fill: "none", stroke: rule, "stroke-width": 1, "stroke-dasharray": "3 3" }, g);
      }
    }
    line(g, [GX - 6, GROUND], [GX + COLS * CELL + 6, GROUND], { stroke: body, w: 2 });
  };
  const block = (g, x, y, fill, str, o = {}) => {
    kit.svg("rect", { x: x + 1, y: y + 1, width: CELL - 2, height: CELL - 2, fill, stroke: ink, "stroke-width": 1, opacity: o.opacity ?? 1 }, g);
    if (str) kit.text(g, x + CELL / 2, y + CELL / 2 + 6, str, { size: o.size ?? 17, fill: BLACK, opacity: o.opacity ?? 1 });
  };
  const slot = (g, x, y, str, o = {}) => {
    kit.svg("rect", { x: x + 2, y: y + 2, width: CELL - 4, height: CELL - 4, fill: YELLOW, "fill-opacity": 0.45, stroke: YELLOW, "stroke-width": 2, "stroke-dasharray": "5 3", opacity: o.opacity ?? 1 }, g);
    if (str) kit.text(g, x + CELL / 2, y + CELL / 2 + 6, str, { size: 17, fill: ink, opacity: o.opacity ?? 1 });
  };
  const redBar = (g, c, z, opacity = 1) => {
    kit.svg("rect", { x: cx(c), y: cy(z) - 3, width: CELL, height: 5, fill: RED, opacity }, g);
  };
  const zmaxLine = (g, opacity = 1) => {
    line(g, [GX, zmaxY], [GX + COLS * CELL, zmaxY], { stroke: accent, dash: "6 5", w: 1.4, opacity });
    rich(g, GX + 4, zmaxY - 16, ["z", { sub: "max" }], { size: 18, anchor: "start", fill: accent, opacity });
  };

  // Gripper path of a move (Fig. 3.3): up to z_max, across, down.
  const movePath = (from, to) => {
    const a = [cx(from[0]) + CELL / 2, cy(from[1]) + CELL / 2];
    const b = [cx(to[0]) + CELL / 2, cy(to[1]) + CELL / 2];
    return [a, [a[0], zmaxY], [b[0], zmaxY], b];
  };
  const along = (pts, f) => {
    const lens = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      lens.push(d);
      total += d;
    }
    let s = Math.max(0, Math.min(1, f)) * total;
    const out = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      if (s >= lens[k - 1]) { out.push(pts[k]); s -= lens[k - 1]; continue; }
      const u = lens[k - 1] ? s / lens[k - 1] : 0;
      out.push([pts[k - 1][0] + (pts[k][0] - pts[k - 1][0]) * u, pts[k - 1][1] + (pts[k][1] - pts[k - 1][1]) * u]);
      break;
    }
    return out;
  };
  const polyline = (g, pts, o = {}) => kit.svg("polyline", {
    points: pts.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" "),
    fill: "none", stroke: o.stroke ?? accent, "stroke-width": o.w ?? 2, "stroke-dasharray": o.dash ?? "none",
    "stroke-linejoin": "round", "stroke-linecap": "round", opacity: o.opacity ?? 1,
  }, g);

  // Draw the aligned scene with some movers already placed and others in flight.
  const scene = (g, placed, moving, f) => {
    grid(g);
    for (const [c, z, s] of OVERLAP) block(g, cx(c), cy(z), GREY, s);
    const done = new Set(placed.map((p) => p[0]));
    const flying = new Set(moving.map((p) => p[0]));
    const filled = new Set(placed.map((p) => p[1]));
    for (const [v, [c, z]] of Object.entries(VOIDS)) if (!filled.has(v)) slot(g, cx(c), cy(z), v);
    for (const [m, [c, z]] of Object.entries(MOVERS)) {
      if (!done.has(+m) && !flying.has(+m)) block(g, cx(c), cy(z), GREEN, String(m));
    }
    for (const [m, v] of placed) {
      const [c, z] = VOIDS[v];
      block(g, cx(c), cy(z), GREY, `${m}, ${v}`);
    }
    for (const [m, v] of moving) {
      const pts = movePath(MOVERS[m], VOIDS[v]);
      polyline(g, pts, { dash: "5 5", w: 1.6, opacity: 0.55 });
      const tip = along(pts, f);
      const p = tip[tip.length - 1];
      if (f >= 0.999) block(g, p[0] - CELL / 2, p[1] - CELL / 2, GREY, `${m}, ${v}`);
      else block(g, p[0] - CELL / 2, p[1] - CELL / 2, GREEN, String(m));
    }
  };

  // Small cost matrix on the right (values from Eqs. 3.4 and 3.5).
  const matrix = (g, x0, y0, rows, cols, vals, pick, opacity = 1) => {
    const w = 46, h = 36;
    cols.forEach((c, j) => kit.text(g, x0 + w * (j + 1) + w / 2, y0 + 24, c, { size: 18, fill: body, opacity }));
    rows.forEach((r, i) => {
      kit.text(g, x0 + w / 2, y0 + h * (i + 1) + 24, r, { size: 18, fill: body, opacity });
      cols.forEach((_, j) => {
        const on = pick.some(([pi, pj]) => pi === i && pj === j);
        const x = x0 + w * (j + 1), y = y0 + h * (i + 1);
        if (on) kit.svg("rect", { x: x + 4, y: y + 3, width: w - 8, height: h - 6, rx: 6, fill: accent, opacity: 0.16 * opacity, stroke: accent, "stroke-width": 1.6, "stroke-opacity": opacity }, g);
        kit.text(g, x + w / 2, y + 24, String(vals[i][j]), { size: 18, fill: on ? ink : body, weight: on ? 700 : 400, opacity });
      });
    });
    const left = x0 + w + 2, right = x0 + w * (cols.length + 1) - 2, top = y0 + h + 2, bot = y0 + h * (rows.length + 1) - 2;
    kit.svg("path", { d: `M${left + 6},${top} L${left},${top} L${left},${bot} L${left + 6},${bot} M${right - 6},${top} L${right},${top} L${right},${bot} L${right - 6},${bot}`, fill: "none", stroke: body, "stroke-width": 1.5, opacity }, g);
  };

  const RX = 400; // left edge of the right-hand panel

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        grid(g);
        const k = Math.max(0, Math.min(1, (e - 0.8) / 0.2)); // cross-fade into the classified view
        const shift = 4 * (1 - e) * CELL;
        if (k < 1) {
          for (const [m, [c, z]] of Object.entries(MOVERS)) block(g, cx(c), cy(z), GREEN, String(m), { opacity: 1 - k });
          for (const [m, [c, z]] of Object.entries(SOURCE_REST)) block(g, cx(c), cy(z), GREEN, String(m), { opacity: 1 - k });
          for (const [v, [c, z]] of Object.entries(DEST)) slot(g, cx(c) + shift, cy(z), v, { opacity: 1 - k });
        }
        if (k > 0) {
          const h = kit.svg("g", { opacity: k }, g);
          for (const [c, z, str] of OVERLAP) block(h, cx(c), cy(z), GREY, str);
          for (const [m, [c, z]] of Object.entries(MOVERS)) block(h, cx(c), cy(z), GREEN, String(m));
          for (const [v, [c, z]] of Object.entries(VOIDS)) slot(h, cx(c), cy(z), v);
        }
        const fills = [GREEN, YELLOW, GREY];
        L.legend.forEach((str, j) => {
          const y = 150 + j * 46;
          kit.svg("rect", { x: RX + 20, y: y - 18, width: 24, height: 24, fill: fills[j], stroke: ink, "stroke-width": 1, opacity: k }, g);
          label(g, RX + 56, y, str, { anchor: "start", size: 18, opacity: k });
        });
      }

      if (i === 1) {
        scene(g, [], [], 0);
        zmaxLine(g, e);
        // Gripper path from the top of voxel 1 to the top of void 5′ (Fig. 3.3).
        const x1 = cx(1) + CELL / 2, x2 = cx(2) + 9;
        const pts = [[x1, cy(1)], [x1, zmaxY], [x2, zmaxY], [x2, cy(3) - 2]];
        polyline(g, along(pts, e), { w: 2.6 });
        if (e > 0.98) {
          const end = pts[3];
          arrow(g, [end[0], end[1] - 22], end, { stroke: accent, w: 2.6 });
        }
        rich(g, RX + 115, 120, ["c", { sub: "ij" }, " = |Δx| + |Δy|"], { size: 20 });
        rich(g, RX + 115, 154, ["+ 2z", { sub: "max" }, " − z", { sub: "i" }, " − z", { sub: "j" }], { size: 20 });
        label(g, RX + 115, 214, L.cost, { size: 20, weight: 600, fill: accent, opacity: e });
      }

      if (i === 2) {
        scene(g, [], STAGE1, e);
        // Top surfaces (red, as in Fig. 3.6): before the moves, then the updated ones for stage 2.
        if (e < 0.5) {
          for (const [c, z] of [[1, 1], [5, 1], [4, 2], [2, 2], [3, 2]]) redBar(g, c, z, 1 - 2 * e);
        } else {
          for (const [c, z] of [[4, 1], [5, 1], [2, 3], [3, 3]]) redBar(g, c, z, 2 * e - 1);
        }
        label(g, RX + 100, 60, `${L.hungarian} · ${L.stage[0]}`, { size: 18, weight: 600 });
        matrix(g, RX + 46, 76, ["1", "5", "8"], ["5′", "6′"], [[7, 8], [9, 8], [7, 6]], [[0, 0], [2, 1]]);
        label(g, RX + 115, 262, "1 → 5′ · 8 → 6′", { size: 20, weight: 600, fill: accent, opacity: e });
        // Red bar key
        kit.svg("rect", { x: RX + 34, y: 300, width: 26, height: 5, fill: RED }, g);
        label(g, RX + 70, 308, L.topAccess, { size: 16, anchor: "start", fill: body });
      }

      if (i === 3) {
        scene(g, STAGE1, STAGE2, e);
        label(g, RX + 100, 60, `${L.hungarian} · ${L.stage[1]}`, { size: 18, weight: 600 });
        matrix(g, RX + 46, 76, ["4", "5"], ["7′", "8′"], [[7, 6], [8, 7]], [[0, 0], [1, 1]]);
        label(g, RX + 115, 226, "4 → 7′ · 5 → 8′", { size: 20, weight: 600, fill: accent });
        label(g, RX + 115, 270, "7 + 6 + 7 + 7", { size: 20, opacity: e });
        label(g, RX + 115, 302, L.total, { size: 18, weight: 600, fill: accent, opacity: e });
      }

      if (i === 4) {
        const panels = [16, 224, 432];
        const W = 192;
        panels.forEach((x0, j) => {
          kit.svg("rect", { x: x0, y: 20, width: W, height: 320, rx: 10, fill: "none", stroke: rule, "stroke-width": 1.5 }, g);
          label(g, x0 + W / 2, 52, L.cases[j][0], { size: 20, weight: 600 });
          label(g, x0 + W / 2, 78, L.cases[j][1], { size: 17, fill: body });
          label(g, x0 + W / 2, 322, L.foot[j], { size: 17, fill: accent, weight: 600 });
        });

        // (a) Voxels: two small structures, one cube travelling via the clearance plane.
        {
          const x0 = panels[0], c = 24, base = 270;
          const src = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]];
          const dst = [[3, 0], [4, 0], [3, 1], [4, 1]];
          const ox = x0 + 22;
          for (const [a, b] of dst) kit.svg("rect", { x: ox + a * c, y: base - (b + 1) * c, width: c - 2, height: c - 2, fill: GREY, stroke: ink, "stroke-width": 1 }, g);
          kit.svg("rect", { x: ox + 3 * c + 1, y: base - 3 * c + 1, width: c - 4, height: c - 4, fill: YELLOW, "fill-opacity": 0.45, stroke: YELLOW, "stroke-width": 2, "stroke-dasharray": "4 3" }, g);
          for (const [a, b] of src.slice(0, 4)) kit.svg("rect", { x: ox + a * c, y: base - (b + 1) * c, width: c - 2, height: c - 2, fill: GREY, stroke: ink, "stroke-width": 1 }, g);
          const p0 = [ox + c / 2 - 1, base - 3 * c + c / 2 - 1];
          const p1 = [ox + 3 * c + c / 2 - 1, base - 3 * c + c / 2 - 1];
          const top = base - 5 * c;
          const pts = [p0, [p0[0], top], [p1[0], top], p1];
          polyline(g, pts, { dash: "4 4", w: 1.5, opacity: 0.6 });
          const tip = along(pts, e);
          const p = tip[tip.length - 1];
          kit.svg("rect", { x: p[0] - c / 2 + 1, y: p[1] - c / 2 + 1, width: c - 2, height: c - 2, fill: GREEN, stroke: ink, "stroke-width": 1 }, g);
          line(g, [x0 + 14, base], [x0 + W - 14, base], { stroke: body, w: 1.6 });
        }

        // (b) LEGO bricks: bricks move from source to target; a missing one comes from the stock.
        {
          const x0 = panels[1], base = 270, h = 20;
          // [x, layer, width] in studs. Source is taken apart from the top; target is built from the bottom.
          const srcB = [[0, 0, 3], [0, 1, 2], [2, 1, 1], [0, 2, 3]];
          // Each target brick names the source brick it reuses, or -1 when it comes from the stock.
          const tgtB = [[0, 0, 3, 3], [0, 1, 2, -1], [2, 1, 1, 2], [1, 2, 2, 1]];
          const u = 16;
          const sx = x0 + 18, tx = x0 + W - 18 - 3 * u;
          const k = Math.min(tgtB.length, Math.floor(e * tgtB.length + 1e-6));
          const used = new Set(tgtB.slice(0, k).map((b) => b[3]).filter((n) => n >= 0));
          srcB.forEach(([bx, ly, bw], n) => {
            if (used.has(n)) return;
            kit.svg("rect", { x: sx + bx * u, y: base - (ly + 1) * h, width: bw * u - 2, height: h - 2, rx: 2, fill: GREEN, stroke: ink, "stroke-width": 1 }, g);
          });
          tgtB.forEach(([bx, ly, bw, from], n) => {
            const shown = n < k;
            kit.svg("rect", {
              x: tx + bx * u, y: base - (ly + 1) * h, width: bw * u - 2, height: h - 2, rx: 2,
              fill: shown ? (from < 0 ? GREY : GREEN) : "none", stroke: shown ? ink : mute,
              "stroke-width": 1, "stroke-dasharray": shown ? "none" : "3 3",
            }, g);
          });
          arrow(g, [sx + 3 * u + 4, base - 2 * h], [tx - 6, base - 2 * h], { stroke: accent, w: 2 });
          // Stock box above, feeding the target.
          const bx = x0 + W / 2 - 28, by = 112;
          kit.svg("rect", { x: bx, y: by, width: 56, height: 34, rx: 3, fill: GREY, stroke: ink, "stroke-width": 1 }, g);
          kit.text(g, bx + 28, by + 23, L.stock, { size: 16, fill: BLACK });
          arrow(g, [bx + 50, by + 38], [tx + 20, base - 3 * h - 8], { stroke: body, w: 1.4, head: 7 });
          line(g, [x0 + 14, base], [x0 + W - 14, base], { stroke: body, w: 1.6 });
        }

        // (c) Chain: five voxels fold from a straight line (joint angles 0) to [90, -90, 90, -90] (Fig. 5.6).
        {
          const x0 = panels[2], c = 28;
          const target = [90, -90, 90, -90];
          let p = [x0 + 40, 250];
          let dir = 0;
          const centers = [p];
          const dirs = [0];
          for (let k = 0; k < target.length; k++) {
            dir -= target[k] * e; // negative = upward on screen
            const r = (dir * Math.PI) / 180;
            p = [p[0] + c * Math.cos(r), p[1] + c * Math.sin(r)];
            centers.push(p);
            dirs.push(dir);
          }
          for (let k = 1; k < centers.length; k++) line(g, centers[k - 1], centers[k], { stroke: RED, w: 4 });
          centers.forEach((q, k) => {
            kit.svg("rect", {
              x: q[0] - c / 2 + 2, y: q[1] - c / 2 + 2, width: c - 4, height: c - 4, rx: 3,
              fill: GREEN, "fill-opacity": 0.85, stroke: ink, "stroke-width": 1,
              transform: `rotate(${dirs[k].toFixed(1)} ${q[0].toFixed(1)} ${q[1].toFixed(1)})`,
            }, g);
          });
          for (const q of centers) kit.svg("circle", { cx: q[0], cy: q[1], r: 3, fill: RED }, g);
          label(g, x0 + W / 2, 128, "α = [0, 0, 0, 0]", { size: 15, fill: body, opacity: 1 - e });
          label(g, x0 + W / 2, 128, "α = [90, −90, 90, −90]", { size: 15, fill: body, opacity: e });
        }
      }
    },
  });
}
