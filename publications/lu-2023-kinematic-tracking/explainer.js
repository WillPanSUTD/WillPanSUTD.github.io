// Kinematic target sensing schematic: object moves under fixed fringes -> NCC correlation is robust
// to fringe lighting -> iterative (GRU) updates give dense optical flow -> RANSAC + iterative
// selection keeps accurate points and fits R, T -> motion-aware phase (Eqs. 7-11) reconstructs the surface.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Phase-shifting profilometry projects fixed fringes and captures several images. Here the object moves (2D rotation and translation) between captures, which breaks the static assumption.",
        "An improved RAFT network tracks the object in the fringe images themselves. Its correlation uses normalised cross-correlation (NCC) instead of a dot product, which normalises the local lighting changes caused by the fringes.",
        "Starting from zero, a GRU update block refines the flow over several iterations, giving a displacement for every pixel of the object.",
        "Not every flow vector is accurate. RANSAC removes obvious outliers; then R and T are fitted, points whose tracked position is more than a threshold (e.g. 0.5 px) from the position predicted by R, T are dropped, and the fit is repeated.",
        "The rotation matrix R and translation vector T describe the motion. They enter the phase calculation (Eqs. 7–11), and the moving surface is reconstructed.",
      ],
      f1: "Frame 1", f2: "Frame 2", fixed: "fringes fixed", moved: "object moved",
      raw: "fringe-lit features", ncc: "after NCC", a: "Frame 1", b: "Frame 2",
      flow: "dense optical flow", iters: "GRU iterations",
      keep: "kept", drop: "dropped", thr: "error < 0.5 px",
      rt: "R, T", phase: "phase, Eqs. (7)–(11)", surf: "surface",
    },
    zh: {
      steps: [
        "相移轮廓术投射固定的条纹并采集多幅图像。此处物体在两次采集之间发生了运动（二维旋转与平移），破坏了物体静止的前提。",
        "改进的 RAFT 网络直接在条纹图像上跟踪物体。其相关计算以归一化互相关（NCC）代替点积，对条纹造成的局部光照变化进行归一化。",
        "从零初始值出发，GRU 更新模块经过多次迭代逐步修正光流，为物体上的每个像素给出位移。",
        "并非每个光流向量都准确。RANSAC 先剔除明显的离群点；随后拟合 R 和 T，舍弃跟踪位置与由 R、T 预测的位置相距超过阈值（如 0.5 像素）的点，并重复拟合。",
        "旋转矩阵 R 与平移向量 T 描述了物体运动，将其代入相位计算（式 7–11），即可重建运动物体的表面。",
      ],
      f1: "第 1 帧", f2: "第 2 帧", fixed: "条纹固定", moved: "物体运动",
      raw: "条纹照明下的特征", ncc: "NCC 归一化后", a: "第 1 帧", b: "第 2 帧",
      flow: "稠密光流", iters: "GRU 迭代",
      keep: "保留", drop: "舍弃", thr: "误差 < 0.5 像素",
      rt: "R, T", phase: "相位计算（式 7–11）", surf: "表面",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  const BAD = "#c0392b"; // dropped / inaccurate flow
  const { text, line, arrow } = kit.pen({ textSize: 19, stroke: accent, width: 1.6 });

  // --- Deterministic geometry (built once) ---------------------------------------------------
  const W = 190, H = 76; // capsule-shaped object, local units
  const P1 = { cx: 235, cy: 205, a: 0 };
  const P2 = { cx: 395, cy: 180, a: -14 };
  const lerpPose = (A, B, u) => ({ cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u, a: A.a + (B.a - A.a) * u });
  const place = ([x, y], P) => {
    const r = (P.a * Math.PI) / 180;
    return [P.cx + x * Math.cos(r) - y * Math.sin(r), P.cy + x * Math.sin(r) + y * Math.cos(r)];
  };
  const rnd = kit.rng(23);
  const pts = [];
  for (let gx = -64; gx <= 64; gx += 32) {
    for (let gy = -20; gy <= 20; gy += 20) {
      const p = { x: gx + (rnd() - 0.5) * 8, y: gy + (rnd() - 0.5) * 6 };
      pts.push(p);
    }
  }
  const outIdx = new Set([1, 8, 12]);
  pts.forEach((p, k) => {
    const bad = outIdx.has(k);
    const m = bad ? 22 : 2;
    p.err = [(rnd() - 0.5) * 2 * m, (rnd() - 0.5) * 2 * m];
    p.bad = bad;
  });

  const capsulePath = (P) => {
    // sample the capsule outline in local coords and transform
    const out = [];
    const r = H / 2, half = W / 2 - r;
    for (let k = 0; k <= 16; k++) { const t = -Math.PI / 2 + (Math.PI * k) / 16; out.push([half + r * Math.cos(t), r * Math.sin(t)]); }
    for (let k = 0; k <= 16; k++) { const t = Math.PI / 2 + (Math.PI * k) / 16; out.push([-half + r * Math.cos(t), r * Math.sin(t)]); }
    return "M" + out.map((q) => place(q, P).map((v) => v.toFixed(1)).join(" ")).join(" L") + " Z";
  };

  const PERIOD = 26;
  const fringes = (g, x0, x1, y0, y1, opacity) => {
    for (let x = x0; x < x1; x += PERIOD) {
      kit.svg("rect", { x, y: y0, width: PERIOD / 2, height: y1 - y0, fill: mute, opacity }, g);
    }
  };
  let clipN = 0;
  const uid = `lu23kt-${Math.floor(rnd() * 1e6)}`;
  // Object lit by the (fixed) fringes: bright stripes clipped to the object outline.
  const litObject = (s, g, P, { opacity = 1, outline = ink, dash } = {}) => {
    const id = `${uid}-${clipN++}`;
    const defs = kit.svg("defs", {}, s);
    const cp = kit.svg("clipPath", { id }, defs);
    kit.svg("path", { d: capsulePath(P) }, cp);
    const og = kit.svg("g", { opacity }, g);
    kit.svg("path", { d: capsulePath(P), fill: bg }, og);
    const cg = kit.svg("g", { "clip-path": `url(#${id})` }, og);
    for (let x = 40; x < 620; x += PERIOD) kit.svg("rect", { x, y: 60, width: PERIOD / 2, height: 280, fill: body, opacity: 0.55 }, cg);
    kit.svg("path", { d: capsulePath(P), fill: "none", stroke: outline, "stroke-width": 1.8, ...(dash && { "stroke-dasharray": dash }) }, og);
  };
  const ghost = (g, P, opacity = 0.8) =>
    kit.svg("path", { d: capsulePath(P), fill: "none", stroke: body, "stroke-width": 1.5, "stroke-dasharray": "5 5", opacity }, g);

  const flowVec = (p) => {
    const a = place([p.x, p.y], P1);
    const b = place([p.x, p.y], P2);
    return [a, [b[0] + p.err[0], b[1] + p.err[1]]];
  };
  const partial = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      clipN = 0;
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        fringes(g, 40, 610, 70, 330, 0.18);
        ghost(g, P1);
        litObject(s, g, lerpPose(P1, P2, e));
        text(g, P1.cx, P1.cy + 70, L.f1, { fill: body });
        text(g, P2.cx, P2.cy - 64, L.f2, { opacity: e, weight: 600 });
        if (e > 0.05) arrow(g, [P1.cx + 20, P1.cy - 54], partial([P1.cx + 20, P1.cy - 54], [P2.cx - 70, P2.cy - 62], e), { w: 2 });
        text(g, 320, 44, `${L.fixed} · ${L.moved}`, { weight: 600 });
      }

      if (i === 1) {
        // Two feature responses along a line: different offset/contrast from fringe lighting.
        const box = (x0, title) => {
          kit.svg("rect", { x: x0, y: 80, width: 250, height: 190, rx: 6, fill: "none", stroke: mute, "stroke-width": 1.2 }, g);
          text(g, x0 + 125, 66, title, { weight: 600 });
        };
        box(40, L.raw);
        box(350, L.ncc);
        const curve = (x0, A, B, phase, colour, dash) => {
          const d = [];
          for (let k = 0; k <= 60; k++) {
            const u = k / 60;
            const y = 175 - (A + B * Math.sin(u * Math.PI * 4 + phase));
            d.push(`${(x0 + 15 + u * 220).toFixed(1)} ${y.toFixed(1)}`);
          }
          kit.svg("path", { d: "M" + d.join(" L"), fill: "none", stroke: colour, "stroke-width": 2.4, ...(dash && { "stroke-dasharray": dash }) }, g);
        };
        // raw: Frame 1 dim, Frame 2 brightened by a fringe
        curve(40, -30, 22, 0.3, body);
        curve(40, 40, 50, 0.3, accent, "7 5");
        // normalised: Frame 2 morphs onto Frame 1 shape
        curve(350, 0, 40, 0.3, body);
        curve(350, 40 * (1 - e), 40 + 10 * (1 - e), 0.3, accent, "7 5");
        arrow(g, [296, 175], [344, 175], { w: 2, opacity: e });
        text(g, 320, 160, "NCC", { size: 17, weight: 700, opacity: e });
        // legend
        line(g, [190, 312], [222, 312], { stroke: body, w: 2.4 });
        text(g, 230, 318, L.a, { anchor: "start", fill: body });
        line(g, [350, 312], [382, 312], { stroke: accent, w: 2.4, dash: "7 5" });
        text(g, 390, 318, L.b, { anchor: "start", fill: accent });
      }

      if (i === 2 || i === 3) {
        fringes(g, 40, 610, 70, 330, 0.12);
        ghost(g, P1, 0.7);
        litObject(s, g, P2, { opacity: 0.55 });
        const u = i === 2 ? e : 1;
        for (const p of pts) {
          const [a, b] = flowVec(p);
          let colour = accent, op = 0.9;
          if (i === 3) {
            if (p.bad) { colour = BAD; op = 0.9 - 0.3 * e; }
          }
          const dash = i === 3 && p.bad && e > 0.5 ? "5 4" : undefined;
          if (u > 0.04) arrow(g, a, partial(a, b, u), { stroke: colour, w: 1.5, opacity: op, head: 7, dash });
          kit.svg("circle", { cx: a[0], cy: a[1], r: 2.6, fill: colour, opacity: op }, g);
        }
        if (i === 2) {
          text(g, 320, 44, L.flow, { weight: 600 });
          // iteration dots
          const n = 5;
          text(g, 320, 312, L.iters, { anchor: "end", fill: body, size: 17 });
          for (let k = 0; k < n; k++) {
            const on = e * n > k + 0.2;
            kit.svg("circle", { cx: 340 + k * 22, cy: 306, r: 6, fill: on ? accent : "none", stroke: accent, "stroke-width": 1.4 }, g);
          }
        } else {
          text(g, 320, 44, L.thr, { weight: 600 });
          // legend
          kit.svg("circle", { cx: 230, cy: 312, r: 5, fill: accent }, g);
          text(g, 242, 318, L.keep, { anchor: "start", fill: accent });
          kit.svg("circle", { cx: 360, cy: 312, r: 5, fill: BAD }, g);
          text(g, 372, 318, L.drop, { anchor: "start", fill: BAD });
        }
      }

      if (i === 4) {
        // left: motion as R, T between the two poses
        const sc = 0.55;
        const sg = kit.svg("g", { transform: `translate(${130 * (1 - sc)} ${200 * (1 - sc)}) scale(${sc})` }, g);
        ghost(sg, { cx: 110, cy: 215, a: 0 }, 0.8);
        litObject(s, sg, { cx: 150, cy: 185, a: -14 });
        text(g, 130, 150, L.rt, { size: 22, weight: 700, fill: accent });
        arrow(g, [222, 200], [270, 200], { w: 2 });
        // middle: phase box
        kit.svg("rect", { x: 278, y: 168, width: 150, height: 64, rx: 6, fill: "none", stroke: accent, "stroke-width": 1.6 }, g);
        text(g, 353, 207, "Φ(x, y)", { size: 20, italic: true });
        text(g, 353, 260, L.phase, { size: 16, fill: body });
        arrow(g, [436, 200], [470, 200], { w: 2, opacity: e });
        // right: reconstructed surface profile (schematic height curve) grows with e
        const x0 = 482, x1 = 612, base = 250;
        line(g, [x0, base], [x1, base], { stroke: mute, w: 1.2 });
        const d = [];
        for (let k = 0; k <= 40; k++) {
          const u = k / 40;
          const h = (Math.sin(u * Math.PI) * 60 + Math.sin(u * Math.PI * 3) * 10) * e;
          d.push(`${(x0 + u * (x1 - x0)).toFixed(1)} ${(base - h).toFixed(1)}`);
        }
        kit.svg("path", { d: `M${x0} ${base} L` + d.join(" L") + ` L${x1} ${base} Z`, fill: accent, opacity: 0.15 }, g);
        kit.svg("path", { d: "M" + d.join(" L"), fill: "none", stroke: accent, "stroke-width": 2.4 }, g);
        text(g, (x0 + x1) / 2, 290, L.surf, { weight: 600, opacity: e });
      }
    },
  });
}
