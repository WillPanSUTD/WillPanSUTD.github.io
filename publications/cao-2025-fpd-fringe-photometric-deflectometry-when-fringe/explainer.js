// FPD schematic, following Fig. 1 of the paper:
// one capture cycle of 12 images (binary patterns for PS, horizontal and vertical fringes for PMD) ->
// PMD branch: four phase-shifted samples per pixel give mean A, specular S, diffuse D = A − S and the phase gradient P ->
// PS branch: the binary-pattern images, stacked into a matrix, are factorised by SVD into normals and a mean curvature H ->
// per-pixel weights w_PMD = S/(S+D) and w_PS = D/(S+D) ->
// R = w_PMD·P + w_PS·H keeps the scratch on the glossy logo (from PMD) and the smudge on the body (from PS).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "One capture cycle: the projector shows binary patterns for photometric stereo (PS) and horizontal and vertical sinusoidal fringes for deflectometry (PMD). The camera records 12 images of a surface with a glossy logo and a less specular body.",
        "PMD branch: each pixel sees the fringe shifted four times. The mean gives A, the fringe modulation gives the specular part S, and D = A − S is the diffuse part. The phase of the fringes gives the gradient map P.",
        "PS branch: the binary-pattern images are stacked into one intensity matrix. Its singular value decomposition (SVD) gives a surface normal per pixel, and from the normals the mean curvature map H.",
        "Weights from reflectance: w_PMD = S / (S + D) and w_PS = D / (S + D), per pixel. Glossy pixels such as the logo trust PMD; more diffuse pixels trust PS.",
        "Fusion: R = w_PMD·P + w_PS·H. PS alone misses the scratch on the glossy logo, PMD alone misses the fingerprint smudge on the body; the fused map keeps both, and both are detected in Smart3.",
      ],
      projector: "projector", camera: "camera", plate: "phone back plate",
      binary: "binary", fx: "fringe-x", fy: "fringe-y", toPS: "→ PS", toPMD: "→ PMD",
      cycle: "12 images per cycle", logo: "glossy logo", body: ["less specular", "body"],
      shift: "phase shift n", intensity: "intensity", logoPx: "logo pixel", bodyPx: "body pixel",
      mean: "A = mean", modS: "S from modulation / A", diffuse: "D = A − S", gloss: "glossiness S / A", phase: "phase → gradient P",
      lights: "binary-pattern images", matrix: "matrix M", rows: "images × pixels", svd: "SVD",
      normals: "normals n", curv: "mean curvature H",
      wPMD: ["w", { sub: "PMD" }, " = S / (S + D)"], wPS: ["w", { sub: "PS" }, " = D / (S + D)"], high: "high", low: "low",
      glossy: "glossy → PMD", diff: "diffuse → PS",
      mapP: "P (PMD)", mapH: "H (PS)", mapR: "R (FPD)", fuse: ["R = w", { sub: "PMD" }, "·P + w", { sub: "PS" }, "·H"],
      missS: "scratch missed", missF: "smudge missed", both: "scratch + smudge found",
      scratch: "scratch", smudge: "smudge",
    },
    zh: {
      steps: [
        "一个采集周期：投影仪依次投射用于光度立体（PS）的二值图案，以及用于相位测量偏折术（PMD）的水平和竖直正弦条纹。相机共采集 12 幅图像，被测表面既有高光的标志区域，也有镜面反射较弱的机身区域。",
        "PMD 分支：每个像素经历四次相移的条纹。取平均得到 A，由条纹调制度得到镜面反射分量 S，D = A − S 为漫反射分量；由条纹相位求得梯度图 P。",
        "PS 分支：把二值图案下的图像堆叠成一个强度矩阵，经奇异值分解（SVD）得到每个像素的表面法向，再由法向计算平均曲率图 H。",
        "按反射特性计算权重：逐像素地 w_PMD = S / (S + D)，w_PS = D / (S + D)。标志等高光像素更信任 PMD，偏漫反射的像素更信任 PS。",
        "融合：R = w_PMD·P + w_PS·H。单用 PS 会漏掉高光标志上的划痕，单用 PMD 会漏掉机身上的指纹脏污；融合图两者兼得，在 Smart3 中都能被检出。",
      ],
      projector: "投影仪", camera: "相机", plate: "手机后盖",
      binary: "二值", fx: "条纹-x", fy: "条纹-y", toPS: "→ PS", toPMD: "→ PMD",
      cycle: "每周期 12 幅图像", logo: "高光标志", body: ["镜面反射", "较弱的机身"],
      shift: "相移序号 n", intensity: "强度", logoPx: "标志像素", bodyPx: "机身像素",
      mean: "A = 均值", modS: "S 由调制度 / A 求得", diffuse: "D = A − S", gloss: "光泽度 S / A", phase: "相位 → 梯度 P",
      lights: "二值图案图像", matrix: "矩阵 M", rows: "图像数 × 像素数", svd: "SVD",
      normals: "法向 n", curv: "平均曲率 H",
      wPMD: ["w", { sub: "PMD" }, " = S / (S + D)"], wPS: ["w", { sub: "PS" }, " = D / (S + D)"], high: "高", low: "低",
      glossy: "高光 → PMD", diff: "漫反射 → PS",
      mapP: "P（PMD）", mapH: "H（PS）", mapR: "R（FPD）", fuse: ["R = w", { sub: "PMD" }, "·P + w", { sub: "PS" }, "·H"],
      missS: "漏检划痕", missF: "漏检脏污", both: "划痕与脏污均检出",
      scratch: "划痕", smudge: "脏污",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the PS branch, and defects (scratch, smudge).
  const PS = "#b7791f";
  const DEFECT = "#d64545";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const pen = kit.pen({ textSize: 17, stroke: body, head: 9 });
  const { line, arrow } = pen;
  // Text that may contain real subscripts: str is a string or an array of strings and { sub: "…" } parts.
  const text = (parent, x, y, str, o = {}) => {
    if (!Array.isArray(str)) return pen.text(parent, x, y, str, o);
    const n = pen.text(parent, x, y, "", o);
    for (const p of str) {
      const t = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": 14 }, n);
      t.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Fixed fingerprint ridge jitter (seeded once, reused every frame).
  const rnd = kit.rng(8);
  const RIDGE = Array.from({ length: 5 }, () => 0.85 + rnd() * 0.3);

  // Phone back plate (front view) in box (x, y, w, h).
  // o.logoFill / o.bodyFill: fill colours; o.logoOp / o.bodyOp: their opacities;
  // o.scratch / o.smudge: 0..1 visibility; o.defect: colour for the defects.
  const plate = (g, x, y, w, h, o = {}) => {
    const r = w * 0.14;
    kit.svg("rect", {
      x, y, width: w, height: h, rx: r, fill: o.bodyFill ?? rule, "fill-opacity": o.bodyOp ?? 0.55,
      stroke: o.stroke ?? body, "stroke-width": 1.6,
    }, g);
    // camera and flash
    kit.svg("circle", { cx: x + w * 0.2, cy: y + w * 0.2, r: w * 0.09, fill: bg, stroke: body, "stroke-width": 1.4 }, g);
    kit.svg("circle", { cx: x + w * 0.36, cy: y + w * 0.2, r: w * 0.03, fill: body }, g);
    // glossy logo: a rounded square in the middle
    const lx = x + w * 0.5, ly = y + h * 0.42, ls = w * 0.17;
    // paint the logo with the background first, so a low weight reads pale rather than mixing with the body fill
    kit.svg("rect", { x: lx - ls, y: ly - ls, width: 2 * ls, height: 2 * ls, rx: ls * 0.45, fill: bg }, g);
    kit.svg("rect", {
      x: lx - ls, y: ly - ls, width: 2 * ls, height: 2 * ls, rx: ls * 0.45,
      fill: o.logoFill ?? bg, "fill-opacity": o.logoOp ?? 1, stroke: body, "stroke-width": 1.4,
    }, g);
    const def = o.defect ?? DEFECT;
    if ((o.scratch ?? 0) > 0) {
      line(g, [lx - ls * 0.95, ly + ls * 0.25], [lx + ls * 0.95, ly - ls * 0.2], { stroke: def, w: 2.6, opacity: o.scratch });
    }
    if ((o.smudge ?? 0) > 0) {
      const fx = x + w * 0.36, fy = y + h * 0.74;
      RIDGE.forEach((k, j) => {
        kit.svg("ellipse", {
          cx: fx, cy: fy, rx: w * 0.05 * (j + 1) * k, ry: w * 0.032 * (j + 1) * k,
          fill: "none", stroke: def, "stroke-width": 1.3, opacity: o.smudge,
        }, g);
      });
    }
    return { logo: [lx, ly, ls], smudge: [x + w * 0.36, y + h * 0.74] };
  };

  // A small pattern tile: kind "bin" (half lit, side k), "fx" horizontal fringes, "fy" vertical fringes.
  const tile = (g, x, y, s, kind, k) => {
    kit.svg("rect", { x, y, width: s, height: s, fill: bg, stroke: body, "stroke-width": 1.2 }, g);
    if (kind === "bin") {
      const half = [[x, y, s / 2, s], [x + s / 2, y, s / 2, s], [x, y, s, s / 2], [x, y + s / 2, s, s / 2]][k];
      kit.svg("rect", { x: half[0], y: half[1], width: half[2], height: half[3], fill: ink, "fill-opacity": 0.8 }, g);
    } else {
      const n = 4, step = s / n, ph = (k * step) / 4;
      for (let j = 0; j < n; j++) {
        const a = j * step + ph;
        if (kind === "fx") kit.svg("rect", { x, y: y + (a % s), width: s, height: Math.min(step / 2, s - (a % s)), fill: ink, "fill-opacity": 0.75 }, g);
        else kit.svg("rect", { x: x + (a % s), y, width: Math.min(step / 2, s - (a % s)), height: s, fill: ink, "fill-opacity": 0.75 }, g);
      }
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
        // left: three stacks of four patterns appear in turn; right: the plate under the camera
        const rows = [["bin", L.binary, L.toPS, PS], ["fx", L.fx, L.toPMD, accent], ["fy", L.fy, L.toPMD, accent]];
        text(g, 150, 30, L.projector, { size: 18, fill: body, weight: 600 });
        rows.forEach(([kind, name, to, col], r) => {
          const v = kit.easeOut(seg01(t, r * 0.22, r * 0.22 + 0.4));
          const y0 = 52 + r * 88;
          const sub = kit.svg("g", { opacity: v }, g);
          for (let k = 3; k >= 0; k--) tile(sub, 40 + k * 12, y0 + k * 6, 48, kind, k);
          text(sub, 140, y0 + 26, name + " ×4", { size: 17, anchor: "start", fill: ink });
          text(sub, 140, y0 + 50, to, { size: 17, anchor: "start", fill: col, weight: 700 });
        });
        arrow(g, [250, 180], [320, 180], { stroke: body, w: 2 });
        // plate with camera above
        const P0 = plate(g, 350, 70, 140, 222, { scratch: 0.9, smudge: 0.9, logoFill: accent, logoOp: 0.22 });
        text(g, 440, 30, L.camera + " · " + L.cycle, { size: 17, fill: body, weight: 600 });
        text(g, 420, 324, L.plate, { size: 17, fill: body });
        const v = kit.easeOut(seg01(t, 0.6, 1));
        line(g, [P0.logo[0] + P0.logo[2] + 4, P0.logo[1]], [504, P0.logo[1] - 30], { stroke: accent, w: 1.4, opacity: v });
        text(g, 510, P0.logo[1] - 34, L.logo, { size: 16, anchor: "start", fill: accent, opacity: v });
        line(g, [P0.smudge[0] + 26, P0.smudge[1] + 12], [504, 262], { stroke: body, w: 1.4, opacity: v });
        L.body.forEach((str, k) => text(g, 510, 266 + k * 20, str, { size: 16, anchor: "start", fill: body, opacity: v }));
      }

      if (i === 1) {
        // left: plate with two probe pixels; middle: the four phase-shifted samples per pixel; right: what they give
        const P0 = plate(g, 26, 70, 120, 190, { logoFill: accent, logoOp: 0.22 });
        const pl = [P0.logo[0] + 8, P0.logo[1] - 6], pb = [70, 220];
        kit.svg("circle", { cx: pl[0], cy: pl[1], r: 5, fill: accent }, g);
        kit.svg("circle", { cx: pb[0], cy: pb[1], r: 5, fill: ink }, g);
        text(g, 86, 292, L.logoPx, { size: 16, fill: accent });
        text(g, 86, 316, L.bodyPx, { size: 16, fill: ink });

        // chart
        const C = { x: 200, y: 56, w: 200, h: 220 };
        line(g, [C.x, C.y + C.h], [C.x + C.w, C.y + C.h], { stroke: body, w: 1.4 });
        line(g, [C.x, C.y + C.h], [C.x, C.y - 4], { stroke: body, w: 1.4 });
        text(g, C.x + C.w / 2, C.y + C.h + 40, L.shift, { size: 16, fill: body });
        text(g, C.x - 8, C.y - 14, L.intensity, { size: 16, anchor: "start", fill: body });
        const X = (n) => C.x + 25 + (n - 1) * 50;
        const Y = (v) => C.y + C.h - v * C.h;
        const curve = (A, B) => Array.from({ length: 41 }, (_, j) => {
          const n = 1 + (j / 40) * 3.6;
          return [C.x + 25 + (n - 1) * 50, Y(A + B * Math.cos(0.6 + (2 * Math.PI * n) / 4))];
        });
        const series = [[0.55, 0.32, accent], [0.62, 0.07, ink]];
        series.forEach(([A, B, col]) => {
          const pts = curve(A, B);
          const m = Math.max(2, Math.round(pts.length * e));
          kit.svg("path", { d: path(pts.slice(0, m)), fill: "none", stroke: col, "stroke-width": 2, opacity: 0.55 }, g);
          for (let n = 1; n <= 4; n++) {
            if (e < (n - 1) / 4) continue;
            kit.svg("circle", { cx: X(n), cy: Y(A + B * Math.cos(0.6 + (2 * Math.PI * n) / 4)), r: 4.5, fill: col }, g);
          }
        });
        for (let n = 1; n <= 4; n++) text(g, X(n), C.y + C.h + 18, String(n), { size: 15, fill: body, halo: false });
        // mean line and modulation bracket for the logo pixel
        const v = kit.easeOut(seg01(t, 0.55, 1));
        line(g, [C.x, Y(0.55)], [C.x + C.w, Y(0.55)], { stroke: accent, w: 1.2, dash: "5 4", opacity: v });
        arrow(g, [C.x + C.w - 8, Y(0.55)], [C.x + C.w - 8, Y(0.87)], { stroke: accent, w: 1.4, opacity: v, head: 7 });
        arrow(g, [C.x + C.w - 8, Y(0.55)], [C.x + C.w - 8, Y(0.23)], { stroke: accent, w: 1.4, opacity: v, head: 7 });

        // derived quantities
        const items = [[L.mean, ink], [L.modS, accent], [L.diffuse, ink], [L.gloss, body], [L.phase, accent]];
        items.forEach(([str, col], k) => {
          const vk = kit.easeOut(seg01(t, 0.35 + k * 0.12, 0.6 + k * 0.1));
          text(g, 432, 92 + k * 46, str, { size: 17, anchor: "start", fill: col, weight: k === 4 ? 700 : 500, opacity: vk });
        });
      }

      if (i === 2) {
        // four images under binary illumination -> intensity matrix -> SVD -> normals -> curvature
        text(g, 20, 34, L.lights, { size: 17, anchor: "start", fill: body, weight: 600 });
        for (let k = 0; k < 4; k++) {
          const x = 20 + (k % 2) * 62, y = 52 + Math.floor(k / 2) * 92;
          const id = "fpdps" + k;
          const [x1, y1, x2, y2] = [[0, 0, 1, 0], [1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0]][k];
          const gr = kit.svg("linearGradient", { id, x1, y1, x2, y2 }, s);
          kit.svg("stop", { offset: 0, "stop-color": PS, "stop-opacity": 0.6 }, gr);
          kit.svg("stop", { offset: 1, "stop-color": PS, "stop-opacity": 0.05 }, gr);
          kit.svg("rect", { x, y, width: 52, height: 80, rx: 8, fill: `url(#${id})`, stroke: body, "stroke-width": 1.2 }, g);
        }
        const v1 = kit.easeOut(seg01(t, 0, 0.35)), v2 = kit.easeOut(seg01(t, 0.3, 0.65)), v3 = kit.easeOut(seg01(t, 0.6, 1));
        arrow(g, [146, 140], [180, 140], { stroke: body, w: 2, opacity: v1 });
        // matrix: 4 rows (images) x many columns (pixels)
        const M = { x: 190, y: 92, w: 120, h: 96 };
        const sub1 = kit.svg("g", { opacity: v1 }, g);
        for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
          kit.svg("rect", {
            x: M.x + c * 12, y: M.y + r * 24, width: 11, height: 23,
            fill: PS, "fill-opacity": 0.15 + 0.55 * Math.abs(Math.sin(r * 1.7 + c * 0.9)), stroke: "none",
          }, sub1);
        }
        text(sub1, M.x + M.w / 2, M.y - 14, L.matrix, { size: 17, fill: ink, weight: 600 });
        text(sub1, M.x + M.w / 2, M.y + M.h + 24, L.rows, { size: 15, fill: body });
        arrow(g, [320, 140], [372, 140], { stroke: PS, w: 2.2, opacity: v2 });
        text(g, 346, 128, L.svd, { size: 17, fill: PS, weight: 700, opacity: v2 });
        // surface profile with normals and a small smudge-like bump
        const prof = (x) => 200 - 10 * Math.exp(-((x - 470) ** 2) / 200) + 4 * Math.sin((x - 380) / 30);
        const xs = Array.from({ length: 61 }, (_, j) => 380 + j * 3.4);
        kit.svg("path", { d: path(xs.map((x) => [x, prof(x)])), fill: "none", stroke: ink, "stroke-width": 2, opacity: v2 }, g);
        for (let x = 386; x <= 580; x += 16) {
          const d = (prof(x + 1) - prof(x - 1)) / 2;
          const n = [d, -1], len = Math.hypot(n[0], n[1]);
          arrow(g, [x, prof(x)], [x + (n[0] / len) * 30, prof(x) + (n[1] / len) * 30], { stroke: PS, w: 1.6, opacity: v2, head: 6 });
        }
        text(g, 480, 110, L.normals, { size: 17, fill: PS, opacity: v2 });
        // curvature strip
        arrow(g, [480, 222], [480, 252], { stroke: body, w: 2, opacity: v3 });
        const cv = xs.map((x) => {
          const h = (prof(x + 2) - 2 * prof(x) + prof(x - 2)) / 4;
          return [x, 300 + h * 260];
        });
        kit.svg("path", { d: path(cv), fill: "none", stroke: PS, "stroke-width": 2.2, opacity: v3 }, g);
        text(g, 480, 340, L.curv, { size: 17, fill: PS, weight: 700, opacity: v3 });
      }

      if (i === 3) {
        // two weight maps of the same plate
        const show = (x, title, logoW, bodyW, col, note) => {
          text(g, x + 75, 36, title, { size: 17, fill: col, weight: 700 });
          plate(g, x, 56, 150, 226, { logoFill: col, logoOp: logoW * e, bodyFill: col, bodyOp: bodyW * e });
          text(g, x + 75, 318, note, { size: 17, fill: col, opacity: kit.easeOut(seg01(t, 0.5, 1)) });
        };
        show(110, L.wPMD, 0.85, 0.15, accent, L.glossy);
        show(380, L.wPS, 0.15, 0.85, PS, L.diff);
        // legend (high / low)
        const lv = kit.easeOut(seg01(t, 0.5, 1));
        kit.svg("rect", { x: 292, y: 140, width: 40, height: 18, fill: ink, "fill-opacity": 0.75, opacity: lv }, g);
        kit.svg("rect", { x: 292, y: 186, width: 40, height: 18, fill: ink, "fill-opacity": 0.12, stroke: mute, opacity: lv }, g);
        text(g, 312, 132, L.high, { size: 15, fill: body, opacity: lv });
        text(g, 312, 222, L.low, { size: 15, fill: body, opacity: lv });
      }

      if (i === 4) {
        // P misses the smudge, H misses the scratch, R keeps both
        const maps = [
          [30, L.mapP, accent, 1, 0, L.missF],
          [240, L.mapH, PS, 0, 1, L.missS],
          [450, L.mapR, ink, 1, 1, L.both],
        ];
        maps.forEach(([x, title, col, sc, sm, note], k) => {
          const v = k < 2 ? 1 : kit.easeOut(seg01(t, 0.15, 0.7));
          text(g, x + 80, 34, title, { size: 17, fill: col, weight: 700 });
          const P0 = plate(g, x + 10, 50, 140, 210, { scratch: sc * v, smudge: sm * v, logoFill: bg });
          if (k === 2) {
            const bv = kit.easeOut(seg01(t, 0.6, 1));
            const [lx, ly, ls] = P0.logo, [fx, fy] = P0.smudge;
            kit.svg("rect", { x: lx - ls - 6, y: ly - ls * 0.6, width: 2 * ls + 12, height: ls * 1.2, fill: "none", stroke: accent, "stroke-width": 2, opacity: bv }, g);
            kit.svg("rect", { x: fx - 34, y: fy - 24, width: 68, height: 48, fill: "none", stroke: accent, "stroke-width": 2, opacity: bv }, g);
          }
          text(g, x + 80, 290, note, { size: 16, fill: k === 2 ? accent : DEFECT, weight: 600, opacity: k === 2 ? kit.easeOut(seg01(t, 0.6, 1)) : 1 });
        });
        text(g, 320, 336, L.fuse, { size: 18, fill: ink, weight: 700, opacity: kit.easeOut(seg01(t, 0.3, 0.8)) });
      }
    },
  });
}
