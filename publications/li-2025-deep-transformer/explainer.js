// Transformer-enhanced dynamic structured light, as a schematic:
// four-step fringes on a moving object -> each point's motion = in-plane shift + Z shift ->
// COTR matches the key frame to the other frames of a five-frame window ->
// aligned frames: the Z part is (n - 3)·ε, solved per pixel from a linearised equation ->
// the window slides by one frame, each window gives one corrected 3D shape.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Four-step phase shifting projects fringes shifted by π/2 per frame and assumes the object holds still. When it moves, the same surface point lands on different pixels and picks up an extra, unknown phase error that differs from pixel to pixel.",
        "The motion of each surface point is split into two parts: an in-plane shift (X–Y), which moves the point to another pixel, and a shift along Z, which adds a phase error. The total phase error is the sum of both.",
        "Within a five-frame window, the middle frame is the key frame. A COTR transformer, fine-tuned on fringe images, matches query pixels in the key frame to the other four frames with sub-pixel accuracy.",
        "Once the frames are aligned pixel by pixel, each frame adds the same extra phase error ε, so frame n (n = 1 to 5, key frame n = 3) carries (n − 3)ε. The five frames give three equations in the phase Φ and ε; for small ε they reduce to a linear equation, solved at every pixel.",
        "The window slides by one frame, so every new frame gives a new 3D shape: corrected phase, three-frequency unwrapping, calibrated triangulation. On a moving ceramic plate the RMSE falls from 1.401 mm (PSP) to 0.072 mm.",
      ],
      frame: "I", shift: "projected shift per frame: π/2 (four-step PSP)",
      moving: "moving surface: extra phase error at every pixel",
      point: "surface point",
      sum: "total phase error = in-plane part + Z part",
      inplane: "in-plane (X–Y)", alongZ: "along Z",
      box1: ["in-plane part", "moves to another pixel", "→ tracked by COTR"],
      box2: ["Z part", "extra phase error ε", "→ solved per pixel"],
      cotr: "COTR transformer, fine-tuned on fringe images",
      key: "key frame",
      aepe1: "matching error (AEPE), COTR: 0.47–0.83 px",
      aepe2: "optical flow: 12.32–21.06 px (Table 1)",
      zTitle: "Z part in one window: (n − 3)·ε",
      n: "frame n",
      small: "(ε small → linear)",
      map: "ε map (per pixel)", phi: "→ corrected phase Φ",
      five: "five frames give three independent equations",
      win: "window of 5, stride 1: ε → Φ → unwrap → 3D",
      rmse: "RMSE, moving ceramic plate (mm), Fig. 6",
      methods: ["PSP", "Guo", "Lu", "Wang", "Ours"],
    },
    zh: {
      steps: [
        "四步相移法每帧将投影条纹平移 π/2，并假定物体静止。物体一旦运动，同一表面点会落到不同像素上，并带来额外的未知相位误差，且各像素的误差各不相同。",
        "每个表面点的运动被分解为两部分：面内（X–Y）位移使该点移到另一个像素；沿 Z 方向的位移则引入额外相位误差。总相位误差为两者之和。",
        "在五帧滑动窗口内，以中间帧为关键帧。在条纹图像上微调的 COTR Transformer 网络把关键帧中的查询像素匹配到其余四帧，精度达到亚像素级。",
        "逐像素对齐各帧后，每帧都多出同样大小的相位误差 ε，第 n 帧（n = 1 至 5，关键帧为 n = 3）为 (n − 3)ε。五帧图像可得到关于相位 Φ 与 ε 的三个方程；ε 较小时化为线性方程，在每个像素上求解。",
        "窗口每次滑动一帧，每采集一帧新图像即可重建一个新的三维形貌：相位校正、三频相位展开、标定后的三角测量。在运动陶瓷平板上，RMSE 从 1.401 mm（PSP）降至 0.072 mm。",
      ],
      frame: "I", shift: "每帧投影相移：π/2（四步相移）",
      moving: "表面运动：每个像素都有额外相位误差",
      point: "表面点",
      sum: "总相位误差 = 面内部分 + Z 向部分",
      inplane: "面内（X–Y）", alongZ: "沿 Z 方向",
      box1: ["面内部分", "移到另一个像素", "→ 由 COTR 跟踪得到"],
      box2: ["Z 向部分", "额外相位误差 ε", "→ 逐像素求解"],
      cotr: "COTR Transformer，在条纹图像上微调",
      key: "关键帧",
      aepe1: "匹配误差（AEPE），COTR：0.47–0.83 px",
      aepe2: "光流法：12.32–21.06 px（表 1）",
      zTitle: "窗口内 Z 向误差：(n − 3)·ε",
      n: "帧序号 n",
      small: "（ε 较小 → 线性）",
      map: "ε 图（逐像素）", phi: "→ 校正后的相位 Φ",
      five: "五帧图像给出三个独立方程",
      win: "窗口长 5、步长 1：ε → Φ → 相位展开 → 三维",
      rmse: "RMSE，运动陶瓷平板（mm），图 6",
      methods: ["PSP", "Guo 方法", "Lu 方法", "Wang 方法", "本文方法"],
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colour: motion (the tracked surface point and its displacement).
  const MOTION = "#d64545";
  const { line, arrow } = kit.pen({ stroke: body, head: 10 });

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Text made of parts: plain strings, { sub } or { sup }; scripts stay >= 14 units.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const small = { "font-size": Math.max(14, Math.round(size * 0.8)) };
      if (typeof p === "string") {
        kit.svg("tspan", {}, n).textContent = p;
      } else if (p.sub !== undefined) {
        kit.svg("tspan", { "baseline-shift": "sub", ...small }, n).textContent = p.sub;
      } else {
        kit.svg("tspan", { "baseline-shift": "super", ...small }, n).textContent = p.sup;
      }
    }
    return n;
  };

  // --- A fringe frame: vertical sinusoid-like stripes shifted by n·period/4, with a domed object
  // (circle) whose height bends the stripes. The object moves between frames.
  const PERIOD = 15;
  const drawFrame = (g, x, y, w, h, n, obj, o = {}) => {
    kit.svg("rect", { x, y, width: w, height: h, fill: bg, stroke: o.stroke || mute, "stroke-width": o.sw || 1.2 }, g);
    const sw = PERIOD * 0.45;
    const off = (n * PERIOD) / 4;
    for (let xs = x - PERIOD + (off % PERIOD); xs < x + w + PERIOD; xs += PERIOD) {
      // pass 1: the flat background stripe, outside the object; pass 2: the stripe bent by the
      // object's dome, kept only inside the object outline
      for (const onObj of [false, true]) {
        const runs = [];
        let pts = [];
        for (let yy = y + 1; yy <= y + h - 1; yy += 2) {
          const d = ((yy - obj.cy) / obj.r) ** 2;
          const xx = onObj ? xs + obj.r * 0.45 * (1 - d) : xs;
          const dist = Math.hypot(xx - obj.cx, yy - obj.cy);
          const ok = xx >= x + sw / 2 && xx <= x + w - sw / 2 &&
            (onObj ? dist <= obj.r - sw / 2 : dist >= obj.r + sw / 2);
          if (ok) pts.push([xx, yy]);
          else { if (pts.length > 3) runs.push(pts); pts = []; }
        }
        if (pts.length > 3) runs.push(pts); // drop tiny stubs at the outline
        for (const r of runs) {
          kit.svg("path", { d: path(r), fill: "none", stroke: ink, "stroke-width": sw, "stroke-opacity": 0.42 }, g);
        }
      }
    }
    kit.svg("circle", { cx: obj.cx, cy: obj.cy, r: obj.r, fill: "none", stroke: body, "stroke-width": 1.6 }, g);
  };

  // Five frames in a row; the object drifts right and up between frames.
  const ROW = { x0: 28, y: 64, w: 104, h: 116, gap: 16 };
  const frameX = (n) => ROW.x0 + n * (ROW.w + ROW.gap);
  const objOf = (n) => ({ cx: frameX(n) + 40 + n * 7, cy: ROW.y + 66 - n * 4, r: 30 });
  const SPOT = [9, -8]; // the tracked surface point, relative to the object centre
  const QUERY = [[-12, -10], [9, -8], [-4, 15]];

  // Smooth epsilon field for the per-pixel map (fixed once, seeded).
  const rnd = kit.rng(13);
  const EPS = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => {
    const base = 0.35 + 0.45 * (c / 7) * (1 - r / 10) + 0.12 * Math.sin(c * 1.3 + r * 0.6);
    return clamp01(base + (rnd() - 0.5) * 0.18);
  }));

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        const SHIFTS = ["0", "π/2", "π", "3π/2", "2π"];
        for (let n = 0; n < 5; n++) {
          const v = kit.easeOut(clamp01(t * 5 - n * 0.8));
          const fg = kit.svg("g", { opacity: v }, g);
          const x = frameX(n), o = objOf(n);
          text(fg, x + ROW.w / 2, ROW.y - 14, [L.frame, { sub: String(n + 1) }], { size: 19, fill: body, weight: 600 });
          drawFrame(fg, x, ROW.y, ROW.w, ROW.h, n, o);
          // where the point sat in frame 1 (dashed) vs where it is now (dot)
          const p0 = [objOf(0).cx - frameX(0) + SPOT[0], objOf(0).cy + SPOT[1]];
          if (n > 0) {
            kit.svg("circle", { cx: x + p0[0], cy: p0[1], r: 5, fill: "none", stroke: MOTION, "stroke-width": 1.5, "stroke-dasharray": "3 2" }, fg);
            arrow(fg, [x + p0[0], p0[1]], [o.cx + SPOT[0], o.cy + SPOT[1]], { stroke: MOTION, w: 1.6, head: 7 });
          }
          kit.svg("circle", { cx: o.cx + SPOT[0], cy: o.cy + SPOT[1], r: 5, fill: MOTION, stroke: bg, "stroke-width": 1.5 }, fg);
          text(fg, x + ROW.w / 2, ROW.y + ROW.h + 26, SHIFTS[n], { size: 18, fill: accent, weight: 600 });
        }
        text(g, 320, 262, L.shift, { size: 18, fill: accent });
        text(g, 320, 296, L.moving, { size: 18, fill: MOTION, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
        kit.svg("circle", { cx: 236, cy: 330, r: 5, fill: MOTION }, g);
        text(g, 248, 336, L.point, { size: 16, anchor: "start", fill: body });
      }

      if (i === 1) {
        // axes as in the paper's Fig. 1(c): Z up, X right, Y towards the viewer
        const O = [96, 270];
        arrow(g, O, [96, 60], { stroke: body, w: 1.6 });
        arrow(g, O, [360, 270], { stroke: body, w: 1.6 });
        arrow(g, O, [40, 330], { stroke: body, w: 1.6 });
        text(g, 96, 50, "Z", { size: 18, fill: body });
        text(g, 374, 276, "X", { size: 18, fill: body });
        text(g, 30, 346, "Y", { size: 18, fill: body });
        const Sm = [150, 236], S0 = [290, 250], Sp = [290, 120];
        // in-plane leg, then the Z leg
        const a = kit.easeOut(seg01(t, 0, 0.5)), b = kit.easeOut(seg01(t, 0.45, 1));
        const P1 = [Sm[0] + (S0[0] - Sm[0]) * a, Sm[1] + (S0[1] - Sm[1]) * a];
        line(g, Sm, P1, { stroke: MOTION, w: 2.2, dash: "7 5" });
        if (a > 0.98) arrow(g, Sm, S0, { stroke: MOTION, w: 2.2, dash: "7 5" });
        const P2 = [S0[0], S0[1] + (Sp[1] - S0[1]) * b];
        if (b > 0) line(g, S0, P2, { stroke: MOTION, w: 2.2, dash: "7 5" });
        if (b > 0.98) arrow(g, S0, Sp, { stroke: MOTION, w: 2.2, dash: "7 5" });
        const cur = b > 0 ? P2 : P1;
        kit.svg("circle", { cx: Sm[0], cy: Sm[1], r: 5, fill: "none", stroke: MOTION, "stroke-width": 1.6 }, g);
        kit.svg("circle", { cx: cur[0], cy: cur[1], r: 6, fill: MOTION, stroke: bg, "stroke-width": 1.5 }, g);
        text(g, Sm[0] - 10, Sm[1] - 12, ["S", { sub: "m" }], { size: 19, anchor: "end", fill: ink });
        text(g, S0[0] + 12, S0[1] + 24, ["S", { sub: "0" }], { size: 19, anchor: "start", fill: ink, opacity: a });
        text(g, Sp[0] + 12, Sp[1] - 6, ["S′", { sub: "m" }], { size: 19, anchor: "start", fill: ink, opacity: b });
        text(g, 220, 288, L.inplane, { size: 17, fill: MOTION, opacity: a });
        text(g, 304, 190, L.alongZ, { size: 17, anchor: "start", fill: MOTION, opacity: b });

        // right: the two parts of the phase error
        const boxes = [[L.box1, 64, a], [L.box2, 186, b]];
        for (const [lines, y0, v] of boxes) {
          kit.svg("rect", { x: 420, y: y0, width: 204, height: 100, rx: 6, fill: rule, "fill-opacity": 0.5, stroke: mute, "stroke-width": 1.2, opacity: v }, g);
          text(g, 522, y0 + 28, lines[0], { size: 18, fill: ink, weight: 700, opacity: v });
          text(g, 522, y0 + 58, lines[1], { size: 16, fill: body, opacity: v });
          text(g, 522, y0 + 84, lines[2], { size: 16, fill: accent, weight: 600, opacity: v });
        }
        text(g, 320, 22, L.sum, { size: 17, fill: body, opacity: kit.easeOut(seg01(t, 0.7, 1)) });
      }

      if (i === 2) {
        text(g, 320, 26, L.cotr, { size: 18, fill: accent, weight: 600 });
        for (let n = 0; n < 5; n++) {
          const x = frameX(n), o = objOf(n);
          const key = n === 2;
          if (key) text(g, x + ROW.w / 2, ROW.y - 12, L.key, { size: 17, fill: accent, weight: 700 });
          else text(g, x + ROW.w / 2, ROW.y - 12, [L.frame, { sub: String(n + 1) }], { size: 18, fill: body });
          drawFrame(g, x, ROW.y, ROW.w, ROW.h, n, o, key ? { stroke: accent, sw: 3 } : {});
        }
        // query points in the key frame and their matches, drawn outward from the key frame
        const k = objOf(2);
        QUERY.forEach((q) => {
          const src = [k.cx + q[0], k.cy + q[1]];
          for (const n of [1, 3, 0, 4]) {
            const far = n === 0 || n === 4;
            const v = kit.easeOut(seg01(t, far ? 0.45 : 0.1, far ? 1 : 0.6));
            if (v <= 0) continue;
            const o = objOf(n), dst = [o.cx + q[0], o.cy + q[1]];
            const cur = [src[0] + (dst[0] - src[0]) * v, src[1] + (dst[1] - src[1]) * v];
            line(g, src, cur, { stroke: accent, w: 1.4, dash: "4 3", opacity: 0.85 });
            if (v > 0.98) kit.svg("circle", { cx: dst[0], cy: dst[1], r: 4.5, fill: accent, stroke: bg, "stroke-width": 1.5 }, g);
          }
          kit.svg("circle", { cx: src[0], cy: src[1], r: 5, fill: accent, stroke: bg, "stroke-width": 1.5 }, g);
        });
        const v = kit.easeOut(seg01(t, 0.6, 1));
        text(g, 320, 248, L.aepe1, { size: 18, fill: accent, weight: 600, opacity: v });
        text(g, 320, 280, L.aepe2, { size: 18, fill: body, opacity: v });
      }

      if (i === 3) {
        // left: Z-part of the phase error per frame within one window
        text(g, 160, 40, L.zTitle, { size: 18, fill: ink, weight: 600 });
        const BASE = 170, UNIT = 34;
        line(g, [36, BASE], [284, BASE], { stroke: body, w: 1.4 });
        const VAL = ["−2ε", "−ε", "0", "ε", "2ε"];
        for (let n = 0; n < 5; n++) {
          const cx = 60 + n * 50, hgt = (n - 2) * UNIT * e;
          if (n !== 2) {
            kit.svg("rect", {
              x: cx - 14, y: hgt > 0 ? BASE - hgt : BASE, width: 28, height: Math.abs(hgt),
              fill: MOTION, "fill-opacity": 0.75,
            }, g);
          }
          const up = n >= 2;
          text(g, cx, up ? BASE - (n - 2) * UNIT - 10 : BASE + (2 - n) * UNIT + 22, VAL[n], { size: 17, fill: MOTION, weight: 600, opacity: e });
          text(g, cx, n < 2 ? BASE - 12 : BASE + 26, String(n + 1), { size: 16, fill: body });
        }
        text(g, 160, 270, L.n, { size: 16, fill: body });

        // middle: three equations -> linear in epsilon
        const vm = kit.easeOut(seg01(t, 0.3, 0.75));
        text(g, 372, 112, ["E", { sub: "1" }, " , E", { sub: "2" }, " , E", { sub: "3" }], { size: 19, fill: ink, weight: 600, opacity: vm });
        arrow(g, [372, 124], [372, 164], { stroke: body, w: 1.6, opacity: vm });
        text(g, 372, 192, ["K", { sub: "1" }, "ε + K", { sub: "0" }, " = 0"], { size: 20, fill: accent, weight: 700, opacity: vm });
        text(g, 372, 222, L.small, { size: 15, fill: body, opacity: vm });

        // right: per-pixel epsilon map
        const vr = kit.easeOut(seg01(t, 0.6, 1));
        const GX = 478, GY = 92, C = 17;
        text(g, GX + 4 * C, 78, L.map, { size: 17, fill: ink, weight: 600, opacity: vr });
        EPS.forEach((row, r) => row.forEach((val, c) => {
          kit.svg("rect", { x: GX + c * C, y: GY + r * C, width: C, height: C, fill: accent, "fill-opacity": (0.12 + 0.75 * val) * vr, stroke: bg, "stroke-width": 0.6 }, g);
        }));
        kit.svg("rect", { x: GX, y: GY, width: 8 * C, height: 8 * C, fill: "none", stroke: mute, "stroke-width": 1.2, opacity: vr }, g);
        text(g, GX + 4 * C, GY + 8 * C + 28, L.phi, { size: 17, fill: accent, weight: 600, opacity: vr });
        text(g, 320, 330, L.five, { size: 17, fill: body, opacity: vr });
      }

      if (i === 4) {
        // top: sliding window over the frame stream
        const FW = 52, FG = 12, FX = 38, FY = 34, FH = 46;
        for (let n = 0; n < 9; n++) {
          const x = FX + n * (FW + FG);
          kit.svg("rect", { x, y: FY, width: FW, height: FH, fill: bg, stroke: mute, "stroke-width": 1 }, g);
          const off = ((n % 4) * PERIOD) / 4;
          for (let xs = x + 4 + (off % 10); xs < x + FW - 3; xs += 10) {
            line(g, [xs, FY + 2], [xs, FY + FH - 2], { stroke: ink, w: 4, opacity: 0.38 });
          }
        }
        const wx = FX - 5 + e * 4 * (FW + FG);
        kit.svg("rect", { x: wx, y: FY - 6, width: 5 * FW + 4 * FG + 10, height: FH + 12, rx: 5, fill: "none", stroke: accent, "stroke-width": 3 }, g);
        text(g, 320, 112, L.win, { size: 17, fill: accent, weight: 600 });

        // bottom: RMSE on the moving ceramic plate (Fig. 6)
        const VALS = [1.401, 1.384, 1.352, 2.028, 0.072];
        const vb = kit.easeOut(seg01(t, 0.3, 1));
        text(g, 320, 152, L.rmse, { size: 17, fill: ink, weight: 600 });
        const X0 = 170, SCALE = 170;
        VALS.forEach((val, k) => {
          const y = 168 + k * 36, ours = k === 4;
          text(g, X0 - 10, y + 20, L.methods[k], { size: 17, anchor: "end", fill: ours ? accent : body, weight: ours ? 700 : 400 });
          kit.svg("rect", { x: X0, y: y + 4, width: Math.max(1, val * SCALE * vb), height: 22, fill: ours ? accent : mute, "fill-opacity": ours ? 0.95 : 0.7 }, g);
          text(g, X0 + val * SCALE * vb + 8, y + 21, val.toFixed(3), { size: 17, anchor: "start", fill: ours ? accent : body, weight: ours ? 700 : 400, opacity: vb });
        });
      }
    },
  });
}
