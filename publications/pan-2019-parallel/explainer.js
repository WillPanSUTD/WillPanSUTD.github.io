// Parallel curvature filter schematic: image as a surface -> 8 tangent-plane projections in a
// 3x3 neighbourhood -> 8 per-pixel distance maps by GPU convolution -> ABSMIN picks d_m and
// U <- U + d_m -> repeated iterations smooth an intensity profile.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The curvature filter treats the image U as a surface over the pixel grid and updates each pixel from its 3 × 3 neighbourhood.",
        "In the 3 × 3 neighbourhood, 8 tangent planes through neighbouring pixels are enumerated; d1 … d8 are the centre pixel's projection distances to them.",
        "On the GPU, each distance is computed for every pixel at once as a convolution of the image. These 8 convolutions, the most expensive part, use shared memory.",
        "ABSMIN keeps, for every pixel, the distance dm with the smallest magnitude; the pixel is updated as U + dm and the loop repeats.",
        "With each iteration the image surface is regularised: the intensity profile along one line grows smoother (as in Figs. 4–5 of the paper).",
      ],
      image: "image", zoom: "3 × 3 neighbourhood", height: "surface Ψ(x) = (x, U(x))",
      gpu: "GPU", conv: ["8 conv", "kernels"], blocks: "thread blocks", parallel: "all pixels in parallel",
      absmin: "ABSMIN", iterate: "iterate", iter: "iteration", x: "position along the line", y: "intensity",
    },
    zh: {
      steps: [
        "曲率滤波把图像 U 看作定义在像素网格上的曲面，并根据每个像素的 3 × 3 邻域对其进行更新。",
        "在 3 × 3 邻域内枚举 8 个经过相邻像素的切平面，d1 … d8 是中心像素到这些平面的投影距离。",
        "在 GPU 上，每种距离都以一次图像卷积的形式对所有像素同时计算。这 8 次卷积是计算量最大的部分，借助共享内存加速。",
        "ABSMIN 为每个像素选出绝对值最小的距离 dm，像素按 U + dm 更新，然后进入下一次迭代。",
        "随着迭代进行，图像曲面得到正则化：沿一条直线的灰度剖面变得越来越平滑（参见论文图 4、图 5）。",
      ],
      image: "图像", zoom: "3 × 3 邻域", height: "曲面 Ψ(x) = (x, U(x))",
      gpu: "GPU", conv: ["8 个", "卷积核"], blocks: "线程块", parallel: "所有像素并行计算",
      absmin: "ABSMIN", iterate: "迭代", iter: "迭代次数", x: "沿直线的位置", y: "灰度",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal semantic colours: the GPU stage (red, as in Fig. 1 of the paper) and the centre pixel.
  const GPU = "#c0392b";
  const CTR = "#3b6fb6";

  const { text, line, arrow } = kit.pen({ textSize: 20, stroke: body, width: 1.6, head: 9 });

  // ---- Deterministic data (built once) ---------------------------------------------------
  const rnd = kit.rng(19);
  const N = 8;
  // Image intensities in [0.12, 0.88]: a smooth ramp plus a bright blob plus noise.
  const img = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const blob = Math.exp(-((r - 2.5) ** 2 + (c - 5) ** 2) / 5);
      const v = 0.2 + 0.05 * c + 0.4 * blob + (rnd() - 0.5) * 0.25;
      img.push(Math.max(0.12, Math.min(0.88, v)));
    }
  }
  // Eight signed distance maps (schematic values in [-1, 1]) and the per-pixel ABSMIN choice.
  const dmaps = Array.from({ length: 8 }, () => img.map(() => (rnd() * 2 - 1) * (0.25 + 0.75 * rnd())));
  const dm = img.map((_, k) => dmaps.reduce((b, m) => (Math.abs(m[k]) < Math.abs(b) ? m[k] : b), dmaps[0][k]));
  const updated = img.map((v, k) => Math.max(0.12, Math.min(0.88, v + 0.12 * dm[k])));

  // 1D profile along a line: piecewise-constant signal + noise, smoothed by a 1D analogue of
  // the filter (candidate moves onto lines through neighbour pairs, smallest magnitude wins).
  const M = 140;
  const base = Array.from({ length: M }, (_, i) => (i < 30 ? 0.35 : i < 62 ? 0.62 : i < 90 ? 0.28 : i < 118 ? 0.78 : 0.45));
  const p0 = base.map((v) => v + (rnd() - 0.5) * 0.32);
  const profiles = [p0.slice()];
  let cur = p0.slice();
  for (let it = 0; it < 30; it++) {
    for (const parity of [0, 1]) {
      const nxt = cur.slice();
      for (let i = 1 + parity; i < M - 1; i += 2) {
        const cand = [(cur[i - 1] + cur[i + 1]) / 2 - cur[i]];
        if (i > 1) cand.push((cur[i - 1] + cur[i - 2]) / 2 - cur[i]);
        if (i < M - 2) cand.push((cur[i + 1] + cur[i + 2]) / 2 - cur[i]);
        nxt[i] = cur[i] + cand.reduce((b, d) => (Math.abs(d) < Math.abs(b) ? d : b));
      }
      cur = nxt;
    }
    profiles.push(cur.slice());
  }

  // ---- Drawing helpers ---------------------------------------------------------------------
  // Text with sub/superscript runs: segs = [[str, "sub" | "sup" | undefined], ...].
  const rich = (g, x, y, segs, o = {}) => {
    const size = o.size ?? 20;
    const small = Math.max(14, Math.round(size * 0.75));
    const node = kit.text(g, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor ?? "middle", weight: o.weight, opacity: o.opacity, halo: true,
    });
    let level = 0;
    for (const [str, kind] of segs) {
      const want = kind === "sub" ? 5 : kind === "sup" ? -8 : 0;
      const ts = kit.svg("tspan", { dy: want - level, ...(kind && { "font-size": small }) }, node);
      ts.textContent = str;
      level = want;
    }
    return node;
  };
  const sub = (g, x, y, main, idx, o = {}) => rich(g, x, y, [[main], [idx, "sub"]], o);
  // Pixel grid from an array of values: cells filled with ink at the value as opacity.
  const grid = (g, x0, y0, cell, vals, { opacity = 1, signed = false } = {}) => {
    kit.svg("rect", { x: x0, y: y0, width: cell * N, height: cell * N, fill: bg, stroke: body, "stroke-width": 1.4, opacity }, g);
    vals.forEach((v, k) => {
      const r = Math.floor(k / N), c = k % N;
      const fill = signed ? (v >= 0 ? ink : accent) : ink;
      const a = signed ? Math.abs(v) * 0.85 : v;
      kit.svg("rect", { x: x0 + c * cell, y: y0 + r * cell, width: cell + 0.3, height: cell + 0.3, fill, opacity: a * opacity }, g);
    });
  };
  // 3x3 dots (pixel centres) with optional shaded plane toward direction (dx, dy).
  const dots = (g, cx, cy, sp, r, dir, opacity = 1) => {
    if (dir) {
      const [dx, dy] = dir;
      const P = (i, j) => `${cx + i * sp},${cy + j * sp}`;
      let pts;
      if (dx === 0) pts = [P(-1, dy), P(1, dy), P(1, 0), P(-1, 0)];
      else if (dy === 0) pts = [P(dx, -1), P(dx, 1), P(0, 1), P(0, -1)];
      else pts = [P(dx, dy), P(-dx, dy), P(dx, -dy)];
      kit.svg("polygon", { points: pts.join(" "), fill: mute, opacity: 0.55 * opacity, stroke: body, "stroke-width": 1.2 }, g);
    }
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const isC = i === 0 && j === 0;
        kit.svg("circle", { cx: cx + i * sp, cy: cy + j * sp, r: isC ? r * 1.1 : r, fill: isC ? CTR : ink, opacity }, g);
      }
    }
  };
  const stack = (g, x0, y0, size, off, cell, count) => {
    for (let k = 7; k >= 0; k--) {
      if (k >= count) continue;
      grid(g, x0 + k * off, y0 - k * off, cell, dmaps[k], { signed: true });
    }
  };

  const DIRS = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // Image grid on the left with a highlighted 3x3 window, zoomed on the right.
        const cell = 26, x0 = 50, y0 = 80;
        grid(g, x0, y0, cell, img);
        text(g, x0 + cell * 4, y0 - 20, L.image, { weight: 600 });
        const wr = 3, wc = 4; // window top-left cell
        kit.svg("rect", { x: x0 + wc * cell, y: y0 + wr * cell, width: cell * 3, height: cell * 3, fill: "none", stroke: CTR, "stroke-width": 3 }, g);
        // Zoomed 3x3 window; the centre pixel is marked.
        const zx = 390, zy = 95, zc = 50;
        const from = [x0 + (wc + 3) * cell + 4, y0 + (wr + 1.5) * cell];
        const to = [zx - 8, zy + 1.5 * zc];
        arrow(g, from, [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e], { stroke: CTR, w: 2 });
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const v = img[(wr + r) * N + (wc + c)];
            kit.svg("rect", { x: zx + c * zc, y: zy + r * zc, width: zc, height: zc, fill: ink, opacity: v * e }, g);
          }
        }
        kit.svg("rect", { x: zx, y: zy, width: zc * 3, height: zc * 3, fill: "none", stroke: CTR, "stroke-width": 3, opacity: e }, g);
        kit.svg("circle", { cx: zx + 1.5 * zc, cy: zy + 1.5 * zc, r: 7, fill: CTR, stroke: bg, "stroke-width": 2, opacity: e }, g);
        text(g, zx + 1.5 * zc, 285, L.zoom, { weight: 600, opacity: e });
        text(g, zx + 1.5 * zc, 320, L.height, { fill: body, opacity: e });
      }

      if (i === 1) {
        const cx = 320, cy = 190;
        dots(g, cx, cy, 30, 6, null);
        DIRS.forEach(([dx, dy], k) => {
          const ix = cx + dx * 165 * e, iy = cy + dy * 112 * e;
          const a0 = [cx + dx * 50, cy + dy * 46];
          const a1 = [cx + dx * (165 - 36), cy + dy * (112 - 32)];
          if (e > 0.35) arrow(g, a0, a1, { w: 1.8, opacity: (e - 0.35) / 0.65 });
          dots(g, ix, iy, 18, 4, [dx, dy], e);
          const lx = dx === 0 ? ix + 50 : ix + dx * 50;
          const anchor = dx < 0 ? "end" : "start";
          sub(g, lx, iy + 7, "d", String(k + 1), { anchor, opacity: e, weight: 600 });
        });
      }

      if (i === 2) {
        // U split into thread blocks -> GPU conv kernels -> stack of 8 distance maps.
        const cell = 16, x0 = 34, y0 = 110;
        grid(g, x0, y0, cell, img);
        for (const k of [N / 2]) {
          line(g, [x0 + k * cell, y0], [x0 + k * cell, y0 + N * cell], { stroke: GPU, dash: "5 4", w: 1.8 });
          line(g, [x0, y0 + k * cell], [x0 + N * cell, y0 + k * cell], { stroke: GPU, dash: "5 4", w: 1.8 });
        }
        text(g, x0 + 64, y0 - 18, "U", { weight: 600, size: 22 });
        text(g, x0 + 64, y0 + N * cell + 30, L.blocks, { fill: GPU });
        kit.svg("rect", { x: 200, y: 112, width: 110, height: 124, rx: 4, fill: "none", stroke: GPU, "stroke-width": 2.2 }, g);
        text(g, 255, 142, L.gpu, { fill: GPU, weight: 700 });
        text(g, 255, 178, L.conv[0], { size: 19 });
        text(g, 255, 202, L.conv[1], { size: 19 });
        arrow(g, [172, 174], [198, 174], { w: 2 });
        arrow(g, [312, 174], [352, 174], { w: 2 });
        const count = Math.max(1, Math.ceil(e * 8));
        stack(g, 362, 138, 112, 8, 14, count);
        sub(g, 352, 284, "d", "1", { anchor: "start", weight: 600 });
        if (count === 8) sub(g, 362 + 56 + 120, 92, "d", "8", { anchor: "start", weight: 600 });
        text(g, 320, 336, L.parallel, { fill: body, opacity: e });
      }

      if (i === 3) {
        const cell = 12; // 96 px maps
        stack(g, 30, 140, 96, 5, cell, 8);
        rich(g, 30, 268, [["d"], ["1", "sub"], [" … d"], ["8", "sub"]], { anchor: "start", weight: 600 });
        // ABSMIN arrow
        arrow(g, [170, 158], [240, 158], { w: 2 });
        text(g, 205, 140, L.absmin, { weight: 700, size: 18 });
        // d_m map fades in
        grid(g, 252, 110, cell, dm, { signed: true, opacity: e });
        sub(g, 300, 96, "d", "m", { weight: 600, opacity: e });
        // plus node
        const px = 400, py = 158;
        arrow(g, [352, py], [382, py], { w: 2, opacity: e });
        kit.svg("circle", { cx: px, cy: py, r: 16, fill: bg, stroke: ink, "stroke-width": 2, opacity: e }, g);
        line(g, [px - 8, py], [px + 8, py], { stroke: ink, w: 2.2, opacity: e });
        line(g, [px, py - 8], [px, py + 8], { stroke: ink, w: 2.2, opacity: e });
        arrow(g, [418, py], [452, py], { w: 2, opacity: e });
        grid(g, 462, 110, cell, updated, { opacity: e });
        rich(g, 510, 96, [["U"], ["t+1", "sup"]], { weight: 600, opacity: e });
        // feedback loop
        const lo = 0.6 * e;
        line(g, [510, 210], [510, 300], { w: 1.8, opacity: lo });
        line(g, [510, 300], [400, 300], { w: 1.8, opacity: lo });
        arrow(g, [400, 300], [400, 176], { w: 1.8, opacity: lo });
        text(g, 455, 326, L.iterate, { fill: body, opacity: e });
        // Update rule, Eq. (6) of the paper.
        rich(g, 140, 326, [["U"], ["t+1", "sup"], [" = U"], ["t", "sup"], [" + d"], ["m", "sub"]], { opacity: e });
      }

      if (i === 4) {
        const X0 = 70, X1 = 610, Y0 = 70, Y1 = 290;
        line(g, [X0, Y1], [X1, Y1], { stroke: body, w: 1.4 });
        line(g, [X0, Y0], [X0, Y1], { stroke: body, w: 1.4 });
        text(g, (X0 + X1) / 2, 322, L.x, { fill: body, size: 18 });
        const yl = kit.text(g, 44, (Y0 + Y1) / 2, L.y, { size: 18, fill: body, anchor: "middle" });
        yl.setAttribute("transform", `rotate(-90 44 ${(Y0 + Y1) / 2})`);
        const path = (arr) => arr.map((v, k) => `${k ? "L" : "M"}${(X0 + 8 + (k / (M - 1)) * (X1 - X0 - 16)).toFixed(1)} ${(Y1 - 10 - v * (Y1 - Y0 - 30)).toFixed(1)}`).join(" ");
        kit.svg("path", { d: path(profiles[0]), fill: "none", stroke: mute, "stroke-width": 1.3, opacity: 0.7 }, g);
        const it = Math.round(e * 30);
        kit.svg("path", { d: path(profiles[it]), fill: "none", stroke: accent, "stroke-width": 2.2 }, g);
        text(g, X1, 46, `${L.iter}: ${it}`, { anchor: "end", weight: 600 });
      }
    },
  });
}
