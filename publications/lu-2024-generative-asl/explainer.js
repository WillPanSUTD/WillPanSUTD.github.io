// Asynchronous structured light (APSNet) schematic:
// synchronised capture -> asynchronous capture mixes neighbouring patterns (AFP) ->
// APSNet separates one AFP into two clean patterns -> four-step phase shifting + unwrapping ->
// depth profile: raw AFPs vs APSNet vs synchronised reference.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Synchronised structured light: the projector shows one fringe pattern at a time and a trigger signal tells the camera when to expose, so every photo holds exactly one pattern.",
        "Without the trigger, projector and camera run on their own clocks. When the projector switches pattern during an exposure, the photo mixes two neighbouring patterns: an aliased fringe pattern (AFP).",
        "APSNet, a U-Net-style encoder–decoder trained adversarially with pixel and structural-similarity losses, takes one AFP and generates the two clean patterns it was mixed from.",
        "Three AFPs yield four clean, phase-shifted patterns. The standard four-step phase-shifting algorithm turns them into a wrapped phase, which is then unwrapped into a continuous phase.",
        "The phase gives depth. Along a test profile of a statue, depth from the raw AFPs is off by −5.0 to 3.6 mm, while depth from APSNet's patterns stays within 0.008 mm of the synchronised result.",
      ],
      proj: "Projector", cam: "Camera", trig: "trigger", noSync: "no sync",
      clean: "one pattern per photo", aliased: "two patterns mixed",
      afp: "AFP", net: "APSNet", enc: "encoder", dec: "decoder", train: "GAN · MSE · structural similarity",
      afps: "3 AFPs", pats: "4 patterns", wrapped: "wrapped φw", unwrapped: "φ = φw + 2πk", shifts: "0, π/2, π, 3π/2",
      sync: "synchronised", raw: "raw AFPs", ours: "APSNet", depth: "depth", pos: "position along profile",
      errRaw: "−5.0 to 3.6 mm", errOurs: "≤ 0.008 mm", sep: ": ",
    },
    zh: {
      steps: [
        "同步结构光：投影仪每次只投射一幅条纹图案，并由触发信号通知相机曝光，因此每张图像恰好只包含一幅图案。",
        "去掉触发信号后，投影仪和相机各按自己的时钟工作。若投影仪在相机曝光期间切换图案，拍到的图像就会混入相邻的两幅图案，即混叠条纹图（AFP）。",
        "APSNet 是一个类 U-Net 的编码器–解码器网络，以对抗方式训练，并以像素误差和结构相似性损失加以监督；它输入一幅 AFP，生成混叠前的两幅干净条纹图。",
        "三幅 AFP 可得到四幅干净的相移条纹图。经典的四步相移算法由此求出包裹相位，再经相位展开得到连续相位。",
        "由相位即可求得深度。沿雕像的一条测试剖面，直接用 AFP 重建的深度误差在 −5.0 到 3.6 mm 之间，而用 APSNet 分离出的条纹图重建，与同步结果的偏差不超过 0.008 mm。",
      ],
      proj: "投影仪", cam: "相机", trig: "触发", noSync: "无同步",
      clean: "每张图像一幅图案", aliased: "两幅图案混叠",
      afp: "AFP", net: "APSNet", enc: "编码器", dec: "解码器", train: "GAN · MSE · 结构相似性",
      afps: "3 幅 AFP", pats: "4 幅相移图", wrapped: "包裹相位 φw", unwrapped: "φ = φw + 2πk", shifts: "0, π/2, π, 3π/2",
      sync: "同步（基准）", raw: "直接用 AFP", ours: "APSNet", depth: "深度", pos: "沿剖面位置",
      errRaw: "−5.0 ~ 3.6 mm", errOurs: "≤ 0.008 mm", sep: "：",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal colours identifying the four projected patterns P1..P4 (as the coloured bars in the paper's Fig. 1).
  const PC = ["#d64545", "#e0a020", "#2e9d4f", "#2f6db5"];
  const BAD = PC[0];

  const seg01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

  const { text, line, arrow } = kit.pen({ textSize: 22, stroke: body });
  // Text with a subscript part rendered as a real subscript (e.g. I + "n" -> Iₙ).
  const subText = (parent, x, y, base, sub, o = {}) => {
    const n = text(parent, x, y, "", o);
    kit.svg("tspan", {}, n).textContent = base;
    kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round((o.size || 22) * 0.72)) }, n).textContent = sub;
    return n;
  };

  // Fringe thumbnail: vertical sinusoidal stripes. comps = [{ phase, w }], weights summing to 1.
  // A mix of two phase-shifted sinusoids is again a sinusoid, but with lower contrast and an in-between phase.
  const CYCLES = 3;
  const fringe = (parent, x, y, w, h, comps, o = {}) => {
    const g = kit.svg("g", { opacity: o.opacity ?? 1 }, parent);
    const n = 30;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      let v = 0;
      for (const c of comps) v += c.w * Math.cos(2 * Math.PI * CYCLES * u + c.phase);
      kit.svg("rect", { x: x + (k * w) / n, y, width: w / n + 0.4, height: h, fill: ink, opacity: (0.5 + 0.5 * v) * 0.88 }, g);
    }
    kit.svg("rect", { x, y, width: w, height: h, fill: "none", stroke: o.stroke || rule, "stroke-width": o.sw || 1.5 }, g);
    return g;
  };
  const phase = (m) => (m * Math.PI) / 2; // P1..P4: shifts 0, π/2, π, 3π/2

  // Timing rows (steps 1-2). Projector slots are contiguous: P1 [140,260], P2 [260,380], ...
  const X0 = 140, SLOT = 120, YP = 64, YC = 132, BH = 30;
  const timingAxes = (g) => {
    text(g, 126, YP + 22, L.proj, { size: 20, anchor: "end", fill: body });
    text(g, 126, YC + 22, L.cam, { size: 20, anchor: "end", fill: body });
    for (const y of [YP + BH, YC + BH]) arrow(g, [X0 - 4, y + 2], [626, y + 2], { stroke: mute, w: 1.2 });
    for (let m = 0; m < 4; m++) {
      // light tint of the pattern colour with ink text: readable in light and dark themes
      kit.svg("rect", { x: X0 + m * SLOT + 1, y: YP, width: SLOT - 2, height: BH, fill: PC[m], "fill-opacity": 0.3, stroke: PC[m], "stroke-width": 2 }, g);
      subText(g, X0 + m * SLOT + SLOT / 2, YP + 22, "P", `${m + 1}`, { size: 21, fill: ink, weight: 600, halo: false });
    }
  };
  // Exposure window [a,b]: coloured by the pattern(s) on screen during it; returns mixing weights.
  const exposure = (g, a, b, opacity = 1) => {
    const comps = [];
    for (let m = 0; m < 4; m++) {
      const lo = Math.max(a, X0 + m * SLOT), hi = Math.min(b, X0 + (m + 1) * SLOT);
      if (hi > lo) {
        kit.svg("rect", { x: lo, y: YC, width: hi - lo, height: BH, fill: PC[m], opacity: 0.85 * opacity }, g);
        comps.push({ m, phase: phase(m), w: (hi - lo) / (b - a) });
      }
    }
    kit.svg("rect", { x: a, y: YC, width: b - a, height: BH, fill: "none", stroke: ink, "stroke-width": 1.2, opacity }, g);
    return comps;
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        timingAxes(g);
        for (let m = 0; m < 4; m++) {
          const v = kit.easeOut(seg01(t, m * 0.18, m * 0.18 + 0.35));
          const a = X0 + m * SLOT + 10, b = a + SLOT - 20;
          line(g, [a, YP + BH], [a, YC], { stroke: accent, w: 1.6, dash: "4 3", opacity: v });
          if (v > 0) exposure(g, a, b, v);
          fringe(g, a + 3, 194, SLOT - 26, 94, [{ phase: phase(m), w: 1 }], { opacity: v, stroke: PC[m], sw: 2.5 });
          subText(g, a + (SLOT - 20) / 2, 186, "I", `${m + 1}`, { size: 21, fill: body, opacity: v });
        }
        line(g, [70, YP + BH], [70, YC + 4], { stroke: accent, w: 1.6, dash: "4 3" });
        text(g, 70, 186, L.trig, { size: 20, fill: accent, weight: 600 });
        text(g, 380, 334, L.clean, { size: 22, fill: body, opacity: e });
      }

      if (i === 1) {
        timingAxes(g);
        // camera windows drift off the projector clock until each one straddles a pattern switch
        const shift = 60 * e;
        const mixes = [];
        for (let n = 0; n < 3; n++) {
          const a = X0 + n * SLOT + 12 + shift, b = a + 96;
          mixes.push({ a, b, comps: exposure(g, a, b) });
        }
        // broken trigger link
        line(g, [70, YP + BH], [70, YC + 4], { stroke: mute, w: 1.6, dash: "4 3" });
        const cx = 70, cy = (YP + BH + YC) / 2 + 2;
        line(g, [cx - 9, cy - 9], [cx + 9, cy + 9], { stroke: BAD, w: 3 });
        line(g, [cx + 9, cy - 9], [cx - 9, cy + 9], { stroke: BAD, w: 3 });
        text(g, 70, 186, L.noSync, { size: 20, fill: BAD, opacity: e });
        mixes.forEach(({ a, b, comps }, n) => {
          const mid = (a + b) / 2;
          fringe(g, mid - 47, 194, 94, 94, comps, { stroke: comps.length > 1 ? BAD : PC[n], sw: 2.5 });
          subText(g, mid, 186, "I", `${n + 1}`, { size: 21, fill: body });
        });
        text(g, 380, 334, `${L.aliased} → ${L.afp}`, { size: 22, fill: BAD, weight: 600, opacity: e });
      }

      if (i === 2) {
        // AFP -> U-shaped encoder-decoder -> two separated patterns
        const mix = [{ phase: phase(0), w: 0.55 }, { phase: phase(1), w: 0.45 }];
        fringe(g, 24, 122, 104, 104, mix, { stroke: BAD, sw: 2.5 });
        subText(g, 76, 112, `${L.afp} I`, "n", { size: 21, fill: BAD, weight: 600 });
        // U-Net silhouette: blocks shrink going down (encoder), grow coming up (decoder)
        const lv = [
          { x: 164, y: 110, h: 110 }, { x: 202, y: 150, h: 76 }, { x: 240, y: 186, h: 50 }, { x: 278, y: 214, h: 32 },
          { x: 360, y: 186, h: 50 }, { x: 398, y: 150, h: 76 }, { x: 436, y: 110, h: 110 },
        ];
        const flow = kit.easeOut(seg01(t, 0, 0.75));
        lv.forEach((b, k) => {
          const lit = flow * (lv.length - 1) >= k - 0.01;
          kit.svg("rect", {
            x: b.x, y: b.y, width: k === 3 ? 64 : 20, height: b.h, rx: 3,
            fill: lit ? accent : "none", "fill-opacity": lit ? 0.22 : 0, stroke: accent, "stroke-width": 1.6,
          }, g);
        });
        for (const [a, b] of [[0, 6], [1, 5], [2, 4]]) {
          line(g, [lv[a].x + 20, lv[a].y + 8], [lv[b].x, lv[b].y + 8], { stroke: mute, w: 1.2, dash: "3 4" });
        }
        arrow(g, [132, 174], [158, 174], { stroke: body, w: 1.6 });
        text(g, 194, 98, L.enc, { size: 20, fill: body });
        text(g, 426, 98, L.dec, { size: 20, fill: body });
        text(g, 320, 290, L.net, { size: 24, fill: accent, weight: 600 });
        text(g, 320, 330, L.train, { size: 20, fill: body });
        const v = kit.easeOut(seg01(t, 0.6, 1));
        arrow(g, [462, 150], [482, 112], { stroke: body, w: 1.6, opacity: v });
        arrow(g, [462, 200], [482, 238], { stroke: body, w: 1.6, opacity: v });
        fringe(g, 488, 52, 104, 104, [{ phase: phase(0), w: 1 }], { opacity: v, stroke: PC[0], sw: 2.5 });
        fringe(g, 488, 196, 104, 104, [{ phase: phase(1), w: 1 }], { opacity: v, stroke: PC[1], sw: 2.5 });
        subText(g, 540, 178, "P", "m", { size: 22, fill: body, opacity: v });
        subText(g, 540, 324, "P", "m+1", { size: 22, fill: body, opacity: v });
      }

      if (i === 3) {
        // 3 AFPs -> 4 phase-shifted patterns -> wrapped phase -> unwrapped phase
        text(g, 60, 54, L.afps, { size: 20, fill: BAD, weight: 600 });
        for (let n = 0; n < 3; n++) {
          fringe(g, 26, 72 + n * 82, 68, 68, [{ phase: phase(n), w: 0.5 }, { phase: phase(n + 1), w: 0.5 }], { stroke: BAD, sw: 2 });
        }
        const v = kit.easeOut(seg01(t, 0, 0.45));
        arrow(g, [104, 190], [132, 190], { stroke: body, w: 1.6 });
        text(g, 210, 54, L.pats, { size: 20, fill: body, weight: 600 });
        for (let m = 0; m < 4; m++) {
          const x = 144 + (m % 2) * 70, y = 86 + Math.floor(m / 2) * 92;
          fringe(g, x, y, 62, 62, [{ phase: phase(m), w: 1 }], { opacity: v, stroke: PC[m], sw: 2 });
          text(g, x + 31, y + 82, ["0", "π/2", "π", "3π/2"][m], { size: 19, fill: body, opacity: v });
        }
        arrow(g, [292, 190], [322, 190], { stroke: body, w: 1.6, opacity: v });
        // phase plot
        const px0 = 340, px1 = 620, py0 = 290, py1 = 80;
        arrow(g, [px0, py0], [px1 + 6, py0], { stroke: mute, w: 1.2 });
        arrow(g, [px0, py0], [px0, py1 - 6], { stroke: mute, w: 1.2 });
        const w2 = kit.easeOut(seg01(t, 0.25, 0.6));
        const u2 = kit.easeOut(seg01(t, 0.6, 1));
        const N = 120, periods = 4;
        let dWrap = "", dUn = "";
        for (let k = 0; k <= N; k++) {
          const u = k / N;
          const x = px0 + 8 + u * (px1 - px0 - 16);
          const ph = u * periods; // phase in units of 2π
          const yw = py0 - 14 - (ph - Math.floor(ph)) * 52;
          const yu = py0 - 14 - ph * 46;
          const jump = k > 0 && Math.floor(ph) !== Math.floor(((k - 1) / N) * periods);
          dWrap += `${k === 0 || jump ? "M" : "L"}${x.toFixed(1)},${yw.toFixed(1)}`;
          dUn += `${k === 0 ? "M" : "L"}${x.toFixed(1)},${(yw + (yu - yw) * u2).toFixed(1)}`;
        }
        kit.svg("path", { d: dWrap, fill: "none", stroke: mute, "stroke-width": 2, opacity: w2 }, g);
        if (u2 > 0) kit.svg("path", { d: dUn, fill: "none", stroke: accent, "stroke-width": 2.6, opacity: u2 }, g);
        text(g, 622, 212, L.wrapped, { size: 19, fill: body, anchor: "end", opacity: w2 });
        text(g, 452, 104, L.unwrapped, { size: 20, fill: accent, weight: 600, opacity: u2 });
      }

      if (i === 4) {
        // depth profiles along one line (schematic of the paper's Fig. 13)
        const px0 = 70, px1 = 610, py0 = 300, py1 = 60;
        arrow(g, [px0, py0], [px1 + 8, py0], { stroke: mute, w: 1.2 });
        arrow(g, [px0, py0], [px0, py1 - 4], { stroke: mute, w: 1.2 });
        text(g, 340, 330, L.pos, { size: 20, fill: body });
        const lab = text(g, 0, 0, L.depth, { size: 20, fill: body });
        lab.setAttribute("transform", `translate(${px0 - 14},${(py0 + py1) / 2}) rotate(-90)`);
        const prof = (u) => {
          // head (high), shoulder slope, a dip, and a low plateau
          const head = 150 * Math.exp(-Math.pow((u - 0.2) / 0.16, 2));
          const dip = -26 * Math.exp(-Math.pow((u - 0.66) / 0.06, 2));
          return 60 + head + dip + 18 * Math.exp(-Math.pow((u - 0.85) / 0.1, 2));
        };
        const N = 140;
        const pathOf = (f, gap) => {
          let d = "", pen = false;
          for (let k = 0; k <= N; k++) {
            const u = k / N;
            if (gap && gap(u)) { pen = false; continue; }
            const x = px0 + 10 + u * (px1 - px0 - 20), y = py0 - f(u);
            d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
            pen = true;
          }
          return d;
        };
        const a1 = kit.easeOut(seg01(t, 0, 0.4)), a2 = kit.easeOut(seg01(t, 0.3, 0.7)), a3 = kit.easeOut(seg01(t, 0.6, 1));
        kit.svg("path", { d: pathOf(prof), fill: "none", stroke: mute, "stroke-width": 7, "stroke-linecap": "round", opacity: 0.55 * a1 }, g);
        const raw = (u) => prof(u) + 16 * Math.sin(2 * Math.PI * 9 * u) * Math.exp(-u * 1.6) + 8 * Math.sin(2 * Math.PI * 23 * u + 1);
        kit.svg("path", { d: pathOf(raw, (u) => (u * 9) % 1 > 0.82), fill: "none", stroke: BAD, "stroke-width": 2, opacity: a2 }, g);
        kit.svg("path", { d: pathOf(prof), fill: "none", stroke: accent, "stroke-width": 2.4, "stroke-dasharray": "7 4", opacity: a3 }, g);
        // legend
        const leg = [[L.sync, mute, 6, a1, ""], [`${L.raw}${L.sep}${L.errRaw}`, BAD, 2, a2, ""], [`${L.ours}${L.sep}${L.errOurs}`, accent, 2.4, a3, "7 4"]];
        leg.forEach(([str, col, w, op, dash], k) => {
          const y = 40 + k * 30;
          line(g, [300, y - 6], [332, y - 6], { stroke: col, w, dash: dash || "none", opacity: op });
          text(g, 340, y, str, { size: 20, anchor: "start", fill: k === 0 ? body : col, weight: k === 0 ? 400 : 600, opacity: op });
        });
      }
    },
  });
}
