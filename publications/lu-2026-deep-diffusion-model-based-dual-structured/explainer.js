// Dual-head structured light with diffusion dealiasing (schematic):
// two synchronised projector-camera heads with a local overlap ->
// in the overlap a camera sees the sum of both projected patterns (aliasing) ->
// a conditional diffusion model, guided by the aliased image, denoises Gaussian noise into the clean fringe ->
// four-step phase shifting + multi-frequency heterodyne unwrapping, then triangulation per head ->
// ICP on the overlap fuses the two partial point clouds.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two synchronised projector–camera heads each measure part of a large surface. Their fields of view overlap locally, so each head covers regions the other cannot see.",
        "When both projectors run at once, a camera pixel in the overlap receives light from both patterns. It records their sum, an aliased fringe pattern, and phase shifting gives wrong phase there.",
        "Treating the other head's pattern as noise turns separation into denoising. A conditional diffusion model with a U-Net, guided by the aliased image y, turns Gaussian noise step by step into the clean fringe x₀.",
        "With clean fringes, each head is an ordinary structured-light unit: four-step phase shifting gives the wrapped phase, multi-frequency heterodyne unwrapping the absolute phase, and triangulation a partial point cloud.",
        "The overlap provides matching points, so the iterative closest point (ICP) algorithm estimates the rigid transform that fuses the two partial clouds into one surface.",
      ],
      head1: "Head 1", head2: "Head 2", overlap: "overlap", surface: "surface",
      p1: "pattern l_1", p2: "pattern l_2", cam: "camera 1", sum: "I(u) = I(u; l_1) + I(u; l_2)",
      noise: "x_T: noise", mid: "x_t", clean: "x_0: clean", cond: "condition y (aliased)",
      net: "P_θ", sep: "I(u; l_1) = I(u) − I(u; l_2)", tsteps: "T = 4000 denoising steps",
      shift: "4 steps, π/2 apart", wrapped: "wrapped φ", abs: "absolute Φ", het: "multi-frequency heterodyne",
      tri: "Φ + calibration → triangulation → partial 3D cloud, per head",
      c1: "Head 1 cloud", c2: "Head 2 cloud", icp: "ICP on the overlap: min Σ ‖R X_i + t − Y_i‖^2", fused: "fused surface",
    },
    zh: {
      steps: [
        "两个同步工作的投影仪–相机测头各测量大幅面表面的一部分。二者视场局部重叠，每个测头都能覆盖另一测头看不到的区域。",
        "两台投影仪同时投射时，重叠区内的相机像素同时接收到两幅图案的光，记录的是二者之和，即混叠条纹；常规相移法在这里会解算出错误的相位。",
        "把另一测头的图案视为噪声，分离问题就变成了去噪问题。以 U-Net 为骨干的条件扩散模型在混叠图像 y 的引导下，把高斯噪声逐步去噪为干净条纹 x₀。",
        "得到干净条纹后，每个测头就是一套普通的结构光单元：四步相移求包裹相位，多频外差展开得到绝对相位，再经三角测量得到局部点云。",
        "重叠区提供了对应点，迭代最近点（ICP）算法据此估计刚体变换，把两片局部点云融合为完整表面。",
      ],
      head1: "测头 1", head2: "测头 2", overlap: "重叠区", surface: "被测表面",
      p1: "图案 l_1", p2: "图案 l_2", cam: "相机 1 所见", sum: "I(u) = I(u; l_1) + I(u; l_2)",
      noise: "x_T：噪声", mid: "x_t", clean: "x_0：干净条纹", cond: "条件 y（混叠图像）",
      net: "P_θ", sep: "I(u; l_1) = I(u) − I(u; l_2)", tsteps: "T = 4000 步去噪",
      shift: "四步相移，间隔 π/2", wrapped: "包裹相位 φ", abs: "绝对相位 Φ", het: "多频外差展开",
      tri: "Φ + 标定参数 → 三角测量 → 各测头的局部点云",
      c1: "测头 1 点云", c2: "测头 2 点云", icp: "ICP 配准重叠区：min Σ ‖R X_i + t − Y_i‖^2", fused: "融合后的完整表面",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal colours identifying the two heads (light paths in the paper's Fig. 2).
  const H1 = "#3b6fb6";
  const H2 = "#d9822b";
  const rnd = kit.rng(7);
  const seg01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body });

  // Text where "x_T" / "P_θ" style parts become real subscripts and "^2" a real superscript.
  const subText = (parent, x, y, str, o = {}) => {
    const n = text(parent, x, y, "", o);
    const size = o.size || 18;
    str.split(/([_^][^\s:：（()‖]+)/).forEach((part) => {
      if (!part) return;
      if (part.startsWith("_") || part.startsWith("^")) {
        kit.svg("tspan", { "baseline-shift": part[0] === "_" ? "sub" : "super", "font-size": Math.max(14, Math.round(size * 0.8)) }, n).textContent = part.slice(1);
      } else {
        kit.svg("tspan", {}, n).textContent = part;
      }
    });
    return n;
  };

  // --- Fixed geometry, built once -------------------------------------------------
  // Side view of a complex surface (as in the paper's Fig. 1).
  const PROFILE = [[70, 300], [190, 300], [245, 196], [315, 262], [390, 184], [450, 300], [570, 300]];
  const along = (pts, n) => {
    const segs = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const len = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      segs.push([pts[k - 1], pts[k], total, len]);
      total += len;
    }
    return Array.from({ length: n }, (_, j) => {
      const d = (j / (n - 1)) * total;
      const [a, b, s0, len] = segs.find(([, , s, l]) => d <= s + l + 1e-6) || segs[segs.length - 1];
      const u = (d - s0) / len;
      return [a[0] + (b[0] - a[0]) * u + (rnd() - 0.5) * 5, a[1] + (b[1] - a[1]) * u + (rnd() - 0.5) * 5];
    });
  };
  const CLOUD = along(PROFILE, 90);
  const SEEN1 = CLOUD.filter((p) => p[0] <= 410);
  const SEEN2 = CLOUD.filter((p) => p[0] >= 230);
  const OVER = CLOUD.filter((p) => p[0] >= 230 && p[0] <= 410);

  // Fringe intensity in [0,1]: sinusoid of a given period (px) and phase.
  const fr = (x, period, phase) => 0.5 + 0.5 * Math.cos((2 * Math.PI * x) / period + phase);
  // Noise grid for the diffusion tiles (12 x 12 cells per tile, 6 tiles).
  const CELLS = 12;
  const NOISE = Array.from({ length: 6 }, () => Array.from({ length: CELLS * CELLS }, () => rnd()));

  // A square tile of vertical stripes, mixed with noise. value(cx, cy) -> intensity in [0,1].
  const tile = (g, x, y, size, value) => {
    const c = size / CELLS;
    kit.svg("rect", { x, y, width: size, height: size, fill: bg, stroke: mute, "stroke-width": 1.2 }, g);
    for (let r = 0; r < CELLS; r++) {
      for (let q = 0; q < CELLS; q++) {
        const v = value(q, r);
        if (v < 0.04) continue;
        kit.svg("rect", { x: x + q * c, y: y + r * c, width: c + 0.3, height: c + 0.3, fill: ink, opacity: (0.85 * v).toFixed(3) }, g);
      }
    }
    kit.svg("rect", { x, y, width: size, height: size, fill: "none", stroke: mute, "stroke-width": 1.2 }, g);
  };
  const clean = (q) => fr(q, 4, 0);
  const aliased = (q) => 0.5 * (fr(q, 4, 0) + fr(q * 1.35, 4, 1.3));

  // Strip of vertical fringes from x0 to x1 at row y; value(x) -> intensity.
  const strip = (g, x0, x1, y, h, value, o = {}) => {
    const w = 4;
    for (let x = x0; x < x1; x += w) {
      const v = value(x + w / 2);
      kit.svg("rect", { x, y, width: w + 0.3, height: h, fill: o.colour || ink, opacity: (0.88 * v * (o.opacity ?? 1)).toFixed(3) }, g);
    }
  };

  const projector = (g, x, y, c) => {
    kit.svg("rect", { x: x - 20, y: y - 14, width: 40, height: 28, rx: 3, fill: bg, stroke: c, "stroke-width": 2 }, g);
    kit.svg("circle", { cx: x, cy: y + 14, r: 6, fill: c }, g);
  };
  const camera = (g, x, y, c) => {
    kit.svg("rect", { x: x - 13, y: y - 10, width: 26, height: 20, rx: 3, fill: c, opacity: 0.85 }, g);
    kit.svg("rect", { x: x - 6, y: y + 10, width: 12, height: 7, fill: c }, g);
  };
  const profilePath = (g, o = {}) => kit.svg("path", {
    d: "M" + PROFILE.map((p) => p.join(",")).join("L"), fill: "none", stroke: o.stroke || ink, "stroke-width": o.w || 2.5,
    "stroke-linejoin": "round", opacity: o.opacity ?? 1,
  }, g);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // Two heads, two projection cones; the cones overlap in the middle of the surface.
        const P1 = [210, 82], P2 = [430, 82];
        const A1 = [90, 300], B1 = [410, 300], A2 = [230, 300], B2 = [550, 300];
        const grow = (apex, p) => [apex[0] + (p[0] - apex[0]) * e, apex[1] + (p[1] - apex[1]) * e];
        for (const [apex, a, b, c] of [[P1, A1, B1, H1], [P2, A2, B2, H2]]) {
          const pa = grow(apex, a), pb = grow(apex, b);
          kit.svg("polygon", { points: [apex, pa, pb].map((q) => q.join(",")).join(" "), fill: c, opacity: 0.16 }, g);
          line(g, apex, pa, { stroke: c, dash: "6 5", w: 1.4 });
          line(g, apex, pb, { stroke: c, dash: "6 5", w: 1.4 });
        }
        line(g, [40, 300], [600, 300], { stroke: body, w: 2 });
        profilePath(g);
        projector(g, P1[0], P1[1] - 14, H1); camera(g, 150, 76, H1);
        projector(g, P2[0], P2[1] - 14, H2); camera(g, 490, 76, H2);
        text(g, 180, 36, L.head1, { weight: 600, fill: H1 });
        text(g, 460, 36, L.head2, { weight: 600, fill: H2 });
        const v = seg01(t, 0.6, 1);
        // overlap bracket on the ground
        line(g, [230, 322], [410, 322], { stroke: accent, w: 2, opacity: v });
        line(g, [230, 314], [230, 330], { stroke: accent, w: 2, opacity: v });
        line(g, [410, 314], [410, 330], { stroke: accent, w: 2, opacity: v });
        text(g, 320, 350, L.overlap, { fill: accent, weight: 600, opacity: v });
        text(g, 44, 326, L.surface, { size: 16, fill: body, anchor: "start" });
      }

      if (i === 1) {
        // Three fringe strips: head 1 pattern, head 2 pattern (overlap only), what camera 1 records.
        const X0 = 170, X1 = 610, OV = 420, H = 46;
        const l1 = (x) => fr(x, 26, 0);
        const l2 = (x) => fr(x, 19, 1.2);
        const rows = [70, 150, 240];
        subText(g, X0 - 12, rows[0] + 30, L.p1, { anchor: "end", fill: H1, weight: 600 });
        subText(g, X0 - 12, rows[1] + 30, L.p2, { anchor: "end", fill: H2, weight: 600 });
        text(g, X0 - 12, rows[2] + 30, L.cam, { anchor: "end", fill: ink, weight: 600 });
        strip(g, X0, X1, rows[0], H, l1, { colour: H1 });
        kit.svg("rect", { x: X0, y: rows[1], width: OV - X0, height: H, fill: "none", stroke: mute, "stroke-dasharray": "5 5", "stroke-width": 1.2 }, g);
        strip(g, OV, X1, rows[1], H, l2, { colour: H2 });
        // camera 1 strip fills left to right
        const xe = X0 + (X1 - X0) * e;
        strip(g, X0, Math.min(xe, OV), rows[2], H, l1);
        if (xe > OV) strip(g, OV, xe, rows[2], H, (x) => 0.5 * (l1(x) + l2(x)));
        for (const y of rows) kit.svg("rect", { x: X0, y, width: X1 - X0, height: H, fill: "none", stroke: mute, "stroke-width": 1 }, g);
        // overlap marker
        kit.svg("rect", { x: OV, y: 56, width: X1 - OV, height: 244, fill: accent, opacity: 0.06 }, g);
        line(g, [OV, 50], [OV, 300], { stroke: accent, dash: "6 5", w: 1.6 });
        text(g, (OV + X1) / 2, 46, L.overlap, { fill: accent, weight: 600 });
        subText(g, 390, 334, L.sum, { fill: accent, weight: 600, opacity: seg01(t, 0.5, 1) });
      }

      if (i === 2) {
        // Reverse diffusion: noise tile -> ... -> clean fringe, every step conditioned on the aliased image y.
        const SZ = 70, Y = 176, XS = [36, 156, 276, 396, 516];
        const noiseLevels = [1, 0.72, 0.45, 0.2, 0];
        // condition tile and bus
        tile(g, 36, 44, 56, (q) => aliased(q));
        text(g, 104, 78, L.cond, { anchor: "start", weight: 600 });
        line(g, [64, 100], [64, 132], { stroke: accent, w: 1.6 });
        line(g, [64, 132], [574, 132], { stroke: accent, w: 1.6 });
        XS.slice(0, 4).forEach((x) => arrow(g, [x + SZ + 25, 132], [x + SZ + 25, 196], { stroke: accent, w: 1.6, head: 8 }));
        const shown = e * 5;
        XS.forEach((x, k) => {
          const vis = Math.max(0, Math.min(1, shown - k + 0.6));
          if (vis <= 0) return;
          const n = noiseLevels[k];
          const grp = kit.svg("g", { opacity: vis.toFixed(3) }, g);
          tile(grp, x, Y, SZ, (q, r) => (1 - n) * clean(q) + n * NOISE[k][r * CELLS + q]);
          if (k < 4) {
            arrow(grp, [x + SZ + 4, Y + SZ / 2 + 14], [x + SZ + 46, Y + SZ / 2 + 14], { stroke: ink, w: 1.8 });
          }
        });
        XS.slice(0, 4).forEach((x) => subText(g, x + SZ + 25, Y + SZ / 2 + 2, L.net, { size: 16, weight: 600, fill: accent }));
        subText(g, XS[0] + SZ / 2, Y + SZ + 28, L.noise, { size: 16 });
        subText(g, XS[2] + SZ / 2, Y + SZ + 28, L.mid, { size: 16 });
        subText(g, XS[4] + SZ / 2, Y + SZ + 28, L.clean, { size: 16, weight: 600 });
        subText(g, 320, 306, L.sep, { size: 17, fill: body });
        text(g, 320, 338, L.tsteps, { size: 17, fill: accent, weight: 600, opacity: seg01(t, 0.5, 1) });
      }

      if (i === 3) {
        // Four phase-shifted tiles -> wrapped phase (sawtooth) -> absolute phase (ramp).
        const SZ = 56;
        for (let k = 0; k < 4; k++) {
          const x = 36 + (k % 2) * 64, y = 72 + Math.floor(k / 2) * 64;
          tile(g, x, y, SZ, (q) => fr(q, 4, (k * Math.PI) / 2));
        }
        text(g, 96, 222, L.shift, { size: 16 });
        arrow(g, [168, 130], [214, 130], { stroke: ink, w: 1.8 });
        const box = (x, title) => {
          kit.svg("rect", { x, y: 70, width: 170, height: 120, fill: "none", stroke: mute, "stroke-width": 1.2 }, g);
          text(g, x + 85, 58, title, { weight: 600 });
        };
        box(226, L.wrapped);
        box(446, L.abs);
        const m = seg01(t, 0, 0.7);
        const N = 120, cycles = 4;
        const saw = [], ramp = [];
        for (let j = 0; j <= N * m; j++) {
          const u = j / N;
          const ph = u * cycles;
          saw.push([234 + u * 154, 180 - (ph - Math.floor(ph)) * 100]);
          ramp.push([454 + u * 154, 180 - u * 100]);
        }
        // break the sawtooth at each wrap so no vertical stroke is drawn as data
        let d = "";
        saw.forEach((p, j) => {
          const jump = j > 0 && p[1] > saw[j - 1][1] + 20;
          d += (j === 0 || jump ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1);
        });
        if (saw.length > 1) kit.svg("path", { d, fill: "none", stroke: accent, "stroke-width": 2.4 }, g);
        if (ramp.length > 1) kit.svg("path", { d: "M" + ramp.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L"), fill: "none", stroke: accent, "stroke-width": 2.4 }, g);
        arrow(g, [402, 130], [440, 130], { stroke: ink, w: 1.8 });
        text(g, 531, 214, L.het, { size: 16 });
        text(g, 320, 300, L.tri, { size: 17, weight: 600, fill: accent, opacity: seg01(t, 0.6, 1) });
      }

      if (i === 4) {
        // Two partial clouds; head 2's starts displaced and ICP pulls it onto head 1 through the overlap.
        const ang = (1 - e) * (-7 * Math.PI) / 180;
        const dx = (1 - e) * 34, dy = (1 - e) * -46;
        const cx = 400, cy = 250;
        const move = ([x, y]) => {
          const ux = x - cx, uy = y - cy;
          return [cx + ux * Math.cos(ang) - uy * Math.sin(ang) + dx, cy + ux * Math.sin(ang) + uy * Math.cos(ang) + dy];
        };
        kit.svg("rect", { x: 230, y: 160, width: 180, height: 160, fill: accent, opacity: 0.06 }, g);
        text(g, 320, 152, L.overlap, { size: 16, fill: accent, weight: 600 });
        for (const p of SEEN1) kit.svg("circle", { cx: p[0], cy: p[1], r: 3.4, fill: H1, opacity: 0.85 }, g);
        for (const p of SEEN2) {
          const q = move(p);
          kit.svg("circle", { cx: q[0], cy: q[1], r: 3.4, fill: "none", stroke: H2, "stroke-width": 1.6 }, g);
        }
        if (t < 0.9) {
          OVER.forEach((p, k) => {
            if (k % 4) return;
            line(g, p, move(p), { stroke: body, w: 1, opacity: 0.6 * (1 - e) });
          });
        }
        text(g, 110, 280, L.c1, { size: 16, fill: H1, weight: 600 });
        text(g, 540, 330 - (1 - e) * 46, L.c2, { size: 16, fill: H2, weight: 600 });
        subText(g, 320, 50, L.icp, { weight: 600, fill: ink });
        text(g, 320, 350, L.fused, { weight: 600, fill: accent, opacity: seg01(t, 0.75, 1) });
      }
    },
  });
}
