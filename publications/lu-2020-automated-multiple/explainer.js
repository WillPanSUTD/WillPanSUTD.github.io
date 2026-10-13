// Multi-object PSP with individual movement (schematic):
// red fringes + colour camera -> red channel = fringes (phase), blue channel = fringe-free object image ->
// OTSU threshold, dilation, contours -> one bounding box per object ->
// KCF tracks each box into the next fringe image (objects move differently) ->
// SIFT matches inside each box, SVD gives R_k, t_k per object ->
// per-object least-squares phase with its own movement, repeated until the last object.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Red fringe patterns are projected and captured by a colour camera. The red channel keeps the fringes for phase retrieval; the blue channel gives a fringe-free object image for tracking.",
        "The objects are identified automatically in the blue image: OTSU thresholding separates them from the background, dilation merges parts that were split apart, and each contour gives a bounding box.",
        "Each object in its box is a template. KCF finds it in the next fringe image although every object moves differently, and the new box becomes the template for the following image.",
        "SIFT matches feature points between each object before and after movement. From these correspondences, SVD gives every object its own rotation matrix R and translation vector t.",
        "With its own R and t, each object's phase is solved by least squares from the red channel and the object is reconstructed, one object after another. Traditional PSP leaves motion errors.",
      ],
      captured: "captured image", red: "red: fringes → phase", blue: "blue: object image → tracking",
      otsu: "OTSU threshold", dilate: "dilation", boxes: "bounding boxes",
      gap: "objects must keep apart (dilation grows them)",
      before: "before movement", after: "next fringe image", kcf: "KCF",
      template: "new box = next template",
      obj: "object ", colon: ": ", svd: "SVD → R", tsep: ", t",
      trad: "traditional PSP", prop: "proposed (own R, t)",
      rmsT: "RMS 8.981 mm", rmsP: "RMS 0.0773 mm",
      ref: "reference: 6-step PSP of the static objects",
    },
    zh: {
      steps: [
        "投影红色条纹图并用彩色相机采集。红色分量保留条纹，用于相位求解；蓝色分量滤除了条纹，得到用于跟踪的纯物体图像。",
        "在蓝色分量图像中自动识别物体：OTSU 阈值分割把物体与背景分开，膨胀运算把被分割断开的部分重新连成一体，再由每个轮廓得到包围框。",
        "包围框内的物体作为模板，KCF 在下一幅条纹图中找到它的新位置，即使各物体的运动各不相同；新的包围框又作为后续图像的模板。",
        "SIFT 在每个物体运动前后的图像之间匹配特征点；由这些对应点，SVD 为每个物体分别求出旋转矩阵 R 和平移向量 t。",
        "利用各自的 R 和 t，从红色分量中以最小二乘求解每个物体的相位并完成重建，逐个物体依次进行。传统 PSP 的结果则带有运动误差。",
      ],
      captured: "采集图像", red: "红色分量：条纹 → 相位", blue: "蓝色分量：物体图像 → 跟踪",
      otsu: "OTSU 阈值分割", dilate: "膨胀", boxes: "包围框",
      gap: "物体之间需留有间距（膨胀会扩大物体）",
      before: "运动前", after: "下一幅条纹图", kcf: "KCF",
      template: "新包围框 = 下一模板",
      obj: "物体 ", colon: "：", svd: "SVD → R", tsep: "，t",
      trad: "传统 PSP", prop: "本文方法（各自的 R、t）",
      rmsT: "RMS 8.981 mm", rmsP: "RMS 0.0773 mm",
      ref: "参考：静止物体的 6 步 PSP 结果",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: red fringe light, blue channel image, and the second object.
  const RED = "#d64545";
  const BLUE = "#3b5bdb";
  const OBJ2 = "#d9822b";
  const OBJ_C = [accent, OBJ2];

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const lerp = (a, b, m) => a + (b - a) * m;
  const { line, arrow } = kit.pen({ stroke: body, head: 10 });

  // Text from parts: strings, or { sub: "…" } for a real subscript (>= 14 units).
  const tx = (parent, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      if (typeof p === "string") {
        kit.svg("tspan", {}, n).textContent = p;
      } else {
        const s = kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
        s.textContent = p.sub;
      }
    }
    return n;
  };

  // ---- Scene in frame units (240 x 180): two elongated objects, viewed from above ----
  const FW = 240, FH = 180;
  const OBJ = [{ w: 58, h: 118 }, { w: 62, h: 128 }];
  // Pose before and after movement: object 1 translates, object 2 rotates and translates.
  const POSE0 = [{ x: 72, y: 92, a: 0 }, { x: 168, y: 92, a: 0 }];
  const POSE1 = [{ x: 90, y: 80, a: 0 }, { x: 178, y: 100, a: 12 }];
  const poseAt = (k, m) => ({
    x: lerp(POSE0[k].x, POSE1[k].x, m), y: lerp(POSE0[k].y, POSE1[k].y, m), a: lerp(POSE0[k].a, POSE1[k].a, m),
  });
  const toFrame = (k, p, q) => {
    const r = (p.a * Math.PI) / 180;
    return [p.x + q[0] * Math.cos(r) - q[1] * Math.sin(r), p.y + q[0] * Math.sin(r) + q[1] * Math.cos(r)];
  };
  const bbox = (k, p, pad = 6) => {
    const { w, h } = OBJ[k];
    const cs = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map((q) => toFrame(k, p, q));
    const xs = cs.map((c) => c[0]), ys = cs.map((c) => c[1]);
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  };

  // Random geometry, built once: OTSU "holes" on each object and SIFT feature points (object coordinates).
  const rnd = kit.rng(20);
  const HOLES = OBJ.map(({ w, h }) => Array.from({ length: 9 }, () => [(rnd() - 0.5) * w * 0.8, (rnd() - 0.5) * h * 0.85, 2.5 + rnd() * 3.5]));
  const SPOTS = [[-0.25, -0.32], [0.2, -0.16], [-0.18, 0.04], [0.22, 0.18], [-0.05, 0.34]];
  const FEATS = OBJ.map(({ w, h }) => SPOTS.map(([u, v]) => [(u + (rnd() - 0.5) * 0.08) * w, (v + (rnd() - 0.5) * 0.06) * h]));

  let clipSeq = 0;
  const uid = () => `lu20-clip-${++clipSeq}`;

  // A panel: frame rectangle at (x, y) with scale s; returns the inner <g> in frame units.
  const panel = (g, x, y, s, o = {}) => {
    kit.svg("rect", {
      x, y, width: FW * s, height: FH * s, fill: o.fill ?? rule, "fill-opacity": o.fillOpacity ?? 0.4,
      stroke: mute, "stroke-width": 1.2,
    }, g);
    return kit.svg("g", { transform: `translate(${x},${y}) scale(${s})` }, g);
  };
  const objRect = (g, k, p, attrs) => kit.svg("rect", {
    x: -OBJ[k].w / 2, y: -OBJ[k].h / 2, width: OBJ[k].w, height: OBJ[k].h, rx: 18,
    transform: `translate(${p.x},${p.y}) rotate(${p.a})`, ...attrs,
  }, g);
  // Horizontal fringes (fixed to the projector, not the object) clipped to the objects.
  const fringes = (g, poses, o = {}) => {
    const id = uid();
    const cp = kit.svg("clipPath", { id }, kit.svg("defs", {}, g));
    poses.forEach((p, k) => objRect(cp, k, p, {}));
    const cg = kit.svg("g", { "clip-path": `url(#${id})`, opacity: o.opacity ?? 1 }, g);
    for (let y = 4; y < FH; y += 14) kit.svg("rect", { x: 0, y, width: FW, height: 6, fill: o.fill ?? RED, opacity: 0.85 }, cg);
  };
  const boxRect = (g, b, attrs) => kit.svg("rect", { x: b.x, y: b.y, width: b.w, height: b.h, fill: "none", "stroke-width": 2.2, ...attrs }, g);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      clipSeq = 0;
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // left: captured colour image; right: red channel (fringes) and blue channel (object only)
        tx(g, 140, 58, L.captured, { size: 18, fill: body, weight: 600 });
        const P = panel(g, 20, 70, 1);
        POSE0.forEach((p, k) => objRect(P, k, p, { fill: BLUE, "fill-opacity": 0.55, stroke: BLUE, "stroke-width": 1.5 }));
        fringes(P, POSE0);

        const vR = kit.easeOut(seg01(t, 0.1, 0.6)), vB = kit.easeOut(seg01(t, 0.4, 0.9));
        arrow(g, [270, 140], [372, 104], { stroke: RED, w: 2.2, opacity: vR });
        arrow(g, [270, 180], [372, 238], { stroke: BLUE, w: 2.2, opacity: vB });

        const sc = 0.62;
        tx(g, 470, 30, L.red, { size: 17, fill: RED, weight: 600, opacity: vR });
        const PR = panel(g, 395, 42, sc);
        const rg = kit.svg("g", { opacity: vR }, PR);
        fringes(rg, POSE0);

        tx(g, 470, 210, L.blue, { size: 17, fill: BLUE, weight: 600, opacity: vB });
        const PB = panel(g, 395, 222, sc);
        const bgp = kit.svg("g", { opacity: vB }, PB);
        POSE0.forEach((p, k) => objRect(bgp, k, p, { fill: BLUE, "fill-opacity": 0.6, stroke: BLUE, "stroke-width": 2 }));
      }

      if (i === 1) {
        // OTSU leaves holes -> dilation merges them -> one bounding box per contour
        const sc = 0.76, Y = 90, XS = [14, 229, 444];
        const v = [kit.easeOut(seg01(t, 0, 0.4)), kit.easeOut(seg01(t, 0.3, 0.7)), kit.easeOut(seg01(t, 0.6, 1))];
        [L.otsu, L.dilate, L.boxes].forEach((lab, j) => tx(g, XS[j] + (FW * sc) / 2, Y - 14, lab, { size: 18, fill: body, weight: 600, opacity: Math.max(0.35, v[j]) }));
        XS.slice(0, 2).forEach((x, j) => arrow(g, [x + FW * sc + 3, Y + 70], [XS[j + 1] - 3, Y + 70], { stroke: body, w: 1.6, head: 7 }));

        const P0 = panel(g, XS[0], Y, sc, { fill: bg, fillOpacity: 1 });
        const g0 = kit.svg("g", { opacity: v[0] }, P0);
        POSE0.forEach((p, k) => {
          objRect(g0, k, p, { fill: ink });
          for (const [hx, hy, r] of HOLES[k]) {
            const c = toFrame(k, p, [hx, hy]);
            kit.svg("circle", { cx: c[0], cy: c[1], r, fill: bg }, g0);
          }
        });

        const P1 = panel(g, XS[1], Y, sc, { fill: bg, fillOpacity: 1 });
        const g1 = kit.svg("g", { opacity: v[1] }, P1);
        POSE0.forEach((p, k) => objRect(g1, k, p, { fill: ink, stroke: ink, "stroke-width": 8, "stroke-linejoin": "round" }));

        const P2 = panel(g, XS[2], Y, sc);
        POSE0.forEach((p, k) => {
          objRect(P2, k, p, { fill: BLUE, "fill-opacity": 0.55, stroke: BLUE, "stroke-width": 1.5 });
          boxRect(P2, bbox(k, p), { stroke: OBJ_C[k], "stroke-dasharray": "7 5", opacity: v[2] });
        });
        tx(g, 320, 290, L.gap, { size: 17, fill: body, opacity: v[2] });
      }

      if (i === 2 || i === 3) {
        // left: frame before movement with templates; right: next fringe image, each object moved its own way
        const sc = 1.08, Y = 64, XL = 22, XR = 358;
        tx(g, XL + (FW * sc) / 2, Y - 14, L.before, { size: 18, fill: body, weight: 600 });
        tx(g, XR + (FW * sc) / 2, Y - 14, L.after, { size: 18, fill: body, weight: 600 });
        const PL = panel(g, XL, Y, sc), PRt = panel(g, XR, Y, sc);
        const m = i === 2 ? kit.easeOut(seg01(t, 0.1, 0.8)) : 1;
        POSE0.forEach((p, k) => {
          objRect(PL, k, p, { fill: BLUE, "fill-opacity": 0.5, stroke: OBJ_C[k], "stroke-width": 2 });
          if (i === 2) boxRect(PL, bbox(k, p), { stroke: OBJ_C[k] });
          const q = poseAt(k, m);
          if (i === 2) objRect(PRt, k, POSE0[k], { fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "5 4" });
          objRect(PRt, k, q, { fill: BLUE, "fill-opacity": 0.5, stroke: OBJ_C[k], "stroke-width": 2 });
          if (i === 2) boxRect(PRt, bbox(k, q), { stroke: OBJ_C[k], opacity: kit.easeOut(seg01(t, 0.5, 1)) });
        });
        // the fringes stay fixed while the objects move (shown faintly)
        fringes(PRt, [poseAt(0, m), poseAt(1, m)], { opacity: 0.35 });

        if (i === 2) {
          arrow(g, [XL + FW * sc + 8, 160], [XR - 8, 160], { stroke: body, w: 2.2 });
          tx(g, (XL + FW * sc + XR) / 2, 148, L.kcf, { size: 19, fill: body, weight: 700 });
          tx(g, 320, 300, L.template, { size: 17, fill: body, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
        } else {
          // SIFT correspondences inside each object, then one (R, t) per object from SVD
          const v = kit.easeOut(seg01(t, 0, 0.6));
          FEATS.forEach((fs, k) => fs.forEach((f, j) => {
            const a = toFrame(k, POSE0[k], f), b = toFrame(k, POSE1[k], f);
            const A = [XL + a[0] * sc, Y + a[1] * sc], B = [XR + b[0] * sc, Y + b[1] * sc];
            const vj = kit.easeOut(seg01(t, j * 0.08, 0.35 + j * 0.08));
            line(g, A, [lerp(A[0], B[0], vj), lerp(A[1], B[1], vj)], { stroke: OBJ_C[k], w: 1.4, opacity: 0.8 });
            kit.svg("circle", { cx: A[0], cy: A[1], r: 3.6, fill: OBJ_C[k] }, g);
            kit.svg("circle", { cx: B[0], cy: B[1], r: 3.6, fill: OBJ_C[k], opacity: v }, g);
          }));
          const vS = kit.easeOut(seg01(t, 0.6, 1));
          tx(g, 170, 300, [L.obj + "1" + L.colon + L.svd, { sub: "1" }, L.tsep, { sub: "1" }], { size: 19, fill: OBJ_C[0], weight: 600, opacity: vS });
          tx(g, 470, 300, [L.obj + "2" + L.colon + L.svd, { sub: "2" }, L.tsep, { sub: "2" }], { size: 19, fill: OBJ_C[1], weight: 600, opacity: vS });
        }
      }

      if (i === 4) {
        // traditional PSP: motion ripples; proposed: each object reconstructed with its own movement
        const sc = 1, Y = 72, XL = 40, XR = 360;
        tx(g, XL + FW / 2, Y - 14, L.trad, { size: 18, fill: body, weight: 600 });
        tx(g, XR + FW / 2, Y - 14, L.prop, { size: 18, fill: body, weight: 600 });
        const PL = panel(g, XL, Y, sc, { fill: bg, fillOpacity: 1 });
        const PRt = panel(g, XR, Y, sc, { fill: bg, fillOpacity: 1 });

        POSE1.forEach((p, k) => {
          objRect(PL, k, p, { fill: OBJ_C[k], "fill-opacity": 0.35 });
          const id = uid();
          const cp = kit.svg("clipPath", { id }, kit.svg("defs", {}, PL));
          objRect(cp, k, p, {});
          const cg = kit.svg("g", { "clip-path": `url(#${id})` }, PL);
          for (let y = 2; y < FH; y += 12) kit.svg("rect", { x: 0, y, width: FW, height: 5, fill: OBJ_C[k], opacity: 0.8 }, cg);
        });

        POSE1.forEach((p, k) => {
          const v = kit.easeOut(seg01(t, k * 0.4, 0.4 + k * 0.4));
          const og = kit.svg("g", { opacity: v }, PRt);
          objRect(og, k, p, { fill: OBJ_C[k], "fill-opacity": 0.4, stroke: OBJ_C[k], "stroke-width": 2 });
          kit.svg("rect", {
            x: -OBJ[k].w * 0.32, y: -OBJ[k].h * 0.22, width: OBJ[k].w * 0.64, height: OBJ[k].h * 0.4, rx: 8,
            transform: `translate(${p.x},${p.y}) rotate(${p.a})`, fill: OBJ_C[k], "fill-opacity": 0.75,
          }, og);
        });
        const vN = kit.easeOut(seg01(t, 0.75, 1));
        tx(g, XL + FW / 2, Y + FH + 32, L.rmsT, { size: 19, fill: ink, weight: 700, opacity: vN });
        tx(g, XR + FW / 2, Y + FH + 32, L.rmsP, { size: 19, fill: accent, weight: 700, opacity: vN });
        tx(g, 320, 340, L.ref, { size: 16, fill: body, opacity: vN });
      }
    },
  });
}
