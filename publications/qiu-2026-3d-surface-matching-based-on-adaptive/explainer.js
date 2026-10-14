// Schematic of the pipeline in the paper (Fig. 1): model point cloud -> depth map -> curvature map ->
// adaptive threshold beta = mu + K*sigma, K adjusted by 1% per iteration until the high-curvature share is
// within the target range -> IVD correspondences -> SVD coarse pose -> ICP fine matching.
// The workpiece shape is a generic stand-in.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The model point cloud is converted into a depth map. For every pixel, the average curvature of a quadratic surface fitted to its neighbourhood becomes the value of the curvature map.",
        "A histogram of the curvature values gives a target share of high-curvature points (upper percentile). The threshold is β = mean + K × standard deviation; K is raised or lowered by 1% per iteration until the share falls inside the target range. The points above it are kept.",
        "For each point, the integral volume descriptor (IVD) is the volume of a sphere around it that lies inside the surface. Model and scene points with similar IVD and position form preliminary correspondences.",
        "Singular value decomposition (SVD) of the covariance of the corresponding points gives the approximate pose of the target in the scene point cloud.",
        "Starting from that pose, ICP iteratively minimises the squared distances to the scene until the objective barely changes, giving the fine surface matching.",
      ],
      cloud: "Model point cloud", depth: "Depth map", curv: "Curvature map",
      thr: "Adaptive threshold", iter: "K changes by 1% per iteration", kept: "Feature points kept",
      axis: "curvature", removed: "redundant", low: "low", high: "high",
      model: "Model features", scene: "Scene point cloud",
      ivdT: "Integral volume descriptor", ivdV: "volume inside the surface", corr: "similar IVD = correspondence", sphere: "sphere radius r",
      coarse: "Coarse matching", desc: "SVD of the point pairs", approx: "approximate pose",
      fine: "Fine matching: ICP", done: "aligned",
    },
    zh: {
      steps: [
        "将模型点云转换为深度图；对每个像素，用邻域拟合二次曲面得到的平均曲率作为曲率图的像素值。",
        "对曲率值做直方图，据此设定高曲率点所占的目标比例（上分位）。阈值为 β = 均值 + K × 标准差；每次迭代将 K 增大或减小 1%，直到高曲率比例落入目标范围，保留高于阈值的点。",
        "对每个点，积分体积描述子（IVD）是以该点为球心的球体落在曲面内部的体积；IVD 与位置相近的模型点和场景点构成初步对应关系。",
        "对对应点的协方差做奇异值分解（SVD），得到目标在场景点云中的大致位姿。",
        "以该位姿为起点，ICP 迭代最小化与场景点的距离平方，直到目标函数变化很小，完成曲面精匹配。",
      ],
      cloud: "模型点云", depth: "深度图", curv: "曲率图",
      thr: "自适应阈值", iter: "每次迭代 K 变化 1%", kept: "保留的特征点",
      axis: "曲率", removed: "冗余", low: "低", high: "高",
      model: "模型特征点", scene: "场景点云",
      ivdT: "积分体积描述子", ivdV: "曲面内部的体积", corr: "IVD 相近即为对应", sphere: "球半径 r",
      coarse: "粗匹配", desc: "对应点对的 SVD", approx: "大致位姿",
      fine: "精匹配：ICP", done: "已对齐",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });

  // --- Generic workpiece on a 24 x 18 grid: plate (h=1), raised boss (h=2), through hole, cut corner ---
  const NX = 24, NY = 18;
  const H = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      let h = 0;
      if (i >= 3 && i <= 20 && j >= 3 && j <= 14) h = 1;
      if (i <= 7 && j <= 6) h = 0;                                   // cut corner
      if (i >= 6 && i <= 11 && j >= 9 && j <= 12) h = 2;               // boss
      if (Math.hypot(i - 15.5, j - 8.5) < 2.9) h = 0;                // hole
      H.push(h);
    }
  }
  const hAt = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY ? 0 : H[j * NX + i]);
  const cells = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const h = hAt(i, j);
      const c = [[1, 0], [-1, 0], [0, 1], [0, -1]].reduce((s, [di, dj]) => s + Math.abs(h - hAt(i + di, j + dj)), 0);
      cells.push({ i, j, h, c });
    }
  }
  const part = cells.filter((p) => p.h > 0);                         // model point cloud
  const T_FINAL = 0.5;                                               // converged threshold (schematic)
  const keep = part.filter((p) => p.c > T_FINAL);                    // high-curvature feature points
  const cMax = Math.max(...part.map((p) => p.c));

  // Deterministic jitter per point
  const rnd = kit.rng(11);
  part.forEach((p) => { p.jx = (rnd() - 0.5) * 2.2; p.jy = (rnd() - 0.5) * 2.2; });

  // Grid placement: cell size s, centre (cx, cy), rotation a (deg)
  const place = (p, P) => {
    const r = (P.a * Math.PI) / 180;
    const dx = (p.i - (NX - 1) / 2) * P.s + (p.jx || 0) * (P.s / 10);
    const dy = (p.j - (NY - 1) / 2) * P.s + (p.jy || 0) * (P.s / 10);
    return [P.cx + dx * Math.cos(r) - dy * Math.sin(r), P.cy + dx * Math.sin(r) + dy * Math.cos(r)];
  };
  const lerp = (A, B, u) => ({ cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u, s: A.s + (B.s - A.s) * u, a: A.a + (B.a - A.a) * u });

  // Panel layout for steps 1-2
  const PX = [110, 320, 530], PY = 190, CELL = 7;
  const panelBox = (g, cx, opacity = 1) =>
    kit.svg("rect", { x: cx - 90, y: PY - 69, width: 180, height: 138, rx: 4, fill: "none", stroke: rule, "stroke-width": 1.2, opacity }, g);
  const title = (g, x, str, o = {}) => text(g, x, 98, str, { weight: 600, ...o });

  // Oblique view of the model point cloud
  const drawCloud = (g, cx, opacity) => {
    for (const p of part) {
      const x = cx + (p.i - 11.5) * 6.4 - (p.j - 8.5) * 1.4 + p.jx * 0.7;
      const y = PY + 12 + (p.j - 8.5) * 5.4 - p.h * 11 + p.jy * 0.7;
      kit.svg("circle", { cx: x, cy: y, r: 1.9, fill: body, opacity: opacity * (0.5 + 0.2 * p.h) }, g);
    }
  };
  const drawDepth = (g, cx, opacity) => {
    const P = { cx, cy: PY, s: CELL, a: 0 };
    for (const p of cells) {
      const [x, y] = place({ i: p.i, j: p.j }, P);
      kit.svg("rect", { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, fill: p.h ? ink : bg, opacity: opacity * (p.h ? 0.25 + 0.3 * p.h : 1), stroke: p.h ? "none" : rule, "stroke-width": 0.4 }, g);
    }
  };
  const drawCurv = (g, cx, opacity) => {
    const P = { cx, cy: PY, s: CELL, a: 0 };
    for (const p of cells) {
      const [x, y] = place({ i: p.i, j: p.j }, P);
      kit.svg("rect", { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, fill: bg, stroke: rule, "stroke-width": 0.4, opacity }, g);
      if (p.h > 0 && p.c > 0) kit.svg("rect", { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, fill: accent, opacity: opacity * (0.3 + 0.7 * (p.c / cMax)) }, g);
      else if (p.h > 0) kit.svg("rect", { x: x - CELL / 2, y: y - CELL / 2, width: CELL, height: CELL, fill: mute, opacity: opacity * 0.35 }, g);
    }
  };

  // Scene: background plane points plus the workpiece surface, rotated
  const FINE = { cx: 470, cy: 220, s: 7, a: 28 };
  const COARSE = { cx: 484, cy: 206, s: 7, a: 17 };
  const START = { cx: 110, cy: 200, s: 7, a: 0 };
  const srnd = kit.rng(5);
  const bgPts = [];
  for (let y = 112; y <= 326; y += 13) {
    for (let x = 318; x <= 622; x += 13) bgPts.push([x + (srnd() - 0.5) * 6, y + (srnd() - 0.5) * 6]);
  }
  const drawScene = (g, opacity = 1) => {
    kit.svg("rect", { x: 306, y: 102, width: 326, height: 236, rx: 4, fill: "none", stroke: rule, "stroke-width": 1.2, opacity }, g);
    for (const [x, y] of bgPts) kit.svg("circle", { cx: x, cy: y, r: 1.8, fill: mute, opacity: opacity * 0.6 }, g);
    for (const p of part) {
      const [x, y] = place(p, FINE);
      kit.svg("circle", { cx: x, cy: y, r: 2, fill: body, opacity: opacity * (0.35 + 0.15 * p.h) }, g);
    }
  };
  const drawKeep = (g, P, opacity = 1, r = 2.6) => {
    for (const p of keep) {
      const [x, y] = place(p, P);
      kit.svg("circle", { cx: x, cy: y, r, fill: accent, opacity }, g);
    }
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
        const e2 = kit.easeOut(t * 2), e3 = kit.easeOut(t * 2 - 1);
        title(g, PX[0], L.cloud);
        drawCloud(g, PX[0], 1);
        title(g, PX[1], L.depth, { opacity: e2 });
        panelBox(g, PX[1], e2);
        drawDepth(g, PX[1], e2);
        title(g, PX[2], L.curv, { opacity: e3 });
        panelBox(g, PX[2], e3);
        drawCurv(g, PX[2], e3);
        arrow(g, [204, PY], [204 + 22 * e2, PY], { opacity: e2 });
        if (e3 > 0) arrow(g, [414, PY], [414 + 22 * e3, PY], { opacity: e3 });
        text(g, PX[2], 306, `${L.axis}: ${L.low} → ${L.high}`, { size: 15, fill: body, opacity: e3 });
        // small legend for curvature shading
        for (let k = 0; k < 4; k++) {
          kit.svg("rect", { x: PX[2] - 40 + k * 20, y: 274, width: 20, height: 12, fill: accent, opacity: e3 * (0.3 + 0.7 * ((k + 1) / 4)) }, g);
        }
      }

      if (i === 1) {
        title(g, PX[0], L.curv);
        panelBox(g, PX[0]);
        drawCurv(g, PX[0], 1);

        // Histogram of curvature values with an iterating threshold
        title(g, PX[1], L.thr);
        text(g, PX[1], 120, "β = μ + Kσ", { size: 17, fill: body, weight: 600 });
        const bins = [0, 1, 2, 3].map((v) => part.filter((p) => Math.min(p.c, 3) === v).length);
        const bx0 = PX[1] - 58, bw = 26, base = 262;
        const sc = (n) => Math.sqrt(n) * 7.5;
        const T0 = 2.5, Tu = T0 + (T_FINAL - T0) * e;                // threshold moves across iterations
        const xT = (v) => bx0 + (v + 0.5) * (bw + 4) - 2;
        bins.forEach((n, v) => {
          const hgt = sc(n);
          kit.svg("rect", { x: bx0 + v * (bw + 4), y: base - hgt, width: bw, height: hgt, fill: v > Tu ? accent : mute, opacity: 0.85 }, g);
        });
        line(g, [bx0 - 6, base], [bx0 + 4 * (bw + 4) + 2, base], { stroke: body, w: 1.2 });
        for (const v of [T0, 1.5]) {
          if (v > Tu + 0.01) line(g, [xT(v), 138], [xT(v), base], { stroke: mute, dash: "3 4", w: 1.2, opacity: 0.8 });
        }
        line(g, [xT(Tu), 134], [xT(Tu), base + 4], { stroke: ink, w: 2 });
        text(g, xT(Tu) + 14, 150, "β", { size: 17, italic: true, anchor: "start", weight: 600 });
        text(g, PX[1] + 46, 282, `${L.axis} →`, { size: 15, fill: body });
        text(g, PX[1], 318, L.iter, { size: 15, fill: body });
        text(g, bx0 + bw / 2 - 6, 288, L.removed, { size: 15, fill: body, opacity: e });

        // Retained feature points
        title(g, PX[2], L.kept);
        panelBox(g, PX[2]);
        const P = { cx: PX[2], cy: PY, s: CELL, a: 0 };
        for (const p of part) {
          const [x, y] = place({ i: p.i, j: p.j }, P);
          const isKeep = p.c > Tu;
          kit.svg("circle", { cx: x, cy: y, r: isKeep ? 2.6 : 1.8, fill: isKeep ? accent : mute, opacity: isKeep ? 1 : 0.6 }, g);
        }
        arrow(g, [204, PY], [226, PY], {});
        arrow(g, [414, PY], [436, PY], {});
      }

      if (i === 2) {
        // Cross-section: surface profile, sphere of radius r at P, voxels inside both
        const surf = (x) => 252 - 44 * Math.exp(-(((x - 170) / 58) ** 2));
        const PXc = 170, PYc = surf(170), R = 64;
        text(g, 170, 98, L.ivdT, { weight: 600 });
        const pts = [];
        for (let x = 40; x <= 300; x += 4) pts.push(`${x},${surf(x)}`);
        kit.svg("polygon", { points: `40,282 ${pts.join(" ")} 300,282`, fill: mute, opacity: 0.3 }, g);
        for (let gx = 110; gx < 230; gx += 8) {
          for (let gy = 146; gy < 280; gy += 8) {
            const cx = gx + 4, cy = gy + 4;
            if ([gx, gx + 8].every((vx) => [gy, gy + 8].every((vy) => Math.hypot(vx - PXc, vy - PYc) < R)) && cy > surf(cx)) {
              kit.svg("rect", { x: gx, y: gy, width: 8, height: 8, fill: accent, opacity: 0.55 * e, stroke: bg, "stroke-width": 0.5 }, g);
            }
          }
        }
        kit.svg("polyline", { points: pts.join(" "), fill: "none", stroke: body, "stroke-width": 1.8 }, g);
        kit.svg("circle", { cx: PXc, cy: PYc, r: R * e, fill: "none", stroke: ink, "stroke-width": 1.6, "stroke-dasharray": "5 4" }, g);
        kit.svg("circle", { cx: PXc, cy: PYc, r: 4, fill: ink }, g);
        text(g, PXc - 12, PYc - 12, "P", { size: 17, italic: true, weight: 600 });
        line(g, [PXc, PYc], [PXc + R * 0.8 * e, PYc - R * 0.6 * e], { stroke: ink, w: 1.2 });
        text(g, PXc + R * 0.8 + 10, PYc - R * 0.6 - 6, L.sphere, { size: 14, anchor: "start", opacity: e });
        text(g, 170, 316, L.ivdV, { size: 15, fill: body, opacity: e });

        // Correspondences between model feature points and scene points
        text(g, 392, 98, L.model, { weight: 600, size: 16 });
        text(g, 548, 98, L.scene, { weight: 600, size: 16 });
        const MP = { cx: 392, cy: 200, s: 5.2, a: 0 }, SP = { cx: 548, cy: 214, s: 5.2, a: 28 };
        for (const p of part) {
          const [x, y] = place(p, SP);
          kit.svg("circle", { cx: x, cy: y, r: 1.7, fill: mute, opacity: 0.7 }, g);
        }
        keep.forEach((p, k) => {
          const [x, y] = place(p, MP);
          if (k % 4 === 0) line(g, [x, y], place(p, SP), { stroke: accent, w: 1, opacity: 0.55 * e });
          kit.svg("circle", { cx: x, cy: y, r: 2.4, fill: accent }, g);
        });
        text(g, 470, 316, L.corr, { size: 15, fill: body, opacity: e });
      }

      if (i === 3) {
        text(g, 110, 98, L.model, { weight: 600, opacity: 1 - e });
        text(g, 469, 92, L.scene, { weight: 600 });
        drawScene(g);
        const P = lerp(START, COARSE, e);
        if (e < 0.98) {
          kit.svg("rect", { x: 20, y: 131, width: 180, height: 138, rx: 4, fill: "none", stroke: rule, "stroke-width": 1.2, opacity: 1 - e }, g);
        }
        drawKeep(g, P, 0.95);
        // Coarse-matching label block
        text(g, 140, 300, L.coarse, { weight: 600, opacity: e });
        text(g, 140, 324, L.desc, { size: 15, fill: body, opacity: e });
        if (e > 0.6) {
          const o = (e - 0.6) / 0.4;
          const [ax, ay] = place({ i: 20, j: 3 }, COARSE);
          line(g, [ax + 8, ay - 6], [592, 128], { stroke: mute, w: 1.2, opacity: o });
          text(g, 592, 122, L.approx, { size: 15, fill: accent, weight: 600, opacity: o, anchor: "end" });
        }
      }

      if (i === 4) {
        text(g, 469, 92, L.scene, { weight: 600 });
        drawScene(g);
        const P = lerp(COARSE, FINE, e);
        // closest-point pairs fade as the model converges
        if (e < 0.95) {
          keep.filter((_, k) => k % 3 === 0).forEach((p) => {
            line(g, place(p, P), place(p, FINE), { stroke: ink, w: 1.1, opacity: 0.7 * (1 - e) });
          });
        }
        drawKeep(g, P, 0.95);
        text(g, 140, 200, L.fine, { weight: 600 });
        // iteration ticks
        for (let k = 0; k < 4; k++) {
          kit.svg("circle", { cx: 104 + k * 24, cy: 226, r: 6, fill: k / 4 < e ? accent : "none", stroke: accent, "stroke-width": 1.4 }, g);
        }
        text(g, 140, 264, `✓ ${L.done}`, { size: 18, fill: accent, weight: 600, opacity: kit.easeOut(t * 1.5 - 0.5) });
      }
    },
  });
}
