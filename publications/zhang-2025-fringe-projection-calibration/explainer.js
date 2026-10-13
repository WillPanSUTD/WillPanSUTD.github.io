// High-order polynomial PSP calibration fitted with SGRK (schematic):
// circle-board feature points give (u, v, phi) and world (X, Y, Z) ->
// n-th order polynomial model W = A x (60 / 105 / 168 coefficients for n = 3 / 4 / 5) ->
// SGRK picks a large-residual row (threshold + greedy probability) ->
// weighted Kaczmarz projection, then soft threshold keeps x sparse ->
// iterate until RSE < 1e-6, then reconstruct 3D points from (u, v, phi).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Calibration data: fringes are projected onto a circle-grid board in several poses. Each circle centre gives its pixel (u, v), its absolute phase ϕ (four-step, three-frequency phase shifting) and its world coordinates (X, Y, Z) from Zhang's method.",
        "Each world coordinate is modelled as an n-th order polynomial in u, v and ϕ, so calibration becomes a linear system W = Ax. Higher orders fit better but need more coefficients: 60, 105 and 168 for orders 3, 4 and 5. The paper uses order 4.",
        "SGRK, one iteration: every equation (row of A) has a residual. Rows whose residual passes a threshold form the candidate set, and one of them is drawn with probability proportional to its squared residual, so large-error equations are chosen first.",
        "The chosen equation updates the coefficients by a weighted Kaczmarz projection onto that row. A soft-threshold step then sets small coefficients to zero, keeping the solution sparse.",
        "The loop repeats until the relative error of the coefficients falls below 10⁻⁶; X, Y and Z are each fitted this way. To measure an object, each pixel's (u, v, ϕ) goes through the fitted polynomial to give its 3D point.",
      ],
      board: "circle board + fringes", poses: "× several board poses",
      pix: "pixel (u, v)", phase: "absolute phase ϕ", phaseNote: "4-step, 3-frequency",
      world: "world (X, Y, Z)", worldNote: "Zhang's method",
      eq: "W = A x", wLab: "W", aLab: "A  (s × m)", xLab: "x",
      coef: "coefficients", order: "order n",
      rows: "equations (rows of A)", res: "residual |r|", thr: "threshold",
      cand: "candidate rows", pick: "picked ∝ |r|", pickTail: "",
      chosen: "picked equation", xs: "coefficients x", proj: "Kaczmarz projection",
      soft: "soft threshold S", softSub: "λ", zero: "→ 0", lam: "±λ", before: "before shrinking",
      lg: "lg RSE", iters: "iterations", stop: "stop: RSE < 10",
      in: "pixel (u, v, ϕ)", poly: "fitted polynomial", out: "3D points (X, Y, Z)",
    },
    zh: {
      steps: [
        "标定数据：将条纹投射到圆形标定板上，并采集多个姿态。每个圆心给出像素坐标 (u, v)、绝对相位 ϕ（三频四步相移）以及由张氏标定法得到的世界坐标 (X, Y, Z)。",
        "每个世界坐标都表示为 u、v、ϕ 的 n 阶多项式，标定由此转化为线性方程组 W = Ax。阶数越高拟合越好，但系数也越多：3、4、5 阶分别为 60、105、168 个。本文采用 4 阶模型。",
        "SGRK 的一次迭代：每个方程（A 的一行）都有残差。残差超过阈值的行组成候选集，再按与残差平方成正比的概率从中抽取一行，因此误差大的方程优先被选中。",
        "被选中的方程通过加权 Kaczmarz 投影更新系数；随后软阈值操作将较小的系数置零，使解保持稀疏。",
        "迭代持续进行，直到系数的相对标准误差低于 10⁻⁶；X、Y、Z 三个坐标分别按此拟合。测量物体时，把每个像素的 (u, v, ϕ) 代入拟合好的多项式，即得到对应的三维点。",
      ],
      board: "圆形标定板 + 条纹", poses: "× 多个标定板姿态",
      pix: "像素坐标 (u, v)", phase: "绝对相位 ϕ", phaseNote: "三频四步相移",
      world: "世界坐标 (X, Y, Z)", worldNote: "张氏标定法",
      eq: "W = A x", wLab: "W", aLab: "A  (s × m)", xLab: "x",
      coef: "系数个数", order: "阶数 n",
      rows: "方程（A 的各行）", res: "残差 |r|", thr: "阈值",
      cand: "候选行", pick: "按 |r|", pickTail: " 概率抽中",
      chosen: "抽中的方程", xs: "系数 x", proj: "Kaczmarz 投影",
      soft: "软阈值 S", softSub: "λ", zero: "→ 0", lam: "±λ", before: "收缩前",
      lg: "lg RSE", iters: "迭代次数", stop: "停止：RSE < 10",
      in: "像素 (u, v, ϕ)", poly: "拟合的多项式", out: "三维点 (X, Y, Z)",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colour: the one equation SGRK picks in this iteration.
  const PICK = "#d9822b";
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, u) => a + (b - a) * u;

  // --- Deterministic data, built once -----------------------------------------
  const rnd = kit.rng(17);
  // Step 2: residuals of nine rows; row 5 is the largest and is the one picked.
  const resid = [0.32, 0.58, 0.21, 0.71, 0.4, 0.92, 0.27, 0.64, 0.15];
  const THR = 0.5;
  const PICKED = 5;
  // Step 3: coefficient vector before/after the projection, then soft threshold.
  const LAMBDA = 0.3;
  const xBefore = [], xAfter = [];
  for (let j = 0; j < 12; j++) {
    const b = (rnd() - 0.5) * 2.0;
    xBefore.push(b);
    xAfter.push(b + (rnd() - 0.5) * 0.5);
  }
  [2, 6, 9].forEach((j, k) => { xAfter[j] = [0.12, -0.16, 0.08][k]; });
  const soft = (v) => Math.sign(v) * Math.max(Math.abs(v) - LAMBDA, 0);
  // Step 4: schematic convergence curve (lg RSE from 0 to -6 over the run).
  const curve = [];
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    curve.push([u, -6 * (0.82 * u + 0.18 * (1 - Math.pow(1 - u, 3))) + (k && k < 40 ? (rnd() - 0.5) * 0.12 : 0)]);
  }
  // Step 4: side view of a three-step block as reconstructed points.
  const stepPts = [];
  const prof = [[350, 290], [350, 250], [440, 250], [440, 220], [530, 220], [530, 190], [610, 190]];
  for (let k = 0; k < prof.length - 1; k++) {
    const [x0, y0] = prof[k], [x1, y1] = prof[k + 1];
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 9));
    for (let q = k ? 1 : 0; q <= n; q++) {
      const u = q / n;
      stepPts.push([x0 + (x1 - x0) * u + (rnd() - 0.5) * 2, y0 + (y1 - y0) * u + (rnd() - 0.5) * 2]);
    }
  }

  // --- Drawing helpers ---------------------------------------------------------
  const rect = (g, x, y, w, h, o = {}) => kit.svg("rect", {
    x, y, width: w, height: h, rx: o.rx ?? 0, fill: o.fill ?? "none",
    stroke: o.stroke ?? "none", "stroke-width": o.sw ?? 1.4, opacity: o.opacity ?? 1,
  }, g);
  const circle = (g, cx, cy, r, o = {}) => kit.svg("circle", {
    cx, cy, r, fill: o.fill ?? "none", stroke: o.stroke ?? "none", "stroke-width": o.sw ?? 1.6, opacity: o.opacity ?? 1,
  }, g);
  // Text with a subscript tspan (>= 14 viewBox units).
  const subText = (g, x, y, main, sub, o = {}) => {
    const node = text(g, x, y, main, o);
    const size = o.size ?? 18;
    kit.svg("tspan", { "font-size": Math.max(14, Math.round(size * 0.8)), dy: 5 }, node).textContent = sub;
    return node;
  };
  // Text with a superscript tspan (>= 14 viewBox units) and an optional plain tail.
  const supText = (g, x, y, main, sup, tail, o = {}) => {
    const node = text(g, x, y, main, o);
    const size = o.size ?? 18;
    kit.svg("tspan", { "font-size": Math.max(14, Math.round(size * 0.8)), "baseline-shift": "super" }, node).textContent = sup;
    if (tail) kit.svg("tspan", {}, node).textContent = tail;
    return node;
  };

  // Step 0: the circle board.
  const BX = 40, BY = 62, BS = 210, N = 7, PITCH = BS / N;
  const HI = [3, 4]; // highlighted circle (row, col)
  const centre = (r, c) => [BX + PITCH * (c + 0.5), BY + PITCH * (r + 0.5)];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        text(g, BX + BS / 2, 44, L.board, { weight: 600 });
        rect(g, BX, BY, BS, BS, { stroke: ink, sw: 1.6 });
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const [cx, cy] = centre(r, c);
            circle(g, cx, cy, 9, { fill: mute, opacity: 0.85 });
          }
        }
        // Projected sinusoidal fringes (vertical), fading in.
        for (let k = 0; k < 42; k++) {
          const x = BX + (k * BS) / 42;
          const v = 0.5 + 0.5 * Math.cos((2 * Math.PI * (x - BX)) / 30);
          rect(g, x, BY, BS / 42 + 0.4, BS, { fill: accent, opacity: 0.32 * v * e });
        }
        const c = centre(HI[0], HI[1]);
        const h = seg01(t, 0.25, 0.6);
        circle(g, c[0], c[1], 13, { stroke: PICK, sw: 2.4, opacity: h });
        line(g, [c[0] - 6, c[1]], [c[0] + 6, c[1]], { stroke: PICK, w: 2, opacity: h });
        line(g, [c[0], c[1] - 6], [c[0], c[1] + 6], { stroke: PICK, w: 2, opacity: h });
        text(g, BX + BS / 2, 304, L.poses, { fill: body, size: 17 });

        const items = [
          [104, L.pix, null],
          [178, L.phase, L.phaseNote],
          [252, L.world, L.worldNote],
        ];
        items.forEach(([y, label, note], k) => {
          const a = seg01(t, 0.35 + k * 0.15, 0.65 + k * 0.15);
          if (a <= 0) return;
          arrow(g, [c[0] + 16, c[1]], [lerp(c[0] + 16, 326, a), lerp(c[1], y - 6, a)], { stroke: accent, opacity: a });
          text(g, 336, y, label, { anchor: "start", weight: 600, opacity: a, size: 20 });
          if (note) text(g, 336, y + 24, note, { anchor: "start", fill: body, opacity: a, size: 16 });
        });
      }

      if (i === 1) {
        text(g, 250, 40, L.eq, { size: 26, weight: 600, italic: true });
        // W column, "=", A grid, x column.
        const top = 90, rowH = 26, nRows = 6;
        const terms = [["1"], ["u"], ["v"], ["ϕ"], ["u", "2"], ["…"], ["ϕ", "n"]];
        const ax = 112, cw = 40;
        const a1 = seg01(t, 0, 0.5), a2 = seg01(t, 0.3, 0.8), a3 = seg01(t, 0.5, 1);
        for (let r = 0; r < nRows; r++) {
          const y = top + r * rowH;
          rect(g, 40, y, 32, rowH, { stroke: body, fill: rule, opacity: a1 });
          if (r === nRows - 1) continue;
          circle(g, 56, y + rowH / 2, 2.5, { fill: ink, opacity: a1 });
        }
        text(g, 56, top + rowH * (nRows - 0.5) + 5, "⋮", { opacity: a1, size: 16 });
        text(g, 92, top + rowH * 3 + 6, "=", { size: 24, opacity: a1 });
        terms.forEach((term, k) => {
          supText(g, ax + cw * (k + 0.5), top - 10, term[0], term[1] ?? "", "", { size: 17, opacity: a2, italic: k > 0 && k !== 5 });
          for (let r = 0; r < nRows; r++) {
            rect(g, ax + cw * k, top + r * rowH, cw, rowH, { stroke: body, fill: accent, opacity: a2 * (r === nRows - 1 ? 0.12 : 0.22) });
          }
        });
        for (let r = 0; r < nRows; r++) {
          rect(g, ax, top + r * rowH, cw * terms.length, rowH, { stroke: body, opacity: a2 });
        }
        // x has one entry per polynomial term (m entries).
        const xx = ax + cw * terms.length + 24, xh = (rowH * nRows) / terms.length;
        terms.forEach((_, r) => {
          const y = top + r * xh;
          rect(g, xx, y, 32, xh, { stroke: PICK, sw: 1.6, opacity: a3 });
          text(g, xx + 16, y + xh / 2 + 6, r === 5 ? "⋮" : "?", { size: 16, fill: PICK, opacity: a3, halo: false });
        });
        const by = top + rowH * nRows + 26;
        text(g, 56, by, L.wLab, { italic: true, opacity: a1 });
        text(g, ax + (cw * terms.length) / 2, by, L.aLab, { italic: true, opacity: a2 });
        text(g, xx + 16, by, L.xLab, { italic: true, opacity: a3, fill: PICK });

        // Coefficient counts per order.
        const base = 286, sc = 0.9, counts = [[3, 60], [4, 105], [5, 168]];
        text(g, 562, 98, L.coef, { size: 17, fill: body });
        counts.forEach(([n, m], k) => {
          const cx = 520 + k * 42, hgt = m * sc * seg01(t, 0.2 + k * 0.15, 0.7 + k * 0.1);
          rect(g, cx - 14, base - hgt, 28, hgt, { fill: n === 4 ? accent : mute });
          if (hgt > 1) text(g, cx, base - hgt - 7, String(m), { size: 16, weight: n === 4 ? 700 : 400 });
          text(g, cx, base + 22, String(n), { size: 17, weight: n === 4 ? 700 : 400 });
        });
        line(g, [500, base], [624, base], { stroke: body });
        text(g, 562, base + 46, L.order, { size: 16, fill: body });
      }

      if (i === 2) {
        const top = 72, rowH = 26, x0 = 60, w = 220, bx = 330, bw = 250;
        text(g, x0 + w / 2, 50, L.rows, { size: 17, fill: body });
        text(g, bx + bw / 2, 50, L.res, { size: 17, fill: body });
        const pickA = seg01(t, 0.55, 0.95);
        resid.forEach((r, k) => {
          const y = top + k * rowH;
          const isCand = r >= THR;
          const isPick = k === PICKED;
          rect(g, x0, y + 4, w, rowH - 8, { stroke: body, fill: rule, opacity: isPick ? 1 : 0.9 });
          for (let c = 1; c < 7; c++) line(g, [x0 + (w * c) / 7, y + 4], [x0 + (w * c) / 7, y + rowH - 4], { stroke: mute, w: 1 });
          const len = r * bw * e;
          const fill = isPick && pickA > 0 ? PICK : isCand ? accent : mute;
          rect(g, bx, y + 6, len, rowH - 12, { fill, opacity: isCand ? 1 : 0.8 });
          if (isPick && pickA > 0) {
            rect(g, x0 - 5, y + 1, w + 10, rowH - 2, { stroke: PICK, sw: 2.4, opacity: pickA });
            arrow(g, [bx - 6, y + rowH / 2], [x0 + w + 9, y + rowH / 2], { stroke: PICK, opacity: pickA, w: 2 });
          }
        });
        // Threshold line.
        const ta = seg01(t, 0.3, 0.6);
        const tx = bx + THR * bw;
        line(g, [tx, top - 6], [tx, top + rowH * resid.length + 4], { stroke: ink, dash: "5 4", w: 1.6, opacity: ta });
        text(g, tx + 8, top + rowH * resid.length + 2, L.thr, { anchor: "start", size: 16, opacity: ta });
        // Legend + pick label.
        const ly = 334;
        rect(g, 70, ly - 13, 16, 16, { fill: accent, opacity: ta });
        text(g, 94, ly, L.cand, { anchor: "start", size: 16, opacity: ta });
        rect(g, 330, ly - 13, 16, 16, { fill: PICK, opacity: pickA });
        supText(g, 354, ly, L.pick, "2", L.pickTail, { anchor: "start", size: 16, opacity: pickA });
      }

      if (i === 3) {
        // Phases: projection (p1), then the ±λ band appears (pb), then values shrink toward zero (p2).
        const p1 = seg01(t, 0, 0.35), pb = seg01(t, 0.35, 0.55), p2 = seg01(t, 0.55, 1);
        // Picked equation at the top.
        rect(g, 60, 34, 200, 20, { stroke: PICK, sw: 2.2, fill: rule });
        for (let c = 1; c < 7; c++) line(g, [60 + (200 * c) / 7, 34], [60 + (200 * c) / 7, 54], { stroke: mute, w: 1 });
        text(g, 272, 50, L.chosen, { anchor: "start", size: 16, fill: PICK });
        // Coefficient bars.
        const base = 200, sc = 85, x0 = 90, dx = 38, bw = 22;
        const xEnd = x0 + dx * 11 + 20;
        text(g, 174, 86, L.xs, { anchor: "start", size: 16, fill: body });
        line(g, [70, base], [xEnd, base], { stroke: body });
        // +/- lambda band.
        if (pb > 0) {
          rect(g, 70, base - LAMBDA * sc, xEnd - 70, 2 * LAMBDA * sc, { fill: PICK, opacity: 0.14 * pb });
          line(g, [70, base - LAMBDA * sc], [xEnd, base - LAMBDA * sc], { stroke: PICK, dash: "4 4", opacity: pb });
          line(g, [70, base + LAMBDA * sc], [xEnd, base + LAMBDA * sc], { stroke: PICK, dash: "4 4", opacity: pb });
          text(g, xEnd + 10, base + 6, L.lam, { anchor: "start", size: 17, opacity: pb, fill: PICK });
          // Legend: dashed outline = value before shrinking, solid = after.
          kit.svg("rect", { x: 452, y: 74, width: 14, height: 14, fill: "none", stroke: body, "stroke-width": 1.4, "stroke-dasharray": "3 3", opacity: pb }, g);
          text(g, 472, 86, L.before, { anchor: "start", size: 15, fill: body, opacity: pb });
        }
        for (let j = 0; j < 12; j++) {
          const v1 = lerp(xBefore[j], xAfter[j], p1);
          const v = lerp(v1, soft(xAfter[j]), p2);
          const cx = x0 + j * dx;
          // Value before shrinking (after the projection), kept as an outline once the band is shown.
          if (pb > 0) {
            const ha = xAfter[j] * sc;
            kit.svg("rect", {
              x: cx - bw / 2, y: ha > 0 ? base - ha : base, width: bw, height: Math.abs(ha),
              fill: "none", stroke: body, "stroke-width": 1.4, "stroke-dasharray": "3 3", opacity: pb,
            }, g);
          }
          const h = v * sc;
          if (Math.abs(h) > 0.5) rect(g, cx - bw / 2, h > 0 ? base - h : base, bw, Math.abs(h), { fill: accent, opacity: 0.85 });
          if (p2 > 0.95 && soft(xAfter[j]) === 0) circle(g, cx, base, 4.5, { fill: PICK });
          // Ghost of the previous value during the projection.
          if (p1 > 0 && p1 < 1) {
            const hb = xBefore[j] * sc;
            rect(g, cx - bw / 2, hb > 0 ? base - hb : base, bw, Math.abs(hb), { stroke: mute, sw: 1.2, opacity: 1 - p1 });
          }
        }
        // Arrow from the equation to the coefficients during the projection.
        arrow(g, [160, 60], [160, 96], { stroke: PICK, opacity: 1 - pb * 0.6, w: 2 });
        // Phase labels.
        if (pb < 1) text(g, 320, 336, L.proj, { size: 18, weight: 600, opacity: 1 - pb });
        if (pb > 0) {
          subText(g, 372, 336, L.soft, L.softSub, { size: 18, weight: 600, opacity: pb, anchor: "end" });
          text(g, 384, 336, L.zero, { size: 18, weight: 600, opacity: pb, anchor: "start", fill: PICK });
        }
      }

      if (i === 4) {
        // Convergence plot.
        const px0 = 70, px1 = 290, py0 = 70, py1 = 270;
        const X = (u) => px0 + u * (px1 - px0);
        const Y = (lg) => py0 + (-lg / 7) * (py1 - py0);
        line(g, [px0, py0], [px0, py1], { stroke: body });
        line(g, [px0, py1], [px1, py1], { stroke: body });
        text(g, px0 - 8, Y(0) + 6, "0", { anchor: "end", size: 15, fill: body });
        text(g, px0 - 8, Y(-6) + 6, "−6", { anchor: "end", size: 15, fill: body });
        text(g, px0, 52, L.lg, { anchor: "start", size: 16, fill: body });
        text(g, (px0 + px1) / 2, py1 + 26, L.iters, { size: 16, fill: body });
        line(g, [px0, Y(-6)], [px1, Y(-6)], { stroke: PICK, dash: "5 4", w: 1.6 });
        supText(g, px0 + 10, Y(-6) - 10, L.stop, "−6", "", { anchor: "start", size: 16, fill: PICK });
        const a = seg01(t, 0, 0.6);
        const nPts = Math.max(1, Math.round(a * (curve.length - 1)));
        const d = curve.slice(0, nPts + 1).map(([u, lg], k) => `${k ? "L" : "M"}${X(u).toFixed(1)} ${Y(lg).toFixed(1)}`).join(" ");
        kit.svg("path", { d, fill: "none", stroke: accent, "stroke-width": 2.4, "stroke-linejoin": "round" }, g);

        // Reconstruction.
        const b = seg01(t, 0.35, 1);
        text(g, 480, 56, L.in, { size: 18, weight: 600, opacity: b });
        arrow(g, [480, 66], [480, 94], { stroke: accent, opacity: b });
        rect(g, 395, 100, 170, 34, { stroke: accent, sw: 1.8, rx: 6, opacity: b });
        text(g, 480, 123, L.poly, { size: 17, opacity: b });
        arrow(g, [480, 140], [480, 168], { stroke: accent, opacity: b });
        const shown = Math.round(seg01(t, 0.55, 1) * stepPts.length);
        for (let k = 0; k < shown; k++) circle(g, stepPts[k][0], stepPts[k][1], 2.8, { fill: accent });
        text(g, 480, 322, L.out, { size: 17, opacity: seg01(t, 0.7, 1) });
      }
    },
  });
}
