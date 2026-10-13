// Phase-map servoing + MPC schematic: phase-map error drives velocity -> gradient sparsification ->
// PCA embedding (d = 8) -> adaptive prediction horizon -> EKF-predicted phase maps as MPC reference.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A projector–camera pair on the robot projects fringes onto the target. The phase map itself is the visual feature: its difference from the desired map drives the end-effector velocity through the phase interaction matrix L.",
        "Gradient-guided sparsification: pixels whose phase gradient is below a threshold ε carry little information about motion, so their rows of L are dropped.",
        "PCA embeds the remaining phase features in d = 8 dimensions. In scenes with enough phase gradient, the reduced interaction matrix keeps rank 6, so all six motion directions stay controllable.",
        "Adaptive horizon: the MPC prediction horizon N follows the phase change rate γ, staying near N = 3 for slow motion and rising towards 10 for fast motion.",
        "An EKF predicts the target's motion and turns it into predicted phase maps. MPC tracks these as its reference, compensating for sensing delay, and applies only the first input of each solution.",
      ],
      obs: "observed", des: "desired", err: "error e", law: ["velocity  V = −λ L", { sup: "+" }, " e"],
      robot: "6-DoF end-effector", keep: "keep |∇φ| ≥ ε", eps: "ε = 0.15 · max |∇φ|",
      full: "L: m × 6", kept: ["L̃: m", { sub: "r" }, " × 6"], pca: "PCA", z: "z (d = 8)",
      lz: ["L", { sub: "z" }, " = W", { sup: "T" }, " L̃: 8 × 6"], rank: "rank 6",
      xAxis: "phase change rate γ", yAxis: "horizon N", nmin: ["N", { sub: "min" }, " = 3"], nmax: ["N", { sub: "max" }, " = 10"],
      slow: "slow target: N = 3", fast: "fast target: N ≈ 9",
      head: "projector + camera", meas: "measured (delayed)", pred: "EKF prediction → MPC reference",
    },
    zh: {
      steps: [
        "机械臂末端的投影仪–相机向目标投射条纹。相位图本身就是视觉特征：它与期望相位图之差经相位交互矩阵 L 换算为末端速度。",
        "梯度引导稀疏化：相位梯度低于阈值 ε 的像素几乎不含运动信息，其在 L 中对应的行被剔除。",
        "PCA 将保留下来的相位特征嵌入 d = 8 维子空间。在相位梯度充足的场景中，降维后的交互矩阵仍保持秩 6，六个运动方向均可控。",
        "自适应预测时域：MPC 的预测步数 N 随相位变化率 γ 调整，慢速运动时保持在 N = 3 附近，快速运动时增大至接近 10。",
        "EKF 预测目标运动，并将其转换为预测相位图；MPC 以此为参考轨迹，补偿感知延迟，每次只执行优化解的第一个控制量。",
      ],
      obs: "观测相位图", des: "期望相位图", err: "误差 e", law: ["速度  V = −λ L", { sup: "+" }, " e"],
      robot: "六自由度末端", keep: "保留 |∇φ| ≥ ε", eps: "ε = 0.15 · max |∇φ|",
      full: "L：m × 6", kept: ["L̃：m", { sub: "r" }, " × 6"], pca: "PCA", z: "z（d = 8）",
      lz: ["L", { sub: "z" }, " = W", { sup: "T" }, " L̃：8 × 6"], rank: "秩为 6",
      xAxis: "相位变化率 γ", yAxis: "预测步数 N", nmin: ["N", { sub: "min" }, " = 3"], nmax: ["N", { sub: "max" }, " = 10"],
      slow: "慢速目标：N = 3", fast: "快速目标：N ≈ 9",
      head: "投影仪 + 相机", meas: "测得位置（有延迟）", pred: "EKF 预测 → MPC 参考",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: low / high phase (colour map ends) and phase error.
  const LO = [44, 95, 168], HI = [232, 185, 49], ERR = "#d1495b";
  const phaseColour = (v) => {
    const u = Math.max(0, Math.min(1, v));
    return `rgb(${LO.map((a, k) => Math.round(a + (HI[k] - a) * u)).join(",")})`;
  };

  // --- Deterministic phase maps (C x R cells): gentle background ramp plus a raised target block.
  const C = 18, R = 11, STEP = 0.45;
  const inObj = (c, r, c0) => c >= c0 && c < c0 + 6 && r >= 3 && r < 8;
  const phase = (c, r, c0) => 0.08 + (0.35 * c) / (C - 1) + (inObj(c, r, c0) ? STEP : 0);
  const DES = 4, OBS = 8;
  const cells = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push({ c, r, v: phase(c, r, OBS), err: phase(c, r, OBS) - phase(c, r, DES) });
  const at = (c, r) => phase(Math.max(0, Math.min(C - 1, c)), Math.max(0, Math.min(R - 1, r)), OBS);
  for (const p of cells) {
    const gx = (at(p.c + 1, p.r) - at(p.c - 1, p.r)) / 2;
    const gy = (at(p.c, p.r + 1) - at(p.c, p.r - 1)) / 2;
    p.g = Math.hypot(gx, gy);
  }
  const gMax = Math.max(...cells.map((p) => p.g));
  for (const p of cells) p.keep = p.g >= 0.15 * gMax;
  const kept = cells.filter((p) => p.keep);

  const rnd = kit.rng(7);
  const zVals = Array.from({ length: 8 }, () => rnd());

  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });

  const grid = (g, x0, y0, cs, fill, { alpha = () => 1, outline = () => false } = {}) => {
    for (const p of cells) {
      const a = alpha(p);
      if (a <= 0.01) continue;
      kit.svg("rect", { x: x0 + p.c * cs, y: y0 + p.r * cs, width: cs - 1, height: cs - 1, fill: fill(p), opacity: a }, g);
      if (outline(p)) kit.svg("rect", { x: x0 + p.c * cs + 0.5, y: y0 + p.r * cs + 0.5, width: cs - 2, height: cs - 2, fill: "none", stroke: ink, "stroke-width": 1, opacity: a }, g);
    }
    kit.svg("rect", { x: x0 - 1, y: y0 - 1, width: C * cs + 1, height: R * cs + 1, fill: "none", stroke: mute, "stroke-width": 1 }, g);
  };
  // Mixed text: strings are plain; { sub } / { sup } become >= 14-unit sub/superscript tspans.
  const richText = (g, x, y, parts, o = {}) => {
    const node = text(g, x, y, "", o);
    const small = Math.max(14, Math.round((o.size ?? 18) * 0.8));
    let shift = 0;
    for (const p of parts) {
      const target = typeof p === "string" ? 0 : p.sub !== undefined ? 5 : -7;
      const attrs = { dy: target - shift };
      if (typeof p !== "string") attrs["font-size"] = small;
      const t = kit.svg("tspan", attrs, node);
      t.textContent = typeof p === "string" ? p : (p.sub ?? p.sup);
      shift = target;
    }
    return node;
  };
  const matrix = (g, x, y, h, o = {}) => {
    kit.svg("rect", { x, y, width: 72, height: h, fill: o.fill ?? rule, stroke: o.stroke ?? body, "stroke-width": 1.2, opacity: o.opacity ?? 1 }, g);
    for (let k = 1; k < 6; k++) line(g, [x + k * 12, y], [x + k * 12, y + h], { stroke: o.stroke ?? body, w: 0.6, opacity: 0.5 * (o.opacity ?? 1) });
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
        const cs = 9, y0 = 60;
        grid(g, 24, y0, cs, (p) => phaseColour(p.v));
        grid(g, 239, y0, cs, (p) => phaseColour(phase(p.c, p.r, DES)));
        grid(g, 454, y0, cs, (p) => (Math.abs(p.err) > 0.01 ? ERR : bg), { alpha: (p) => (Math.abs(p.err) > 0.01 ? e : 1) });
        text(g, 105, 46, L.obs, { weight: 600 });
        text(g, 320, 46, L.des, { weight: 600 });
        text(g, 535, 46, L.err, { weight: 600, fill: ERR });
        text(g, 213, 120, "−", { size: 28, weight: 700 });
        text(g, 428, 120, "=", { size: 28, weight: 700 });
        arrow(g, [535, 172], [535, 172 + 46 * e], { stroke: accent });
        if (e > 0.3) {
          kit.svg("rect", { x: 380, y: 228, width: 240, height: 40, rx: 6, fill: bg, stroke: accent, "stroke-width": 1.4, opacity: e }, g);
          richText(g, 500, 254, L.law, { fill: accent, weight: 600, opacity: e });
          arrow(g, [380, 248], [380 - 70 * e, 248], { stroke: accent });
          text(g, 170, 254, L.robot, { opacity: e });
        }
      }

      if (i === 1 || i === 2) {
        const x0 = 30, y0 = 100, cs = 13;
        const fade = i === 1 ? e : 1;
        grid(g, x0, y0, cs, (p) => (p.keep ? phaseColour(p.v) : (fade > 0.5 ? rule : phaseColour(p.v))), {
          alpha: (p) => (p.keep ? 1 : 1 - 0.7 * fade),
          outline: (p) => p.keep && fade > 0.5,
        });
        text(g, x0 + (C * cs) / 2, 84, L.keep, { weight: 600, fill: accent });
        if (i === 1) {
          text(g, x0 + (C * cs) / 2, 276, L.eps, { size: 17 });
          const top = 80, H = 210, h = (H * kept.length) / cells.length;
          matrix(g, 330, top, H, { opacity: 1 - 0.55 * e });
          text(g, 366, 316, L.full);
          arrow(g, [412, top + h / 2], [412 + 56 * e, top + h / 2], { stroke: accent });
          matrix(g, 480, top, h, { fill: accent, stroke: accent, opacity: 0.25 + 0.6 * e });
          richText(g, 516, top + h + 28, L.kept, { fill: accent, weight: 600, opacity: e });
        } else {
          const cx = 478, cy = 172;
          for (const p of kept) {
            const px = x0 + p.c * cs + cs / 2, py = y0 + p.r * cs + cs / 2;
            const x = px + (cx - px) * e, y = py + (cy - py) * e;
            if (e < 0.98) kit.svg("circle", { cx: x, cy: y, r: 3, fill: phaseColour(p.v), opacity: 0.9 * (1 - e) + 0.05 }, g);
          }
          arrow(g, [292, 172], [410, 172], { stroke: accent, w: 2 });
          text(g, 351, 160, L.pca, { weight: 600, fill: accent });
          richText(g, 351, 200, ["W", { sup: "T" }], { size: 18 });
          text(g, 478, 86, L.z, { weight: 600 });
          zVals.forEach((v, k) => {
            kit.svg("rect", { x: 470, y: 100 + k * 18, width: 16, height: 16, fill: phaseColour(v), stroke: ink, "stroke-width": 0.8, opacity: e }, g);
          });
          richText(g, 470, 282, L.lz, { size: 18, fill: ink, opacity: e });
          text(g, 470, 310, L.rank, { size: 18, fill: accent, weight: 600, opacity: e });
        }
      }

      if (i === 3) {
        const ox = 70, oy = 290, W = 220, gMaxPlot = 0.6;
        const X = (gm) => ox + (gm / gMaxPlot) * W;
        const Y = (n) => oy - (n / 11) * 210;
        const N = (gm) => Math.min(10, Math.max(3, 3 + 7 * Math.tanh(5 * gm)));
        arrow(g, [ox, oy], [ox + W + 14, oy]);
        arrow(g, [ox, oy], [ox, 60]);
        text(g, ox + W / 2, 326, L.xAxis, { size: 17 });
        text(g, ox + 8, 62, L.yAxis, { size: 17, anchor: "start" });
        line(g, [ox, Y(3)], [ox + W, Y(3)], { stroke: mute, dash: "4 4", w: 1.2 });
        line(g, [ox, Y(10)], [ox + W, Y(10)], { stroke: mute, dash: "4 4", w: 1.2 });
        richText(g, ox + W, Y(3) + 24, L.nmin, { size: 16, anchor: "end" });
        richText(g, ox + 10, Y(10) - 11, L.nmax, { size: 16, anchor: "start" });
        const pts = [];
        for (let k = 0; k <= 60; k++) { const gm = (gMaxPlot * k * e) / 60; pts.push(`${X(gm)},${Y(N(gm))}`); }
        kit.svg("polyline", { points: pts.join(" "), fill: "none", stroke: accent, "stroke-width": 2.4 }, g);
        kit.svg("circle", { cx: X(0), cy: Y(3), r: 5.5, fill: bg, stroke: ink, "stroke-width": 2 }, g);
        if (e > 0.5) kit.svg("circle", { cx: X(0.3), cy: Y(N(0.3)), r: 5.5, fill: ink }, g);
        // horizon timelines
        const row = (y, n, label, filled) => {
          text(g, 360, y - 12, label, { anchor: "start", weight: 600 });
          const shown = Math.max(1, Math.round(n * (filled ? e : 1)));
          for (let k = 0; k < shown; k++) {
            kit.svg("rect", { x: 360 + k * 26, y, width: 22, height: 26, rx: 3, fill: k === 0 ? accent : "none", stroke: accent, "stroke-width": 1.4, opacity: k === 0 ? 0.85 : 1 }, g);
          }
        };
        row(130, 3, L.slow, false);
        row(230, 9, L.fast, true);
        text(g, 371, 179, "k", { size: 15, italic: true });
        text(g, 371, 279, "k", { size: 15, italic: true });
      }

      if (i === 4) {
        const belt = 290, bw = 50, bh = 36;
        const xt = 140 + 140 * e;
        line(g, [30, belt], [610, belt], { stroke: body, w: 2 });
        for (let k = 0; k < 12; k++) kit.svg("circle", { cx: 50 + k * 50, cy: belt + 7, r: 5, fill: "none", stroke: mute, "stroke-width": 1.2 }, g);
        arrow(g, [562, belt - 16], [612, belt - 16], { stroke: mute });
        // measured (delayed) ghost
        kit.svg("rect", { x: xt - 58, y: belt - bh, width: bw, height: bh, fill: "none", stroke: body, "stroke-width": 1.4, "stroke-dasharray": "4 3" }, g);
        // EKF predictions
        for (let k = 1; k <= 4; k++) {
          kit.svg("rect", { x: xt + k * 54, y: belt - bh, width: bw, height: bh, fill: accent, opacity: (0.32 - k * 0.06) * e, stroke: accent, "stroke-width": 1.2, "stroke-dasharray": "4 3" }, g);
        }
        // true target with fringes
        kit.svg("rect", { x: xt, y: belt - bh, width: bw, height: bh, fill: phaseColour(0.75), stroke: ink, "stroke-width": 1.4 }, g);
        for (let k = 1; k < 6; k++) line(g, [xt + k * 8.3, belt - bh], [xt + k * 8.3, belt], { stroke: phaseColour(0.2), w: 2, opacity: 0.6 });
        // projector-camera head follows the predicted target
        const hx = xt + 25 + 24 * e;
        kit.svg("rect", { x: hx - 30, y: 60, width: 60, height: 28, rx: 4, fill: bg, stroke: ink, "stroke-width": 1.6 }, g);
        line(g, [hx, 30], [hx, 60], { stroke: ink, w: 4 });
        line(g, [hx - 14, 88], [xt, belt - bh], { stroke: accent, dash: "5 4", w: 1.2 });
        line(g, [hx + 14, 88], [xt + bw, belt - bh], { stroke: accent, dash: "5 4", w: 1.2 });
        text(g, hx + 42, 80, L.head, { anchor: "start" });
        text(g, xt - 33, 322, L.meas, { size: 17, anchor: "middle" });
        text(g, xt + 54, 350, L.pred, { size: 17, anchor: "start", fill: accent, weight: 600, opacity: e });
      }
    },
  });
}
