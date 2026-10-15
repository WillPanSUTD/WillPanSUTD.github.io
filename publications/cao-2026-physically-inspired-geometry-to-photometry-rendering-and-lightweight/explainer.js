// Schematic of the pipeline in the paper (Fig. 1): line-laser depth map -> depth-RGB LUT built from the
// histogram CDF (Freedman-Diaconis bins) -> surface normals from diagonal cross products -> Phong shading
// I = Ia + Id + Is with the Table 3 weights -> rendered image C' = I x C -> YOLO-WaveletTiny.
// The weld bead and the pit are a generic stand-in, not data from the paper.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A line-laser scanner gives a depth map of the weld. A pit is only sub-millimetre deep, so in the grey depth map it barely differs from the sound bead around it.",
        "Depth is mapped to colour through a lookup table built from the depth histogram: bin width from the Freedman–Diaconis rule, then the cumulative distribution sets each depth's colour, from blue (low) over green to red (high).",
        "For every pixel, the normal is the cross product of two diagonal vectors to its neighbours. On the sound bead the normals turn smoothly; at the pit edge they change abruptly.",
        "Phong shading turns the normals into brightness: ambient + diffuse (N·L) + specular ((R·V)ⁿ). Multiplying the pseudo-colour by this brightness gives the rendered image, where the pit edge stands out.",
        "The rendered image goes to YOLO-WaveletTiny. In the backbone, WDSConv splits features with a Haar wavelet into one low-frequency and three high-frequency subbands; in the neck, IWUpsample rebuilds resolution by inverse wavelet transform.",
      ],
      profile: "Cross-section of the weld", depth: "Depth map (grey)", pseudo: "Pseudo-colour image",
      rendered: "Rendered image", pit: "pit", pitSize: "pit (sub-mm)", bead: "weld bead", height: "height",
      hist: "Depth histogram", cdf: "CDF", lut: "LUT", low: "low", high: "high",
      normals: "Surface normals", smooth: "smooth", abrupt: "abrupt change",
      light: "light L", view: "view V", bright: "Brightness I", formula: "I = Ia + Id + Is",
      product: "C′ = I × C",
      net: "YOLO-WaveletTiny", wds: "WDSConv (backbone)", iwu: "IWUpsample (neck)",
      lowf: "low freq.", highf: "high freq.", detect: "Pit",
    },
    zh: {
      steps: [
        "线激光扫描仪给出焊缝的深度图。凹坑深度仅为亚毫米级，在灰度深度图上与周围正常焊道几乎没有差别。",
        "用深度直方图构建的查找表把深度映射为颜色：箱宽按 Freedman–Diaconis 准则确定，再由累积分布决定每个深度的颜色，从蓝（低）经绿到红（高）。",
        "每个像素的法向量由指向邻点的两条对角向量叉乘得到。正常焊道上法向量平缓变化；在凹坑边缘，法向量突变。",
        "Phong 光照把法向量转换为亮度：环境光 + 漫反射（N·L）+ 镜面反射（(R·V)ⁿ）。伪彩色图乘以该亮度即得渲染图，凹坑边缘在图中变得醒目。",
        "渲染图输入 YOLO-WaveletTiny。主干中的 WDSConv 用 Haar 小波把特征分解为一个低频子带和三个高频子带；颈部的 IWUpsample 通过逆小波变换恢复分辨率。",
      ],
      profile: "焊缝横截面", depth: "深度图（灰度）", pseudo: "伪彩色图",
      rendered: "渲染图", pit: "凹坑", pitSize: "凹坑（亚毫米）", bead: "焊道", height: "高度",
      hist: "深度直方图", cdf: "累积分布", lut: "查找表", low: "低", high: "高",
      normals: "表面法向量", smooth: "平缓", abrupt: "突变",
      light: "光源 L", view: "视线 V", bright: "亮度 I", formula: "I = Ia + Id + Is",
      product: "C′ = I × C",
      net: "YOLO-WaveletTiny", wds: "WDSConv（主干）", iwu: "IWUpsample（颈部）",
      lowf: "低频", highf: "高频", detect: "凹坑",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  const { text, line, arrow } = kit.pen({ textSize: 16, stroke: body, width: 1.6 });

  // --- Height field: a weld bead running along y, with a small pit on its flank ---
  const NX = 90, NY = 20, X0 = 52, Y0 = 9;
  const bead = (x) => 1.0 * Math.exp(-(((x - 45) / 16) ** 2));
  const pitDepth = 0.09;
  const hAt = (x, y) => bead(x) - pitDepth * Math.exp(-(((x - X0) / 2.2) ** 2) - (((y - Y0) / 2.2) ** 2));

  // Phong shading with the paper's Table 3 weights (wa 0.1, wd 0.5, ws 0.3, n 32, Il 1.3); slope scaled for display.
  const SLOPE = 9;
  const norm = (v) => { const m = Math.hypot(...v); return v.map((c) => c / m); };
  const Ldir = norm([-0.55, -0.35, 1]), Vdir = norm([0.2, 0.15, 1]);
  const shade = (x, y) => {
    const v1 = [1, 1, SLOPE * (hAt(x + 1, y + 1) - hAt(x, y))];
    const v2 = [-1, 1, SLOPE * (hAt(x, y + 1) - hAt(x + 1, y))];
    const n = norm([v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]]);
    const nl = n[0] * Ldir[0] + n[1] * Ldir[1] + n[2] * Ldir[2];
    const R = [2 * nl * n[0] - Ldir[0], 2 * nl * n[1] - Ldir[1], 2 * nl * n[2] - Ldir[2]];
    const rv = Math.max(0, R[0] * Vdir[0] + R[1] * Vdir[1] + R[2] * Vdir[2]);
    return 0.1 * 1 + 0.5 * 1.3 * Math.max(0, nl) + 0.3 * 1.3 * rv ** 32;
  };

  // Histogram-equalised LUT: CDF of heights -> index 0..1 -> blue / green / red ramp
  const all = [];
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) all.push(hAt(x, y));
  const sorted = [...all].sort((a, b) => a - b);
  const cdfOf = (h) => {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= h) lo = m + 1; else hi = m; }
    return lo / sorted.length;
  };
  const ramp = (u) => {
    const c = u < 0.5 ? [0, 2 * u, 1 - 2 * u] : [2 * u - 1, 2 - 2 * u, 0];
    return c.map((v) => Math.round(40 + 200 * v));
  };
  const rgb = (c, k = 1) => `rgb(${c.map((v) => Math.max(0, Math.min(255, Math.round(v * k)))).join(",")})`;

  // Image strip helper: cell grid of NX x NY at (x, y) with cell size s
  const strip = (g, x0, y0, s, fill, opacity = 1) => {
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        kit.svg("rect", { x: x0 + x * s, y: y0 + y * s, width: s + 0.3, height: s + 0.3, fill: fill(x, y), opacity }, g);
      }
    }
    kit.svg("rect", { x: x0, y: y0, width: NX * s, height: NY * s, fill: "none", stroke: rule, "stroke-width": 1 }, g);
  };
  const greyFill = (x, y) => { const v = Math.round(60 + 170 * hAt(x, y)); return `rgb(${v},${v},${v})`; };
  const pseudoFill = (x, y) => rgb(ramp(cdfOf(hAt(x, y))));
  const renderFill = (x, y) => rgb(ramp(cdfOf(hAt(x, y))), Math.min(1.6, shade(x, y) * 1.25));

  // Cross-section through the pit row
  const PX0 = 40, PW = 560, PBASE = 230, PH = 110;
  const px = (x) => PX0 + (x / (NX - 1)) * PW;
  const py = (h) => PBASE - h * PH;
  const profilePts = () => {
    const pts = [];
    for (let x = 0; x <= NX - 1; x += 0.25) pts.push(`${px(x).toFixed(1)},${py(hAt(x, Y0)).toFixed(1)}`);
    return pts.join(" ");
  };
  const drawProfile = (g, opacity = 1) => {
    kit.svg("polygon", { points: `${PX0},${PBASE} ${profilePts()} ${PX0 + PW},${PBASE}`, fill: mute, opacity: 0.25 * opacity }, g);
    kit.svg("polyline", { points: profilePts(), fill: "none", stroke: body, "stroke-width": 2, opacity }, g);
  };
  const pitMark = (g, x, y, opacity = 1) => {
    kit.svg("circle", { cx: x, cy: y, r: 16, fill: "none", stroke: accent, "stroke-width": 1.6, "stroke-dasharray": "4 3", opacity }, g);
  };

  const SX = 140, SY = 268, SS = 4;                                  // strip placement (360 x 80)

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        text(g, 320, 34, L.profile, { weight: 600 });
        drawProfile(g, 1);
        text(g, px(45), py(1) - 14, L.bead, { size: 15, fill: body });
        pitMark(g, px(X0), py(hAt(X0, Y0)), e);
        text(g, px(X0) + 24, py(hAt(X0, Y0)) - 18, L.pitSize, { size: 15, fill: accent, weight: 600, anchor: "start", opacity: e });
        text(g, 70, 258, L.depth, { size: 15, weight: 600, anchor: "start", opacity: e });
        strip(g, SX, SY, SS, greyFill, e);
        pitMark(g, SX + X0 * SS + SS / 2, SY + Y0 * SS + SS / 2, e);
      }

      if (i === 1) {
        // Histogram of heights (left) and its CDF as a curve, feeding the LUT colour bar
        text(g, 150, 34, L.hist, { weight: 600 });
        const nb = 14, hx0 = 40, hw = 220, hb = 196, hmax = 140;
        const counts = new Array(nb).fill(0);
        all.forEach((h) => { counts[Math.min(nb - 1, Math.floor(((h - sorted[0]) / (sorted.at(-1) - sorted[0])) * nb))] += 1; });
        const cmax = Math.max(...counts);
        counts.forEach((c, k) => {
          const hh = (Math.sqrt(c) / Math.sqrt(cmax)) * (hmax - 30);
          kit.svg("rect", { x: hx0 + k * (hw / nb) + 1, y: hb - hh, width: hw / nb - 2, height: hh, fill: rgb(ramp((k + 0.5) / nb)), opacity: 0.35 + 0.55 * e }, g);
        });
        line(g, [hx0 - 4, hb], [hx0 + hw + 4, hb], { stroke: body, w: 1.2 });
        text(g, hx0 + hw / 2, hb + 20, `${L.height}: ${L.low} → ${L.high}`, { size: 15, fill: body });
        let acc = 0;
        const cpts = counts.map((c, k) => { acc += c; return `${(hx0 + (k + 1) * (hw / nb)).toFixed(1)},${(hb - (acc / all.length) * hmax * e).toFixed(1)}`; });
        kit.svg("polyline", { points: `${hx0},${hb} ${cpts.join(" ")}`, fill: "none", stroke: ink, "stroke-width": 2 }, g);
        text(g, hx0 + hw + 8, hb - hmax * e + 4, L.cdf, { size: 15, anchor: "start", weight: 600, opacity: e });

        // LUT bar
        text(g, 440, 34, L.lut, { weight: 600 });
        for (let k = 0; k < 40; k++) kit.svg("rect", { x: 330 + k * 5.5, y: 70, width: 5.6, height: 22, fill: rgb(ramp(k / 39)) }, g);
        text(g, 330, 112, "B", { size: 15, weight: 600, anchor: "start" });
        text(g, 440, 112, "G", { size: 15, weight: 600 });
        text(g, 550, 112, "R", { size: 15, weight: 600, anchor: "end" });
        arrow(g, [440, 124], [440, 150], {});
        text(g, 440, 172, "i(k) = ⌊CDF(k) × 255⌋", { size: 15, fill: body });

        text(g, 70, 258, L.pseudo, { size: 15, weight: 600, anchor: "start" });
        strip(g, SX, SY, SS, pseudoFill, 1);
        pitMark(g, SX + X0 * SS + SS / 2, SY + Y0 * SS + SS / 2, 1);
      }

      if (i === 2) {
        text(g, 320, 34, L.normals, { weight: 600 });
        drawProfile(g, 1);
        for (let x = 3; x <= NX - 4; x += (Math.abs(x - X0) < 5 ? 0.75 : 4.5)) {
          const h0 = hAt(x, Y0), dh = (hAt(x + 0.5, Y0) - hAt(x - 0.5, Y0)) * SLOPE;
          const n = norm([-dh, 1]);
          const near = Math.abs(x - X0) < 5;
          const len = 34 * e;
          arrow(g, [px(x), py(h0)], [px(x) + n[0] * len, py(h0) - n[1] * len], { stroke: near ? accent : body, w: near ? 1.8 : 1.2, head: 6 });
        }
        text(g, px(20), py(hAt(20, Y0)) - 52, L.smooth, { size: 15, fill: body, opacity: e });
        text(g, px(X0) + 34, py(hAt(X0, Y0)) - 56, L.abrupt, { size: 15, fill: accent, weight: 600, anchor: "start", opacity: e });
        text(g, 320, 290, "n = v₁ × v₂ ,  v₁ = P(x+1, y+1) − P(x, y) ,  v₂ = P(x, y+1) − P(x+1, y)", { size: 15, fill: body, opacity: e });
      }

      if (i === 3) {
        // Brightness along the cross-section, with light and view directions
        text(g, 150, 34, L.bright, { weight: 600 });
        text(g, 150, 56, L.formula, { size: 15, fill: body });
        const bx0 = 40, bw = 240, bb = 200, bh = 120;
        const vals = [];
        for (let x = 0; x <= NX - 2; x += 0.25) vals.push([x, shade(x, Y0)]);
        const vmax = Math.max(...vals.map((v) => v[1]));
        const pts = vals.map(([x, v]) => `${(bx0 + (x / (NX - 2)) * bw).toFixed(1)},${(bb - (v / vmax) * bh * e).toFixed(1)}`);
        line(g, [bx0, bb], [bx0 + bw, bb], { stroke: body, w: 1.2 });
        kit.svg("polyline", { points: pts.join(" "), fill: "none", stroke: accent, "stroke-width": 2 }, g);
        const xp = bx0 + (X0 / (NX - 2)) * bw;
        line(g, [xp, bb + 6], [xp, bb - bh - 6], { stroke: mute, dash: "3 4", w: 1.2 });
        text(g, xp, bb + 24, L.pit, { size: 15, fill: accent, weight: 600 });

        // light / view glyph
        const gx = 440, gy = 150;
        line(g, [gx - 80, gy + 40], [gx + 80, gy + 40], { stroke: body, w: 2 });
        arrow(g, [gx, gy + 40], [gx, gy - 30], { stroke: ink, w: 1.6 });
        text(g, gx + 8, gy - 34, "N", { size: 15, italic: true, weight: 600, anchor: "start" });
        arrow(g, [gx - 70, gy - 40], [gx - 4, gy + 34], { stroke: accent, w: 1.6 });
        text(g, gx - 74, gy - 48, L.light, { size: 15, fill: accent, weight: 600 });
        arrow(g, [gx + 4, gy + 34], [gx + 64, gy - 30], { stroke: body, w: 1.6 });
        text(g, gx + 70, gy - 38, L.view, { size: 15, fill: body, weight: 600 });

        text(g, 70, 258, L.rendered, { size: 15, weight: 600, anchor: "start" });
        strip(g, SX, SY, SS, (x, y) => (e < 0.5 ? pseudoFill(x, y) : renderFill(x, y)), 1);
        pitMark(g, SX + X0 * SS + SS / 2, SY + Y0 * SS + SS / 2, 1);
        text(g, 560, 304, L.product, { size: 15, weight: 600, fill: body });
      }

      if (i === 4) {
        text(g, 320, 34, L.net, { weight: 600 });
        // input thumbnail
        const tx = 24, ty = 92, ts = 1.75;
        strip(g, tx, ty, ts, renderFill, 1);
        arrow(g, [tx + NX * ts + 8, ty + 18], [tx + NX * ts + 34, ty + 18], {});

        // Haar subbands
        const qx = 220, qy = 70, qs = 44;
        text(g, qx + qs + 3, qy - 12, L.wds, { size: 15, weight: 600 });
        [["LL", L.lowf, accent], ["LH", L.highf, mute], ["HL", L.highf, mute], ["HH", L.highf, mute]].forEach(([nm, , c], k) => {
          const x = qx + (k % 2) * (qs + 6), y = qy + Math.floor(k / 2) * (qs + 6);
          kit.svg("rect", { x, y, width: qs, height: qs, rx: 3, fill: c, opacity: k === 0 ? 0.35 : 0.25 * e + 0.1, stroke: rule }, g);
          text(g, x + qs / 2, y + qs / 2 + 6, nm, { size: 15, weight: 600 });
        });
        text(g, qx + qs + 3, qy + 2 * qs + 34, `LL = ${L.lowf} · LH, HL, HH = ${L.highf}`, { size: 14, fill: body });
        arrow(g, [qx + 2 * qs + 16, qy + qs], [qx + 2 * qs + 46, qy + qs], {});

        // inverse wavelet upsampling
        const ux = 400;
        text(g, ux + 52, qy - 12, L.iwu, { size: 15, weight: 600 });
        for (let k = 0; k < 3; k++) {
          const w = 30 + k * 22;
          kit.svg("rect", { x: ux + 52 - w / 2, y: qy + 8 + k * 30, width: w, height: 22, rx: 3, fill: accent, opacity: 0.18 + 0.12 * k * e, stroke: rule }, g);
          text(g, ux + 52, qy + 25 + k * 30, "IWT", { size: 14, fill: body });
        }

        // detection result
        arrow(g, [ux + 52, qy + 98], [ux + 52, 214], {});
        strip(g, 272, 222, 4, renderFill, 1);
        const bx = 272 + (X0 - 5) * 4, by = 222 + (Y0 - 5) * 4;
        kit.svg("rect", { x: bx, y: by, width: 10 * 4, height: 10 * 4, fill: "none", stroke: accent, "stroke-width": 2.2, opacity: e }, g);
        text(g, bx + 4, by - 8, L.detect, { size: 15, fill: accent, weight: 600, anchor: "start", opacity: e });
      }
    },
  });
}
