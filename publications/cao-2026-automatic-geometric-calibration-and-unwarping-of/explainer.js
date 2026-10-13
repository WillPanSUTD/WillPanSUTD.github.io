// Rotating line-scan calibration schematic:
// a plate with round holes turns under a fixed scan line -> each image row is one angle step, so the
// holes come out as ellipses -> fit an ellipse to every hole -> regress aspect ratio against the
// horizontal centre position; the line reaches zero at the rotation centre x_c (outside the image) ->
// polar-to-Cartesian unwarping turns the ellipses back into circles.
// Geometry is exact for this toy model: a hole at polar (R, phi) maps to image column ~ R and row ~ phi.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The calibration plate turns on a rotary stage under a fixed scan line. Each scan line becomes one image row, so the rows record angle and the columns record distance from the rotation centre.",
        "In the image, the round holes come out as ellipses. Holes nearer the rotation centre come out taller, holes farther away flatter. Here, as in the paper's experiment, the rotation centre lies outside the image.",
        "An ellipse is fitted to every hole, and its centre and aspect ratio ρ (the ratio of its two semi-axes) are recorded. Ellipses with large residuals or implausible aspect ratios are discarded.",
        "The aspect ratio grows almost linearly with the ellipse's horizontal position. Robust line fitting sets outliers aside, and the point where the line reaches zero is the rotation centre. A second regression on the vertical positions of the centres gives the angular sampling rate k.",
        "With the rotation centre and k known, every pixel is mapped from polar back to Cartesian coordinates. The ellipses become circles again, and the same mapping corrects the 3D height map.",
      ],
      top: "top view", image: "image", scan: "scan line", centre: "rotation centre",
      rows: "row = angle step", cols: "column = distance",
      tall: "near: taller", flat: "far: flatter", xc: "x", off: "outside the image",
      ratio: "ρ = r", fit: "avg. fit error 0.42 px",
      axisX: "ellipse centre, column", axisY: "ρ", edge: "image edge",
      stat1: "x", stat1b: " = −516.76 px", stat2: "R", stat2b: " = 0.998", stat3: "k = 0.00402 rad/pixel",
      polar: "polar → Cartesian", eps: "circularity error ε (mean): 0.21 → 0.02", same: "same mapping for 2D and 3D",
    },
    zh: {
      steps: [
        "标定板随旋转台转动，从固定的扫描线下方经过。每条扫描线构成图像的一行，因此行对应转角，列对应到旋转中心的距离。",
        "在图像中，圆孔成像为椭圆：离旋转中心越近的孔越瘦高，越远越扁平。与论文实验一样，此处旋转中心位于图像之外。",
        "对每个孔拟合椭圆，记录其中心位置和长宽比 ρ（两个半轴之比）。残差过大或长宽比不合理的椭圆被剔除。",
        "长宽比随椭圆中心的水平位置近似线性增大。稳健直线拟合排除离群点，直线外推到零的位置即旋转中心；再对各中心的竖直位置做一次回归，得到角采样率 k。",
        "得到旋转中心和 k 后，把每个像素从极坐标映射回笛卡尔坐标，椭圆恢复为圆；同一映射也用于校正三维高度图。",
      ],
      top: "俯视图", image: "图像", scan: "扫描线", centre: "旋转中心",
      rows: "行 = 角度步进", cols: "列 = 距离",
      tall: "近：瘦高", flat: "远：扁平", xc: "x", off: "位于图像之外",
      ratio: "ρ = r", fit: "平均拟合误差 0.42 px",
      axisX: "椭圆中心所在列", axisY: "ρ", edge: "图像边缘",
      stat1: "x", stat1b: " = −516.76 px", stat2: "R", stat2b: " = 0.998", stat3: "k = 0.00402 rad/pixel",
      polar: "极坐标 → 笛卡尔坐标", eps: "圆度误差 ε（均值）：0.21 → 0.02", same: "二维、三维共用同一映射",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colour: outlier ellipse measurements set aside by the robust line fit.
  const OUT = "#d64545";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));

  const { text, line, arrow } = kit.pen({ textSize: 21, stroke: body });
  // Text followed by a real subscript and an optional tail, e.g. x + "c" + " = …".
  const subText = (parent, x, y, head, sub, tail, o = {}) => {
    const n = text(parent, x, y, head, o);
    const s = kit.svg("tspan", { "baseline-shift": o.sup ? "super" : "sub", "font-size": Math.max(14, (o.size || 21) * 0.72) }, n);
    s.textContent = sub;
    if (tail) {
      const t = kit.svg("tspan", {}, n);
      t.textContent = tail;
    }
    return n;
  };
  const poly = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L") + "Z";

  // --- World model (plate units; rotation centre at the origin) ---
  const HOLE_R = 0.17;
  const PLATE = { x0: 1.5, x1: 5.1, y0: -1.45, y1: 1.45 };
  const HOLES = [];
  for (let i = 0; i < 5; i++) for (const j of [-1.5, -0.5, 0.5, 1.5]) HOLES.push([1.9 + i * 0.7, j * 0.7]);
  const R_MIN = 1.5, R_MAX = 5.2, TH = 0.62; // image covers r in [R_MIN, R_MAX], angle in [-TH, TH]
  const circle = (c, r, n = 28) => Array.from({ length: n }, (_, k) => {
    const a = (k / n) * 2 * Math.PI;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  });
  const polar = (p) => [Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0])];
  // Sector-scan image of a world point inside box {x, y, w, h}: column ~ r, row ~ angle.
  const toImage = (p, box) => {
    const [r, phi] = polar(p);
    return [box.x + ((r - R_MIN) / (R_MAX - R_MIN)) * box.w, box.y + box.h / 2 - (phi / TH) * (box.h / 2)];
  };
  // Aspect ratio of a hole's image in a box (exact for the linear sector map): rho = R * Sx / Sy.
  const rhoOf = (c, box) => polar(c)[0] * (box.w / (R_MAX - R_MIN)) / (box.h / (2 * TH));

  const BIG = { x: 140, y: 34, w: 360, h: 282 }; // image box for steps 2-3 and the start of step 5
  const BAD = 13; // index of the hole whose ellipse fit is corrupted (an outlier in the regression)
  const NEAR = 1, FAR = 18; // holes used for the near / far call-outs

  const imageFrame = (g, box) => kit.svg("rect", {
    x: box.x, y: box.y, width: box.w, height: box.h, fill: rule, "fill-opacity": 0.45, stroke: mute, "stroke-width": 1.2,
  }, g);
  const imageHoles = (g, box, o = {}) => HOLES.forEach((c, k) => {
    kit.svg("path", { d: poly(circle(c, HOLE_R).map((p) => toImage(p, box))), fill: ink, opacity: o.opacity ? o.opacity(k) : 1 }, g);
  });

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // left: top view, the plate rotates under the fixed scan line; right: the image fills row by row
        const O = [150, 196], S = 26;
        const alpha = -TH + 2 * TH * kit.easeOut(t);
        const rot = (p) => {
          const x = p[0] * Math.cos(alpha) - p[1] * Math.sin(alpha);
          const y = p[0] * Math.sin(alpha) + p[1] * Math.cos(alpha);
          return [O[0] + x * S, O[1] - y * S];
        };
        kit.svg("circle", { cx: O[0], cy: O[1], r: 5.5 * S, fill: "none", stroke: mute, "stroke-width": 1.5 }, g);
        const P = PLATE;
        kit.svg("path", { d: poly([[P.x0, P.y0], [P.x1, P.y0], [P.x1, P.y1], [P.x0, P.y1]].map(rot)), fill: rule, "fill-opacity": 0.6, stroke: body, "stroke-width": 1.4 }, g);
        HOLES.forEach((c) => { const q = rot(c); kit.svg("circle", { cx: q[0], cy: q[1], r: HOLE_R * S, fill: ink }, g); });
        kit.svg("circle", { cx: O[0], cy: O[1], r: 5, fill: ink }, g);
        text(g, O[0] - 12, O[1] + 7, L.centre, { size: 19, anchor: "end", fill: body });
        line(g, [O[0] + R_MIN * S, O[1]], [O[0] + R_MAX * S, O[1]], { stroke: accent, w: 4 });
        // rotation arrow (counter-clockwise on screen)
        const ra = 5.5 * S + 12;
        const a0 = 0.95, a1 = 1.55;
        kit.svg("path", {
          d: `M${O[0] + ra * Math.cos(a0)},${O[1] - ra * Math.sin(a0)} A${ra},${ra} 0 0 0 ${O[0] + ra * Math.cos(a1)},${O[1] - ra * Math.sin(a1)}`,
          fill: "none", stroke: body, "stroke-width": 1.6,
        }, g);
        arrow(g, [O[0] + ra * Math.cos(a1 - 0.08), O[1] - ra * Math.sin(a1 - 0.08)], [O[0] + ra * Math.cos(a1), O[1] - ra * Math.sin(a1)], { stroke: body, w: 1.6 });
        text(g, 300, 352, L.scan, { size: 20, fill: accent, weight: 600, anchor: "end" });
        line(g, [262, 333], [O[0] + 4.4 * S, O[1] + 6], { stroke: accent, w: 1.2, opacity: 0.8 });
        text(g, 70, 26, L.top, { size: 21, fill: body, weight: 600 });

        // image panel
        const box = { x: 352, y: 46, w: 270, h: 260 };
        text(g, box.x + box.w / 2, 30, L.image, { size: 21, fill: body, weight: 600 });
        imageFrame(g, box);
        const defs = kit.svg("defs", {}, s);
        const cp = kit.svg("clipPath", { id: "cao-rows" }, defs);
        const yNow = box.y + box.h / 2 + (alpha / TH) * (box.h / 2);
        kit.svg("rect", { x: box.x, y: box.y, width: box.w, height: Math.max(0, yNow - box.y) }, cp);
        imageHoles(kit.svg("g", { "clip-path": "url(#cao-rows)" }, g), box);
        line(g, [box.x, yNow], [box.x + box.w, yNow], { stroke: accent, w: 3 });
        text(g, box.x + box.w / 2, 330, L.rows, { size: 19, fill: body });
        text(g, box.x + box.w / 2, 354, L.cols, { size: 19, fill: body });
      }

      if (i === 1 || i === 2) {
        const box = BIG;
        imageFrame(g, box);
        const pulse = kit.easeOut(seg01(t, 0, 0.6));
        imageHoles(g, box);

        if (i === 1) {
          // near / far call-outs and the rotation centre off to the left
          for (const [k, lab, dx] of [[NEAR, L.tall, -1], [FAR, L.flat, 1]]) {
            const c = toImage(HOLES[k], box);
            kit.svg("ellipse", {
              cx: c[0], cy: c[1], rx: 32, ry: 30, fill: "none", stroke: accent, "stroke-width": 2.2, opacity: pulse,
            }, g);
            const lx = dx < 0 ? box.x - 14 : box.x + box.w + 14;
            line(g, [c[0] + dx * 32, c[1]], [lx, c[1]], { stroke: accent, w: 1.4, opacity: pulse });
            text(g, lx + dx * 6, c[1] + 7, lab, { size: 20, anchor: dx < 0 ? "end" : "start", fill: accent, weight: 600, opacity: pulse });
          }
          const v = kit.easeOut(seg01(t, 0.4, 1));
          arrow(g, [box.x - 6, 340], [box.x - 6 - 110 * v, 340], { stroke: body, w: 1.6, dash: "6 5", opacity: v });
          subText(g, box.x + 4, 347, L.xc, "c", ": " + L.off, { size: 20, anchor: "start", fill: body, italic: false, opacity: v });
        } else {
          // ellipse fits appear left to right; one fit is pulled off by a reflection
          const order = HOLES.map((c, k) => [toImage(c, box)[0], k]).sort((a, b) => a[0] - b[0]);
          order.forEach(([, k], n) => {
            const v = kit.easeOut(seg01(t, (n / HOLES.length) * 0.6, (n / HOLES.length) * 0.6 + 0.25));
            if (v <= 0) return;
            const c = toImage(HOLES[k], box);
            const pts = circle(HOLES[k], HOLE_R).map((p) => toImage(p, box));
            const rx = (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) / 2;
            const ry = (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) / 2;
            const bad = k === BAD; // fit pulled off by a reflection on the edge
            kit.svg("ellipse", {
              cx: c[0] + (bad ? 6 : 0), cy: c[1] - (bad ? 4 : 0), rx: rx + (bad ? 8 : 3), ry: ry + (bad ? 6 : 3),
              fill: "none", stroke: accent, "stroke-width": 2, opacity: v,
            }, g);
            line(g, [c[0] - 4, c[1]], [c[0] + 4, c[1]], { stroke: bg, w: 1.6, opacity: v });
            line(g, [c[0], c[1] - 4], [c[0], c[1] + 4], { stroke: bg, w: 1.6, opacity: v });
          });
          // the corrupted hole: a bright reflection eats part of its edge
          const cb = toImage(HOLES[BAD], box);
          kit.svg("circle", { cx: cb[0] + 9, cy: cb[1] - 6, r: 8, fill: rule }, g);
          // rho = r_x / r_y label with a leader to the far hole
          const f = toImage(HOLES[FAR], box);
          const pts = circle(HOLES[FAR], HOLE_R).map((p) => toImage(p, box));
          const rx = (Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]))) / 2;
          const va = kit.easeOut(seg01(t, 0.5, 0.9));
          line(g, [f[0] + rx + 4, f[1] - 4], [box.x + box.w + 8, f[1] - 26], { stroke: body, w: 1.2, opacity: va });
          const lab = subText(g, box.x + box.w + 12, f[1] - 22, L.ratio, "x", " / r", { size: 20, anchor: "start", fill: body, opacity: va });
          const sy = kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, 20 * 0.72) }, lab);
          sy.textContent = "y";
          text(g, 320, 350, L.fit, { size: 20, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.75, 1)) });
        }
      }

      if (i === 3) {
        // aspect ratio vs ellipse centre column; extrapolate to rho = 0 -> rotation centre x_c
        const box = BIG;
        const PX0 = 86, PX1 = 612, PY0 = 296, PY1 = 70;
        const RHO_MAX = 2.4;
        const sx = box.w / (R_MAX - R_MIN);
        const colOf = (r) => (r - R_MIN) * sx; // ellipse centre column (0 at the image edge)
        const C_LO = colOf(-0.35), C_HI = colOf(R_MAX);
        const X = (c) => PX0 + ((c - C_LO) / (C_HI - C_LO)) * (PX1 - PX0);
        const Y = (rho) => PY0 - (rho / RHO_MAX) * (PY0 - PY1);
        line(g, [PX0, PY0], [PX1, PY0], { stroke: body, w: 1.4 });
        line(g, [PX0, PY0], [PX0, PY1 - 14], { stroke: body, w: 1.4 });
        text(g, PX0 - 14, PY1, L.axisY, { size: 22, fill: body, italic: true });
        text(g, (PX0 + PX1) / 2 + 60, PY0 + 50, L.axisX, { size: 19, fill: body });
        // image edge (column 0)
        line(g, [X(0), PY0], [X(0), 118], { stroke: mute, w: 1.2, dash: "5 5" }); // stops below the stats
        text(g, X(0) + 6, PY0 + 26, L.edge, { size: 18, anchor: "start", fill: mute });
        const r = kit.rng(5);
        const pts = HOLES.map((c, k) => {
          // small deterministic measurement noise on both coordinates
          const rho = rhoOf(c, box) * (1 + (r() - 0.5) * 0.06);
          const col = colOf(polar(c)[0]) + (r() - 0.5) * 16;
          return [col, k === BAD ? rho + 0.55 : rho, k === BAD];
        });
        const vp = kit.easeOut(seg01(t, 0, 0.3));
        pts.forEach(([c, rho, bad]) => {
          kit.svg("circle", { cx: X(c), cy: Y(rho), r: 5.5, fill: bad ? OUT : accent, opacity: vp }, g);
        });
        const vo = kit.easeOut(seg01(t, 0.25, 0.45));
        const ob = pts.find((p) => p[2]);
        line(g, [X(ob[0]) - 7, Y(ob[1]) - 7], [X(ob[0]) + 7, Y(ob[1]) + 7], { stroke: OUT, w: 2, opacity: vo });
        line(g, [X(ob[0]) - 7, Y(ob[1]) + 7], [X(ob[0]) + 7, Y(ob[1]) - 7], { stroke: OUT, w: 2, opacity: vo });
        // least-squares line through the inliers, drawn from the right and extended to rho = 0
        const inl = pts.filter((p) => !p[2]);
        const mx = inl.reduce((a, p) => a + p[0], 0) / inl.length;
        const my = inl.reduce((a, p) => a + p[1], 0) / inl.length;
        const a = inl.reduce((acc, p) => acc + (p[0] - mx) * (p[1] - my), 0) / inl.reduce((acc, p) => acc + (p[0] - mx) ** 2, 0);
        const b = my - a * mx;
        const xc = -b / a;
        const vl = kit.easeOut(seg01(t, 0.4, 1));
        const cEnd = C_HI - (C_HI - xc) * vl;
        line(g, [X(C_HI), Y(a * C_HI + b)], [X(cEnd), Y(a * cEnd + b)], { stroke: ink, w: 2 });
        const vx = kit.easeOut(seg01(t, 0.85, 1));
        kit.svg("circle", { cx: X(xc), cy: PY0, r: 7, fill: "none", stroke: accent, "stroke-width": 2.5, opacity: vx }, g);
        subText(g, X(xc), PY0 + 28, "x", "c", "", { size: 22, fill: accent, weight: 600, opacity: vx });
        // headline numbers from the paper (Sec. 4.4)
        const vs = kit.easeOut(seg01(t, 0.6, 1));
        subText(g, 120, 40, L.stat1, "c", L.stat1b, { size: 21, anchor: "start", fill: accent, weight: 600, opacity: vs });
        subText(g, 120, 74, L.stat2, "2", L.stat2b, { size: 20, anchor: "start", fill: body, opacity: vs, sup: true });
        text(g, 120, 102, L.stat3, { size: 20, anchor: "start", fill: body, opacity: vs });
      }

      if (i === 4) {
        // polar -> Cartesian: every hole outline moves from its image position to its true position
        const m = kit.easeOut(seg01(t, 0, 0.75));
        const S = 62, O = [70, 182];
        const toCart = (p) => [O[0] + p[0] * S, O[1] - p[1] * S];
        const lerp = (p, q) => [p[0] + (q[0] - p[0]) * m, p[1] + (q[1] - p[1]) * m];
        // image frame fades out, rotation centre and radial guides fade in
        kit.svg("rect", {
          x: BIG.x, y: BIG.y, width: BIG.w, height: BIG.h, fill: rule, "fill-opacity": 0.45 * (1 - m), stroke: mute, "stroke-width": 1.2, opacity: 1 - m,
        }, g);
        const P = PLATE;
        kit.svg("path", {
          d: poly([[P.x0, P.y0], [P.x1, P.y0], [P.x1, P.y1], [P.x0, P.y1]].map(toCart)), fill: rule, "fill-opacity": 0.6, stroke: body, "stroke-width": 1.4, opacity: m,
        }, g);
        for (const a of [-TH, TH]) {
          line(g, O, [O[0] + 240 * Math.cos(a), O[1] - 240 * Math.sin(a)], { stroke: mute, w: 1.2, dash: "5 5", opacity: m });
        }
        HOLES.forEach((c) => {
          const ring = circle(c, HOLE_R);
          kit.svg("path", { d: poly(ring.map((p) => lerp(toImage(p, BIG), toCart(p)))), fill: ink }, g);
        });
        kit.svg("circle", { cx: O[0], cy: O[1], r: 5, fill: accent, opacity: m }, g);
        subText(g, O[0], O[1] + 30, "x", "c", "", { size: 21, fill: accent, weight: 600, opacity: m });
        const v = kit.easeOut(seg01(t, 0.7, 1));
        text(g, 620, 40, L.polar, { size: 21, anchor: "end", fill: body, weight: 600 });
        text(g, 620, 318, L.eps, { size: 20, anchor: "end", fill: accent, weight: 600, opacity: v });
        text(g, 620, 346, L.same, { size: 19, anchor: "end", fill: body, opacity: v });
      }
    },
  });
}
