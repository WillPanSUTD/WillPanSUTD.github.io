// Transparent-adhesive volume measurement schematic:
// CSBO: a green-yellow substrate absorbs the violet laser that passes through the bead ->
// per pixel row, gradient rises/falls of at least K delimit candidate regions ->
// a weighted grey-scale centroid gives one candidate centre per region ->
// DWMF-SC scores continuity, intensity and history and keeps one point per row ->
// depth map, PCA plane fit and rectification, segmentation, V = Δx·Δy·Σz.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "CSBO: part of the violet laser passes through the transparent bead. On a green-yellow substrate, the complementary colour of violet, that transmitted light is absorbed instead of returning as scattering and reflection.",
        "In each pixel row of a stripe image, a candidate region starts with a grey-level rise of at least K and ends with a fall of at least K. Several regions can appear: the real stripe and bright noise.",
        "Inside each region, a weighted grey-scale centre of gravity gives one candidate centre point. The weight I / (256 − I) favours the brightest pixels.",
        "DWMF-SC scores every candidate from its continuity with neighbouring rows, its intensity and its distance from the previous row's point, removes weak or over-wide ones, and keeps the best one per row.",
        "The centre lines form a depth map. A PCA plane fit levels it, segmentation isolates the adhesive, and the volume is the sum of one prism per pixel.",
      ],
      laser: "violet laser", other: "blue, pink or purple", gy: "green-yellow",
      back: "transmitted light returns", absorbed: "transmitted light absorbed",
      row: "one pixel row of a stripe image", rise: "rise ≥ K", fall: "fall ≥ K",
      cand: "candidate centres", wfx: "centre = Σ w(I)·x / Σ w(I),   w(I) = I / (256 − I)",
      img: "stripe image, row by row", score: "score per candidate",
      cont: "continuity", inten: "intensity", hist: "history", keep: "keep the top score per row",
      drop1: "score 0 if I < 10% of max I", drop2: "or region width > 20 px",
      plane: "PCA datum plane, then rectify", seg: "segmented adhesive", prism: "one prism per pixel",
      list: ["centre lines → depth map", "plane fit + rectification", "3D Otsu + connectivity", "V = Δx · Δy · Σ z"],
      res1: "average error vs weighed mass: 1.39% on green-yellow",
      res2: "8.03–9.05% on blue, pink and purple (Table II, Fig. 13)",
    },
    zh: {
      steps: [
        "CSBO：部分紫色激光会穿透透明胶条。紫色的互补色是黄绿色，黄绿色基板会吸收这部分透射光，使其不再产生散射和反射。",
        "在光条图像的每一个像素行中，候选区域以至少为 K 的灰度上升开始、以至少为 K 的灰度下降结束。一行中可能出现多个区域：真正的光条，以及明亮的噪声。",
        "在每个候选区域内，用加权灰度重心法求出一个候选中心点。权重 I / (256 − I) 让最亮的像素占更大比重。",
        "DWMF-SC 依据候选点与相邻行的连续性、灰度强度以及与上一行选定点的距离为其打分，剔除过暗或过宽的候选点，每行只保留得分最高的一个。",
        "各行中心线组成深度图。PCA 平面拟合将其校正水平，分割提取出胶体区域，体积即每个像素对应长方体柱的体积之和。",
      ],
      laser: "紫色激光", other: "蓝、粉或紫色基板", gy: "黄绿色基板",
      back: "透射光被反射回来", absorbed: "透射光被吸收",
      row: "光条图像中的一个像素行", rise: "上升 ≥ K", fall: "下降 ≥ K",
      cand: "候选中心点", wfx: "中心 = Σ w(I)·x / Σ w(I)，  w(I) = I / (256 − I)",
      img: "光条图像（逐行处理）", score: "候选点评分",
      cont: "连续性", inten: "灰度强度", hist: "历史位置", keep: "每行保留得分最高者",
      drop1: "I 低于最大值的 10% 时得分为 0", drop2: "区域宽度 > 20 px 时亦然",
      plane: "PCA 基准平面拟合并校正", seg: "分割出的胶体", prism: "每个像素一个柱",
      list: ["中心线 → 深度图", "平面拟合与校正", "3D Otsu + 连通域分析", "V = Δx · Δy · Σ z"],
      res1: "相对称重真值的平均误差：黄绿色基板 1.39%",
      res2: "蓝、粉、紫色基板为 8.03–9.05%（表 II、图 13）",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the violet laser, the green-yellow substrate, the other substrates, rejected points.
  const VIOLET = "#7c3aed";
  const GY = "#9acd32";
  const OTHER = "#5b7bd5";
  const REJECT = "#d64545";

  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, head: 9 });
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // ---- Step 1: bead cross-section on two substrates ---------------------------------------------
  const beadPts = (cx, base, hw, h) => Array.from({ length: 33 }, (_, j) => {
    const u = -1 + (2 * j) / 32;
    return [cx + u * hw, base - h * Math.pow(Math.max(0, 1 - u * u), 0.55)];
  });
  const beadTop = (cx, base, hw, h, x) => {
    const u = (x - cx) / hw;
    return base - h * Math.pow(Math.max(0, 1 - u * u), 0.55);
  };

  // ---- Steps 2 and 3: one pixel row with three bright regions -----------------------------------
  const rnd = kit.rng(7);
  const NPX = 40, PX0 = 40, PW = 14, BASE_Y = 250, HS = 0.72;
  const bumps = [
    { c: 10, s: 2.6, a: 200, p: 40 },   // I: the real stripe
    { c: 21, s: 0.9, a: 110, p: 0 },    // II: a narrow noise spot
    { c: 31.5, s: 3.4, a: 115, p: 25 }, // III: a wide reflection
  ];
  const I = Array.from({ length: NPX }, (_, k) => {
    let v = 18 + rnd() * 8;
    for (const b of bumps) {
      v += b.a * Math.exp(-(((k - b.c) / b.s) ** 4)) + b.p * Math.exp(-(((k - b.c) / (b.s * 0.6)) ** 2));
    }
    return Math.min(250, v);
  });
  // Regions found with the paper's rule (rise >= K into b, fall >= K out of d), K chosen for the schematic.
  const K = 25;
  const regions = [];
  for (let k = 1; k < NPX - 1; k++) {
    if (I[k] - I[k - 1] < K) continue;
    if (regions.length && k <= regions[regions.length - 1].d) continue;
    let d = k;
    while (d + 1 < NPX && I[d] - I[d + 1] < K) d++;
    if (d + 1 < NPX) regions.push({ a: k - 1, b: k, d, e: d + 1 });
  }
  const w = (v) => v / (256 - v);
  regions.forEach((r) => {
    let sw = 0, sx = 0, peak = r.b;
    for (let k = r.b; k <= r.d; k++) { sw += w(I[k]); sx += w(I[k]) * k; if (I[k] > I[peak]) peak = k; }
    r.x = sx / sw;
    r.c = peak;
  });
  const pxX = (k) => PX0 + k * PW + PW / 2;
  const ROMAN = ["I", "II", "III", "IV", "V"];

  const drawRow = (g, grow, hl) => {
    line(g, [PX0 - 6, BASE_Y], [PX0 + NPX * PW + 6, BASE_Y], { stroke: mute, w: 1.2 });
    for (let k = 0; k < NPX; k++) {
      const inR = regions.some((r) => k >= r.b && k <= r.d);
      const h = I[k] * HS * grow;
      kit.svg("rect", {
        x: PX0 + k * PW + 1, y: BASE_Y - h, width: PW - 2, height: h,
        fill: inR && hl > 0 ? accent : mute, "fill-opacity": inR ? 0.35 + 0.4 * hl : 0.45,
      }, g);
    }
  };
  const drawRegions = (g, v) => {
    regions.forEach((r, n) => {
      const x0 = PX0 + r.b * PW, x1 = PX0 + (r.d + 1) * PW;
      line(g, [x0, BASE_Y + 8], [x0, BASE_Y + 16], { stroke: accent, w: 2, opacity: v });
      line(g, [x0, BASE_Y + 16], [x1, BASE_Y + 16], { stroke: accent, w: 2, opacity: v });
      line(g, [x1, BASE_Y + 8], [x1, BASE_Y + 16], { stroke: accent, w: 2, opacity: v });
      text(g, (x0 + x1) / 2, BASE_Y + 40, ROMAN[n], { size: 18, fill: accent, weight: 700, opacity: v });
    });
  };

  // ---- Step 4: candidates in a stripe image -----------------------------------------------------
  const ROWS = 11, IX0 = 40, IY0 = 56, IW = 290, RH = 21;
  const trueX = (r) => 150 + 70 / (1 + Math.exp(-(r - 5) * 1.1));
  const cands = [];
  for (let r = 0; r < ROWS; r++) {
    cands.push({ r, x: trueX(r) + (rnd() - 0.5) * 4, keep: true });
    if (r % 3 !== 1) {
      const side = rnd() < 0.5 ? -1 : 1;
      cands.push({ r, x: trueX(r) + side * (45 + rnd() * 55), keep: false });
    }
    if (r === 4 || r === 8) cands.push({ r, x: IX0 + 30 + rnd() * 40, keep: false });
  }
  const rowY = (r) => IY0 + 12 + r * RH;

  // ---- Step 5: bead on a tilted platform, levelled and integrated --------------------------------
  const CX = 190, BY = 230, HALF = 150, BW = 90, BH = 78;
  const prof = (u) => BH * Math.pow(Math.max(0, 1 - (u / BW) ** 2), 0.55);
  const place = (u, h, th) => [CX + u * Math.cos(th) + h * Math.sin(th), BY + u * Math.sin(th) - h * Math.cos(th)];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        text(g, 320, 30, L.laser, { size: 19, fill: VIOLET, weight: 600 });
        [[165, OTHER, L.other, L.back, true], [475, GY, L.gy, L.absorbed, false]].forEach(([cx, col, lab, note, bounce]) => {
          const base = 250, hw = 110, h = 105;
          kit.svg("rect", { x: cx - 150, y: base, width: 300, height: 26, fill: col, "fill-opacity": 0.75 }, g);
          text(g, cx, base + 50, lab, { size: 18, fill: body, weight: 600 });
          kit.svg("path", { d: path(beadPts(cx, base, hw, h)) + "Z", fill: rule, "fill-opacity": 0.35, stroke: ink, "stroke-width": 1.8 }, g);
          // incoming laser sheet, then rays continuing through the bead to the substrate
          const xs = [-70, -35, 0, 35, 70].map((d) => cx + d);
          const src = [cx, 48];
          const inA = clamp01(t / 0.35);
          xs.forEach((x) => {
            const top = [x, beadTop(cx, base, hw, h, x)];
            const hit = [src[0] + (top[0] - src[0]) * inA, src[1] + (top[1] - src[1]) * inA];
            line(g, src, hit, { stroke: VIOLET, w: 1.6, opacity: 0.8 });
            const thr = seg01(t, 0.3, 0.6);
            if (thr > 0) {
              const bot = [x + (x - cx) * 0.12, base];
              line(g, top, [top[0] + (bot[0] - top[0]) * thr, top[1] + (bot[1] - top[1]) * thr], { stroke: VIOLET, w: 1.6, dash: "5 4", opacity: 0.8 });
            }
            const back = seg01(t, 0.6, 1);
            if (back > 0) {
              const bot = [x + (x - cx) * 0.12, base];
              if (bounce) {
                const out = [bot[0] + (x - cx) * 0.55 + 10, beadTop(cx, base, hw, h, bot[0]) - 34];
                arrow(g, bot, [bot[0] + (out[0] - bot[0]) * back, bot[1] + (out[1] - bot[1]) * back], { stroke: REJECT, w: 1.8, head: 8 });
              } else {
                kit.svg("circle", { cx: bot[0], cy: bot[1] + 6, r: 5 * back, fill: VIOLET, opacity: 0.55 * (1 - back) + 0.2 }, g);
              }
            }
          });
          text(g, cx, base + 78, note, { size: 18, fill: bounce ? REJECT : accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.6, 1)) });
        });
      }

      if (i === 1) {
        text(g, 320, 34, L.row, { size: 19, fill: body, weight: 600 });
        drawRow(g, kit.easeOut(seg01(t, 0, 0.45)), kit.easeOut(seg01(t, 0.45, 1)));
        const v = kit.easeOut(seg01(t, 0.45, 1));
        drawRegions(g, v);
        const r0 = regions[0];
        const yb = BASE_Y - I[r0.b] * HS, yd = BASE_Y - I[r0.d] * HS;
        arrow(g, [pxX(r0.a) - 40, yb - 34], [pxX(r0.b) - 8, yb - 4], { stroke: accent, w: 2, opacity: v });
        text(g, pxX(r0.a) - 44, yb - 40, L.rise, { size: 17, anchor: "end", fill: accent, weight: 600, opacity: v });
        arrow(g, [pxX(r0.e) + 40, yd + 52], [pxX(r0.d) + 8, yd + 8], { stroke: accent, w: 2, opacity: v });
        text(g, pxX(r0.e) + 44, yd + 72, L.fall, { size: 17, anchor: "start", fill: accent, weight: 600, opacity: v });
        [["a", -4], ["b", 4], ["d", -4], ["e", 4]].forEach(([k, dx]) => text(g, pxX(r0[k]) + dx, BASE_Y + 64, k, { size: 16, fill: body, italic: true, opacity: v }));
        text(g, (pxX(r0.b) + pxX(r0.d)) / 2, BASE_Y + 64, "c", { size: 16, fill: body, italic: true, opacity: v });
      }

      if (i === 2) {
        text(g, 320, 34, L.cand, { size: 19, fill: body, weight: 600 });
        drawRow(g, 1, 1);
        drawRegions(g, 1);
        regions.forEach((r) => {
          const x = PX0 + r.x * PW + PW / 2;
          const top = BASE_Y - I[Math.round(r.x)] * HS;
          const yy = BASE_Y - (BASE_Y - top + 24) * e;
          line(g, [x, BASE_Y], [x, yy], { stroke: ink, w: 2, dash: "5 4" });
          kit.svg("circle", { cx: x, cy: yy, r: 6, fill: ink, stroke: bg, "stroke-width": 2 }, g);
        });
        text(g, 320, 336, L.wfx, { size: 18, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.5, 1)) });
      }

      if (i === 3) {
        text(g, IX0 + IW / 2, 34, L.img, { size: 19, fill: body, weight: 600 });
        kit.svg("rect", { x: IX0, y: IY0, width: IW, height: ROWS * RH + 4, fill: ink, "fill-opacity": 0.85, rx: 3 }, g);
        for (let r = 1; r < ROWS; r++) line(g, [IX0, IY0 + 2 + r * RH], [IX0 + IW, IY0 + 2 + r * RH], { stroke: body, w: 0.6, opacity: 0.6 });
        const v = kit.easeOut(seg01(t, 0.25, 0.8));
        const kept = cands.filter((c) => c.keep).sort((a, b) => a.r - b.r);
        const n = Math.max(2, Math.ceil(kept.length * v));
        if (v > 0) kit.svg("path", { d: path(kept.slice(0, n).map((c) => [c.x, rowY(c.r)])), fill: "none", stroke: accent, "stroke-width": 3, opacity: v }, g);
        cands.forEach((c) => {
          const y = rowY(c.r);
          if (c.keep) {
            kit.svg("circle", { cx: c.x, cy: y, r: 5.5, fill: v > 0.05 ? accent : bg, stroke: bg, "stroke-width": 1.5 }, g);
          } else {
            kit.svg("circle", { cx: c.x, cy: y, r: 5.5, fill: v > 0.05 ? REJECT : bg, opacity: 1 - 0.5 * v }, g);
            if (v > 0.05) {
              line(g, [c.x - 7, y - 7], [c.x + 7, y + 7], { stroke: REJECT, w: 2, opacity: v });
              line(g, [c.x - 7, y + 7], [c.x + 7, y - 7], { stroke: REJECT, w: 2, opacity: v });
            }
          }
        });
        const X = 372;
        text(g, X, 64, L.score, { size: 19, anchor: "start", fill: body, weight: 600 });
        [[L.cont, "× 0.5"], [L.inten, "× 0.1"], [L.hist, "× 0.4"]].forEach(([lab, wt], k) => {
          const op = kit.easeOut(seg01(t, k * 0.12, 0.3 + k * 0.12));
          text(g, X + 8, 102 + k * 32, lab, { size: 18, anchor: "start", fill: ink, opacity: op });
          text(g, 612, 102 + k * 32, wt, { size: 18, anchor: "end", fill: accent, weight: 700, opacity: op });
        });
        line(g, [X, 188], [612, 188], { stroke: mute, w: 1 });
        const v2 = kit.easeOut(seg01(t, 0.5, 1));
        text(g, X, 220, L.drop1, { size: 17, anchor: "start", fill: REJECT, opacity: v2 });
        text(g, X, 246, L.drop2, { size: 17, anchor: "start", fill: REJECT, opacity: v2 });
        text(g, X, 290, L.keep, { size: 18, anchor: "start", fill: accent, weight: 600, opacity: v2 });
      }

      if (i === 4) {
        const th = (9 * Math.PI / 180) * (1 - kit.easeOut(seg01(t, 0, 0.4)));
        const pv = kit.easeOut(seg01(t, 0.4, 0.85));
        text(g, CX, 34, L.plane, { size: 19, fill: body, weight: 600 });
        line(g, place(-HALF, 0, th), place(HALF, 0, th), { stroke: body, w: 2.5 });
        // sampled platform patches used for the plane fit
        [-130, 118].forEach((u) => {
          kit.svg("path", { d: path([place(u, 0, th), place(u + 18, 0, th), place(u + 18, 6, th), place(u, 6, th)]) + "Z", fill: accent, opacity: 0.6 }, g);
        });
        // one prism per pixel under the bead
        const NB = 12, cw = (2 * BW) / NB;
        for (let k = 0; k < NB; k++) {
          const u0 = -BW + k * cw, hh = prof(u0 + cw / 2) * pv;
          if (hh <= 0.5) continue;
          kit.svg("path", {
            d: path([place(u0, 0, th), place(u0 + cw, 0, th), place(u0 + cw, hh, th), place(u0, hh, th)]) + "Z",
            fill: accent, "fill-opacity": 0.28, stroke: accent, "stroke-width": 1,
          }, g);
        }
        const outline = Array.from({ length: 41 }, (_, j) => { const u = -BW + (2 * BW * j) / 40; return place(u, prof(u), th); });
        kit.svg("path", { d: path(outline), fill: "none", stroke: ink, "stroke-width": 2 }, g);
        text(g, CX, BY + 34, L.seg, { size: 18, fill: body, opacity: pv });
        if (pv > 0.2) {
          const u1 = -BW + 1.5 * cw, p0 = place(u1, prof(u1) * pv, th);
          arrow(g, [p0[0] - 22, 126], [p0[0], p0[1] - 4], { stroke: body, w: 1.4, opacity: pv });
          text(g, p0[0] - 22, 116, L.prism, { size: 16, fill: body, opacity: pv });
        }
        L.list.forEach((lab, k) => {
          const on = k === 0 ? 1 : k === 1 ? kit.easeOut(seg01(t, 0, 0.4)) : kit.easeOut(seg01(t, 0.4 + (k - 2) * 0.2, 0.6 + (k - 2) * 0.2));
          text(g, 400, 92 + k * 38, lab, { size: 18, anchor: "start", fill: k === 3 ? accent : ink, weight: k === 3 ? 700 : 400, opacity: 0.3 + 0.7 * on });
        });
        const r = kit.easeOut(seg01(t, 0.8, 1));
        text(g, 320, 312, L.res1, { size: 18, fill: accent, weight: 600, opacity: r });
        text(g, 320, 340, L.res2, { size: 18, fill: body, opacity: r });
      }
    },
  });
}
