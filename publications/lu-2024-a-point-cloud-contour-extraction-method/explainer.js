// Plane-segmentation contour extraction schematic:
// RANSAC proposes planes (side view) -> PCA refits each set, near-parallel fragments merge, small sets drop ->
// the chip-top plane is rotated parallel to XOY and projected into a binary 2D image ->
// Gaussian smoothing, gradient, keep maxima along the gradient direction ->
// boundary pixels are mapped back to 3D as the contour of the chip top.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Plane segmentation starts with RANSAC: three far-apart points are drawn at random, a plane is fitted through them, and every point closer than d_th joins its set. After N_iterate tries the largest set is kept and removed, and the search repeats.",
        "PCA refits each RANSAC set: the plane passes through the centroid, and its normal is the covariance eigenvector with the smallest eigenvalue. Two planes less than 15° apart, with over 90% of points within d_th, are merged; plane pairs with too few points are removed.",
        "Each segmented plane is rotated parallel to the XOY plane and projected into a 2D image. Pixels holding object points are set to 0, the rest to 1.",
        "The image is smoothed with a Gaussian filter, and the gradient magnitude and direction are computed. A pixel is kept as a boundary point only if it is the maximum along its gradient direction.",
        "The boundary pixels are mapped back through the projection and the inverse rotation, giving the contour points of the surface in 3D.",
      ],
      ransac: "RANSAC", samples: "3 random points", band: ["d < d", { sub: "th" }],
      repeat: ["× N", { sub: "iterate" }, " tries, keep the largest set"],
      board: "board", chip: "chip top",
      pca: "PCA refit", normal: "normal", merge: ["θ", { sub: "12" }, " < 15° → merge"], drop: ["too few points", "→ removed"],
      rotate: "rotate ∥ XOY", side: "side view", image: "2D image (top view)", zero: "0 object", one: "1 background",
      smooth: "Gaussian smoothing", grad: "gradient direction", keep: ["max along gradient", "→ boundary point"],
      back: "back to 3D", contour: "contour points",
    },
    zh: {
      steps: [
        "平面分割先用 RANSAC：随机选取三个相距较远的点拟合平面，与平面距离小于 d_th 的点归入该集合。迭代 N_iterate 次后保留点数最多的集合并将其移出，再开始下一轮搜索。",
        "对每个 RANSAC 集合用 PCA 重新拟合：平面过质心，法向量取协方差矩阵最小特征值对应的特征向量。夹角小于 15° 且超过 90% 的点距离小于 d_th 的两个平面合并，点数过少的平面对被剔除。",
        "将每个分割出的平面旋转至与 XOY 平面平行，再投影为二维图像：有物体点的像素置 0，其余置 1。",
        "先用高斯滤波平滑图像，再计算梯度幅值和方向。只有沿梯度方向取得最大值的像素才保留为边界点。",
        "边界像素经投影逆变换和逆旋转映射回三维空间，得到该表面的三维轮廓点。",
      ],
      ransac: "RANSAC", samples: "随机选 3 个点", band: ["d < d", { sub: "th" }],
      repeat: ["迭代 N", { sub: "iterate" }, " 次，保留最大集合"],
      board: "电路板", chip: "芯片顶面",
      pca: "PCA 重新拟合", normal: "法向量", merge: ["θ", { sub: "12" }, " < 15° → 合并"], drop: ["点数过少", "→ 剔除"],
      rotate: "旋转至 ∥ XOY", side: "侧视图", image: "二维图像（俯视）", zero: "0 物体", one: "1 背景",
      smooth: "高斯平滑", grad: "梯度方向", keep: ["沿梯度方向取极大", "→ 边界点"],
      back: "映射回三维", contour: "轮廓点",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: a second plane fragment, and a set that gets removed.
  const FRAG = "#d9822b";
  const DROP = "#c0392b";

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg01 = (v, a, b) => clamp01((v - a) / (b - a));

  // Text from parts: plain strings, or { sub: "…" } for a subscript (never below 14 units).
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 20;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const sub = typeof p !== "string";
      const s = kit.svg("tspan", sub ? { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.75)) } : {}, n);
      s.textContent = sub ? p.sub : p;
    }
    return n;
  };
  const { line, arrow } = kit.pen({ stroke: body, head: 10 });
  const dot = (g, x, y, r, fill, opacity = 1) => kit.svg("circle", { cx: x, cy: y, r, fill, opacity }, g);

  // ---- Side-view point cloud (steps 1-2), built once ------------------------------
  const rnd = kit.rng(22);
  const jit = (a) => (rnd() - 0.5) * a;
  const cloud = [];
  const run = (x0, x1, y0, y1, step, set) => {
    const n = Math.round(Math.abs(x1 - x0) / step);
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      cloud.push({ x: x0 + (x1 - x0) * u + jit(3), y: y0 + (y1 - y0) * u + jit(5), set });
    }
  };
  run(50, 190, 286, 286, 9, "board");
  run(430, 590, 286, 286, 9, "board");
  for (let y = 200; y <= 276; y += 13) cloud.push({ x: 200 + jit(3), y, set: "wall" });
  for (let y = 200; y <= 276; y += 13) cloud.push({ x: 420 + jit(3), y, set: "wall" });
  run(204, 302, 180, 180, 7, "A");  // chip top, fragment A
  run(318, 416, 181, 184, 7, "B");  // chip top, fragment B (slightly tilted)
  for (let k = 0; k < 6; k++) cloud.push({ x: 476 + k * 6 + jit(3), y: 208 + jit(8), set: "C" }); // small stray set
  const setA = cloud.filter((p) => p.set === "A");
  const samples = [setA[0], setA[Math.floor(setA.length / 2)], setA[setA.length - 1]]; // far apart across A
  const LINE_Y = 181;
  const BAND = 13;

  // ---- 2D image of the chip top (steps 3-5), computed once ------------------------
  const COLS = 24, ROWS = 16, CELL = 12;
  const mask = [];
  for (let r = 0; r < ROWS; r++) {
    mask.push([]);
    for (let c = 0; c < COLS; c++) {
      let on = c >= 4 && c <= 19 && r >= 2 && r <= 13;
      if (r >= 11 && c >= 4 && c <= 8) on = false;            // notch at the lower left of the chip top
      if (on && (r === 2 || r === 13 || c === 4 || c === 19) && rnd() < 0.12) on = false; // ragged rim
      mask[r].push(on);
    }
  }
  // Intensity: object 0, background 1.
  const I = mask.map((row) => row.map((on) => (on ? 0 : 1)));
  const at = (A, r, c) => A[Math.max(0, Math.min(ROWS - 1, r))][Math.max(0, Math.min(COLS - 1, c))];
  const K = [[1, 2, 1], [2, 4, 2], [1, 2, 1]];
  const S = I.map((row, r) => row.map((_, c) => {
    let s = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) s += K[i + 1][j + 1] * at(I, r + i, c + j);
    return s / 16;
  }));
  const Gu = S.map((row, r) => row.map((_, c) => (at(S, r, c + 1) - at(S, r, c - 1)) / 2));
  const Gv = S.map((row, r) => row.map((_, c) => (at(S, r + 1, c) - at(S, r - 1, c)) / 2));
  const G = S.map((row, r) => row.map((_, c) => Math.hypot(Gu[r][c], Gv[r][c])));
  const edges = [];
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const g = G[r][c];
      // On a binary image the gradient peaks where object meets background; mark the object-side pixel.
      if (!mask[r][c] || g < 1e-6) continue;
      const rim = !mask[r - 1][c] || !mask[r + 1][c] || !mask[r][c - 1] || !mask[r][c + 1];
      if (rim) edges.push({ r, c, dr: Math.round(Gv[r][c] / g), dc: Math.round(Gu[r][c] / g) });
    }
  }
  const arrowsAt = edges.filter((p, k) => k % 9 === 4 && (p.dr || p.dc));

  const grid = (g, x0, y0, cell, paint) => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        kit.svg("rect", { x: x0 + c * cell, y: y0 + r * cell, width: cell, height: cell, ...paint(r, c) }, g);
      }
    }
  };
  const GX = 300, GY = 66; // grid origin, steps 3-4

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        text(g, 24, 40, L.ransac, { anchor: "start", weight: 600, size: 22 });
        // This round's set is fragment A; B and C are sets found in other rounds (refined in step 2).
        const bx0 = 192, bw = 124;
        kit.svg("rect", { x: bx0, y: LINE_Y - BAND, width: bw * e, height: 2 * BAND, fill: accent, opacity: 0.12 }, g);
        line(g, [bx0, LINE_Y], [bx0 + bw * e, LINE_Y], { stroke: accent, w: 1.6, dash: "6 5" });
        const on = t > 0.5;
        for (const p of cloud) {
          if (p.set === "A") dot(g, p.x, p.y, 3.4, on ? accent : mute);
          else if (p.set === "B") dot(g, p.x, p.y, 3.4, on ? FRAG : mute, on ? 0.5 : 1);
          else if (p.set === "C") dot(g, p.x, p.y, 3.4, on ? DROP : mute, on ? 0.5 : 1);
          else dot(g, p.x, p.y, 3.4, mute);
        }
        for (const p of samples) kit.svg("circle", { cx: p.x, cy: p.y, r: 7, fill: "none", stroke: ink, "stroke-width": 2 }, g);
        text(g, 253, 130, L.samples, { size: 20 });
        for (const p of samples) line(g, [253 + (p.x - 253) * 0.5, 140], [p.x, p.y - 9], { stroke: mute, w: 1.2 });
        text(g, 186, LINE_Y + 6, L.band, { anchor: "end", fill: accent, size: 20, opacity: e });
        text(g, 110, 316, L.board, { size: 18, fill: body });
        text(g, 320, 340, L.repeat, { size: 19, fill: body, opacity: e });
      }

      if (i === 1) {
        const e1 = kit.easeOut(seg01(t, 0, 0.5));
        const e2 = kit.easeOut(seg01(t, 0.5, 1));
        text(g, 24, 40, L.pca, { anchor: "start", weight: 600, size: 22 });
        for (const p of cloud) {
          if (p.set === "board" || p.set === "wall") dot(g, p.x, p.y, 3.4, mute, 0.6);
          else if (p.set === "A") dot(g, p.x, p.y, 3.4, accent);
          else if (p.set === "B") {
            dot(g, p.x, p.y, 3.4, FRAG, 1 - e2);
            dot(g, p.x, p.y, 3.4, accent, e2);
          } else dot(g, p.x, p.y, 3.4, DROP, 1 - 0.75 * e2);
        }
        // Centroids and normals (smallest-eigenvalue eigenvectors).
        const cA = [253, 180], cB = [367, 182.5];
        for (const [c, col, tilt] of [[cA, accent, 0], [cB, FRAG, 0.06]]) {
          dot(g, c[0], c[1], 5.5, ink);
          const len = 70 * e1;
          arrow(g, c, [c[0] + Math.sin(tilt) * len, c[1] - Math.cos(tilt) * len], { stroke: col === FRAG && e2 > 0.5 ? accent : col, w: 2.2 });
        }
        text(g, 262, 132, L.normal, { anchor: "start", size: 18, fill: body, opacity: e1 });
        text(g, 310, 72, L.merge, { size: 20, fill: accent, opacity: e2 });
        // Removed set C.
        const k = 8 * e2;
        if (k > 0.5) {
          const m = [491, 208];
          kit.svg("path", { d: `M${m[0] - k} ${m[1] - k} L${m[0] + k} ${m[1] + k} M${m[0] + k} ${m[1] - k} L${m[0] - k} ${m[1] + k}`, stroke: DROP, "stroke-width": 2.6, "stroke-linecap": "round" }, g);
        }
        L.drop.forEach((str, k) => text(g, 446, 244 + k * 24, str, { anchor: "start", size: 18, fill: DROP, opacity: e2 }));
        text(g, 310, 320, L.chip, { size: 18, fill: body });
        line(g, [310, 304], [310, 194], { stroke: mute, w: 1.1, dash: "3 4" });
      }

      if (i === 2) {
        // Left: side view of the merged plane rotating into XOY.
        text(g, 140, 40, L.side, { size: 18, fill: body });
        const ang = (-14 * (1 - e) * Math.PI) / 180;
        const cx = 140, cy = 190, hw = 100;
        line(g, [30, 250], [250, 250], { stroke: mute, w: 1.2 });
        text(g, 236, 274, "XOY", { size: 16, fill: body });
        for (let k = 0; k <= 16; k++) {
          const u = (k / 16 - 0.5) * 2 * hw;
          dot(g, cx + u * Math.cos(ang), cy + u * Math.sin(ang), 3.4, accent);
        }
        text(g, 140, 130, L.rotate, { size: 19, fill: accent, opacity: e });
        text(g, 140, 156, ["M", { sub: "pose" }], { size: 19, fill: body, opacity: e });
        arrow(g, [256, 190], [286, 190], { stroke: body, w: 1.6, opacity: e });
        // Right: binary image.
        text(g, GX + (COLS * CELL) / 2, 50, L.image, { size: 18, fill: body });
        grid(g, GX, GY, CELL, (r, c) => ({
          fill: mask[r][c] ? ink : bg, "fill-opacity": mask[r][c] ? 0.8 * e : 1, stroke: rule, "stroke-width": 0.6,
        }));
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) if (mask[r][c]) dot(g, GX + (c + 0.5) * CELL, GY + (r + 0.5) * CELL, 2, accent, 1 - e);
        }
        kit.svg("rect", { x: GX, y: 290, width: 14, height: 14, fill: ink, "fill-opacity": 0.8 }, g);
        text(g, GX + 20, 303, L.zero, { anchor: "start", size: 17, fill: body });
        kit.svg("rect", { x: GX + 140, y: 290, width: 14, height: 14, fill: bg, stroke: body, "stroke-width": 1 }, g);
        text(g, GX + 160, 303, L.one, { anchor: "start", size: 17, fill: body });
      }

      if (i === 3) {
        const e1 = kit.easeOut(seg01(t, 0, 0.5));
        const e2 = kit.easeOut(seg01(t, 0.5, 1));
        text(g, 24, 80, L.smooth, { anchor: "start", size: 19, fill: body });
        text(g, 24, 160, L.grad, { anchor: "start", size: 19, fill: body });
        arrow(g, [24, 182], [72, 182], { stroke: FRAG, w: 2, head: 8 });
        text(g, 24, 240, L.keep[0], { anchor: "start", size: 19, fill: accent, opacity: e2 });
        text(g, 24, 266, L.keep[1], { anchor: "start", size: 19, fill: accent, opacity: e2 });
        grid(g, GX, GY, CELL, (r, c) => {
          const v = I[r][c] + (S[r][c] - I[r][c]) * e1; // blend to the smoothed image
          return { fill: ink, "fill-opacity": 0.8 * (1 - v), stroke: rule, "stroke-width": 0.6 };
        });
        kit.svg("rect", { x: GX, y: GY, width: COLS * CELL, height: ROWS * CELL, fill: "none", stroke: rule, "stroke-width": 1 }, g);
        for (const p of edges) {
          kit.svg("rect", { x: GX + p.c * CELL + 1, y: GY + p.r * CELL + 1, width: CELL - 2, height: CELL - 2, fill: accent, opacity: e2 }, g);
        }
        for (const p of arrowsAt) {
          const a = [GX + (p.c + 0.5) * CELL, GY + (p.r + 0.5) * CELL];
          arrow(g, a, [a[0] + p.dc * 22, a[1] + p.dr * 22], { stroke: FRAG, w: 2, head: 7, opacity: e1 });
        }
      }

      if (i === 4) {
        // Left: the 2D boundary, small.
        const cell = 7, x0 = 24, y0 = 120;
        text(g, x0 + (COLS * cell) / 2, y0 - 16, "2D", { size: 18, fill: body });
        kit.svg("rect", { x: x0, y: y0, width: COLS * cell, height: ROWS * cell, fill: bg, stroke: rule, "stroke-width": 1 }, g);
        for (const p of edges) kit.svg("rect", { x: x0 + p.c * cell, y: y0 + p.r * cell, width: cell, height: cell, fill: accent }, g);
        arrow(g, [200, 176], [246, 176], { stroke: body, w: 1.8 });
        text(g, 223, 160, L.back, { size: 17, fill: body });
        // Right: oblique 3D view of the board and the chip block; contour on its top face.
        const P = (c, r, h) => [318 + c * 8.5 + r * 4.5, 140 + r * 6 - h];
        const poly = (pts, attrs) => kit.svg("polygon", { points: pts.map((q) => q.join(",")).join(" "), ...attrs }, g);
        poly([P(-2, -2, 0), P(25, -2, 0), P(25, 17, 0), P(-2, 17, 0)], { fill: rule, stroke: mute, "stroke-width": 1 });
        const H = 40 * e + 4;
        const c0 = 4, c1 = 20, r0 = 2, r1 = 14;
        poly([P(c0, r1, 0), P(c1, r1, 0), P(c1, r1, H), P(c0, r1, H)], { fill: mute, opacity: 0.55 });
        poly([P(c1, r0, 0), P(c1, r1, 0), P(c1, r1, H), P(c1, r0, H)], { fill: mute, opacity: 0.8 });
        poly([P(c0, r0, H), P(c1, r0, H), P(c1, r1, H), P(c0, r1, H)], { fill: bg, stroke: mute, "stroke-width": 1 });
        for (const p of edges) {
          const q = P(p.c + 0.5, p.r + 0.5, H);
          dot(g, q[0], q[1], 2.2, accent, seg01(t, 0.3, 1));
        }
        text(g, 450, 312, L.contour, { size: 20, fill: accent, weight: 600, opacity: e });
        text(g, 420, 268, L.board, { size: 17, fill: body });
      }
    },
  });
}
