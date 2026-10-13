// Depth-adaptive line-laser calibration schematic:
// a Z-stage carries the sensor through six depths and records the laser stripe on a flat target ->
// one rational polynomial (RPC) mapping turns stripe pixels (u, v) into physical (X, Z) for every depth ->
// a yawed sensor shears the stitched checkerboard into a parallelogram ->
// roll alpha comes from a height block, yaw gamma from checkerboard orthogonality ->
// one inverse rotation, reused at every depth, restores the square grid.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Internal stage: a precision Z-stage carries the camera and line laser through six depths, Z₁–Z₆, above a flat target. At each depth a laser-on/laser-off image pair gives a clean stripe centreline. Z₃ is held out for testing.",
        "One rational polynomial mapping, a perspective backbone plus a bivariate cubic residual (22 coefficients), is fitted to the stripe pixels from all training depths at once and maps them to physical coordinates (X, Z).",
        "External stage: a 3D cloud is built by stitching profiles taken while a motion stage scans the target. If the sensor is rotated against the motion direction, the stitched cloud is sheared: a square checkerboard comes out as a parallelogram.",
        "The two angles that cause shear are measured directly: roll α from the apparent height of a standard height block, yaw γ by requiring adjacent checkerboard edges to be perpendicular again. Pitch β causes no in-plane shear in this setup and is set to zero.",
        "Every point is mapped through one inverse rotation built from α and γ. It does not depend on depth, so the same correction squares the grid at every working depth without retuning.",
      ],
      stage: "Z-stage", target: "flat target", image: "camera image", held: "dashed: Z", heldTail: ", held out",
      depths: "6 depths, 30 mm apart (150 mm)",
      pix: "pixels (u, v)", world: "physical (X, Z)", rpc: "RPC", coef: "22 coefficients",
      model: "perspective + cubic residual, one fit for all depths",
      gain: "mean abs. error vs HALCON: X −17.5%, Z −11.8%",
      top: "top view", motion: "motion", stitched: "stitched cloud", stitch: "stitch",
      shear: "Δx = Δy · tan γ", tilt: "test tilt α ≈ 5°, γ ≈ 10°: E", tiltSub: "orth", tiltTail: " depth-mean 10.007°",
      block: "height block → α", board: "checkerboard → γ", line: "line L (RANSAC)",
      alpha: "α = arctan((H′ − H) / W)", perp: "make A′B′ ⟂ A′D′ → γ",
      est: "estimated once at Z", estTail: ": α = 5.150°, γ = 9.830°",
      rot: "one inverse rotation R", rotTail: ", same at every depth",
      s1: "E", s1sub: "orth", s1tail: " depth-mean: 10.007° → 0.309°",
      s2: "E", s2sub: "θ", s2tail: " depth-mean: 0.7591° → 0.0387°",
    },
    zh: {
      steps: [
        "内部标定：精密 Z 轴位移台带动相机和线激光器，在平面靶标上方依次移动到 Z₁–Z₆ 六个深度。每个深度采集一组激光开/关图像对，得到干净的光条中心线。Z₃ 留作测试。",
        "用一个有理多项式映射（透视主干加二元三次残差，共 22 个系数）一次性拟合全部训练深度的光条像素，把它们映射到物理坐标 (X, Z)。",
        "外部标定：运动平台扫描靶标时逐帧拼接轮廓，得到三维点云。若传感器相对运动方向存在转角，拼接点云就会发生剪切：方形棋盘格变成平行四边形。",
        "直接测量引起剪切的两个角度：由标准高度块的表观高度求横滚角 α，由棋盘格相邻边恢复垂直的条件求偏航角 γ。在该配置下俯仰角 β 不产生面内剪切，取为零。",
        "所有点都经过同一个由 α 和 γ 构成的逆旋转。它与深度无关，因此同一校正在每个工作深度都能把网格恢复为方格，无需逐深度重新调参。",
      ],
      stage: "Z 轴位移台", target: "平面靶标", image: "相机图像", held: "虚线：Z", heldTail: "，留作测试",
      depths: "6 个深度，间隔 30 mm（共 150 mm）",
      pix: "像素 (u, v)", world: "物理坐标 (X, Z)", rpc: "RPC", coef: "22 个系数",
      model: "透视 + 三次残差，所有深度共用一次拟合",
      gain: "平均绝对误差较 HALCON：X −17.5%，Z −11.8%",
      top: "俯视图", motion: "运动", stitched: "拼接点云", stitch: "拼接",
      shear: "Δx = Δy · tan γ", tilt: "测试倾斜 α ≈ 5°，γ ≈ 10°：E", tiltSub: "orth", tiltTail: " 深度均值 10.007°",
      block: "高度块 → α", board: "棋盘格 → γ", line: "参考线 L（RANSAC）",
      alpha: "α = arctan((H′ − H) / W)", perp: "令 A′B′ ⟂ A′D′ → 求 γ",
      est: "仅在 Z", estTail: " 估计一次：α = 5.150°，γ = 9.830°",
      rot: "同一个逆旋转 R", rotTail: "，各深度通用",
      s1: "E", s1sub: "orth", s1tail: " 深度均值：10.007° → 0.309°",
      s2: "E", s2sub: "θ", s2tail: " 深度均值：0.7591° → 0.0387°",
    },
  }, lang);

  const ink = kit.token("--c-ink") || "#0a0a0a";
  const body = kit.token("--c-body") || "#525252";
  const accent = kit.token("--c-accent") || "#1e3a8a";
  const mute = kit.token("--c-mute") || "#a3a3a3";
  const bg = kit.token("--c-bg") || "#ffffff";
  const rule = kit.token("--c-rule") || "#e5e5e5";
  // Literal semantic colour: the laser light (fan, stripe on the target, stripe points).
  const LASER = "#d64545";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));

  // Text made of parts: plain strings, or { sub: "…" } for a real subscript.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 20;
    const n = kit.svg("text", {
      x, y, "font-size": size, fill: o.fill || ink, "text-anchor": o.anchor || "middle",
      "font-weight": o.weight || 400, "font-family": "var(--f-sans)", "paint-order": "stroke",
      stroke: bg, "stroke-width": 4, "stroke-linejoin": "round", opacity: o.opacity ?? 1,
    }, parent);
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      if (typeof p === "string") {
        const s = kit.svg("tspan", {}, n);
        s.textContent = p;
      } else {
        const s = kit.svg("tspan", { "baseline-shift": "sub", "font-size": size * 0.72 }, n);
        s.textContent = p.sub;
      }
    }
    return n;
  };
  const line = (parent, a, b, o = {}) => kit.svg("line", {
    x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.stroke || body, "stroke-width": o.w || 1.5,
    "stroke-dasharray": o.dash || "none", opacity: o.opacity ?? 1, "stroke-linecap": "round",
  }, parent);
  const arrow = (parent, a, b, o = {}) => {
    line(parent, a, b, o);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = 10;
    const p1 = [b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45)];
    const p2 = [b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)];
    kit.svg("polygon", { points: [b, p1, p2].map((q) => q.join(",")).join(" "), fill: o.stroke || body, opacity: o.opacity ?? 1 }, parent);
  };
  const dim = (parent, a, b, o = {}) => { arrow(parent, a, b, o); arrow(parent, b, a, o); };
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // --- Stripe model: in the image, depth k gives a slightly bowed stripe at row V[k] ---
  const N_DEP = 6, HELD = 2; // Z3 is the held-out test depth
  const STRIPE_N = 24;
  // Stripe k in a box: s runs -1..1 across the image width; the bow grows with depth (non-linear deviation).
  const stripeImg = (k, box) => Array.from({ length: STRIPE_N }, (_, j) => {
    const s = -1 + (2 * j) / (STRIPE_N - 1);
    const v = 0.14 + k * 0.145;
    const bow = 0.025 + k * 0.006;
    return [box.x + box.w * (0.06 + 0.88 * (s + 1) / 2), box.y + box.h * (v + bow * (1 - s * s))];
  });
  // The same stripe in physical (X, Z): a straight line at its depth.
  const stripeWorld = (k, box) => Array.from({ length: STRIPE_N }, (_, j) => {
    const s = -1 + (2 * j) / (STRIPE_N - 1);
    return [box.x + box.w * (0.06 + 0.88 * (s + 1) / 2), box.y + box.h * (0.12 + k * 0.15)];
  });
  const frame = (g, box) => kit.svg("rect", {
    x: box.x, y: box.y, width: box.w, height: box.h, fill: rule, "fill-opacity": 0.4, stroke: mute, "stroke-width": 1.2,
  }, g);

  // Checkerboard of n x n cells in a square box, sheared: the top row is pushed right by `shift` px.
  const board = (g, x0, y0, size, n, shift, o = {}) => {
    const f = (x, y) => [x + ((y0 + size - y) / size) * shift, y];
    const c = size / n;
    for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) {
      const x = x0 + q * c, y = y0 + r * c;
      kit.svg("path", {
        d: path([f(x, y), f(x + c, y), f(x + c, y + c), f(x, y + c)]) + "Z",
        fill: (r + q) % 2 ? bg : ink, "fill-opacity": (r + q) % 2 ? 1 : 0.72, stroke: o.stroke || body, "stroke-width": o.w || 1,
      }, g);
    }
    return f;
  };

  const GAMMA = (10 * Math.PI) / 180; // the yaw used in the paper's tilt experiment (about 10 degrees)

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // left: the sensor rides the Z-stage down through six depths; right: one stripe per depth in the image
        const RAIL = 78, DEP = [54, 88, 122, 156, 190, 224], PLATE_Y = 300;
        line(g, [RAIL, 40], [RAIL, 262], { stroke: body, w: 3 });
        text(g, RAIL + 4, 28, L.stage, { size: 19, fill: body, weight: 600 });
        DEP.forEach((y, k) => {
          line(g, [RAIL - 7, y], [RAIL + 7, y], { stroke: body, w: 1.5 });
          text(g, RAIL - 12, y + 6, ["Z", { sub: String(k + 1) }], { size: 18, anchor: "end", fill: k === HELD ? mute : body });
        });
        const p = ease(t) * (N_DEP - 1);
        const ys = DEP[0] + (p / (N_DEP - 1)) * (DEP[N_DEP - 1] - DEP[0]);
        // sensor head (camera + laser) on an arm from the rail
        line(g, [RAIL, ys], [150, ys], { stroke: body, w: 3 });
        kit.svg("rect", { x: 150, y: ys - 16, width: 96, height: 30, rx: 4, fill: bg, stroke: ink, "stroke-width": 1.6 }, g);
        kit.svg("circle", { cx: 230, cy: ys - 1, r: 8, fill: "none", stroke: ink, "stroke-width": 1.6 }, g);
        const src = [176, ys + 14];
        const half = (PLATE_Y - src[1]) * 0.42;
        kit.svg("path", { d: path([src, [src[0] - half, PLATE_Y], [src[0] + half, PLATE_Y]]) + "Z", fill: LASER, "fill-opacity": 0.16, stroke: "none" }, g);
        kit.svg("rect", { x: 70, y: PLATE_Y, width: 230, height: 9, fill: rule, stroke: body, "stroke-width": 1.2 }, g);
        line(g, [src[0] - half, PLATE_Y], [src[0] + half, PLATE_Y], { stroke: LASER, w: 4 });
        text(g, 185, 336, L.target, { size: 19, fill: body });

        const box = { x: 360, y: 44, w: 252, h: 236 };
        text(g, box.x + box.w / 2, 32, L.image, { size: 19, fill: body, weight: 600 });
        frame(g, box);
        for (let k = 0; k < N_DEP; k++) {
          if (p < k - 0.02) continue;
          kit.svg("path", {
            d: path(stripeImg(k, box)), fill: "none", stroke: LASER, "stroke-width": 3,
            "stroke-dasharray": k === HELD ? "8 6" : "none", "stroke-linecap": "round",
          }, g);
        }
        text(g, box.x + box.w / 2, 310, L.depths, { size: 18, fill: body });
        text(g, box.x + box.w / 2, 338, [L.held, { sub: "3" }, L.heldTail], { size: 18, fill: mute, opacity: ease(seg01(t, 0.6, 1)) });
      }

      if (i === 1) {
        // one RPC fit carries every bowed stripe in pixel space onto a straight line at its physical depth
        const PB = { x: 20, y: 50, w: 200, h: 210 }, WB = { x: 420, y: 50, w: 200, h: 210 };
        frame(g, PB);
        // physical frame: axes only
        line(g, [WB.x, WB.y + WB.h], [WB.x + WB.w, WB.y + WB.h], { stroke: body, w: 1.4 });
        line(g, [WB.x, WB.y + WB.h], [WB.x, WB.y - 6], { stroke: body, w: 1.4 });
        text(g, PB.x + PB.w / 2, 36, L.pix, { size: 19, fill: body, weight: 600 });
        text(g, WB.x + WB.w / 2, 36, L.world, { size: 19, fill: body, weight: 600 });
        const m = ease(seg01(t, 0.15, 1));
        for (let k = 0; k < N_DEP; k++) {
          const a = stripeImg(k, PB), b = stripeWorld(k, WB);
          const dash = k === HELD ? "8 6" : "none";
          kit.svg("path", { d: path(a), fill: "none", stroke: LASER, "stroke-width": 2.5, "stroke-dasharray": dash, opacity: 0.45 }, g);
          const cur = a.map((q, j) => [q[0] + (b[j][0] - q[0]) * m, q[1] + (b[j][1] - q[1]) * m]);
          kit.svg("path", { d: path(cur), fill: "none", stroke: accent, "stroke-width": 3, "stroke-dasharray": dash, "stroke-linecap": "round" }, g);
          if (m > 0.98) text(g, WB.x - 8, b[0][1] + 6, ["Z", { sub: String(k + 1) }], { size: 18, anchor: "end", fill: k === HELD ? mute : body });
        }
        arrow(g, [238, 150], [352, 150], { stroke: accent, w: 2.5 });
        text(g, 295, 138, L.rpc, { size: 22, fill: accent, weight: 700 });
        text(g, 295, 180, L.coef, { size: 18, fill: body });
        text(g, 320, 300, L.model, { size: 18, fill: body });
        text(g, 320, 336, L.gain, { size: 18, fill: accent, weight: 600, opacity: ease(seg01(t, 0.7, 1)) });
      }

      if (i === 2) {
        // left: top view, the laser line is yawed by gamma against the motion direction; right: the stitched grid shears
        const B = { x: 70, y: 70, size: 160 };
        text(g, B.x + B.size / 2, 40, L.top, { size: 19, fill: body, weight: 600 });
        board(g, B.x, B.y, B.size, 4, 0);
        // motion arrow along Y
        arrow(g, [40, B.y + B.size], [40, B.y], { stroke: body, w: 2 });
        text(g, 16, B.y + B.size + 28, [L.motion + " (Y)"], { size: 18, anchor: "start", fill: body });
        // laser line sweeping the board, rotated by gamma; the ideal (perpendicular) line dashed
        const sweep = 0.15 + 0.6 * ease(t);
        const cy = B.y + B.size - sweep * B.size;
        const cx = B.x + B.size / 2;
        const hl = B.size / 2 + 18;
        line(g, [cx - hl, cy], [cx + hl, cy], { stroke: mute, w: 1.5, dash: "6 5" });
        line(g, [cx - hl * Math.cos(GAMMA), cy + hl * Math.sin(GAMMA)], [cx + hl * Math.cos(GAMMA), cy - hl * Math.sin(GAMMA)], { stroke: LASER, w: 4 });
        text(g, cx + hl + 8, cy - 10, "γ", { size: 20, anchor: "start", fill: LASER, weight: 600 });

        arrow(g, [272, 150], [352, 150], { stroke: body, w: 2 });
        text(g, 312, 136, L.stitch, { size: 18, fill: body });

        const S = { x: 400, y: 70, size: 160 };
        text(g, S.x + S.size / 2 + 14, 40, L.stitched, { size: 19, fill: body, weight: 600 });
        const shift = Math.tan(GAMMA) * S.size * ease(seg01(t, 0.2, 1));
        // the square it should have been
        kit.svg("rect", { x: S.x, y: S.y, width: S.size, height: S.size, fill: "none", stroke: mute, "stroke-width": 1.5, "stroke-dasharray": "6 5" }, g);
        const f = board(g, S.x, S.y, S.size, 4, shift, { stroke: body });
        // a corner that is no longer a right angle
        const c0 = f(S.x, S.y + S.size);
        kit.svg("path", { d: path([f(S.x + 22, S.y + S.size), f(S.x + 22, S.y + S.size - 22), f(S.x, S.y + S.size - 22)]), fill: "none", stroke: accent, "stroke-width": 2, opacity: ease(seg01(t, 0.6, 1)) }, g);
        kit.svg("circle", { cx: c0[0], cy: c0[1], r: 4, fill: accent, opacity: ease(seg01(t, 0.6, 1)) }, g);
        text(g, S.x + S.size / 2 + 14, S.y + S.size + 32, L.shear, { size: 19, fill: body });
        text(g, 320, 340, [L.tilt, { sub: L.tiltSub }, L.tiltTail], { size: 18, fill: accent, weight: 600, opacity: ease(seg01(t, 0.6, 1)) });
      }

      if (i === 3) {
        // left: roll from the height block; right: yaw from one checkerboard cell
        const vA = ease(seg01(t, 0, 0.55)), vG = ease(seg01(t, 0.35, 0.9)), vE = ease(seg01(t, 0.75, 1));
        text(g, 160, 34, L.block, { size: 19, fill: body, weight: 600 });
        const BASE = 230, BX0 = 100, BX1 = 220, H = 70, HP = 84;
        line(g, [30, BASE], [290, BASE], { stroke: accent, w: 2, dash: "8 5" });
        text(g, 30, BASE + 28, L.line, { size: 18, anchor: "start", fill: accent });
        kit.svg("rect", { x: BX0, y: BASE - H, width: BX1 - BX0, height: H, fill: rule, stroke: body, "stroke-width": 1.4 }, g);
        // measured upper-face stripe points sit at H' instead of the nominal H
        for (let j = 0; j <= 10; j++) {
          kit.svg("circle", { cx: BX0 + 6 + j * ((BX1 - BX0 - 12) / 10), cy: BASE - HP, r: 3.2, fill: LASER, opacity: vA }, g);
        }
        dim(g, [BX0 - 16, BASE], [BX0 - 16, BASE - H], { stroke: body, w: 1.4 });
        text(g, BX0 - 24, BASE - H / 2 + 7, "H", { size: 19, anchor: "end", fill: body });
        dim(g, [BX1 + 16, BASE], [BX1 + 16, BASE - HP], { stroke: LASER, w: 1.4, opacity: vA });
        text(g, BX1 + 24, BASE - HP / 2 + 7, "H′", { size: 19, anchor: "start", fill: LASER, opacity: vA });
        dim(g, [BX0, BASE - HP - 22], [BX1, BASE - HP - 22], { stroke: body, w: 1.4 });
        text(g, (BX0 + BX1) / 2, BASE - HP - 30, "W", { size: 19, fill: body });
        text(g, 160, 296, L.alpha, { size: 19, fill: accent, weight: 600, opacity: vA });

        text(g, 480, 34, L.board, { size: 19, fill: body, weight: 600 });
        const A = [400, 220], side = 110, sh = Math.tan(GAMMA) * side;
        const Bp = [A[0] + side, A[1]], D = [A[0] + sh, A[1] - side], C = [Bp[0] + sh, Bp[1] - side];
        kit.svg("path", { d: path([A, Bp, C, D]) + "Z", fill: ink, "fill-opacity": 0.12, stroke: body, "stroke-width": 1.4 }, g);
        arrow(g, A, Bp, { stroke: accent, w: 2.6, opacity: vG });
        arrow(g, A, D, { stroke: accent, w: 2.6, opacity: vG });
        for (const [q, lab, dx, dy] of [[A, "A′", -10, 22], [Bp, "B′", 10, 22], [D, "D′", -10, -8]]) {
          kit.svg("circle", { cx: q[0], cy: q[1], r: 4.5, fill: ink }, g);
          text(g, q[0] + dx, q[1] + dy, lab, { size: 18, anchor: dx < 0 ? "end" : "start", fill: body });
        }
        text(g, 480, 296, L.perp, { size: 19, fill: accent, weight: 600, opacity: vG });
        text(g, 320, 340, [L.est, { sub: "3" }, L.estTail], { size: 18, fill: body, opacity: vE });
      }

      if (i === 4) {
        // the same inverse rotation squares the grid at three of the six depths at once
        const m = ease(seg01(t, 0.1, 0.85));
        const shift0 = Math.tan(GAMMA) * 110;
        [[0, 60], [2, 260], [5, 460]].forEach(([k, x0]) => {
          text(g, x0 + 60, 38, ["Z", { sub: String(k + 1) }], { size: 20, fill: body, weight: 600 });
          kit.svg("rect", { x: x0, y: 56, width: 110, height: 110, fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "6 5", opacity: 1 - m }, g);
          board(g, x0, 56, 110, 3, shift0 * (1 - m), { stroke: m > 0.98 ? accent : body, w: m > 0.98 ? 1.6 : 1 });
        });
        text(g, 320, 222, [L.rot, { sub: "x" }, "(α) R", { sub: "z" }, "(γ)" + L.rotTail], { size: 19, fill: body, weight: 600 });
        const v = ease(seg01(t, 0.6, 1));
        text(g, 320, 284, [L.s1, { sub: L.s1sub }, L.s1tail], { size: 19, fill: accent, weight: 600, opacity: v });
        text(g, 320, 322, [L.s2, { sub: L.s2sub }, L.s2tail], { size: 19, fill: accent, weight: 600, opacity: v });
      }
    },
  });
}
