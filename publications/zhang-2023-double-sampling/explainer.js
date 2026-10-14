// Double-sampling PSP schematic:
// a trigger device makes the camera shoot twice per projected fringe ->
// same-fringe pairs differ only by motion, cross-fringe pairs also by the 2π/N phase shift ->
// motion tracking (R, T) gives where each point is at each capture, (f_n, g_n) ->
// least squares over I11, I12, I21 gives A, B, C and the phase φ = tan⁻¹(−C/B) ->
// multiplexing: every three consecutive images give one phase map (Fig. 2 of the paper).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A trigger control device links the camera and the projector. For each projected fringe pattern I₁, I₂, I₃ …, the camera is triggered twice, so two consecutive images are captured before the next projection (I₁₁ and I₁₂ for I₁, I₂₁ and I₂₂ for I₂, …).",
        "Two images of the same projected fringe have no PSP phase shift between them (δ₁ = 0), so they differ only by the object's motion. Images of different fringes differ by the motion and by the PSP phase shift δ₂ = 2π/N. The phase is analysed in I₁₁, I₁₂ and I₂₁.",
        "Tracking the object gives the rotation matrix and translation vector of its motion. From them follows the coordinate transformation (fₙ, gₙ) that relates each point's position before and after the motion.",
        "Each image is written as A + B cos(ϕ + δₖ) + C sin(ϕ + δₖ), where ϕ is the reference-plane phase at the transformed coordinates. Least squares over the three images (N = 3) gives A, B and C, and the phase change of the object is φ = tan⁻¹(−C/B).",
        "Multiplexing: every three consecutive images give one object phase map, so the frames overlap and a new frame starts with each image (Fig. 2b). Traditional PSP needs three projections for each frame (Fig. 2a).",
      ],
      proj: "Projector", cam: "Camera", time: "time",
      twice: "trigger control: 2 camera shots per projected fringe",
      onlyMotion: "motion only", motionShift: "motion + phase shift 2π/N",
      view: "camera images over time", track: "motion tracking",
      rt: "→ rotation R, translation T", fg1: "(f", fg2: ", g", fg3: "): coordinate change",
      fg4: "before and after", fg5: "the motion",
      intensity: "I", axis: "ϕ(h) + δ", perPixel: "least squares, per pixel",
      dxe: "D X = E,  X = [A  B  C]",
      phase: "φ = tan", phaseTail: "(−C / B)",
      threeImg: "N = 3 images:",
      slot: "projected", trad: "Traditional PSP", dbl: "Double sampling", frame: "Frame ",
      every3: "every 3 consecutive images → 1 phase map",
    },
    zh: {
      steps: [
        "触发控制装置把相机与投影仪联动起来：投影仪每投射一幅条纹图 I₁、I₂、I₃ ……，相机都被触发两次，在下一次投射前连续拍下两幅图像（I₁ 对应 I₁₁ 和 I₁₂，I₂ 对应 I₂₁ 和 I₂₂，……）。",
        "同一幅投射条纹下拍到的两幅图像之间没有 PSP 相移（δ₁ = 0），只相差物体的运动；不同条纹下的图像之间既有运动，也有 PSP 相移 δ₂ = 2π/N。相位由 I₁₁、I₁₂ 和 I₂₁ 三幅图像联合求解。",
        "跟踪物体运动，得到描述运动的旋转矩阵和平移向量。由此得到坐标变换关系 (fₙ, gₙ)，它描述物体上各点在运动前后的位置对应。",
        "每幅图像写成 A + B cos(ϕ + δₖ) + C sin(ϕ + δₖ)，其中 ϕ 为参考平面相位在变换后坐标处的取值。对三幅图像（N = 3）做最小二乘求出 A、B、C，物体引起的相位变化为 φ = tan⁻¹(−C/B)。",
        "复用：每连续三幅图像即可解出一幅物体相位图，各帧相互重叠，每多拍一幅图像就开始新的一帧（图 2b）。传统 PSP 每一帧都需要三次投射（图 2a）。",
      ],
      proj: "投影仪", cam: "相机", time: "时间",
      twice: "触发控制：每幅投射条纹拍摄 2 次",
      onlyMotion: "仅含运动", motionShift: "运动 + 相移 2π/N",
      view: "相机图像随时间变化", track: "运动跟踪",
      rt: "→ 旋转 R，平移 T", fg1: "(f", fg2: ", g", fg3: ")：",
      fg4: "运动前后的", fg5: "坐标变换关系",
      intensity: "I", axis: "ϕ(h) + δ", perPixel: "逐像素最小二乘",
      dxe: "D X = E，X = [A  B  C]",
      phase: "φ = tan", phaseTail: "(−C / B)",
      threeImg: "N = 3 幅图像：",
      slot: "投射", trad: "传统 PSP", dbl: "双采样", frame: "第 ",
      frameTail: " 帧",
      every3: "每连续 3 幅图像 → 1 幅相位图",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: camera captures (yellow, as in Fig. 1 of the paper) and object motion.
  const CAP = "#e8b400";
  const MOTION = "#d64545";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { line, arrow } = kit.pen({ stroke: body, head: 10 });
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Text made of parts: plain strings, { sub: "…" } or { sup: "…" }; script tspans stay >= 14 units.
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 19;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo ?? true,
    });
    const small = Math.max(14, Math.round(size * 0.8));
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : {
        "baseline-shift": p.sub !== undefined ? "sub" : "super", "font-size": small,
      }, n);
      s.textContent = typeof p === "string" ? p : (p.sub ?? p.sup);
    }
    return n;
  };
  const frameLabel = (k) => (L.frameTail ? L.frame + k + L.frameTail : L.frame + k);

  // Vertical binary fringes of period `per` inside [x0, x1] x [y0, y1], shifted by `phase` (radians).
  const fringes = (g, x0, y0, x1, y1, per, phase, fill) => {
    const off = (((-phase / (2 * Math.PI)) * per) % per + per) % per;
    for (let x = x0 - per + off; x < x1; x += per) {
      const a = Math.max(x0, x), b = Math.min(x1, x + per / 2);
      if (b > a) kit.svg("rect", { x: a, y: y0, width: b - a, height: y1 - y0, fill, "fill-opacity": 0.78 }, g);
    }
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
        // trigger timeline: one projector illumination per fringe, two camera captures inside each
        const X0 = 130, PER = 165;
        const cursor = X0 + e * 500;
        text(g, 20, 108, L.proj, { size: 19, anchor: "start", fill: body, weight: 600 });
        text(g, 20, 218, L.cam, { size: 19, anchor: "start", fill: body, weight: 600 });
        line(g, [X0, 124], [625, 124], { stroke: mute, w: 1.2 });
        line(g, [X0, 234], [625, 234], { stroke: mute, w: 1.2 });
        for (let k = 0; k < 3; k++) {
          const px = X0 + k * PER;
          const on = cursor > px ? 1 : 0.12;
          kit.svg("rect", { x: px, y: 80, width: 145, height: 44, rx: 3, fill: accent, opacity: on }, g);
          text(g, px + 72, 110, ["I", { sub: String(k + 1) }], { size: 20, fill: bg, weight: 600, halo: false, opacity: on });
          line(g, [px, 124], [px, 190], { stroke: mute, w: 1.2, dash: "4 4", opacity: on });
          for (let j = 0; j < 2; j++) {
            const cx = px + 10 + j * 70;
            const vis = clamp01((cursor - cx) / 30);
            kit.svg("rect", { x: cx, y: 190, width: 56, height: 44, rx: 3, fill: CAP, opacity: 0.12 + 0.88 * vis }, g);
            text(g, cx + 26, 219, ["I", { sub: String(k + 1) + String(j + 1) }], { size: 19, fill: "#000", halo: false, opacity: 0.2 + 0.8 * vis });
          }
        }
        arrow(g, [X0, 268], [625, 268], { stroke: body, w: 1.5 });
        text(g, 625, 292, L.time, { size: 17, anchor: "end", fill: body });
        line(g, [cursor, 66], [cursor, 250], { stroke: MOTION, w: 1.5, opacity: t < 1 ? 0.8 : 0 });
        text(g, 320, 334, L.twice, { size: 18, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
      }

      if (i === 1) {
        // three captures: I11 and I12 under fringe 1 (only the object moved), I21 under fringe 2 (moved + shifted)
        const W = 170, H = 130, Y = 64, PER = 16, OBJ = 70, STEP = 14;
        const boxes = [
          { x: 30, lab: "11", delta: ["δ", { sub: "1" }, " = 0"], ph: 0 },
          { x: 235, lab: "12", delta: ["δ", { sub: "1" }, " = 0"], ph: 0 },
          { x: 440, lab: "21", delta: ["δ", { sub: "2" }, " = 2π/N"], ph: (2 * Math.PI) / 3 },
        ];
        boxes.forEach((b, k) => {
          const vis = kit.easeOut(seg01(t, k * 0.22, k * 0.22 + 0.4));
          const bx = kit.svg("g", { opacity: 0.08 + 0.92 * vis }, g);
          text(bx, b.x + W / 2, Y - 14, ["I", { sub: b.lab }], { size: 20, fill: ink, weight: 600 });
          kit.svg("rect", { x: b.x, y: Y, width: W, height: H, fill: bg, stroke: CAP, "stroke-width": 3 }, bx);
          fringes(bx, b.x, Y, b.x + W, Y + H, PER, b.ph, ink);
          // the object: its height shifts the fringe phase inside it; it moves right between captures
          const ox = b.x + 28 + k * STEP, oy = Y + 30;
          kit.svg("rect", { x: ox, y: oy, width: OBJ, height: OBJ, fill: bg }, bx);
          fringes(bx, ox, oy, ox + OBJ, oy + OBJ, PER, b.ph + Math.PI / 2, ink);
          kit.svg("rect", { x: ox, y: oy, width: OBJ, height: OBJ, fill: "none", stroke: accent, "stroke-width": 2.5 }, bx);
          if (k > 0) {
            kit.svg("rect", { x: ox - STEP, y: oy, width: OBJ, height: OBJ, fill: "none", stroke: MOTION, "stroke-width": 1.8, "stroke-dasharray": "5 4" }, bx);
            arrow(bx, [ox - STEP + 4, oy + OBJ + 14], [ox + 24, oy + OBJ + 14], { stroke: MOTION, w: 2.5, head: 8 });
          }
          text(bx, b.x + W / 2, Y + H + 32, b.delta, { size: 19, fill: body });
        });
        const v = kit.easeOut(seg01(t, 0.6, 1));
        const brace = (a, b2, y) => {
          line(g, [a, y - 8], [a, y], { stroke: body, w: 1.5, opacity: v });
          line(g, [a, y], [b2, y], { stroke: body, w: 1.5, opacity: v });
          line(g, [b2, y - 8], [b2, y], { stroke: body, w: 1.5, opacity: v });
        };
        brace(118, 312, 262);
        brace(328, 522, 262);
        text(g, 215, 294, L.onlyMotion, { size: 18, fill: MOTION, weight: 600, opacity: v });
        text(g, 425, 294, L.motionShift, { size: 18, fill: accent, weight: 600, opacity: v });
      }

      if (i === 2) {
        // the object translates and rotates; tracking gives R, T and so each point's position (f_n, g_n)
        const FR = { x: 24, y: 56, w: 316, h: 236 };
        text(g, FR.x + FR.w / 2, 40, L.view, { size: 18, fill: body, weight: 600 });
        kit.svg("rect", { x: FR.x, y: FR.y, width: FR.w, height: FR.h, fill: rule, "fill-opacity": 0.35, stroke: mute, "stroke-width": 1.2 }, g);
        const S = 92, P = [0.3, 0.38];
        const poses = [0, 1, 2].map((n) => ({ cx: 92 + n * 80, cy: 176 - n * 6, rot: n * 6 }));
        const pt = (q) => {
          const a = (q.rot * Math.PI) / 180, dx = (P[0] - 0.5) * S, dy = (P[1] - 0.5) * S;
          return [q.cx + dx * Math.cos(a) - dy * Math.sin(a), q.cy + dx * Math.sin(a) + dy * Math.cos(a)];
        };
        poses.forEach((q, n) => {
          const vis = kit.easeOut(seg01(t, n * 0.25, n * 0.25 + 0.35));
          const last = n === 2;
          kit.svg("rect", {
            x: q.cx - S / 2, y: q.cy - S / 2, width: S, height: S,
            transform: `rotate(${q.rot} ${q.cx} ${q.cy})`,
            fill: last ? accent : "none", "fill-opacity": 0.12, stroke: last ? accent : mute,
            "stroke-width": last ? 2.5 : 1.6, "stroke-dasharray": last ? "none" : "6 5", opacity: vis,
          }, g);
          const p = pt(q);
          kit.svg("circle", { cx: p[0], cy: p[1], r: 5, fill: MOTION, opacity: vis }, g);
          const above = n === 0;
          text(g, p[0], p[1] + (above ? -14 : 30), ["(f", { sub: String(n + 1) }, ", g", { sub: String(n + 1) }, ")"], { size: 17, fill: MOTION, opacity: vis });
          if (n > 0) arrow(g, pt(poses[n - 1]), [p[0] - 7, p[1] + 0.5], { stroke: MOTION, w: 1.8, head: 8, opacity: vis });
        });
        const v = kit.easeOut(seg01(t, 0.55, 1));
        text(g, 370, 120, L.track, { size: 20, anchor: "start", fill: accent, weight: 700, opacity: v });
        text(g, 370, 156, L.rt, { size: 18, anchor: "start", fill: body, opacity: v });
        text(g, 370, 214, [L.fg1, { sub: "n" }, L.fg2, { sub: "n" }, L.fg3], { size: 18, anchor: "start", fill: MOTION, opacity: v });
        text(g, 370, 242, L.fg4, { size: 18, anchor: "start", fill: MOTION, opacity: v });
        text(g, 370, 270, L.fg5, { size: 18, anchor: "start", fill: MOTION, opacity: v });
      }

      if (i === 3) {
        // three samples at known phases ϕ(h) + δ_k; one cosine A + B cos + C sin fitted through them
        const AX = { x0: 50, x1: 360, y0: 60, y1: 270 };
        line(g, [AX.x0, AX.y1], [AX.x1, AX.y1], { stroke: body, w: 1.4 });
        line(g, [AX.x0, AX.y1], [AX.x0, AX.y0 - 6], { stroke: body, w: 1.4 });
        text(g, AX.x0 - 10, AX.y0 + 8, ["I", { sub: "m" }], { size: 19, anchor: "end", fill: body });
        text(g, (AX.x0 + AX.x1) / 2, AX.y1 + 34, [L.axis, { sub: "k" }], { size: 19, fill: body });
        const A0 = 0.5, Bc = 0.22, Cc = -0.26; // illustrative values
        const X = (u) => AX.x0 + 12 + (u / (2 * Math.PI)) * (AX.x1 - AX.x0 - 24);
        const Y = (v) => AX.y1 - 10 - v * (AX.y1 - AX.y0 - 20);
        const f = (u) => A0 + Bc * Math.cos(u) + Cc * Math.sin(u);
        const fit = kit.easeOut(seg01(t, 0.3, 1));
        const pts = [];
        for (let j = 0; j <= 60 * fit; j++) { const u = (j / 60) * 2 * Math.PI; pts.push([X(u), Y(f(u))]); }
        if (pts.length > 1) kit.svg("path", { d: path(pts), fill: "none", stroke: accent, "stroke-width": 3, "stroke-linecap": "round" }, g);
        const samples = [
          { u: 0.7, lab: "11", dy: -16 }, { u: 1.55, lab: "12", dy: 32 }, { u: 1.05 + (2 * Math.PI) / 3, lab: "21", dy: -16 },
        ];
        samples.forEach((q, k) => {
          const vis = kit.easeOut(seg01(t, k * 0.12, k * 0.12 + 0.3));
          const p = [X(q.u), Y(f(q.u))];
          line(g, [p[0], AX.y1], p, { stroke: mute, w: 1.2, dash: "4 4", opacity: vis });
          kit.svg("circle", { cx: p[0], cy: p[1], r: 7, fill: CAP, stroke: ink, "stroke-width": 1.4, opacity: vis }, g);
          text(g, p[0], p[1] + q.dy, ["I", { sub: q.lab }], { size: 18, fill: ink, opacity: vis });
        });
        const v = kit.easeOut(seg01(t, 0.5, 1));
        text(g, 390, 92, [L.threeImg], { size: 18, anchor: "start", fill: body, opacity: v });
        text(g, 390, 120, ["I", { sub: "11" }, ", I", { sub: "12" }, ", I", { sub: "21" }], { size: 18, anchor: "start", fill: body, opacity: v });
        text(g, 390, 170, L.perPixel, { size: 18, anchor: "start", fill: body, weight: 600, opacity: v });
        text(g, 390, 200, L.dxe, { size: 18, anchor: "start", fill: body, opacity: v });
        const w = kit.easeOut(seg01(t, 0.75, 1));
        text(g, 390, 262, [L.phase, { sup: "−1" }, L.phaseTail], { size: 22, anchor: "start", fill: accent, weight: 700, opacity: w });
      }

      if (i === 4) {
        // same projection slots: traditional PSP gets one frame from three projections,
        // double sampling slides a window of three consecutive images (Fig. 2 of the paper)
        const SX = 60, SW = 140;
        for (let k = 0; k < 4; k++) {
          const x = SX + k * SW;
          text(g, x + SW / 2, 30, ["I", { sub: String((k % 3) + 1) }], { size: 19, fill: body, weight: 600 });
          if (k > 0) line(g, [x, 40], [x, 240], { stroke: rule, w: 1.5 });
        }
        const thumb = (x, y, w, h, ph) => {
          kit.svg("rect", { x, y, width: w, height: h, fill: bg, stroke: mute, "stroke-width": 1 }, g);
          fringes(g, x, y, x + w, y + h, 10, ph, ink);
        };
        text(g, SX, 56, L.trad, { size: 17, anchor: "start", fill: body, weight: 600 });
        for (let k = 0; k < 4; k++) thumb(SX + k * SW + 40, 66, 60, 38, (k % 3) * (2 * Math.PI) / 3);
        line(g, [SX + 70, 110], [SX + 70, 120], { stroke: body, w: 1.5 });
        line(g, [SX + 70, 120], [SX + 2 * SW + 70, 120], { stroke: body, w: 1.5 });
        line(g, [SX + 2 * SW + 70, 110], [SX + 2 * SW + 70, 120], { stroke: body, w: 1.5 });
        text(g, SX + SW + 70, 144, frameLabel(1), { size: 17, fill: accent, weight: 600 });

        text(g, SX, 176, L.dbl, { size: 17, anchor: "start", fill: body, weight: 600 });
        const cx = [];
        for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) {
          const x = SX + k * SW + 10 + j * 66;
          thumb(x, 188, 54, 38, (k % 3) * (2 * Math.PI) / 3 + j * 0.9);
          cx.push(x + 27);
        }
        const pos = e * 5; // window start index 0 … 5
        const w0 = Math.floor(pos + 1e-6);
        const at = (u) => { const a = Math.min(Math.floor(u), cx.length - 2); return cx[a] + (cx[a + 1] - cx[a]) * (u - a); };
        const wl = at(pos) - 31, wr = at(pos + 2) + 31;
        kit.svg("rect", { x: wl, y: 182, width: wr - wl, height: 50, rx: 6, fill: "none", stroke: accent, "stroke-width": 3 }, g);
        for (let k = 0; k <= Math.min(5, w0); k++) {
          text(g, cx[k + 1], k % 2 ? 286 : 260, frameLabel(k + 1), { size: 16, fill: accent, weight: 600 });
        }
        text(g, 320, 332, L.every3, { size: 19, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.5, 1)) });
      }
    },
  });
}
