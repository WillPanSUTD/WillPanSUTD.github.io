// Double-shooting PSP for moving objects (schematic):
// camera triggered twice per projected fringe pattern -> images under one pattern differ only by motion,
// images under different patterns carry motion + PSP phase shift (mixed phase shift) ->
// motion tracking gives a rotation-translation matrix, built into the fringe model ->
// least squares solves a, B, C per pixel, phase = arctan(-C / B) ->
// captured images are reused: every three adjacent images give one phase frame.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A trigger controller fires the camera twice while the projector shows each fringe pattern, so every pattern yields two captured images of the moving object.",
        "Two images taken under the same pattern differ only by the object's motion. Images taken under different patterns also carry the ordinary PSP phase shift: a mixed phase shift.",
        "Object motion tracking gives a rotation–translation matrix, which maps each point between images. The fringe model of every image is written with this motion included.",
        "Per pixel, least squares fits a, B and C to three such images, and the object phase follows as φ = arctan(−C / B).",
        "The captured images are reused: every three adjacent images give one phase frame, so a new frame appears with each new image and the reconstruction frame rate rises while the projector rate stays the same.",
      ],
      proj: "Projector", cam: "Camera", pattern: "pattern", time: "time",
      twice: "2 captures per pattern",
      motionOnly: "motion only", mixed: "motion + phase shift",
      tracking: "motion tracking", rt: "R, T",
      map: "from R, T",
      ls: "least squares", abc: "a, B, C", wrapped: "wrapped phase φ",
      trad: "Traditional", ours: "Proposed", frame: "Frame",
      reuse: "3 adjacent images → 1 frame",
    },
    zh: {
      steps: [
        "触发控制设备使投影仪每投射一幅条纹图，相机拍摄两次，因此每幅投射条纹都对应运动物体的两张采集图像。",
        "同一幅投射条纹下拍摄的两张图像之间只存在物体运动引起的相移；不同投射条纹下拍摄的图像还包含 PSP 的传统相移，即混合相移。",
        "物体运动跟踪算法给出旋转平移矩阵，用来描述各点在图像之间的坐标变换；每张图像的条纹方程都计入这一运动。",
        "对每个像素，用最小二乘从三张图像中求解 a、B、C，再由 φ = arctan(−C / B) 得到物体相位。",
        "采集到的图像被复用：每三张相邻图像得到一帧相位，因此每采到一张新图像就有一帧新相位，在投影速率不变的情况下提高了重构帧率。",
      ],
      proj: "投影仪", cam: "相机", pattern: "条纹", time: "时间",
      twice: "每幅条纹拍摄两次",
      motionOnly: "仅运动相移", mixed: "运动 + 传统相移",
      tracking: "运动跟踪", rt: "R, T",
      map: "由 R, T 得到",
      ls: "最小二乘", abc: "a, B, C", wrapped: "包裹相位 φ",
      trad: "传统 PSP", ours: "本文方法", frame: "第",
      reuse: "每三张相邻图像 → 一帧",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colour: object motion.
  const MOVE = "#d9822b";
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const frameLabel = (k) => (lang === "zh" ? `${L.frame} ${k} 帧` : `${L.frame} ${k}`);

  // Deterministic per-image jitter of the object's vertical position (the stage moves in 2D).
  const rnd = kit.rng(31);
  const jitter = Array.from({ length: 6 }, () => (rnd() - 0.5) * 0.04);

  // Text with subscripts. segs: [{ t, sub }]. Subscripts stay >= 14 units.
  const rich = (g, x, y, segs, o = {}) => {
    const size = o.size ?? 20;
    const sub = Math.max(14, Math.round(size * 0.8));
    const node = kit.text(g, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor ?? "middle", opacity: o.opacity, halo: true, weight: o.weight,
    });
    let low = false;
    for (const s of segs) {
      const attrs = {};
      if (s.sub && !low) { attrs.dy = Math.round(size * 0.3); low = true; }
      else if (!s.sub && low) { attrs.dy = -Math.round(size * 0.3); low = false; }
      if (s.sub) attrs["font-size"] = sub;
      kit.svg("tspan", attrs, node).textContent = s.t;
    }
    return node;
  };
  const In = (n) => [{ t: "I" }, { t: String(n), sub: true }];

  // A camera image: vertical fringes deformed by a dome-shaped object.
  // shift: fringe phase as a fraction of the period; ox, oy: object centre as fractions of the tile.
  let clipId = 0;
  const tile = (g, x, y, w, h, { shift = 0, ox = 0.5, oy = 0.5, period = 12, mode = "fringe", opacity = 1, outline = true } = {}) => {
    const id = `z31clip${clipId++}`;
    const defs = kit.svg("defs", {}, g);
    const cp = kit.svg("clipPath", { id }, defs);
    kit.svg("rect", { x, y, width: w, height: h }, cp);
    const box = kit.svg("g", { opacity }, g);
    kit.svg("rect", { x, y, width: w, height: h, fill: bg, stroke: rule, "stroke-width": 1.2 }, box);
    const inner = kit.svg("g", { "clip-path": `url(#${id})` }, box);
    const r = 0.33 * Math.min(w, h);
    const cx = x + ox * w, cy = y + oy * h;
    const amp = 0.7 * period;
    const levels = mode === "phase" ? 6 : 1;
    for (let x0 = x - 2 * period + shift * period; x0 < x + w + period; x0 += period) {
      for (let f = 0; f < levels; f++) {
        const xs = x0 + (f * period) / levels;
        const pts = [];
        for (let yy = y; yy <= y + h + 0.1; yy += 3) {
          const d2 = ((xs - cx) / r) ** 2 + ((yy - cy) / r) ** 2;
          pts.push(`${(xs + (d2 < 1 ? amp * Math.sqrt(1 - d2) : 0)).toFixed(1)},${yy.toFixed(1)}`);
        }
        const attrs = mode === "phase"
          ? { stroke: accent, "stroke-width": period / levels + 0.6, opacity: 0.1 + (0.75 * f) / (levels - 1) }
          : { stroke: ink, "stroke-width": period * 0.45, opacity: 0.45 };
        kit.svg("polyline", { points: pts.join(" "), fill: "none", ...attrs }, inner);
      }
    }
    if (outline) kit.svg("circle", { cx, cy, r, fill: "none", stroke: body, "stroke-width": 1.4, opacity: 0.8 }, inner);
    return [cx, cy, r];
  };
  // Object position in camera image n (0-based): moves to the right.
  const objX = (n) => 0.36 + 0.06 * n;
  const objY = (n) => 0.5 + jitter[n];
  // Projected pattern index for camera image n under double shooting.
  const patOf = (n) => Math.floor(n / 2);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      clipId = 0;
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // Timing: one projected pattern, two camera captures.
        text(g, 20, 102, L.proj, { anchor: "start", weight: 600 });
        text(g, 20, 222, L.cam, { anchor: "start", weight: 600 });
        for (let k = 0; k < 3; k++) {
          const bx = 140 + k * 162;
          text(g, bx + 74, 50, `${L.pattern} ${k + 1}`, { size: 17, fill: body });
          tile(g, bx, 62, 148, 64, { shift: k / 3, outline: false, period: 12, ox: -2 });
          for (let c = 0; c < 2; c++) {
            const n = 2 * k + c;
            const u = seg01(t, n / 6 - 0.05, n / 6 + 0.15);
            if (u <= 0) continue;
            const cx = bx + c * 78;
            line(g, [cx + 35, 128], [cx + 35, 176], { stroke: mute, dash: "4 4", w: 1.2, opacity: u });
            tile(g, cx, 180, 70, 70, { shift: k / 3, ox: objX(n), oy: objY(n), period: 9, opacity: u });
            rich(g, cx + 35, 276, In(n + 1), { size: 18, opacity: u });
          }
        }
        arrow(g, [140, 300], [626, 300], { stroke: mute, w: 1.3 });
        text(g, 620, 324, L.time, { anchor: "end", size: 16, fill: body });
        text(g, 140, 340, L.twice, { anchor: "start", fill: accent, weight: 600, opacity: e });
      }

      if (i === 1) {
        // Mixed phase shift between I1, I2 (same pattern) and I3 (next pattern).
        const xs = [50, 245, 440];
        const deltas = [[{ t: "δ" }, { t: "1", sub: true }, { t: " = 0" }], [{ t: "δ" }, { t: "2", sub: true }, { t: " = 0" }],
          [{ t: "δ" }, { t: "3", sub: true }, { t: " = 2π/N" }]];
        for (let n = 0; n < 3; n++) {
          const ox = n === 0 ? objX(0) : objX(0) + (objX(n) - objX(0)) * e;
          const shift = n === 2 ? e / 3 : 0;
          rich(g, xs[n] + 75, 48, In(n + 1), { size: 22, weight: 600 });
          tile(g, xs[n], 62, 150, 150, { shift, ox, oy: objY(n) });
          rich(g, xs[n] + 75, 240, deltas[n], { size: 20, fill: n === 2 ? accent : ink });
        }
        // Brackets between neighbours.
        const brace = (x1, x2, y, label, col) => {
          line(g, [x1, y - 8], [x1, y], { stroke: col, w: 1.6, opacity: e });
          line(g, [x1, y], [x2, y], { stroke: col, w: 1.6, opacity: e });
          line(g, [x2, y - 8], [x2, y], { stroke: col, w: 1.6, opacity: e });
          text(g, (x1 + x2) / 2, y + 26, label, { size: 18, fill: col, weight: 600, opacity: e });
        };
        brace(125, 315, 268, L.motionOnly, MOVE);
        brace(330, 515, 268, L.mixed, accent);
      }

      if (i === 2) {
        // Motion tracking -> R, T -> coordinate map in the fringe model.
        text(g, 140, 48, L.tracking, { weight: 600 });
        const x = 50, y = 62, w = 180, h = 180;
        tile(g, x, y, w, h, { ox: objX(2), oy: objY(2), outline: false, period: 12, opacity: 0.35 });
        const r = 0.33 * Math.min(w, h);
        const centres = [0, 1, 2].map((n) => [x + objX(n) * w, y + objY(n) * h]);
        centres.forEach(([cx, cy], n) => {
          kit.svg("circle", { cx, cy, r, fill: "none", stroke: n === 2 ? MOVE : body, "stroke-width": n === 2 ? 2 : 1.4, "stroke-dasharray": n === 2 ? "" : "5 4", opacity: n === 0 ? 1 : seg01(t, n * 0.25, n * 0.25 + 0.3) }, g);
        });
        arrow(g, centres[0], [centres[0][0] + (centres[2][0] - centres[0][0]) * e, centres[0][1] + (centres[2][1] - centres[0][1]) * e], { stroke: MOVE, w: 2.2 });
        text(g, x + w / 2, y + h + 34, L.rt, { size: 20, fill: MOVE, weight: 600, opacity: e });
        arrow(g, [250, 152], [250 + 40 * e, 152], { stroke: body, w: 1.6 });
        const ox = 440;
        rich(g, ox, 108, [{ t: "(f" }, { t: "n", sub: true }, { t: ", g" }, { t: "n", sub: true }, { t: `) ${L.map}` }], { size: 20, opacity: e, fill: MOVE });
        rich(g, ox, 170, [{ t: "I" }, { t: "n", sub: true }, { t: " = a + B cos h" }, { t: "n", sub: true }, { t: " + C sin h" }, { t: "n", sub: true }], { size: 21, opacity: seg01(t, 0.25, 0.75) });
        rich(g, ox, 226, [{ t: "h" }, { t: "n", sub: true }, { t: " = ϕ(f" }, { t: "n", sub: true }, { t: ", g" }, { t: "n", sub: true }, { t: ") + δ" }, { t: "n", sub: true }], { size: 21, opacity: seg01(t, 0.45, 0.95) });
        rich(g, ox, 284, [{ t: "B = cos φ,  C = −sin φ" }], { size: 19, fill: body, opacity: seg01(t, 0.6, 1) });
      }

      if (i === 3) {
        // Three images -> least squares -> a, B, C -> wrapped phase.
        for (let n = 0; n < 3; n++) {
          const y = 40 + n * 100;
          tile(g, 30, y, 80, 80, { shift: n === 2 ? 1 / 3 : 0, ox: objX(n), oy: objY(n), period: 9 });
          rich(g, 124, y + 46, In(n + 1), { size: 18, anchor: "start" });
          arrow(g, [150, y + 40], [150 + 40 * e, y + 40 + (180 - (y + 40)) * 0.6 * e], { stroke: mute, w: 1.4 });
        }
        const bx = 205, by = 130, bw = 150, bh = 100;
        kit.svg("rect", { x: bx, y: by, width: bw, height: bh, rx: 8, fill: bg, stroke: accent, "stroke-width": 1.8, opacity: seg01(t, 0.15, 0.5) }, g);
        text(g, bx + bw / 2, by + 40, L.ls, { size: 19, weight: 600, opacity: seg01(t, 0.15, 0.5) });
        text(g, bx + bw / 2, by + 74, L.abc, { size: 19, fill: accent, opacity: seg01(t, 0.3, 0.65) });
        const u = seg01(t, 0.45, 0.9);
        arrow(g, [bx + bw + 10, 180], [bx + bw + 10 + 40 * u, 180], { stroke: body, w: 1.6, opacity: u });
        tile(g, 425, 80, 170, 170, { mode: "phase", ox: objX(1), oy: objY(1), period: 18, opacity: u, outline: false });
        text(g, 510, 64, L.wrapped, { size: 18, weight: 600, opacity: u });
        rich(g, 510, 284, [{ t: "φ = arctan(−C / B)" }], { size: 21, fill: accent, opacity: u });
      }

      if (i === 4) {
        // Frame reuse: traditional groups of three vs. sliding windows of three.
        const tw = 62, th = 44, x0 = 150, dx = 76;
        const colX = (k) => x0 + k * dx;
        text(g, 20, 100, L.trad, { anchor: "start", weight: 600 });
        for (let k = 0; k < 6; k++) {
          rich(g, colX(k) + tw / 2, 54, In(k + 1), { size: 17, fill: body });
          tile(g, colX(k), 64, tw, th, { shift: (k % 3) / 3, ox: objX(k), oy: objY(k), period: 8 });
        }
        for (let j = 0; j < 2; j++) {
          const a = colX(3 * j) + 6, b = colX(3 * j + 2) + tw - 6;
          line(g, [a, 124], [b, 124], { stroke: body, w: 2.4 });
          text(g, (a + b) / 2, 148, frameLabel(j + 1), { size: 16, fill: body });
        }
        text(g, 20, 210, L.ours, { anchor: "start", weight: 600, fill: accent });
        for (let k = 0; k < 6; k++) {
          tile(g, colX(k), 182, tw, th, { shift: (patOf(k) % 3) / 3, ox: objX(k), oy: objY(k), period: 8 });
        }
        for (let j = 0; j < 4; j++) {
          const u = seg01(t, j * 0.18, j * 0.18 + 0.3);
          if (u <= 0) continue;
          const y = 246 + j * 22;
          const a = colX(j) + 6, b = colX(j + 2) + tw - 6;
          line(g, [a, y], [a + (b - a) * u, y], { stroke: accent, w: 2.4 });
          text(g, a - 8, y + 6, frameLabel(j + 1), { size: 16, anchor: "end", fill: accent, opacity: u });
        }
        text(g, 620, 346, L.reuse, { anchor: "end", size: 17, fill: body, opacity: e });
      }
    },
  });
}
