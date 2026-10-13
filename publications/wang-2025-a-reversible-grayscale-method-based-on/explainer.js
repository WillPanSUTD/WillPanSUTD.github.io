// Bit-field HSV encoding, one pixel: normalise -> RGB to HSV -> split 16 bits (a, b, c) ->
// quantise and pack into one 16-bit grey value -> unpack with shifts/masks and convert back to RGB.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Take one 8-bit RGB pixel and normalise its three channels to [0, 1].",
        "Convert to HSV: hue H (an angle), saturation S and value V.",
        "Split the 16 bits of the output pixel into a + b + c bits for H, S and V, either from the component variances or by a fixed scheme. Here Scheme 1: a = 6, b = 4, c = 6.",
        "Quantise H, S and V to their bit widths and pack them side by side: one 16-bit grayscale value.",
        "Decoding reverses it: shifts and masks recover the fields, then HSV to RGB. Only quantisation error remains.",
      ],
      pixel: "RGB pixel", div: "÷ 255", gray: "16-bit gray",
      input: "input", decoded: "decoded",
      alloc: "a ∝ Var(H),  b ∝ Var(S),  c = 16 − a − b",
      scheme: "or a fixed scheme, e.g. Scheme 1: (6, 4, 6)",
    },
    zh: {
      steps: [
        "取一个 8 位 RGB 像素，将三个通道归一化到 [0, 1]。",
        "转换到 HSV 空间：色调 H（角度）、饱和度 S 和明度 V。",
        "把输出像素的 16 位划分为 a + b + c 位，分别存放 H、S、V，可按各分量方差分配，也可采用固定方案。此处为方案 1：a = 6，b = 4，c = 6。",
        "把 H、S、V 量化到各自的位宽，并依次拼接，得到一个 16 位灰度值。",
        "解码时逆向操作：移位与掩码取回各字段，再由 HSV 转回 RGB，误差只来自量化。",
      ],
      pixel: "RGB 像素", div: "÷ 255", gray: "16 位灰度",
      input: "输入", decoded: "解码",
      alloc: "a ∝ Var(H)，b ∝ Var(S)，c = 16 − a − b",
      scheme: "或采用固定方案，如方案 1：(6, 4, 6)",
    },
  }, lang);

  const { ink, body, mute, rule } = kit.palette();
  // Literal field colours: hue, saturation, value bit fields.
  const FC = ["#c2570c", "#0f766e", "#6d28d9"];

  // --- The worked example, computed with the paper's equations (Sec. III-B, III-C) -------------
  const RGB = [200, 120, 60];
  const A = 6, B = 4, C = 6;                     // Scheme 1 (Table I)
  const [r, g, b] = RGB.map((v) => v / 255);
  const cmax = Math.max(r, g, b), cmin = Math.min(r, g, b), d = cmax - cmin;
  let H = 0;
  if (d > 0) {
    if (cmax === r) H = 60 * ((((g - b) / d) % 6 + 6) % 6);
    else if (cmax === g) H = 60 * ((b - r) / d + 2);
    else H = 60 * ((r - g) / d + 4);
  }
  const S = cmax === 0 ? 0 : d / cmax;
  const V = cmax;
  const gamV = (x) => Math.pow(x, 0.45);         // the paper's example gamma for V
  const Hq = Math.floor((H / 360) * (2 ** A - 1));
  const Sq = Math.floor(S * (2 ** B - 1));
  const Vq = Math.floor(gamV(V) * (2 ** C - 1));
  const IG = (Hq << (B + C)) | (Sq << C) | Vq;
  const bits = IG.toString(2).padStart(16, "0").split("");
  // decode
  const H2 = (Hq / (2 ** A - 1)) * 360;
  const S2 = Sq / (2 ** B - 1);
  const V2 = Math.pow(Vq / (2 ** C - 1), 1 / 0.45);
  const cc = V2 * S2, xx = cc * (1 - Math.abs(((H2 / 60) % 2) - 1)), m = V2 - cc;
  const sect = Math.floor(H2 / 60) % 6;
  const tmp = [[cc, xx, 0], [xx, cc, 0], [0, cc, xx], [0, xx, cc], [xx, 0, cc], [cc, 0, xx]][sect];
  const RGB2 = tmp.map((v) => Math.floor((v + m) * 255));
  const rgbStr = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6 });
  const f2 = (v) => v.toFixed(2);

  // 16-cell register, MSB on the left.
  const X0 = 80, CW = 30;
  const fieldW = [A, B, C];
  const register = (s, y, h, { widths = fieldW, showBits = 0, idx = true } = {}) => {
    let x = X0;
    widths.forEach((w, k) => {
      kit.svg("rect", { x, y, width: w * CW, height: h, fill: FC[k], opacity: 0.18 }, s);
      kit.svg("rect", { x, y, width: w * CW, height: h, fill: "none", stroke: FC[k], "stroke-width": 2 }, s);
      x += w * CW;
    });
    for (let k = 1; k < 16; k++) line(s, [X0 + k * CW, y + 4], [X0 + k * CW, y + h - 4], { stroke: mute, w: 1, opacity: 0.6 });
    if (idx) {
      text(s, X0 + CW / 2, y - 8, "15", { size: 14, fill: body });
      text(s, X0 + 15.5 * CW, y - 8, "0", { size: 14, fill: body });
    }
    for (let k = 0; k < 16; k++) {
      const vis = Math.max(0, Math.min(1, showBits * 16 - k));
      if (vis <= 0) continue;
      text(s, X0 + (k + 0.5) * CW, y + h / 2 + 7, bits[k], { size: 20, weight: 600, fill: ink, opacity: vis, halo: false });
    }
  };
  const centres = () => {
    const c = []; let x = X0;
    fieldW.forEach((w) => { c.push(x + (w * CW) / 2); x += w * CW; });
    return c;
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);

      if (i === 0) {
        kit.svg("rect", { x: 50, y: 100, width: 120, height: 120, rx: 6, fill: rgbStr(RGB), stroke: body, "stroke-width": 1.2 }, s);
        text(s, 110, 252, L.pixel, { size: 18 });
        text(s, 110, 278, `(${RGB.join(", ")})`, { size: 16, fill: body });
        arrow(s, [190, 160], [250, 160], { w: 1.8 });
        text(s, 220, 145, L.div, { size: 18, weight: 600 });
        ["R", "G", "B"].forEach((ch, k) => {
          const x = 300 + k * 100, v = [r, g, b][k], hgt = 170 * v * e;
          line(s, [x - 10, 270], [x + 60, 270], { stroke: rule, w: 1.4 });
          kit.svg("rect", { x, y: 270 - hgt, width: 50, height: hgt, fill: ink, opacity: 0.55 }, s);
          text(s, x + 25, 296, ch, { size: 18, weight: 600 });
          text(s, x + 25, 262 - hgt, f2(v * e), { size: 16, fill: body });
        });
      }

      if (i === 1) {
        kit.svg("rect", { x: 40, y: 130, width: 80, height: 80, rx: 6, fill: rgbStr(RGB), stroke: body, "stroke-width": 1.2 }, s);
        arrow(s, [132, 170], [168, 170], { w: 1.8 });
        // hue dial
        const cx = 260, cy = 170, R = 72;
        kit.svg("circle", { cx, cy, r: R, fill: "none", stroke: rule, "stroke-width": 10 }, s);
        const ang = H * e;
        const rad = (ang * Math.PI) / 180;
        const end = [cx + R * Math.cos(-rad), cy + R * Math.sin(-rad)];
        if (ang > 0.5) {
          kit.svg("path", { d: `M${cx + R} ${cy} A${R} ${R} 0 0 0 ${end[0]} ${end[1]}`, fill: "none", stroke: FC[0], "stroke-width": 10 }, s);
        }
        line(s, [cx, cy], [cx + R + 14, cy], { stroke: mute, w: 1.2, dash: "4 4" });
        line(s, [cx, cy], [cx + (R - 6) * Math.cos(-rad), cy + (R - 6) * Math.sin(-rad)], { stroke: FC[0], w: 2.4 });
        kit.svg("circle", { cx, cy, r: 4, fill: FC[0] }, s);
        text(s, cx + R + 22, cy + 6, "0°", { size: 15, anchor: "start", fill: body });
        text(s, cx, 290, `H = ${(H * e).toFixed(1)}°`, { weight: 600, fill: FC[0] });
        // S, V bars
        [[S, "S", FC[1], 420], [V, "V", FC[2], 520]].forEach(([v, n, col, x]) => {
          const hgt = 170 * v * e;
          kit.svg("rect", { x, y: 260 - 170, width: 50, height: 170, fill: "none", stroke: rule, "stroke-width": 1.4 }, s);
          kit.svg("rect", { x, y: 260 - hgt, width: 50, height: hgt, fill: col, opacity: 0.75 }, s);
          text(s, x + 25, 290, `${n} = ${f2(v * e)}`, { weight: 600, fill: col });
        });
      }

      if (i === 2) {
        const eq = 16 / 3;
        const widths = fieldW.map((w) => eq + (w - eq) * e);
        text(s, 320, 70, "a + b + c = 16", { size: 22, weight: 600 });
        register(s, 130, 56, { widths });
        let x = X0;
        ["H", "S", "V"].forEach((n, k) => {
          const w = widths[k] * CW;
          text(s, x + w / 2, 222, `${n}: ${"abc"[k]} = ${Math.round(widths[k])}`, { size: 18, weight: 600, fill: FC[k], opacity: e });
          x += w;
        });
        text(s, 320, 282, L.alloc, { size: 17, fill: body });
        text(s, 320, 318, L.scheme, { size: 17, fill: body, opacity: e });
      }

      if (i === 3) {
        const cs = centres();
        [`Hq = ${Hq}`, `Sq = ${Sq}`, `Vq = ${Vq}`].forEach((lbl, k) => {
          text(s, cs[k], 70 + 16 * (1 - e), lbl, { size: 18, weight: 600, fill: FC[k], opacity: e });
        });
        register(s, 110, 56, { showBits: e });
        const f = text(s, 320, 222, "I", { size: 17, fill: body, opacity: e });
        kit.svg("tspan", { "font-size": 14, dy: 4 }, f).textContent = "G";
        kit.svg("tspan", { dy: -4 }, f).textContent = " = (Hq ≪ 10) | (Sq ≪ 6) | Vq";
        const op = t > 0.5 ? (t - 0.5) * 2 : 0;
        text(s, 320, 290, `= ${IG}  (${L.gray})`, { size: 20, weight: 600, opacity: op });
      }

      if (i === 4) {
        const cs = centres();
        register(s, 52, 44, { showBits: 1 });
        const ops = ["≫ 10", "(≫ 6) & 15", "& 63"];
        const vals = [`H′ = ${H2.toFixed(1)}°`, `S′ = ${f2(S2)}`, `V′ = ${f2(V2)}`];
        cs.forEach((x, k) => {
          arrow(s, [x, 102], [x, 102 + 62 * e], { stroke: FC[k], w: 1.8 });
          text(s, x + 10, 142, ops[k], { size: 16, fill: FC[k], weight: 600, anchor: "start", opacity: e });
          text(s, x, 192, vals[k], { size: 18, weight: 600, fill: FC[k], opacity: e });
        });
        const op = t > 0.4 ? (t - 0.4) / 0.6 : 0;
        kit.svg("rect", { x: 170, y: 222, width: 60, height: 60, rx: 6, fill: rgbStr(RGB), stroke: body, "stroke-width": 1.2 }, s);
        kit.svg("rect", { x: 410, y: 222, width: 60, height: 60, rx: 6, fill: rgbStr(RGB2), stroke: body, "stroke-width": 1.2, opacity: op }, s);
        text(s, 320, 262, "≈", { size: 30, weight: 600, opacity: op });
        text(s, 200, 312, `${L.input} (${RGB.join(", ")})`, { size: 16, fill: body });
        text(s, 440, 312, `${L.decoded} (${RGB2.join(", ")})`, { size: 16, fill: body, opacity: op });
      }
    },
  });
}
