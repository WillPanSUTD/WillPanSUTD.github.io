// WTAYOLO schematic:
// photometric stereo reduces surface-reflection interference ->
// WTAConv expands the receptive field ->
// channel and spatial attention strengthen important features, suppress redundant ones ->
// weak scratch detected; mAP50 86.8 %, +5.1 % over YOLOv11n, no extra parameters.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A weak scratch on a reflective lithium-battery surface is hard to detect. A photometric stereo system effectively reduces the interference from surface reflections.",
        "The WTAConv module expands the receptive field, enhancing the ability to extract scratch features from the images.",
        "Channel and spatial attention strengthen important features and suppress redundant information.",
        "WTAYOLO detects the subtle scratch. Without increasing the number of parameters, mAP50 rises to 86.8 %, 5.1 % above the YOLOv11n baseline.",
      ],
      raw: "reflective surface", ps: "photometric stereo", clean: "reflections reduced",
      glare: "reflection", scratch: "weak scratch",
      wta: "WTAConv", small: "small receptive field", large: "expanded receptive field",
      chan: "channel attention", spat: "spatial attention",
      keep: "important: strengthened", drop: "redundant: suppressed",
      det: "scratch", map: "mAP50 86.8 %", gain: "+5.1 % over YOLOv11n", params: "no increase in parameters",
    },
    zh: {
      steps: [
        "锂电池表面反光，微弱划痕难以检测。光度立体系统可有效降低表面反射带来的干扰。",
        "WTAConv 模块扩大感受野，从而增强从图像中提取划痕特征的能力。",
        "通道注意力与空间注意力机制强化重要特征，同时抑制冗余信息。",
        "WTAYOLO 检测出细微划痕。在不增加参数量的情况下，mAP50 提升至 86.8%，比基线模型 YOLOv11n 提高 5.1%。",
      ],
      raw: "反光表面", ps: "光度立体", clean: "反射干扰降低",
      glare: "反光", scratch: "微弱划痕",
      wta: "WTAConv", small: "较小感受野", large: "扩大后的感受野",
      chan: "通道注意力", spat: "空间注意力",
      keep: "重要特征：强化", drop: "冗余信息：抑制",
      det: "划痕", map: "mAP50 86.8%", gain: "比 YOLOv11n 提高 5.1%", params: "参数量不增加",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6, head: 10 });

  // Deterministic scratch path in unit coordinates (u, v in [0, 1]).
  const rnd = kit.rng(11);
  const SCR = [];
  for (let k = 0; k <= 14; k++) {
    const u = 0.14 + (0.72 * k) / 14;
    SCR.push([u, 0.72 - 0.42 * (u - 0.14) / 0.72 + (rnd() - 0.5) * 0.035]);
  }
  // Surface texture specks.
  const SPECK = Array.from({ length: 46 }, () => [rnd(), rnd(), 0.5 + rnd()]);

  // A surface panel: metal plate with optional glare, scratch at given strength.
  const panel = (g, x, y, w, h, { glare = 0, scr = 0.3, scrColour = ink, speck = 1 } = {}) => {
    const clipId = `wt-clip-${Math.round(x)}-${Math.round(y)}`;
    const defs = kit.svg("defs", {}, g);
    const cp = kit.svg("clipPath", { id: clipId }, defs);
    kit.svg("rect", { x, y, width: w, height: h, rx: 6 }, cp);
    const inner = kit.svg("g", { "clip-path": `url(#${clipId})` }, g);
    kit.svg("rect", { x, y, width: w, height: h, fill: mute, opacity: 0.28 }, inner);
    for (const [u, v, r] of SPECK) {
      kit.svg("circle", { cx: x + u * w, cy: y + v * h, r: r * 1.3, fill: body, opacity: 0.14 * speck }, inner);
    }
    const d = SCR.map(([u, v], k) => `${k ? "L" : "M"}${(x + u * w).toFixed(1)} ${(y + v * h).toFixed(1)}`).join(" ");
    kit.svg("path", { d, fill: "none", stroke: scrColour, "stroke-width": 2.4, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: scr }, inner);
    if (glare > 0.01) {
      for (const [rx, ry, o] of [[0.36, 0.3, 0.45], [0.24, 0.2, 0.6], [0.13, 0.11, 0.85]]) {
        kit.svg("ellipse", { cx: x + 0.46 * w, cy: y + 0.5 * h, rx: rx * w, ry: ry * h, fill: "#ffffff", opacity: o * glare }, inner);
      }
    }
    kit.svg("rect", { x, y, width: w, height: h, rx: 6, fill: "none", stroke: rule, "stroke-width": 1.4 }, g);
    return d;
  };

  // Feature grid used in steps 2 and 3.
  const GX = 60, GY = 92, CELL = 22, NC = 12, NR = 9;
  const onScratch = (c, r) => {
    const u = (c + 0.5) / NC, v = (r + 0.5) / NR;
    if (u < 0.12 || u > 0.88) return false;
    const vs = 0.72 - 0.42 * (u - 0.14) / 0.72;
    return Math.abs(v - vs) < 0.07;
  };
  const grid = (g, alpha = () => 0.2, fill = () => mute) => {
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      kit.svg("rect", {
        x: GX + c * CELL + 1, y: GY + r * CELL + 1, width: CELL - 2, height: CELL - 2, rx: 2,
        fill: fill(c, r), opacity: alpha(c, r),
      }, g);
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
        const W = 210, H = 170, Y = 110;
        text(g, 40 + W / 2, 86, L.raw, { weight: 600, size: 20 });
        panel(g, 40, Y, W, H, { glare: 1, scr: 0.3 });
        text(g, 40 + 0.4 * W, Y + 0.3 * H, L.glare, { size: 16, fill: body });
        // photometric stereo block
        const bx = 268, bw = 104;
        kit.svg("rect", { x: bx, y: 166, width: bw, height: 58, rx: 8, fill: bg, stroke: accent, "stroke-width": 1.6, opacity: e }, g);
        text(g, bx + bw / 2, L.ps.includes(" ") ? 190 : 201, L.ps.split(" ")[0], { size: 16, fill: accent, weight: 600, opacity: e });
        if (L.ps.includes(" ")) text(g, bx + bw / 2, 212, L.ps.split(" ").slice(1).join(" "), { size: 16, fill: accent, weight: 600, opacity: e });
        arrow(g, [252, 195], [bx - 4, 195], { opacity: e });
        arrow(g, [bx + bw + 2, 195], [386, 195], { opacity: e });
        text(g, 390 + W / 2, 86, L.clean, { weight: 600, size: 20, opacity: e });
        panel(g, 390, Y, W, H, { glare: 1 - e, scr: 0.3 + 0.6 * e });
        text(g, 390 + 0.5 * W, Y + H + 30, L.scratch, { size: 17, fill: ink, opacity: e });
      }

      if (i === 1) {
        grid(g, (c, r) => (onScratch(c, r) ? 0.75 : 0.2), (c, r) => (onScratch(c, r) ? ink : mute));
        // centre cell on the scratch
        const cc = 6, cr = 4;
        const half = 1 + 2 * e; // 3x3 -> 7x7 window
        const x0 = GX + (cc - half + 0.5) * CELL - CELL / 2, y0 = GY + (cr - half + 0.5) * CELL - CELL / 2;
        const side = (2 * half + 1) * CELL;
        kit.svg("rect", { x: x0, y: y0, width: side, height: side, fill: accent, opacity: 0.1 }, g);
        kit.svg("rect", { x: x0, y: y0, width: side, height: side, fill: "none", stroke: accent, "stroke-width": 2.2, rx: 3 }, g);
        kit.svg("rect", { x: GX + cc * CELL, y: GY + cr * CELL, width: CELL, height: CELL, fill: accent, opacity: 0.9 }, g);
        text(g, GX + (NC * CELL) / 2, 66, L.wta, { weight: 700, size: 22, fill: accent });
        // legend on the right
        const lx = 360;
        kit.svg("rect", { x: lx, y: 130, width: 22, height: 22, fill: "none", stroke: accent, "stroke-width": 2, opacity: 1 - e * 0.6 }, g);
        text(g, lx + 34, 147, L.small, { anchor: "start", size: 18, fill: body, opacity: 1 - e * 0.6 });
        kit.svg("rect", { x: lx - 6, y: 186, width: 34, height: 34, fill: accent, "fill-opacity": 0.1, stroke: accent, "stroke-width": 2.2, opacity: Math.max(0.15, e) }, g);
        text(g, lx + 40, 209, L.large, { anchor: "start", size: 18, fill: ink, weight: 600, opacity: Math.max(0.15, e) });
        arrow(g, [lx + 11, 158], [lx + 11, 180], { stroke: accent, opacity: e });
      }

      if (i === 2) {
        // channel attention: bars reweighted
        const base = [0.55, 0.5, 0.6, 0.52, 0.58, 0.5, 0.56, 0.54];
        const imp = [false, true, false, true, false, false, true, false];
        const bx0 = 50, by = 260, bw = 22, gap = 10, hmax = 150;
        text(g, bx0 + (8 * (bw + gap) - gap) / 2, 70, L.chan, { weight: 600, size: 20 });
        base.forEach((b, k) => {
          const target = imp[k] ? 0.95 : 0.18;
          const hgt = hmax * (b + (target - b) * e);
          kit.svg("rect", {
            x: bx0 + k * (bw + gap), y: by - hgt, width: bw, height: hgt, rx: 2,
            fill: imp[k] ? accent : mute, opacity: imp[k] ? 0.85 : 0.45 + 0.15 * (1 - e),
          }, g);
        });
        line(g, [bx0 - 6, by], [bx0 + 8 * (bw + gap), by], { stroke: rule, w: 1.4 });
        // spatial attention map (smaller grid on the right)
        const sx = 352, sy = 96, sc = 20, nc = 12, nr = 8;
        text(g, sx + (nc * sc) / 2, 70, L.spat, { weight: 600, size: 20 });
        for (let r = 0; r < nr; r++) for (let c = 0; c < nc; c++) {
          const u = (c + 0.5) / nc, v = (r + 0.5) / nr;
          const vs = 0.72 - 0.42 * (u - 0.14) / 0.72;
          const hit = u > 0.12 && u < 0.88 && Math.abs(v - vs) < 0.08;
          kit.svg("rect", {
            x: sx + c * sc + 1, y: sy + r * sc + 1, width: sc - 2, height: sc - 2, rx: 2,
            fill: hit ? accent : mute, opacity: hit ? 0.3 + 0.6 * e : 0.35 - 0.22 * e,
          }, g);
        }
        // legend
        kit.svg("rect", { x: 120, y: 300, width: 16, height: 16, fill: accent, opacity: 0.85 }, g);
        text(g, 144, 314, L.keep, { anchor: "start", size: 17, fill: ink, opacity: Math.max(0.2, e) });
        kit.svg("rect", { x: 370, y: 300, width: 16, height: 16, fill: mute, opacity: 0.45 }, g);
        text(g, 394, 314, L.drop, { anchor: "start", size: 17, fill: body, opacity: Math.max(0.2, e) });
      }

      if (i === 3) {
        const X = 40, Y = 80, W = 300, H = 220;
        panel(g, X, Y, W, H, { glare: 0, scr: 0.9 });
        // bounding box around scratch
        const us = SCR.map((p) => p[0]), vs = SCR.map((p) => p[1]);
        const bx = X + (Math.min(...us) - 0.04) * W, by = Y + (Math.min(...vs) - 0.06) * H;
        const bw = (Math.max(...us) - Math.min(...us) + 0.08) * W, bh = (Math.max(...vs) - Math.min(...vs) + 0.12) * H;
        kit.svg("rect", {
          x: bx, y: by, width: bw, height: bh, fill: "none", stroke: accent, "stroke-width": 2.6,
          "stroke-dasharray": `${(2 * (bw + bh) * e).toFixed(1)} 2000`,
        }, g);
        kit.svg("rect", { x: bx, y: by - 24, width: 62, height: 24, fill: accent, opacity: e }, g);
        text(g, bx + 31, by - 6, L.det, { size: 16, fill: "#ffffff", weight: 600, opacity: e, halo: false });
        // results
        const rx = 370;
        text(g, rx, 150, L.map, { anchor: "start", size: 26, weight: 700, fill: ink, opacity: e });
        text(g, rx, 192, L.gain, { anchor: "start", size: 19, fill: accent, weight: 600, opacity: e });
        text(g, rx, 230, L.params, { anchor: "start", size: 18, fill: body, opacity: e });
      }
    },
  });
}
