// FP-DiffNet schematic:
// turbid water degrades the projected fringes (attenuation, scattering blur, backscatter, refraction) ->
// training: clean in-air fringes X0 are noised step by step, a U-Net conditioned on the underwater image y predicts the noise ->
// sampling: from pure noise, the U-Net removes noise step by step under the guidance of y ->
// every k = 50 steps, a physics-residual gradient step pulls the estimate toward the observation ->
// the restored phase-shifted fringes go through the standard four-step PSP: wrapped phase -> unwrapping -> height.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Under water, the projected fringes reach the camera weakened by absorption, blurred by small-angle forward scattering, raised by backscattered background light and shifted by refraction at the water–air interface.",
        "Training: a clean fringe image X₀ captured in air is noised step by step towards pure Gaussian noise (T = 1000 steps). A U-Net, given the noisy image Xₜ, the step t and the real underwater fringe image y, learns to predict the injected noise.",
        "Sampling: start from pure noise at step T and let the trained U-Net remove noise one step at a time, always conditioned on the underwater observation y, until a clean fringe image F* remains.",
        "Physics guidance: a simplified degradation D(X), a Gaussian forward-scatter blur plus backscatter noise, links the estimate to the observation. Every k = 50 reverse steps, a gradient step with α = 0.01 reduces the residual between the observation and the simulated degradation.",
        "The restored fringes are ordinary four-step phase-shifted patterns, so standard PSP takes over unchanged: arctangent gives the wrapped phase, unwrapping gives the absolute phase, and its difference to a reference plane gives height.",
      ],
      proj: "projector", cam: "camera", water: "turbid water", obj: "object",
      row: "one row of the fringe image", air: "in air", under: "underwater",
      fwd: "forward, add noise:", x0: " (in air)", yObs: "y (underwater)",
      unet: "U-Net", loss: "loss L(ε, ε*)",
      rev: "reverse: remove noise, t = T → 0", cond: "y guides every reverse step",
      blurBox: "blur h", blurSub: "g", blurTail: " + noise n", obs: "observation", sim: "simulated",
      every: "physics correction when t mod 50 = 0", alpha: "α = 0.01",
      four: "4-step F*", wrapped: "wrapped φ", unwrap: "unwrap", height: "Φ", heightTail: " − Φ", heightEnd: " → height",
      t4: "highest turbidity T4:", mae: "wrapped-phase MAE 0.0354 rad", rmse: "3D RMSE 0.0890 mm",
    },
    zh: {
      steps: [
        "在水下，投射的条纹到达相机时已被吸收削弱，被小角度前向散射模糊，被后向散射的背景光抬高，并因水—空气界面的折射而发生偏移。",
        "训练：在空气中采集的清晰条纹图 X₀ 被逐步加噪，直至接近纯高斯噪声（T = 1000 步）。U-Net 以含噪图像 Xₜ、时间步 t 和真实的水下条纹图 y 为输入，学习预测所加入的噪声。",
        "采样：从第 T 步的纯噪声出发，训练好的 U-Net 在水下观测 y 的条件引导下逐步去噪，最终得到清晰的条纹图 F*。",
        "物理引导：简化退化算子 D(X)（高斯形式的前向散射模糊加后向散射噪声）把估计与观测联系起来。反向扩散每隔 k = 50 步，以 α = 0.01 做一次梯度修正，减小观测与模拟退化之间的残差。",
        "复原后的条纹就是普通的四步相移图案，后续直接沿用标准 PSP：反正切得到包裹相位，相位展开得到绝对相位，再与参考平面相位作差得到高度。",
      ],
      proj: "投影仪", cam: "相机", water: "浑浊水体", obj: "物体",
      row: "条纹图中的一行", air: "空气中", under: "水下",
      fwd: "前向逐步加噪：", x0: "（空气中）", yObs: "y（水下）",
      unet: "U-Net", loss: "损失 L(ε, ε*)",
      rev: "反向：逐步去噪，t = T → 0", cond: "y 引导每一步反向去噪",
      blurBox: "模糊 h", blurSub: "g", blurTail: " + 噪声 n", obs: "观测", sim: "模拟退化",
      every: "t mod 50 = 0 时做物理修正", alpha: "α = 0.01",
      four: "四步相移 F*", wrapped: "包裹相位 φ", unwrap: "展开", height: "Φ", heightTail: " − Φ", heightEnd: " → 高度",
      t4: "最高浊度 T4：", mae: "包裹相位 MAE 0.0354 rad", rmse: "三维重建 RMSE 0.0890 mm",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: water, projected light, and the physics-correction step (orange as in Fig. 3).
  const WATER = "#2b7a99";
  const LIGHT = "#d64545";
  const PHYS = "#d9822b";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { line, arrow } = kit.pen({ stroke: body, head: 9 });
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Text made of parts: plain strings, or { sub: "…" } / { sup: "…" } for a real subscript / superscript.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 16;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": p.sup !== undefined ? "super" : "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : (p.sub ?? p.sup);
    }
    return n;
  };

  // --- Fringe tiles: vertical sinusoidal stripes plus a fixed noise grain (built once, seeded) ---
  const rnd = kit.rng(7);
  const GRAIN = 18;
  const grains = Array.from({ length: 8 }, () => Array.from({ length: GRAIN * GRAIN }, () => rnd()));
  const SLIVERS = 36;
  // o: amp (stripe contrast 0..1), noise (grain strength 0..1), offset (uniform haze 0..1), phase (rad), grain index
  const tile = (g, x, y, size, o = {}) => {
    const { amp = 1, noise = 0, offset = 0, phase = 0, gi = 0, opacity = 1, stroke = mute } = o;
    const t = kit.svg("g", { opacity }, g);
    kit.svg("rect", { x, y, width: size, height: size, fill: bg }, t);
    if (offset > 0) kit.svg("rect", { x, y, width: size, height: size, fill: ink, "fill-opacity": 0.5 * offset }, t);
    const w = size / SLIVERS;
    for (let j = 0; j < SLIVERS; j++) {
      const v = 0.5 + 0.5 * Math.cos((2 * Math.PI * 4 * (j + 0.5)) / SLIVERS + phase);
      const a = amp * v * 0.85;
      if (a > 0.02) kit.svg("rect", { x: x + j * w, y, width: w + 0.4, height: size, fill: ink, "fill-opacity": a.toFixed(3) }, t);
    }
    if (noise > 0) {
      const c = size / GRAIN, gr = grains[gi % grains.length];
      for (let r = 0; r < GRAIN; r++) for (let q = 0; q < GRAIN; q++) {
        const v = gr[r * GRAIN + q];
        kit.svg("rect", {
          x: x + q * c, y: y + r * c, width: c + 0.3, height: c + 0.3,
          fill: v > 0.5 ? ink : bg, "fill-opacity": (noise * Math.abs(v - 0.5) * 1.8).toFixed(3),
        }, t);
      }
    }
    kit.svg("rect", { x, y, width: size, height: size, fill: "none", stroke, "stroke-width": 1.3 }, t);
  };

  // Fixed per-sample noise for the 1D profile in step 1.
  const PROFILE_N = 120;
  const profNoise = Array.from({ length: PROFILE_N + 1 }, () => rnd() - 0.5);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // left: side view of the underwater set-up; right: one row of fringe intensity, in air vs underwater
        kit.svg("rect", { x: 24, y: 118, width: 282, height: 200, fill: WATER, "fill-opacity": 0.12, stroke: WATER, "stroke-width": 1.4 }, g);
        text(g, 165, 342, L.water, { size: 15, fill: WATER, weight: 600 });
        // projector and camera
        kit.svg("rect", { x: 44, y: 52, width: 56, height: 28, rx: 3, fill: bg, stroke: LIGHT, "stroke-width": 1.6 }, g);
        text(g, 72, 40, L.proj, { size: 15, fill: body });
        kit.svg("rect", { x: 230, y: 52, width: 56, height: 28, rx: 3, fill: bg, stroke: accent, "stroke-width": 1.6 }, g);
        kit.svg("circle", { cx: 258, cy: 66, r: 7, fill: "none", stroke: accent, "stroke-width": 1.4 }, g);
        text(g, 258, 40, L.cam, { size: 15, fill: body });
        // object surface
        kit.svg("path", { d: "M100,306 Q165,262 230,306", fill: "none", stroke: ink, "stroke-width": 2.5 }, g);
        text(g, 92, 304, L.obj, { size: 15, anchor: "end", fill: body });
        // rays: projector -> object (light), object -> camera direct (I_d)
        const hit = [165, 284];
        line(g, [72, 80], hit, { stroke: LIGHT, w: 2 });
        arrow(g, hit, [252, 82], { stroke: accent, w: 2.2 });
        text(g, 218, 226, ["I", { sub: "d" }], { size: 17, anchor: "start", fill: accent, weight: 600 });
        // forward scattering: small-angle deflection near the return path (I_f, dashed)
        const pf = [176, 192];
        kit.svg("circle", { cx: pf[0], cy: pf[1], r: 5, fill: body }, g);
        line(g, hit, pf, { stroke: accent, w: 1.6, dash: "6 4", opacity: 0.8 });
        arrow(g, pf, [240, 84], { stroke: accent, w: 1.6, dash: "6 4", opacity: 0.8 });
        text(g, 166, 184, ["I", { sub: "f" }], { size: 17, anchor: "end", fill: accent, weight: 600 });
        // backscatter: light turned back by a particle before reaching the object (I_b, dash-dot)
        const pb = [90, 214];
        kit.svg("circle", { cx: pb[0], cy: pb[1], r: 5, fill: body }, g);
        line(g, [60, 80], pb, { stroke: LIGHT, w: 1.6, opacity: 0.8 });
        arrow(g, pb, [234, 78], { stroke: mute, w: 1.6, dash: "10 4 2 4" });
        text(g, 80, 222, ["I", { sub: "b" }], { size: 17, anchor: "end", fill: body, weight: 600 });

        // right: intensity profile across three fringe periods
        const PX0 = 360, PX1 = 620, PY0 = 64, PY1 = 236;
        text(g, (PX0 + PX1) / 2, 40, L.row, { size: 15, fill: body, weight: 600 });
        line(g, [PX0, PY1], [PX1, PY1], { stroke: body, w: 1.3 });
        line(g, [PX0, PY1], [PX0, PY0 - 4], { stroke: body, w: 1.3 });
        const P = (PX1 - PX0) / 3;
        const yOf = (v) => PY1 - (PY1 - PY0) * v;
        const clean = [], under = [];
        const amp = 0.45 + (0.11 - 0.45) * e, mean = 0.5 + (0.38 - 0.5) * e, shift = 14 * e, nz = 0.06 * e;
        for (let k = 0; k <= PROFILE_N; k++) {
          const x = PX0 + ((PX1 - PX0) * k) / PROFILE_N;
          clean.push([x, yOf(0.5 + 0.45 * Math.cos((2 * Math.PI * (x - PX0)) / P))]);
          under.push([x, yOf(mean + amp * Math.cos((2 * Math.PI * (x - PX0 - shift)) / P) + nz * profNoise[k])]);
        }
        kit.svg("path", { d: path(clean), fill: "none", stroke: mute, "stroke-width": 2, "stroke-dasharray": "6 5" }, g);
        kit.svg("path", { d: path(under), fill: "none", stroke: WATER, "stroke-width": 2.6 }, g);
        // legend
        line(g, [376, 266], [404, 266], { stroke: mute, w: 2, dash: "6 5" });
        text(g, 412, 271, L.air, { size: 15, anchor: "start", fill: body });
        line(g, [500, 266], [528, 266], { stroke: WATER, w: 2.6 });
        text(g, 536, 271, L.under, { size: 15, anchor: "start", fill: body });
        text(g, (PX0 + PX1) / 2, 322,
          ["I", { sub: "obs" }, " = I", { sub: "d" }, " ⊗ h", { sub: "PSF" }, " + I", { sub: "b" }, " + G(x + Δx)"],
          { size: 17, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.5, 1)) });
      }

      if (i === 1 || i === 2) {
        // a row of five tiles: forward (clean -> noise) or reverse (noise -> clean)
        const XS = [34, 154, 274, 394, 514], TY = 58, TS = 76;
        const levels = [0, 0.3, 0.55, 0.8, 1];
        const order = i === 1 ? levels : levels.slice().reverse();
        const head = i === 1
          ? ["X", { sub: "t" }, " = √ᾱ", { sub: "t" }, " X", { sub: "0" }, " + √(1 − ᾱ", { sub: "t" }, ") ε"]
          : [L.rev];
        text(g, 320, 36, i === 1 ? [L.fwd + " ", ...head] : head, { size: 17, fill: body, weight: 600 });
        const labels = i === 1
          ? [["X", { sub: "0" }, L.x0], null, ["X", { sub: "t" }], null, ["X", { sub: "T" }, " (T = 1000)"]]
          : [["X", { sub: "T" }, " ~ N(0, I)"], null, ["X", { sub: "t" }], null, ["F*"]];
        const reveal = e * (XS.length - 1);
        XS.forEach((x, k) => {
          const vis = clamp01(reveal - k + 1);
          if (vis <= 0) return;
          const n = order[k];
          tile(g, x, TY, TS, { amp: Math.sqrt(1 - n), noise: n, gi: k, opacity: vis, stroke: k === 4 && i === 2 ? accent : mute });
          if (labels[k]) text(g, x + TS / 2, TY + TS + 24, labels[k], { size: 16, fill: k === 4 && i === 2 ? accent : body, opacity: vis, weight: k === 4 && i === 2 ? 600 : undefined });
          if (k > 0) arrow(g, [XS[k - 1] + TS + 6, TY + TS / 2], [x - 6, TY + TS / 2], { stroke: body, w: 1.8, opacity: vis });
        });

        if (i === 1) {
          // bottom: the U-Net sees X_t, t and y and predicts the noise
          const v = kit.easeOut(seg01(t, 0.4, 1));
          tile(g, 34, 222, 76, { amp: 0.3, offset: 0.35, noise: 0.08, gi: 6, opacity: v });
          text(g, 72, 324, L.yObs, { size: 15, fill: body, opacity: v });
          arrow(g, [116, 262], [244, 262], { stroke: body, w: 1.8, opacity: v });
          arrow(g, [312, 164], [312, 214], { stroke: body, w: 1.8, opacity: v });
          kit.svg("polygon", { points: "252,218 304,240 304,286 252,308", fill: accent, "fill-opacity": 0.14, stroke: accent, "stroke-width": 1.5, opacity: v }, g);
          kit.svg("polygon", { points: "320,240 372,218 372,308 320,286", fill: accent, "fill-opacity": 0.14, stroke: accent, "stroke-width": 1.5, opacity: v }, g);
          text(g, 312, 334, [L.unet + " ε", { sub: "θ" }, "(X", { sub: "t" }, ", t, y)"], { size: 16, fill: accent, weight: 600, opacity: v });
          arrow(g, [380, 262], [420, 262], { stroke: body, w: 1.8, opacity: v });
          text(g, 440, 268, "ε*", { size: 18, fill: accent, weight: 700, opacity: v });
          text(g, 540, 268, L.loss, { size: 16, fill: body, opacity: v });
        } else {
          // bottom: the underwater observation y conditions every reverse step
          const v = kit.easeOut(seg01(t, 0.3, 1));
          const Y = [282, 226];
          for (const mx of [132, 252, 372, 492]) line(g, [Y[0] + 38, Y[1] - 4], [mx, TY + TS / 2 + 10], { stroke: WATER, w: 1.6, dash: "5 4", opacity: v });
          tile(g, Y[0], Y[1], 76, { amp: 0.3, offset: 0.35, noise: 0.08, gi: 6, opacity: v, stroke: WATER });
          text(g, 320, 326, L.yObs, { size: 15, fill: WATER, weight: 600, opacity: v });
          text(g, 320, 350, L.cond, { size: 15, fill: body, opacity: v });
        }
      }

      if (i === 3) {
        // top: simulate the degradation of the current estimate and compare it with the observation
        text(g, 320, 34, ["D(X) = X ⊗ h", { sub: "g" }, " + n", { sub: "g" }], { size: 17, fill: body, weight: 600 });
        tile(g, 40, 64, 76, { amp: 0.85, noise: 0.15, gi: 1 });
        text(g, 78, 164, ["X", { sub: "t−1" }], { size: 16, fill: body });
        arrow(g, [122, 102], [158, 102], { stroke: body, w: 1.8 });
        kit.svg("rect", { x: 162, y: 80, width: 150, height: 44, rx: 6, fill: rule, stroke: body, "stroke-width": 1.2 }, g);
        text(g, 237, 108, [L.blurBox, { sub: L.blurSub }, L.blurTail, { sub: "g" }], { size: 15, fill: ink });
        arrow(g, [316, 102], [352, 102], { stroke: body, w: 1.8 });
        tile(g, 356, 64, 76, { amp: 0.3, offset: 0.3, noise: 0.3, gi: 2 });
        text(g, 394, 164, L.sim, { size: 15, fill: body });
        text(g, 466, 110, "↔", { size: 22, fill: PHYS, weight: 700 });
        tile(g, 500, 64, 76, { amp: 0.3, offset: 0.35, noise: 0.08, gi: 6, stroke: WATER });
        text(g, 538, 164, [L.obs + " I", { sub: "obs" }], { size: 15, fill: WATER, weight: 600 });
        // the gradient step that pulls the estimate back
        const c = kit.easeOut(seg01(t, 0.15, 0.7));
        kit.svg("path", { d: "M538,178 C520,214 150,214 126,186", fill: "none", stroke: PHYS, "stroke-width": 2, opacity: c }, g);
        arrow(g, [130, 192], [120, 178], { stroke: PHYS, w: 2, opacity: c });
        text(g, 320, 232, ["X ← X − α ∇‖I", { sub: "obs" }, " − G", { sub: "simple" }, "(X)‖", { sup: "2" }, ",  " + L.alpha], { size: 16, fill: PHYS, weight: 600, opacity: c });

        // bottom: the reverse timeline from t = 1000 to 0 with a correction every 50 steps
        const TX0 = 50, TX1 = 590, TYL = 286;
        line(g, [TX0, TYL], [TX1, TYL], { stroke: body, w: 1.6 });
        for (let k = 0; k <= 20; k++) {
          const x = TX0 + ((TX1 - TX0) * k) / 20;
          line(g, [x, TYL - 8], [x, TYL + 8], { stroke: PHYS, w: 2 });
        }
        const mx = TX0 + (TX1 - TX0) * e;
        kit.svg("circle", { cx: mx, cy: TYL, r: 6, fill: accent }, g);
        text(g, TX0, 316, "t = 1000", { size: 15, anchor: "start", fill: body });
        text(g, TX1, 316, "t = 0", { size: 15, anchor: "end", fill: body });
        text(g, 320, 346, L.every, { size: 16, fill: PHYS, weight: 600 });
      }

      if (i === 4) {
        // four restored phase-shifted frames -> wrapped phase -> unwrapped phase minus reference -> height
        const v1 = kit.easeOut(seg01(t, 0, 0.4)), v2 = kit.easeOut(seg01(t, 0.3, 0.7)), v3 = kit.easeOut(seg01(t, 0.6, 1));
        text(g, 93, 44, L.four, { size: 15, fill: body, weight: 600 });
        [[30, 64], [96, 64], [30, 130], [96, 130]].forEach(([x, y], n) => {
          tile(g, x, y, 60, { amp: 1, phase: (n * Math.PI) / 2, stroke: accent });
        });
        arrow(g, [164, 124], [212, 124], { stroke: body, w: 1.8, opacity: v2 });
        text(g, 188, 112, "arctan", { size: 14, fill: body, opacity: v2 });

        // wrapped phase (sawtooth) in [-pi, pi]
        const WX0 = 236, WX1 = 396, WY0 = 66, WY1 = 186;
        text(g, (WX0 + WX1) / 2, 44, L.wrapped, { size: 15, fill: body, weight: 600, opacity: v2 });
        line(g, [WX0, WY1], [WX1, WY1], { stroke: body, w: 1.2, opacity: v2 });
        line(g, [WX0, WY1], [WX0, WY0], { stroke: body, w: 1.2, opacity: v2 });
        text(g, WX0 - 6, WY0 + 6, "π", { size: 14, anchor: "end", fill: body, opacity: v2 });
        text(g, WX0 - 6, WY1, "−π", { size: 14, anchor: "end", fill: body, opacity: v2 });
        const per = (WX1 - WX0) / 4;
        for (let k = 0; k < 4; k++) {
          line(g, [WX0 + k * per, WY1 - 2], [WX0 + (k + 1) * per, WY0 + 2], { stroke: accent, w: 2.2, opacity: v2 });
          if (k < 3) line(g, [WX0 + (k + 1) * per, WY0 + 2], [WX0 + (k + 1) * per, WY1 - 2], { stroke: accent, w: 1, dash: "3 3", opacity: v2 * 0.6 });
        }
        arrow(g, [404, 124], [452, 124], { stroke: body, w: 1.8, opacity: v3 });
        text(g, 428, 112, L.unwrap, { size: 14, fill: body, opacity: v3 });

        // unwrapped object phase vs reference plane; the gap is the height-induced phase
        const UX0 = 466, UX1 = 616, UY0 = 66, UY1 = 186;
        text(g, (UX0 + UX1) / 2, 44, [L.height, { sub: "O" }, L.heightTail, { sub: "R" }, L.heightEnd], { size: 15, fill: body, weight: 600, opacity: v3 });
        line(g, [UX0, UY1], [UX1, UY1], { stroke: body, w: 1.2, opacity: v3 });
        line(g, [UX0, UY1], [UX0, UY0], { stroke: body, w: 1.2, opacity: v3 });
        const ref = [], objp = [];
        for (let k = 0; k <= 40; k++) {
          const u = k / 40, x = UX0 + (UX1 - UX0) * u;
          ref.push([x, UY1 - 8 - 96 * u]);
          objp.push([x, UY1 - 8 - 96 * u - 22 * Math.exp(-Math.pow((u - 0.55) / 0.2, 2))]);
        }
        kit.svg("path", { d: path(objp.concat(ref.slice().reverse())) + "Z", fill: accent, "fill-opacity": 0.15, stroke: "none", opacity: v3 }, g);
        kit.svg("path", { d: path(ref), fill: "none", stroke: mute, "stroke-width": 2, "stroke-dasharray": "6 4", opacity: v3 }, g);
        kit.svg("path", { d: path(objp), fill: "none", stroke: accent, "stroke-width": 2.4, opacity: v3 }, g);

        // headline numbers at the highest turbidity
        text(g, 320, 254, L.t4, { size: 16, fill: body, weight: 600, opacity: v3 });
        text(g, 320, 284, L.mae, { size: 17, fill: accent, weight: 600, opacity: v3 });
        text(g, 320, 314, L.rmse, { size: 17, fill: accent, weight: 600, opacity: v3 });
      }
    },
  });
}
