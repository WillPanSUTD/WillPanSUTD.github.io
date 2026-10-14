// Grayscale-compatible 16-bit encoding, followed through one example pixel:
// BT.601 gray -> high byte; OpenCV hue/saturation -> 4 + 4 bits -> low byte;
// MSB extraction returns the gray exactly; direct HSV inverse (V = gray) gives a coarse colour;
// a 0.47 M-parameter U-Net adds a residual scaled by 0.25.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Encoder, part 1: the standard BT.601 grayscale value G of each RGB pixel is written into the high byte of a 16-bit word.",
        "Part 2: the pixel's hue (OpenCV range 0–179) and saturation (0–255) are each quantized to 4 bits.",
        "The 4-bit hue and 4-bit saturation are packed into the low byte. Shifting the 16-bit word right by 8 bits returns the standard grayscale exactly.",
        "Direct decoder (no training): unpack the word, dequantize hue and saturation, use the gray value as V, and convert HSV back to RGB. The result is a coarse colour.",
        "Refinement: the main model, a 0.47 M-parameter U-Net (UNet-residual), reads the coarse RGB plus the gray, hue and saturation planes (6 channels) and adds a residual scaled by 0.25.",
      ],
      px: "RGB pixel", gray: "gray", high: "high byte: gray (8 bits)", hue: "hue 4b", sat: "sat 4b",
      hueRow: "hue H", satRow: "saturation S", exact: "exact standard gray",
      coarse: "coarse RGB", input: "input", restored: "restored RGB", unet: "U-Net, 0.47 M",
      tohsv: "HSV → RGB", ch: "6-channel input", skip: "skip",
    },
    zh: {
      steps: [
        "编码第一步：把每个 RGB 像素的标准 BT.601 灰度值 G 写入 16 位字的高字节。",
        "第二步：把像素的色相（OpenCV 取值 0–179）和饱和度（0–255）各量化为 4 位。",
        "4 位色相和 4 位饱和度打包进低字节。把 16 位字右移 8 位，即可精确取回标准灰度图。",
        "直接解码（无需训练）：拆出各字段，对色相和饱和度反量化，以灰度值作为 V，再由 HSV 转回 RGB，得到粗略的颜色。",
        "细化：主模型是一个 0.47 M 参数的 U-Net（UNet-residual），它读取粗略 RGB 以及灰度、色相、饱和度三个平面（共 6 通道），叠加一个乘以 0.25 的残差。",
      ],
      px: "RGB 像素", gray: "灰度", high: "高字节：灰度（8 位）", hue: "色相 4 位", sat: "饱和度 4 位",
      hueRow: "色相 H", satRow: "饱和度 S", exact: "精确的标准灰度",
      coarse: "粗略 RGB", input: "输入", restored: "恢复的 RGB", unet: "U-Net，0.47 M",
      tohsv: "HSV → RGB", ch: "6 通道输入", skip: "跳连",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the hue field and the saturation field of the low byte.
  const HUE_C = "#d9776b";
  const SAT_C = "#5b84c4";

  // --- The example pixel, run through the paper's equations (Eqs. 1, 4-7, 8-11) ---
  const RGB = [230, 180, 40];
  const G = Math.round(0.299 * RGB[0] + 0.587 * RGB[1] + 0.114 * RGB[2]);           // 179
  const mx = Math.max(...RGB), mn = Math.min(...RGB), dl = mx - mn;
  let hDeg = mx === RGB[0] ? (60 * (RGB[1] - RGB[2])) / dl : mx === RGB[1] ? 120 + (60 * (RGB[2] - RGB[0])) / dl : 240 + (60 * (RGB[0] - RGB[1])) / dl;
  if (hDeg < 0) hDeg += 360;
  const H = Math.round(hDeg / 2);                                                       // 22 (OpenCV 0-179)
  const S = Math.round((dl / mx) * 255);                                                // 211
  const Hq = Math.round((H * 15) / 179);                                                // 2
  const Sq = Math.round((S * 15) / 255);                                                // 12
  const H8 = (Hq << 4) | Sq;                                                            // 44
  const Y = (G << 8) | H8;                                                              // 45868
  const bits = (v, n) => v.toString(2).padStart(n, "0").split("").map(Number);
  const WORD = [...bits(G, 8), ...bits(Hq, 4), ...bits(Sq, 4)];
  // Direct decoder: dequantize, V = gray, OpenCV HSV -> RGB.
  const Hd = (Hq * 179) / 15, Sd = (Sq * 255) / 15, Vd = G;
  const hsv2rgb = (hh, ss, vv) => {
    const c = vv * (ss / 255), hp = (hh * 2) / 60, x = c * (1 - Math.abs((hp % 2) - 1)), m = vv - c;
    const k = Math.floor(hp) % 6;
    const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
    return t.map((u) => Math.round(u + m));
  };
  const COARSE = hsv2rgb(Hd, Sd, Vd);                                                    // [179, 150, 36]
  // Schematic stand-in for the refined output: most of the way from the coarse colour back to the input.
  const REFINED = COARSE.map((c, k) => Math.round(c + 0.85 * (RGB[k] - c)));
  const css = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
  const grayCss = `rgb(${G},${G},${G})`;

  // Text made of parts: plain strings, or { sub } for a real subscript tspan.
  const T = (g, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(g, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo ?? true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };
  const { line, arrow } = kit.pen({ stroke: body, width: 1.6, head: 9 });
  const box = (g, x, y, w, h, fill, o = {}) =>
    kit.svg("rect", { x, y, width: w, height: h, rx: o.rx ?? 4, fill, stroke: o.stroke ?? body, "stroke-width": o.sw ?? 1.2, opacity: o.opacity ?? 1 }, g);
  const seg01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

  // The 16-bit word: shown[k] in [0,1] is how far cell k has been written.
  const X0 = 96, CW = 28;
  const fieldFill = (k) => (k < 8 ? rule : k < 12 ? HUE_C : SAT_C);
  const drawWord = (g, y, shown, o = {}) => {
    const h = o.h ?? 34;
    for (let k = 0; k < 16; k++) {
      const x = X0 + k * CW;
      box(g, x, y, CW, h, bg, { rx: 0, stroke: mute, sw: 1 });
      const a = shown[k];
      if (a > 0) {
        kit.svg("rect", { x: x + 1, y: y + 1, width: CW - 2, height: h - 2, fill: fieldFill(k), opacity: (k < 8 ? 1 : 0.28) * a }, g);
        T(g, x + CW / 2, y + h / 2 + 6, String(WORD[k]), { size: 17, fill: ink, opacity: a, halo: false });
      }
    }
    // field separators
    for (const k of [8, 12]) line(g, [X0 + k * CW, y - 4], [X0 + k * CW, y + h + 4], { stroke: ink, w: 2 });
    if (o.labels !== false) {
      T(g, X0 - 10, y + h / 2 + 6, "MSB", { size: 15, fill: body, anchor: "end" });
      T(g, X0 + 16 * CW + 10, y + h / 2 + 6, "LSB", { size: 15, fill: body, anchor: "start" });
      T(g, X0 + 4 * CW, y + h + 26, L.high, { size: 16, fill: body, opacity: o.lab?.[0] ?? 1 });
      T(g, X0 + 10 * CW, y + h + 26, L.hue, { size: 16, fill: HUE_C, opacity: o.lab?.[1] ?? 1 });
      T(g, X0 + 14 * CW, y + h + 26, L.sat, { size: 16, fill: SAT_C, opacity: o.lab?.[2] ?? 1 });
    }
  };
  const fill = (f) => Array.from({ length: 16 }, (_, k) => f(k));

  // Quantization strip: 16 bins; marker slides from the exact value to the nearest bin centre.
  const strip = (g, y, label, colourOf, exactIdx, q, e, valueLabel, qLabel, fieldC) => {
    const x0 = 214, bw = 20;
    T(g, x0 - 12, y + 19, label, { size: 17, fill: body, anchor: "end" });
    for (let k = 0; k < 16; k++) box(g, x0 + k * bw, y, bw, 26, colourOf(k), { rx: 0, stroke: bg, sw: 1 });
    const xc = (u) => x0 + bw / 2 + bw * u;
    const u = exactIdx + (q - exactIdx) * e;
    kit.svg("polygon", { points: `${xc(u)},${y - 2} ${xc(u) - 7},${y - 13} ${xc(u) + 7},${y - 13}`, fill: ink }, g);
    box(g, x0 + q * bw, y, bw, 26, "none", { rx: 0, stroke: ink, sw: 2.4, opacity: e });
    T(g, x0 + 16 * bw + 14, y + 19, valueLabel, { size: 17, fill: body, anchor: "start", opacity: 1 - e });
    T(g, x0 + 16 * bw + 14, y + 19, qLabel, { size: 17, fill: fieldC, anchor: "start", weight: 600, opacity: e });
  };

  const swatch = (g, x, y, s, colour, o = {}) => box(g, x, y, s, s, colour, { rx: 6, stroke: ink, sw: 1.4, opacity: o.opacity ?? 1 });

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);
      const WY = 254;

      if (i === 0) {
        swatch(g, 70, 48, 76, css(RGB));
        T(g, 108, 152, L.px, { size: 17, fill: body });
        T(g, 108, 176, `(${RGB.join(", ")})`, { size: 17, fill: body });
        arrow(g, [158, 86], [158 + 92 * e, 86], { stroke: body });
        T(g, 344, 72, "0.299 R + 0.587 G + 0.114 B", { size: 18, opacity: e });
        T(g, 344, 102, "BT.601", { size: 16, fill: body, opacity: e });
        const a2 = seg01(t, 0.35, 0.7);
        swatch(g, 488, 48, 76, grayCss, { opacity: a2 });
        T(g, 526, 152, [`${L.gray} G = ${G}`], { size: 17, fill: body, opacity: a2 });
        // the gray value drops into the high byte
        const a3 = seg01(t, 0.5, 1);
        if (a3 > 0) arrow(g, [526, 184], [X0 + 4 * CW + (526 - X0 - 4 * CW) * (1 - a3), WY - 8], { stroke: accent, opacity: a3 });
        drawWord(g, WY, fill((k) => (k < 8 ? seg01(t, 0.55 + k * 0.05, 0.62 + k * 0.05) : 0)), { lab: [1, 0.35, 0.35] });
      }

      if (i === 1) {
        swatch(g, 20, 52, 60, css(RGB));
        const hueBin = (k) => `hsl(${Math.round((k * 179 * 2) / 15)}, 72%, 55%)`;
        const satBin = (k) => `hsl(${Math.round(Hd * 2)}, ${Math.round((k * 100) / 15)}%, 52%)`;
        strip(g, 50, L.hueRow, hueBin, (H * 15) / 179, Hq, e, `H = ${H}`, `→ ${Hq}`, HUE_C);
        strip(g, 134, L.satRow, satBin, (S * 15) / 255, Sq, e, `S = ${S}`, `→ ${Sq}`, SAT_C);
        T(g, 374, 204, ["H", { sub: "q" }, " = round(15·H / 179),  S", { sub: "q" }, " = round(15·S / 255)"], { size: 16, fill: body, opacity: e });
        drawWord(g, WY, fill((k) => (k < 8 ? 0.6 : 0)), { lab: [0.6, 1, 1] });
      }

      if (i === 2) {
        const aH = seg01(t, 0, 0.45), aS = seg01(t, 0.2, 0.65);
        drawWord(g, WY, fill((k) => (k < 8 ? 1 : k < 12 ? seg01(aH, (k - 8) * 0.2, (k - 8) * 0.2 + 0.4) : seg01(aS, (k - 12) * 0.2, (k - 12) * 0.2 + 0.4))));
        T(g, 320, 44, ["H", { sub: "8" }, " = (H", { sub: "q" }, " << 4) | S", { sub: "q" }, ` = ${H8}`], { size: 18, opacity: seg01(t, 0, 0.5) });
        T(g, 320, 80, ["Y = (G << 8) | H", { sub: "8" }, ` = ${Y}`], { size: 18, opacity: seg01(t, 0.25, 0.7) });
        // MSB extraction
        const a = seg01(t, 0.55, 1);
        const cx = X0 + 4 * CW;
        line(g, [X0 + 2, WY - 12], [X0 + 8 * CW - 2, WY - 12], { stroke: accent, w: 2, opacity: a });
        arrow(g, [cx, WY - 12], [cx, WY - 12 - 26 * a], { stroke: accent, opacity: a });
        swatch(g, cx - 34, 128, 68, grayCss, { opacity: a });
        T(g, cx + 54, 160, `Y >> 8 = ${G}`, { size: 18, anchor: "start", opacity: a });
        T(g, cx + 54, 186, L.exact, { size: 17, fill: accent, anchor: "start", weight: 600, opacity: a });
      }

      if (i === 3) {
        drawWord(g, 22, fill(() => 1), { labels: false, h: 30 });
        const xs = [X0 + 4 * CW, X0 + 10 * CW, X0 + 14 * CW];
        const a1 = seg01(t, 0, 0.35), a2 = seg01(t, 0.25, 0.6), a3 = seg01(t, 0.55, 0.9);
        const rows = [
          [["G = ", String(G)], ["V = G = ", String(G)], body],
          [["H", { sub: "q" }, ` = ${Hq}`], ["H ≈ ", Hd.toFixed(1)], HUE_C],
          [["S", { sub: "q" }, ` = ${Sq}`], ["S = ", String(Math.round(Sd))], SAT_C],
        ];
        rows.forEach(([r1, r2, c], k) => {
          arrow(g, [xs[k], 58], [xs[k], 58 + 22 * a1], { stroke: mute, opacity: a1 });
          T(g, xs[k], 104, r1, { size: 18, fill: c === body ? ink : c, opacity: a1 });
          arrow(g, [xs[k], 114], [xs[k], 114 + 18 * a2], { stroke: mute, opacity: a2 });
          T(g, xs[k], 154, r2, { size: 18, fill: c === body ? ink : c, opacity: a2 });
        });
        // converge into HSV -> RGB
        for (const x of xs) line(g, [x, 166], [x + (330 - x) * a3, 166 + 22 * a3], { stroke: mute, opacity: a3 });
        box(g, 270, 190, 120, 34, bg, { stroke: accent, sw: 1.6, opacity: a3 });
        T(g, 330, 213, L.tohsv, { size: 17, fill: accent, opacity: a3, weight: 600 });
        const a4 = seg01(t, 0.75, 1);
        arrow(g, [330, 226], [330, 226 + 22 * a4], { stroke: accent, opacity: a4 });
        swatch(g, 298, 254, 64, css(COARSE), { opacity: a4 });
        T(g, 376, 284, L.coarse, { size: 17, anchor: "start", opacity: a4, weight: 600 });
        T(g, 376, 308, `(${COARSE.join(", ")})`, { size: 16, fill: body, anchor: "start", opacity: a4 });
        swatch(g, 120, 266, 46, css(RGB), { opacity: 0.9 * a4 });
        T(g, 143, 336, `${L.input} (${RGB.join(", ")})`, { size: 15, fill: body, opacity: a4 });
      }

      if (i === 4) {
        // six input channels
        const rowsY = [70, 128, 172, 216];
        // tiles at x = 100..148, labels to their left
        swatch(g, 100, rowsY[0] - 8, 48, css(COARSE));
        T(g, 90, rowsY[0] + 14, [L.coarse], { size: 15, anchor: "end" });
        T(g, 90, rowsY[0] + 34, "3 ch", { size: 15, fill: body, anchor: "end" });
        box(g, 100, rowsY[1], 48, 30, grayCss, { rx: 3 });
        T(g, 90, rowsY[1] + 21, "G", { size: 17, anchor: "end" });
        box(g, 100, rowsY[2], 48, 30, HUE_C, { rx: 3, opacity: 0.85 });
        T(g, 90, rowsY[2] + 21, ["H", { sub: "q" }], { size: 17, anchor: "end" });
        box(g, 100, rowsY[3], 48, 30, SAT_C, { rx: 3, opacity: 0.85 });
        T(g, 90, rowsY[3] + 21, ["S", { sub: "q" }], { size: 17, anchor: "end" });
        T(g, 124, 284, L.ch, { size: 15, fill: body });
        // U-Net: two-level encoder-decoder, widths 32 -> 64 -> 128 -> 64 -> 32
        const a = seg01(t, 0, 0.45);
        // bracket gathering the six input channels, then the arrow into the U-Net
        kit.svg("path", { d: "M154,62 L162,62 L162,246 L154,246", fill: "none", stroke: body, "stroke-width": 1.6 }, g);
        arrow(g, [162, 160], [162 + 34 * a, 160], { stroke: body, opacity: Math.max(0.15, a) });
        const blocks = [[200, 130], [234, 88], [268, 52], [302, 88], [336, 130]];
        blocks.forEach(([x, h], k) => {
          const ak = seg01(a, k * 0.12, k * 0.12 + 0.5);
          box(g, x, 160 - h / 2, 24, h, accent, { rx: 2, stroke: accent, opacity: 0.18 + 0.5 * ak });
        });
        for (const [x1, x2, yy] of [[212, 348, 86], [246, 314, 108]]) {
          kit.svg("path", { d: `M${x1},${yy + 6} C${x1},${yy - 16} ${x2},${yy - 16} ${x2},${yy + 6}`, fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "4 4", opacity: a }, g);
        }
        T(g, 280, 64, L.skip, { size: 15, fill: body, opacity: a });
        T(g, 280, 246, L.unet, { size: 17, weight: 600, opacity: a });
        // residual * 0.25, plus the coarse base, clip
        const b = seg01(t, 0.35, 0.8);
        arrow(g, [364, 160], [364 + 66 * b, 160], { stroke: body, opacity: b });
        T(g, 396, 150, "× 0.25", { size: 17, fill: accent, opacity: b, weight: 600 });
        kit.svg("circle", { cx: 448, cy: 160, r: 15, fill: bg, stroke: ink, "stroke-width": 1.6, opacity: b }, g);
        T(g, 448, 167, "+", { size: 22, opacity: b, halo: false });
        // coarse base bypasses the network
        kit.svg("path", { d: "M124,54 L124,34 L448,34 L448,138", fill: "none", stroke: mute, "stroke-width": 1.6, opacity: b }, g);
        arrow(g, [448, 120], [448, 144], { stroke: mute, opacity: b });
        const c = seg01(t, 0.6, 1);
        arrow(g, [464, 160], [464 + 40 * c, 160], { stroke: body, opacity: c });
        T(g, 484, 150, "clip", { size: 15, fill: body, opacity: c });
        swatch(g, 512, 124, 72, css(REFINED), { opacity: c });
        T(g, 548, 226, L.restored, { size: 17, weight: 600, opacity: c });
        swatch(g, 524, 252, 48, css(RGB), { opacity: 0.9 * c });
        T(g, 548, 326, L.input, { size: 15, fill: body, opacity: c });
      }
    },
  });
}
