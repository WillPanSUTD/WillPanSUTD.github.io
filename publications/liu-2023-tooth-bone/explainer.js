// DDMF schematic (side view of five lower teeth, FDI 32-36):
// CBCT slices -> TSTNet -> 3D teeth + alveolar bone (coarse crowns) ->
// intraoral scan -> IOSNet numbers the crowns, gum removed ->
// closed bite in CBCT: point curvature finds the contact, jaws are split ->
// two-stage registration of IOS crowns onto the CBCT jaw (global RANSAC, then multiscale ICP) ->
// CBCT crowns replaced by IOS crowns: fused crown-root-bone model.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "CBCT shows teeth inside the bone. TSTNet labels every pixel of each 2D CBCT slice as tooth, alveolar bone or background, and the labelled slices are rebuilt into 3D meshes. Roots and bone are complete, but the crowns are coarse and error-prone.",
        "An intraoral scan records the visible surface sharply. IOSNet labels each mesh face as gum or as one of 32 teeth, numbered in the FDI system. With the gum removed, precise crowns remain, but there are no roots.",
        "CBCT usually holds both jaws, often biting together so upper and lower teeth touch. A point-curvature feature marks the sharp creases where surfaces meet; cutting there separates the teeth, which are then grouped into upper and lower jaws.",
        "The numbered IOS crowns are registered to the matching CBCT jaw in two stages: a global match (RANSAC on FPFH features) gives a rough pose, then point-to-plane ICP at three scales refines it.",
        "CBCT crown points that lie close to the IOS crowns are cut away, the IOS crowns take their place, and Poisson reconstruction makes one mesh: sharp crowns from IOS, roots and bone from CBCT, tooth numbers from IOS.",
      ],
      slices: "CBCT slices", net: "TSTNet", tooth: "tooth", bone: "bone",
      roots: "roots + bone", coarse: "coarse crowns",
      ios: "intraoral scan", iosnet: "IOSNet", gum: "gum", noRoots: "no roots", sharp: "sharp crowns",
      upper: "upper jaw", lower: "lower jaw", contact: "teeth touch", curv: "curvature", split: "jaws split",
      global: "1  global: RANSAC", fine: "2  fine: ICP × 3 scales",
      fromIos: "crowns ← IOS", fromCbct: "roots, bone ← CBCT",
      stat: "avg. surface distance 0.17 mm", time: "20–25 min (experts: 300–400 min)",
    },
    zh: {
      steps: [
        "CBCT 能看到牙槽骨内的牙齿。TSTNet 将每张二维 CBCT 切片的每个像素标为牙齿、牙槽骨或背景，再由标注后的切片重建出三维网格。牙根与牙槽骨完整，但牙冠粗糙、易出错。",
        "口内扫描能清晰记录口腔内可见的表面。IOSNet 将网格的每个面片标为牙龈或 32 颗牙齿之一，并按 FDI 牙位编号。去除牙龈后得到精确的牙冠，但没有牙根。",
        "CBCT 通常同时包含上下颌，且常处于咬合状态，上下牙相互接触。点曲率特征能标出表面相接处的尖锐折痕；沿此切开即可分离各颗牙齿，再将其归入上颌和下颌。",
        "带编号的口扫牙冠与对应的 CBCT 颌骨分两步配准：先用基于 FPFH 特征的 RANSAC 做全局匹配，得到粗略位姿；再在三个尺度上做点到面 ICP 精细调整。",
        "删去 CBCT 中与口扫牙冠距离很近的牙冠点，以口扫牙冠取而代之，再经泊松重建得到一个完整网格：牙冠来自口扫，牙根和牙槽骨来自 CBCT，牙位编号来自口扫。",
      ],
      slices: "CBCT 切片", net: "TSTNet", tooth: "牙齿", bone: "牙槽骨",
      roots: "牙根 + 牙槽骨", coarse: "牙冠粗糙",
      ios: "口内扫描", iosnet: "IOSNet", gum: "牙龈", noRoots: "无牙根", sharp: "牙冠清晰",
      upper: "上颌", lower: "下颌", contact: "上下牙接触", curv: "点曲率", split: "上下颌分离",
      global: "1  全局：RANSAC", fine: "2  精细：三尺度 ICP",
      fromIos: "牙冠 ← 口扫", fromCbct: "牙根、牙槽骨 ← CBCT",
      stat: "平均表面距离 0.17 mm", time: "20–25 分钟（专家需 300–400 分钟）",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal anatomical colours: alveolar bone, gum, and the high-curvature contact marks.
  const BONE = "#d9c49a";
  const GUM = "#e79a9a";
  const CURV = "#d64545";

  const seg01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

  const { text, line, arrow } = kit.pen({ textSize: 21, stroke: body });

  // Five lower teeth, FDI 32 (lateral incisor) to 36 (first molar). w = width; cusps = occlusal profile
  // as [u (0..1 across the crown), height above the crown shoulder]; roots = apex offsets (u) and length factor.
  const TEETH = [
    { fdi: 32, w: 30, ch: 46, rl: 1.0, cusps: [[0.15, 0.9], [0.5, 1.0], [0.85, 0.9]], roots: [0.5] },
    { fdi: 33, w: 36, ch: 52, rl: 1.25, cusps: [[0.1, 0.62], [0.5, 1.0], [0.9, 0.62]], roots: [0.5] },
    { fdi: 34, w: 38, ch: 44, rl: 1.05, cusps: [[0.12, 0.7], [0.35, 1.0], [0.62, 0.72], [0.88, 0.82]], roots: [0.5] },
    { fdi: 35, w: 38, ch: 42, rl: 1.05, cusps: [[0.12, 0.72], [0.35, 1.0], [0.62, 0.76], [0.88, 0.86]], roots: [0.5] },
    { fdi: 36, w: 54, ch: 40, rl: 0.95, cusps: [[0.08, 0.75], [0.25, 1.0], [0.5, 0.82], [0.75, 1.0], [0.92, 0.75]], roots: [0.22, 0.78] },
  ];
  const GAP = 4;
  const ROW_W = TEETH.reduce((s, d) => s + d.w, 0) + GAP * (TEETH.length - 1);
  // x positions for a row starting at x0
  const layout = (x0) => {
    let x = x0;
    return TEETH.map((d) => { const c = x + d.w / 2; x += d.w + GAP; return c; });
  };

  // Crown outline (closed path) above the cemento-enamel junction at y0; dir = -1 grows upward (lower jaw).
  const crownPath = (d, cx, y0, dir, rough, seed) => {
    const r = kit.rng(seed);
    const half = d.w / 2;
    const pts = [[cx - half * 0.86, y0]];
    pts.push([cx - half * 1.02, y0 + dir * d.ch * 0.45]);
    for (const [u, h] of d.cusps) pts.push([cx - half + u * d.w, y0 + dir * d.ch * h]);
    pts.push([cx + half * 1.02, y0 + dir * d.ch * 0.45]);
    pts.push([cx + half * 0.86, y0]);
    let out = pts;
    if (rough) {
      // densify and jitter: a blocky, low-resolution surface
      out = [];
      for (let k = 0; k < pts.length - 1; k++) {
        const [a, b] = [pts[k], pts[k + 1]];
        for (let s = 0; s < 3; s++) {
          const f = s / 3;
          const j = s === 0 && k === 0 ? 0 : 1;
          out.push([a[0] + (b[0] - a[0]) * f + j * (r() - 0.5) * 3.5, a[1] + (b[1] - a[1]) * f + j * (r() - 0.5) * 3.5]);
        }
      }
      out.push(pts[pts.length - 1]);
      return "M" + out.map((p) => p.map((v) => v.toFixed(1)).join(",")).join("L") + "Z";
    }
    // smooth: quadratic curves through the outline midpoints
    let s = `M${out[0][0].toFixed(1)},${out[0][1].toFixed(1)}`;
    for (let k = 1; k < out.length - 1; k++) {
      const m = [(out[k][0] + out[k + 1][0]) / 2, (out[k][1] + out[k + 1][1]) / 2];
      s += `Q${out[k][0].toFixed(1)},${out[k][1].toFixed(1)} ${m[0].toFixed(1)},${m[1].toFixed(1)}`;
    }
    s += `L${out[out.length - 1][0].toFixed(1)},${out[out.length - 1][1].toFixed(1)}Z`;
    return s;
  };
  const rootPath = (d, cx, y0, dir, len) => {
    const half = d.w / 2;
    if (d.roots.length === 1) {
      const a = [cx, y0 - dir * len * d.rl];
      return `M${cx - half * 0.84},${y0} Q${cx - half * 0.7},${(y0 + a[1]) / 2} ${a[0]},${a[1]} Q${cx + half * 0.7},${(y0 + a[1]) / 2} ${cx + half * 0.84},${y0}Z`;
    }
    const L1 = cx - half + d.roots[0] * d.w, R1 = cx - half + d.roots[1] * d.w;
    const ay = y0 - dir * len * d.rl;
    const fork = y0 - dir * len * 0.3;
    return `M${cx - half * 0.86},${y0} Q${L1 - 8},${(y0 + ay) / 2} ${L1},${ay} Q${L1 + 6},${fork} ${cx},${fork} Q${R1 - 6},${fork} ${R1},${ay} Q${R1 + 8},${(y0 + ay) / 2} ${cx + half * 0.86},${y0}Z`;
  };

  // Draw a jaw: dir = -1 lower jaw (crowns up), +1 upper jaw (crowns down). y0 = CEJ line.
  const jaw = (parent, x0, y0, dir, o = {}) => {
    const g = kit.svg("g", { opacity: o.opacity ?? 1 }, parent);
    const xs = layout(x0);
    const rootLen = o.rootLen || 62;
    if (o.bone) {
      // alveolar bone: from slightly below the CEJ (crest) past the apices
      const top = y0 - dir * 8, bot = y0 - dir * (rootLen * 1.4 + 6);
      kit.svg("rect", {
        x: x0 - 16, y: Math.min(top, bot), width: ROW_W + 32, height: Math.abs(bot - top), rx: 14,
        fill: BONE, "fill-opacity": 0.55 * (o.boneOpacity ?? 1), stroke: BONE, "stroke-width": 1.5,
        "stroke-opacity": o.boneOpacity ?? 1,
      }, g);
    }
    TEETH.forEach((d, k) => {
      const cx = xs[k];
      if (o.roots) {
        kit.svg("path", { d: rootPath(d, cx, y0, dir, rootLen), fill: bg, "fill-opacity": 0.85, stroke: body, "stroke-width": 1.5, opacity: o.rootOpacity ?? 1 }, g);
      }
      if (o.crown) {
        const c = o.crown(k);
        if (c && c.opacity > 0) {
          kit.svg("path", {
            d: crownPath(d, cx, y0, dir, c.rough, 11 + k * 7 + (dir > 0 ? 100 : 0)),
            fill: c.fill, "fill-opacity": c.fillOpacity ?? 0.85, stroke: c.stroke, "stroke-width": c.sw || 1.6,
            "stroke-linejoin": "round", opacity: c.opacity,
          }, g);
        }
      }
    });
    return { g, xs };
  };
  const cbctCrown = (op = 1) => () => ({ rough: true, fill: mute, fillOpacity: 0.45, stroke: body, sw: 1.4, opacity: op });
  const iosCrown = (op = 1) => () => ({ rough: false, fill: accent, fillOpacity: 0.78, stroke: accent, sw: 1.8, opacity: op });
  // Model groups are drawn in local units (jaw at x0 = 0, CEJ at y = 0) and placed with a uniform scale,
  // so the teeth can fill the frame while text stays in screen units.
  const place = (parent, sc, tx, ty, attrs = {}) => kit.svg("g", { transform: `translate(${tx},${ty}) scale(${sc})`, ...attrs }, parent);
  const XS = layout(0);
  const fdiLabels = (parent, sc, tx, y, op) => {
    TEETH.forEach((d, k) => text(parent, tx + XS[k] * sc, y, String(d.fdi), { size: 22, fill: accent, weight: 600, opacity: op }));
  };
  const swatch = (parent, x, y, fill, label, op, o = {}) => {
    kit.svg("rect", { x, y: y - 16, width: 18, height: 18, rx: 3, fill, stroke: o.stroke || "none", "stroke-width": 1, opacity: op }, parent);
    text(parent, x + 26, y, label, { size: 22, anchor: "start", fill: body, opacity: op });
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // left: stack of 2D slices with a schematic dental arch; the front slice gets labelled
        text(g, 104, 40, L.slices, { size: 23, fill: body, weight: 600 });
        const lab = kit.easeOut(seg01(t, 0.05, 0.45));
        for (let n = 4; n >= 0; n--) {
          const x = 30 + n * 14, y = 60 + n * 14;
          kit.svg("rect", { x, y, width: 116, height: 116, rx: 4, fill: ink, "fill-opacity": 0.9, stroke: mute, "stroke-width": 1 }, g);
          const cx = x + 58, cy = y + 52;
          const arch = `M${cx - 40},${cy + 34} Q${cx - 44},${cy - 30} ${cx},${cy - 32} Q${cx + 44},${cy - 30} ${cx + 40},${cy + 34}`;
          kit.svg("path", { d: arch, fill: "none", stroke: mute, "stroke-width": 12, opacity: 0.7 }, g);
          if (n === 0 && lab > 0) kit.svg("path", { d: arch, fill: "none", stroke: BONE, "stroke-width": 12, opacity: 0.9 * lab }, g);
          for (let k = 0; k < 7; k++) {
            const a = Math.PI * (0.08 + (k / 6) * 0.84);
            const px = cx - 40 * Math.cos(a), py = cy + 30 - 58 * Math.sin(a);
            kit.svg("circle", { cx: px, cy: py, r: 5, fill: n === 0 && lab > 0 ? accent : bg, opacity: n === 0 ? 1 : 0.8 }, g);
          }
        }
        kit.svg("circle", { cx: 40, cy: 256, r: 8, fill: accent, opacity: lab }, g);
        text(g, 56, 263, L.tooth, { size: 22, anchor: "start", fill: body, opacity: lab });
        kit.svg("rect", { x: 32, y: 279, width: 16, height: 16, rx: 2, fill: BONE, opacity: lab }, g);
        text(g, 56, 295, L.bone, { size: 22, anchor: "start", fill: body, opacity: lab });
        text(g, 104, 336, L.net, { size: 24, fill: accent, weight: 600, opacity: lab });

        arrow(g, [222, 182], [258, 182], { stroke: body, w: 1.8 });

        // right: 3D model rebuilt from the labelled slices, revealed from the bottom up
        const sc = 1.2, tx = 296, ty = 186;
        const defs = kit.svg("defs", {}, s);
        const cp = kit.svg("clipPath", { id: "liu-reveal" }, defs);
        const yTop = 340 - kit.easeOut(seg01(t, 0.3, 1)) * 320;
        kit.svg("rect", { x: 262, y: yTop, width: 378, height: 360 - yTop }, cp);
        const m = kit.svg("g", { "clip-path": "url(#liu-reveal)" }, g);
        jaw(place(m, sc, tx, ty), 0, 0, -1, { bone: true, roots: true, crown: cbctCrown(1) });
        const v = kit.easeOut(seg01(t, 0.75, 1));
        const mid = tx + (ROW_W / 2) * sc;
        text(g, mid, 84, L.coarse, { size: 24, fill: body, opacity: v });
        line(g, [mid, 94], [mid, 112], { stroke: mute, w: 1.4, opacity: v });
        text(g, mid, 342, L.roots, { size: 24, fill: body, opacity: v });
      }

      if (i === 1) {
        // intraoral scan: crowns + gum, no roots; IOSNet numbers the crowns; then the gum is removed
        const sc = 1.4, tx = (640 - ROW_W * sc) / 2, ty = 214;
        const col = kit.easeOut(seg01(t, 0.15, 0.55));
        const gumOff = kit.easeOut(seg01(t, 0.6, 1));
        const m = place(g, sc, tx, ty);
        let d = `M-18,40 L-18,-6`;
        TEETH.forEach((tt, k) => {
          const l = XS[k] - tt.w / 2, r = XS[k] + tt.w / 2;
          d += `L${l},-4 Q${XS[k]},12 ${r},-4`;
        });
        d += `L${ROW_W + 18},-6 L${ROW_W + 18},40Z`;
        kit.svg("path", { d, fill: GUM, "fill-opacity": 0.6, stroke: GUM, "stroke-width": 1.2, opacity: 1 - gumOff }, m);
        jaw(m, 0, 0, -1, { crown: () => ({ rough: false, fill: mute, fillOpacity: 0.5, stroke: body, sw: 1.3, opacity: 1 - col }) });
        jaw(m, 0, 0, -1, { crown: iosCrown(col) });
        const ghost = kit.svg("g", { opacity: 0.6 * gumOff }, m);
        TEETH.forEach((tt, k) => {
          kit.svg("path", { d: rootPath(tt, XS[k], 0, -1, 62), fill: "none", stroke: mute, "stroke-width": 1.1, "stroke-dasharray": "3 3" }, ghost);
        });
        fdiLabels(g, sc, tx, 128, col);
        text(g, 320, 42, L.ios, { size: 25, fill: body, weight: 600 });
        text(g, 320, 82, L.iosnet, { size: 24, fill: accent, weight: 600, opacity: col });
        text(g, tx + (ROW_W + 24) * sc, ty + 34, L.gum, { size: 23, anchor: "start", fill: GUM, weight: 600, opacity: 1 - gumOff });
        text(g, 320, 350, `${L.sharp} · ${L.noRoots}`, { size: 24, fill: body, opacity: gumOff });
      }

      if (i === 2) {
        // closed bite in CBCT: upper and lower crowns touch; curvature marks the contact; jaws separate
        const sc = 1.05, tx = (640 - ROW_W * sc) / 2, occl = 178;
        const lift = 26 * kit.easeOut(seg01(t, 0.55, 1));
        const marks = kit.easeOut(seg01(t, 0.1, 0.45));
        const sep = kit.easeOut(seg01(t, 0.6, 1));
        jaw(place(g, sc, tx, occl + 50 * sc), 0, 0, -1, { bone: true, roots: true, rootLen: 46, crown: cbctCrown(1) });
        jaw(place(g, sc, tx, occl - 50 * sc - lift), 0, 0, 1, { bone: true, roots: true, rootLen: 46, crown: cbctCrown(1) });
        // high point-curvature vertices along the contact (before separation)
        const r = kit.rng(7);
        const mg = kit.svg("g", { opacity: marks * (1 - kit.easeOut(seg01(t, 0.5, 0.8))) }, g);
        for (let k = 0; k < 26; k++) {
          const x = tx + (4 + (k / 25) * (ROW_W - 8)) * sc;
          kit.svg("circle", { cx: x, cy: occl + (r() - 0.5) * 8 - 2, r: 3.4, fill: CURV }, mg);
        }
        const yl = occl - lift / 2;
        line(g, [tx - 4, yl], [tx + (ROW_W + 4) * sc, yl], { stroke: body, w: 1.4, dash: "6 5", opacity: sep });
        const lx = tx - 26, rx = tx + (ROW_W + 30) * sc;
        text(g, lx, yl + 8, L.curv, { size: 22, anchor: "end", fill: CURV, weight: 600, opacity: marks * (1 - sep) });
        text(g, lx, yl + 8, L.split, { size: 22, anchor: "end", fill: body, weight: 600, opacity: sep });
        text(g, rx, yl + 8, L.contact, { size: 22, anchor: "start", fill: body, opacity: 1 - sep });
        text(g, rx, 64 - lift, L.upper, { size: 23, anchor: "start", fill: body });
        text(g, rx, 304, L.lower, { size: 23, anchor: "start", fill: body });
      }

      if (i === 3) {
        // registration: IOS crowns move from an arbitrary pose onto the CBCT lower jaw
        const sc = 1.3, tx = (640 - ROW_W * sc) / 2, ty = 208;
        jaw(place(g, sc, tx, ty), 0, 0, -1, { bone: true, roots: true, crown: cbctCrown(1) });
        const g1 = kit.easeOut(seg01(t, 0, 0.6));
        const g2 = kit.easeOut(seg01(t, 0.6, 1));
        // start pose: shifted and rotated; after the global stage: small residual; after ICP: aligned
        const dx = 46 * (1 - g1) + 5 * g1 * (1 - g2);
        const dy = -40 * (1 - g1) - 6 * g1 * (1 - g2);
        const rot = 8 * (1 - g1) - 2.5 * g1 * (1 - g2);
        const cx = ROW_W / 2, cy = -25;
        const mv = kit.svg("g", { transform: `translate(${dx.toFixed(2)},${dy.toFixed(2)}) rotate(${rot.toFixed(2)},${cx},${cy})` }, place(g, sc, tx, ty));
        jaw(mv, 0, 0, -1, { crown: () => ({ rough: false, fill: accent, fillOpacity: 0.45, stroke: accent, sw: 1.6, opacity: 1 }) });
        TEETH.forEach((d, k) => {
          const n = text(mv, XS[k], -62, String(d.fdi), { size: 22 / sc, fill: accent, weight: 600 });
          n.setAttribute("stroke-width", 4 / sc);
        });
        // stage labels along the bottom
        text(g, 300, 350, L.global, { size: 22, anchor: "end", fill: g2 > 0 ? body : accent, weight: g2 > 0 ? 400 : 600 });
        arrow(g, [310, 343], [334, 343], { stroke: mute, w: 1.4 });
        text(g, 344, 350, L.fine, { size: 22, anchor: "start", fill: g2 > 0 ? accent : mute, weight: g2 > 0 ? 600 : 400 });
      }

      if (i === 4) {
        // crown replacement and fusion
        const sc = 1.3, tx = (640 - ROW_W * sc) / 2, ty = 204;
        const cut = kit.easeOut(seg01(t, 0, 0.45));
        const put = kit.easeOut(seg01(t, 0.35, 0.8));
        const m = place(g, sc, tx, ty);
        jaw(m, 0, 0, -1, { bone: true, roots: true, crown: cbctCrown(1 - cut) });
        jaw(m, 0, 0, -1, { crown: iosCrown(put) });
        fdiLabels(g, sc, tx, ty - 66 * sc, put);
        const v = kit.easeOut(seg01(t, 0.7, 1));
        text(g, 320, 34, L.stat, { size: 24, fill: accent, weight: 600, opacity: v });
        text(g, 320, 64, L.time, { size: 21, fill: body, opacity: v });
        swatch(g, 70, 352, accent, L.fromIos, v);
        swatch(g, 330, 352, BONE, L.fromCbct, v, { stroke: body });
      }
    },
  });
}
