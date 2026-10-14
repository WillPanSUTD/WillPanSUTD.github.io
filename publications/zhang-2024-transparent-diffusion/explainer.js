// Transparent-object PSP with a diffusion model:
// fringes reach the camera from the front surface (F), the back surface (B) and multiple reflections (M) ->
// the captured pattern is the sum S = F + B + M + A, and only F is wanted ->
// training: noise is added to developer-sprayed front-surface patterns x0, and a U-Net conditioned on the
// aliased pattern y learns to predict that noise ->
// sampling: from pure noise, the trained network removes noise step by step, conditioned on y, to give F* ->
// conventional 4-step PSP on F* gives the wrapped phase and the 3D front surface.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Fringes projected onto a transparent object reach the camera along three paths: reflected by the front surface (F), reflected once by the back surface (B), and reflected several times between the two surfaces (M). In the image they overlap.",
        "Each captured fringe pattern is the sum S = F + B + M + A, where A is the background light. Only F, with the background light, describes the front surface, so a network p is trained to sample an estimate F* from S.",
        "Training: the front-surface pattern x0 is captured after spraying a developer onto the object (which gives clean front-surface fringes), paired with the aliased pattern y. Gaussian noise e is added to x0 (T = 2600 steps), and a U-Net, given the noisy pattern, the step t and y, learns to predict that noise.",
        "Sampling: start from pure Gaussian noise. At each step the trained network, conditioned on the captured aliased pattern y, estimates the noise and removes it, t ← t − 1, until t = 0. The result is the front-surface pattern F*.",
        "The estimated patterns go into conventional 4-step PSP: wrapped phase, then the 3D shape of the front surface. RMS reconstruction errors on the four test objects range from 0.0388 to 0.0437 mm.",
      ],
      proj: "projector", cam: "camera", obj: "transparent object", front: "front surface", back: "back surface",
      lf: "front surface", lb: "back surface", lm: "multiple reflection",
      sumHead: "one camera pixel sees", bg: "A: background light",
      target: "target", goal: "sample F* ∼ p(S; θ)", sumLab: "captured S",
      noise: "noise", dev: "developer-sprayed", alias: "aliased", net: "U-Net",
      loss: "loss L = ‖e − e*‖", sched: "β: 0.0001 → 0.002, T = 2600",
      pure: "pure noise", cond: "condition on y (captured, aliased)", loop: "t ← t − 1 until t = 0",
      shifts: "F*, 4 phase shifts", wrapped: "wrapped phase", surf: "front surface",
      rms: "RMS error 0.0388–0.0437 mm (Table 1)",
    },
    zh: {
      steps: [
        "条纹投射到透明物体上后，沿三条路径进入相机：经前表面反射（F）、经后表面一次反射（B），以及在前后表面之间多次反射（M）。三者在图像中相互叠加。",
        "每幅采集到的条纹图都是 S = F + B + M + A，其中 A 为背景光。只有 F（连同背景光）反映前表面，因此训练网络 p，从 S 中采样出估计值 F*。",
        "训练：在物体表面喷涂显像剂（可得到干净的前表面条纹）后采集前表面条纹图 x0，并与混叠条纹图 y 配对。对 x0 逐步加入高斯噪声 e（T = 2600 步），U-Net 网络以含噪条纹图、步数 t 和 y 为输入，学习预测所加的噪声。",
        "采样：从纯高斯噪声出发。每一步中，训练好的网络以采集到的混叠条纹图 y 为条件估计噪声并将其去除，t ← t − 1，直到 t = 0，得到前表面条纹图 F*。",
        "估计出的条纹图送入常规四步相移法：先求包裹相位，再重建前表面的三维形貌。四个测试物体的重建 RMS 误差为 0.0388–0.0437 mm。",
      ],
      proj: "投影仪", cam: "相机", obj: "透明物体", front: "前表面", back: "后表面",
      lf: "前表面反射", lb: "后表面反射", lm: "多次反射",
      sumHead: "相机单个像素接收", bg: "A：背景光",
      target: "目标", goal: "采样 F* ∼ p(S; θ)", sumLab: "采集到的 S",
      noise: "噪声", dev: "喷涂显像剂后", alias: "混叠条纹", net: "U-Net",
      loss: "损失 L = ‖e − e*‖", sched: "β：0.0001 → 0.002，T = 2600",
      pure: "纯噪声", cond: "以 y 为条件（采集的混叠条纹）", loop: "t ← t − 1，直到 t = 0",
      shifts: "F*，四步相移", wrapped: "包裹相位", surf: "前表面",
      rms: "RMS 误差 0.0388–0.0437 mm（表 1）",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours for the three light paths (the paper's Fig. 1 uses yellow, red and orange).
  const CF = "#c99700"; // F: front surface
  const CB = "#d64545"; // B: back surface
  const CM = "#e07a2c"; // M: multiple reflection

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { line, arrow } = kit.pen({ stroke: body, head: 10 });

  // Text made of parts: plain strings, { sub: "…" } or { sup: "…" }; sub/superscripts stay >= 14 units.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo ?? true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = typeof p === "string"
        ? kit.svg("tspan", {}, n)
        : kit.svg("tspan", { "baseline-shift": p.sub !== undefined ? "sub" : "super", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : (p.sub ?? p.sup);
    }
    return n;
  };
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");
  // First fraction u of a polyline.
  const partial = (pts, u) => {
    const seg = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1]));
    let left = seg.reduce((a, b) => a + b, 0) * clamp01(u);
    const out = [pts[0]];
    for (let k = 0; k < seg.length && left > 0; k++) {
      const f = Math.min(1, left / seg[k]);
      out.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f]);
      left -= seg[k];
    }
    return out;
  };

  // --- Fringe tiles (built once): a rotated block in front of vertical fringes -------------------------
  const N = 22;
  const rnd = kit.rng(7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const grid = (f) => Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => f((j + 0.5) / N, (i + 0.5) / N)));
  const inObj = (u, v) => {
    const a = 0.35, du = u - 0.5, dv = v - 0.52;
    const ru = du * Math.cos(a) + dv * Math.sin(a), rv = -du * Math.sin(a) + dv * Math.cos(a);
    return Math.abs(ru) < 0.27 && Math.abs(rv) < 0.27;
  };
  const fr = (ph) => 0.5 + 0.5 * Math.cos(ph);
  const K = 2 * Math.PI * 3;
  // front-surface pattern: bright clean fringes on the block, shifted by its height; dim fringes around it
  const front = (u, v, d = 0) => (inObj(u, v) ? 0.12 + 0.86 * fr(K * u + 1.7 + d) : 0.04 + 0.34 * fr(K * u + d));
  const F0 = grid((u, v) => front(u, v));
  // aliased pattern: inside the block the front, back and multiple reflections overlap
  const Y0 = grid((u, v) => (inObj(u, v)
    ? 0.12 + 0.34 * fr(K * u + 1.7) + 0.3 * fr(K * u + 4.6 + 2.2 * v) + 0.14 * fr(2 * K * u + 0.8)
    : front(u, v)));
  const NOISE = grid(() => gauss());
  const SHIFTED = [0, 1, 2, 3].map((k) => grid((u, v) => front(u, v, (k * Math.PI) / 2)));

  // Draw one tile; ab is the signal weight (alpha-bar): 1 = clean pattern, 0 = pure noise.
  const tile = (g, x, y, size, src, ab = 1, o = {}) => {
    kit.svg("rect", { x, y, width: size, height: size, fill: bg }, g);
    const c = size / N, sa = Math.sqrt(ab), sn = Math.sqrt(1 - ab);
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const val = src ? sa * (2 * src[i][j] - 1) + sn * NOISE[i][j] : NOISE[i][j];
      kit.svg("rect", {
        x: (x + j * c).toFixed(2), y: (y + i * c).toFixed(2), width: (c + 0.3).toFixed(2), height: (c + 0.3).toFixed(2),
        fill: ink, "fill-opacity": clamp01(0.5 + 0.42 * val).toFixed(3),
      }, g);
    }
    kit.svg("rect", { x, y, width: size, height: size, fill: "none", stroke: o.stroke || mute, "stroke-width": o.w || 1.2 }, g);
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // left: projector, slab and camera with the three light paths; right: legend
        const FY = 190, BY = 100, X0 = 70, X1 = 290;
        kit.svg("rect", { x: X0, y: BY, width: X1 - X0, height: FY - BY, fill: rule, "fill-opacity": 0.6, stroke: body, "stroke-width": 1.4 }, g);
        line(g, [X0, FY], [X1, FY], { stroke: ink, w: 2.4 });
        line(g, [X0, BY], [X1, BY], { stroke: ink, w: 2.4 });
        text(g, (X0 + X1) / 2, 84, L.obj, { size: 18, fill: body, weight: 600 });
        text(g, X1 + 8, BY + 6, L.back, { size: 16, anchor: "start", fill: body });
        text(g, X1 + 8, FY + 6, L.front, { size: 16, anchor: "start", fill: body });
        const P = [60, 310], C = [320, 310];
        // projector and camera bodies
        kit.svg("rect", { x: P[0] - 26, y: P[1], width: 52, height: 26, rx: 4, fill: bg, stroke: ink, "stroke-width": 1.6 }, g);
        kit.svg("rect", { x: C[0] - 26, y: C[1], width: 52, height: 26, rx: 4, fill: bg, stroke: ink, "stroke-width": 1.6 }, g);
        text(g, P[0], 354, L.proj, { size: 16, fill: body });
        text(g, C[0], 354, L.cam, { size: 16, fill: body });
        const rays = [
          { c: CM, pts: [P, [126, FY], [148, BY], [170, FY], [192, BY], [214, FY], C], w: 3 },
          { c: CB, pts: [P, [168, FY], [200, BY], [232, FY], C], w: 3.4 },
          { c: CF, pts: [P, [190, FY], C], w: 4 },
        ];
        rays.forEach((r, k) => {
          const u = kit.easeOut(seg01(t, 0.12 * k, 0.6 + 0.12 * k));
          kit.svg("path", { d: path(partial(r.pts, u)), fill: "none", stroke: r.c, "stroke-width": r.w, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.92 }, g);
        });
        // legend
        const LX = 414;
        text(g, LX, 150, L.sumHead, { size: 17, anchor: "start", fill: body, weight: 600 });
        [[CF, "F", L.lf], [CB, "B", L.lb], [CM, "M", L.lm]].forEach(([c, k, lab], j) => {
          const y = 186 + j * 32;
          line(g, [LX, y - 6], [LX + 28, y - 6], { stroke: c, w: 5 });
          text(g, LX + 38, y, k + (lang === "zh" ? "：" : ": ") + lab, { size: 16, anchor: "start", fill: ink });
        });
        text(g, LX, 282, "+ " + L.bg, { size: 17, anchor: "start", fill: body });
        text(g, LX, 322, "S = F + B + M + A", { size: 20, anchor: "start", fill: accent, weight: 700, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
      }

      if (i === 1) {
        // left: the three components as intensity profiles along one image row; right: their sum S
        const comp = [
          { k: "F", c: CF, amp: 1, ph: 0.9 },
          { k: "B", c: CB, amp: 0.8, ph: 3.4 },
          { k: "M", c: CM, amp: 0.3, ph: 5.2 },
        ];
        const W0 = 70, W1 = 270, H = 24, rows = [70, 150, 230];
        const xs = Array.from({ length: 61 }, (_, k) => k / 60);
        comp.forEach((q, j) => {
          const cy = rows[j];
          line(g, [W0, cy + H + 4], [W1, cy + H + 4], { stroke: rule, w: 1 });
          kit.svg("path", { d: path(xs.map((u) => [W0 + u * (W1 - W0), cy - q.amp * H * Math.cos(2 * Math.PI * 3 * u + q.ph)])), fill: "none", stroke: q.c, "stroke-width": 3 }, g);
          text(g, W0 - 14, cy + 7, q.k, { size: 22, anchor: "end", fill: ink, weight: 700 });
          if (j > 0) text(g, W0 - 40, cy - 34, "+", { size: 22, anchor: "middle", fill: body });
        });
        text(g, (W0 + W1) / 2, 302, "+ A", { size: 20, fill: body });
        text(g, W1 + 14, rows[0] + 7, L.target, { size: 16, anchor: "start", fill: CF, weight: 700 });
        arrow(g, [W1 + 30, 160], [W1 + 82, 160], { stroke: body, w: 2 });
        // sum: grows from F alone to the full mixture
        const S0 = 380, S1 = 610, CY = 160, HS = 30;
        const m = kit.easeOut(seg01(t, 0.1, 0.8));
        const sum = (u) => comp.reduce((acc, q, j) => acc + (j === 0 ? 1 : m) * q.amp * Math.cos(2 * Math.PI * 3 * u + q.ph), 0);
        line(g, [S0, CY + 2.4 * HS], [S1, CY + 2.4 * HS], { stroke: rule, w: 1 });
        kit.svg("path", { d: path(xs.map((u) => [S0 + u * (S1 - S0), CY - HS * Math.cos(2 * Math.PI * 3 * u + comp[0].ph)])), fill: "none", stroke: CF, "stroke-width": 2, "stroke-dasharray": "6 5", opacity: 0.8 }, g);
        kit.svg("path", { d: path(xs.map((u) => [S0 + u * (S1 - S0), CY - HS * sum(u)])), fill: "none", stroke: ink, "stroke-width": 3 }, g);
        text(g, (S0 + S1) / 2, 58, L.sumLab, { size: 18, fill: ink, weight: 700 });
        text(g, (S0 + S1) / 2, 284, L.goal, { size: 20, fill: accent, weight: 700, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
      }

      if (i === 2) {
        // Fig. 5 (training): e and x0 mix into x_t; p_theta(x_t, t, y) predicts e*; loss compares e and e*
        const ab = 1 - 0.75 * e; // noise level grows as the forward process runs
        const TS = 72, SEP = lang === "zh" ? "：" : ": ";
        tile(g, 24, 22, TS, null);
        text(g, 60, 114, ["e" + SEP + L.noise], { size: 16, fill: body });
        tile(g, 24, 134, TS, F0);
        text(g, 24, 226, ["x", { sub: "0" }, SEP + L.dev], { size: 16, anchor: "start", fill: body });
        tile(g, 24, 248, TS, Y0);
        text(g, 24, 340, ["y" + SEP + L.alias], { size: 16, anchor: "start", fill: body });
        // forward process
        text(g, 300, 54, ["x", { sub: "t" }, " = √ᾱ", { sub: "t" }, " x", { sub: "0" }, " + √(1 − ᾱ", { sub: "t" }, ") e"], { size: 17, fill: ink });
        arrow(g, [100, 58], [236, 118], { stroke: body, w: 1.8 });
        arrow(g, [100, 170], [236, 150], { stroke: body, w: 1.8 });
        tile(g, 242, 82, 106, F0, ab, { stroke: accent, w: 1.6 });
        text(g, 295, 212, ["x", { sub: "t" }], { size: 18, fill: ink, weight: 600 });
        // network
        kit.svg("rect", { x: 400, y: 98, width: 86, height: 80, rx: 8, fill: accent, "fill-opacity": 0.12, stroke: accent, "stroke-width": 1.8 }, g);
        text(g, 443, 136, ["p", { sub: "θ" }], { size: 24, fill: accent, weight: 700 });
        text(g, 443, 164, L.net, { size: 15, fill: body });
        arrow(g, [352, 135], [398, 135], { stroke: body, w: 1.8 });
        line(g, [100, 284], [443, 284], { stroke: body, w: 1.8 });
        arrow(g, [443, 284], [443, 180], { stroke: body, w: 1.8 });
        text(g, 456, 66, "t", { size: 18, anchor: "start", fill: ink, italic: true });
        arrow(g, [443, 52], [443, 96], { stroke: body, w: 1.8 });
        // prediction and loss
        arrow(g, [488, 138], [524, 138], { stroke: body, w: 1.8 });
        const v = kit.easeOut(seg01(t, 0.5, 1));
        const pg = kit.svg("g", { opacity: v }, g);
        tile(pg, 530, 102, TS, null);
        text(pg, 566, 196, "e*", { size: 18, fill: ink, weight: 600 });
        text(pg, 618, 250, [L.loss, { sup: "2" }], { size: 17, anchor: "end", fill: accent, weight: 700 });
        text(g, 618, 340, L.sched, { size: 15, anchor: "end", fill: body });
      }

      if (i === 3) {
        // Fig. 5 (sampling): pure noise -> ... -> F*, every step conditioned on y
        const TS = 84, XS = [22, 146, 270, 394, 518], AB = [0, 0.18, 0.45, 0.78, 1], TY = 150;
        tile(g, 22, 18, 70, Y0);
        text(g, 104, 50, ["y"], { size: 18, anchor: "start", fill: ink, weight: 600 });
        text(g, 104, 76, L.cond, { size: 16, anchor: "start", fill: body });
        line(g, [57, 92], [57, 112], { stroke: body, w: 1.6 });
        line(g, [57, 112], [580, 112], { stroke: body, w: 1.6 });
        XS.forEach((x, k) => {
          const v = kit.easeOut(seg01(t, k * 0.16, k * 0.16 + 0.25));
          const tg = kit.svg("g", { opacity: k === 0 ? 1 : v }, g);
          tile(tg, x, TY, TS, F0, AB[k], k === 4 ? { stroke: accent, w: 2 } : {});
          if (k < 4) {
            const ax = x + TS + 4, bx = XS[k + 1] - 4;
            arrow(tg, [ax, TY + TS / 2], [bx, TY + TS / 2], { stroke: accent, w: 2 });
            text(tg, (ax + bx) / 2, TY + TS / 2 - 10, ["p", { sub: "θ" }], { size: 16, fill: accent, weight: 700 });
            arrow(tg, [(ax + bx) / 2, 112], [(ax + bx) / 2, TY + TS / 2 - 30], { stroke: body, w: 1.4, head: 7 });
          }
        });
        text(g, 64, 262, ["x", { sub: "T" }, " = e"], { size: 17, fill: ink });
        text(g, 64, 286, L.pure, { size: 15, fill: body });
        text(g, 312, 262, ["x", { sub: "t" }], { size: 17, fill: ink });
        text(g, 560, 262, "F*", { size: 19, fill: accent, weight: 700, opacity: kit.easeOut(seg01(t, 0.7, 1)) });
        text(g, 320, 334, L.loop, { size: 18, fill: body, weight: 600 });
      }

      if (i === 4) {
        // conventional 4-step PSP on the estimated patterns -> wrapped phase -> front surface
        const TS = 60;
        text(g, 86, 46, L.shifts, { size: 16, fill: body, weight: 600 });
        for (let k = 0; k < 4; k++) {
          const x = 20 + (k % 2) * (TS + 12), y = 64 + Math.floor(k / 2) * (TS + 12);
          tile(g, x, y, TS, SHIFTED[k], 1, { stroke: accent });
        }
        arrow(g, [162, 136], [204, 136], { stroke: body, w: 2 });
        // wrapped phase along one row: a sawtooth with a jump where the block sits
        const P0 = 214, P1 = 390, PY = 136, PH = 46;
        const u = kit.easeOut(seg01(t, 0.1, 0.6));
        line(g, [P0, PY + PH + 8], [P1, PY + PH + 8], { stroke: rule, w: 1 });
        const ph = (x) => {
          const q = (x - P0) / (P1 - P0);
          const raw = 2 * Math.PI * 3.2 * q + (q > 0.35 && q < 0.75 ? 1.7 : 0);
          return ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        };
        const pts = [];
        for (let x = P0; x <= P0 + (P1 - P0) * u; x += 1) {
          const y = PY + PH - (ph(x) / (2 * Math.PI)) * 2 * PH;
          const prev = pts[pts.length - 1];
          if (prev && Math.abs(y - prev[1]) > PH * 0.4) pts.push(null);
          pts.push([x, y]);
        }
        let run = [];
        for (const p of [...pts, null]) {
          if (p) { run.push(p); continue; }
          if (run.length > 1) kit.svg("path", { d: path(run), fill: "none", stroke: accent, "stroke-width": 2.6 }, g);
          run = [];
        }
        text(g, (P0 + P1) / 2, 72, L.wrapped + " φ", { size: 17, fill: ink, weight: 600 });
        text(g, P0 - 4, PY - PH + 6, "π", { size: 15, anchor: "end", fill: body });
        text(g, P0 - 4, PY + PH + 6, "−π", { size: 15, anchor: "end", fill: body });
        arrow(g, [400, 136], [442, 136], { stroke: body, w: 2 });
        // reconstructed front surface: a block in oblique view
        const v = kit.easeOut(seg01(t, 0.45, 0.9));
        const bx = 470, by = 110, bw = 110, bh = 54, dx = 34, dy = -30;
        const sg = kit.svg("g", { opacity: v }, g);
        kit.svg("path", { d: path([[bx, by], [bx + bw, by], [bx + bw + dx, by + dy], [bx + dx, by + dy]]) + "Z", fill: accent, "fill-opacity": 0.55, stroke: ink, "stroke-width": 1.4 }, sg);
        kit.svg("path", { d: path([[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]]) + "Z", fill: accent, "fill-opacity": 0.25, stroke: ink, "stroke-width": 1.4 }, sg);
        kit.svg("path", { d: path([[bx + bw, by], [bx + bw + dx, by + dy], [bx + bw + dx, by + bh + dy], [bx + bw, by + bh]]) + "Z", fill: accent, "fill-opacity": 0.38, stroke: ink, "stroke-width": 1.4 }, sg);
        text(sg, bx + (bw + dx) / 2, 206, L.surf, { size: 17, fill: ink, weight: 600 });
        text(g, 320, 300, L.rms, { size: 19, fill: accent, weight: 700, opacity: kit.easeOut(seg01(t, 0.7, 1)) });
      }
    },
  });
}
