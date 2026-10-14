// Plasmon-induced transparency in a coupled triangle-rod unit cell:
// the unit cell and the two polarizations ->
// V-polarized light drives the triangle as a broad, radiative dipole (bright mode); the rod is not driven directly ->
// the near field at the triangle tip excites the rod's multipolar (j = 2) mode, three charge parts (dark mode) ->
// bright and dark modes interfere destructively: a transparency peak (III) rises between dips I and II ->
// sliding the rod sideways (offset Δd) weakens the coupling until the window is gone at Δd = 120 nm.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "One unit cell: a gold nanotriangle (side s = 400 nm) below a gold nanorod (550 × 80 nm), 50 nm thick on quartz, repeated with a 2 µm period. The gap g and the sideways offset Δd are varied. Light arrives at normal incidence, polarized along the rod (H) or across it (V).",
        "Under V polarization the nanotriangle resonates as a dipole. This mode is highly radiative and gives a broad resonance: the bright mode. Light polarized across the rod cannot directly excite the rod's longitudinal plasmons.",
        "The localized surface plasmon at the triangle tip excites the nanorod through its near field. The rod responds with a multipolar mode (labelled j = 2) with three charge parts. It acts as the dark resonator, with a narrow resonance.",
        "Bright and dark modes interfere destructively, and a transmission peak (III) rises from the broad valley. Dip I is the in-phase (bonding) and dip II the out-of-phase (antibonding) coupling. Under H polarization there is only one broad dipolar dip.",
        "Shifting the rod sideways weakens the coupling. At g = 20 nm the window fades as Δd grows from 0 to 120 nm, and at Δd = 120 nm it disappears for every gap tested. The offset has a much stronger effect than the gap.",
      ],
      cell: "unit cell", light: "light at normal incidence",
      hpol: "H: along the rod", vpol: "V: across the rod",
      dims: "s = 400 nm · l = 550 nm · w = 80 nm", vary: "varied: gap g, offset Δd",
      bright: "bright mode", brightSub: "triangle dipole, broad",
      notDriven: "rod: not driven by V light", eField: "E (V)",
      dark: "dark mode", darkSub: "rod, j = 2: three charge parts",
      tip: "near field at the tip",
      wl: "wavelength →", tr: "transmission", sch: "schematic spectrum",
      vCurve: "V polarization", hCurve: "H polarization",
      dI: "I: in phase", dII: "II: out of phase", pIII: "III: PIT window",
      fixed: "g = 20 nm", offset: "Δd = ", nm: " nm",
      gone: "Δd = 120 nm: window disappears", weaker: "coupling weakens",
    },
    zh: {
      steps: [
        "一个单元：金纳米三角（边长 s = 400 nm）位于金纳米棒（550 × 80 nm）下方，厚 50 nm，制作在石英衬底上，以 2 µm 周期排列。改变的参数是间隙 g 和横向偏移 Δd。光垂直入射，偏振方向沿纳米棒（H）或垂直于纳米棒（V）。",
        "在 V 偏振下，纳米三角以偶极模式共振。该模式辐射很强，共振谱线宽：这是亮模。偏振方向垂直于纳米棒的光无法直接激发纳米棒的纵向等离激元。",
        "三角尖端的局域表面等离激元通过近场激发纳米棒。纳米棒以多极模式（记作 j = 2）响应，电荷分为三段。它充当暗共振器，共振谱线窄。",
        "亮模与暗模发生相消干涉，宽谷中升起一个透射峰（III）。谷 I 对应同相（成键）耦合，谷 II 对应反相（反键）耦合。在 H 偏振下只有一个宽的偶极谷。",
        "纳米棒横向偏移会削弱耦合。在 g = 20 nm 时，随着 Δd 从 0 增至 120 nm，透明窗口逐渐消失；Δd = 120 nm 时，所有间隙下窗口都完全消失。偏移对窗口的影响远强于间隙。",
      ],
      cell: "单元结构", light: "光垂直入射",
      hpol: "H：沿纳米棒", vpol: "V：垂直于纳米棒",
      dims: "s = 400 nm · l = 550 nm · w = 80 nm", vary: "改变：间隙 g、偏移 Δd",
      bright: "亮模", brightSub: "三角偶极，谱线宽",
      notDriven: "纳米棒：不被 V 光直接激发", eField: "E (V)",
      dark: "暗模", darkSub: "纳米棒 j = 2：三段电荷",
      tip: "尖端近场",
      wl: "波长 →", tr: "透射率", sch: "示意透射谱",
      vCurve: "V 偏振", hCurve: "H 偏振",
      dI: "I：同相", dII: "II：反相", pIII: "III：PIT 窗口",
      fixed: "g = 20 nm", offset: "Δd = ", nm: " nm",
      gone: "Δd = 120 nm：窗口消失", weaker: "耦合减弱",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: gold metal, positive charge, negative charge.
  const GOLD = "#d9a520", PLUS = "#d64545", MINUS = "#2f6fd6";

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, head: 10 });
  const dim = (g, a, b, o = {}) => { arrow(g, a, b, o); arrow(g, b, a, o); };
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // --- Unit cell, drawn at 0.4 px per nm (the gap is exaggerated so it stays visible) ---
  const SC = 0.4, ROD_L = 550 * SC, ROD_W = 80 * SC, TRI_S = 400 * SC, TRI_H = TRI_S * Math.sqrt(3) / 2;
  const unit = (g, cx, top, o = {}) => {
    const gap = o.gap ?? 22, off = o.off ?? 0, op = o.opacity ?? 1;
    const rx = cx - ROD_L / 2 + off;
    const rod = kit.svg("rect", { x: rx, y: top, width: ROD_L, height: ROD_W, fill: GOLD, stroke: ink, "stroke-width": 1.2, opacity: op }, g);
    if (o.rodFade !== undefined) rod.setAttribute("fill-opacity", o.rodFade);
    const apex = [cx, top + ROD_W + gap];
    const bl = [cx - TRI_S / 2, apex[1] + TRI_H], br = [cx + TRI_S / 2, apex[1] + TRI_H];
    kit.svg("path", { d: path([apex, br, bl]) + "Z", fill: GOLD, stroke: ink, "stroke-width": 1.2, opacity: op }, g);
    return { rx, top, apex, bl, br, rodMid: [rx + ROD_L / 2, top + ROD_W / 2] };
  };
  const charge = (g, x, y, sign, o = {}) => {
    const c = sign > 0 ? PLUS : MINUS;
    kit.svg("circle", { cx: x, cy: y, r: o.r ?? 11, fill: c, opacity: o.opacity ?? 1 }, g);
    kit.text(g, x, y + 6, sign > 0 ? "+" : "−", { size: 18, weight: 700, fill: "#ffffff", opacity: o.opacity ?? 1 });
  };
  const glow = (g, x, y, r, a) => {
    for (const [k, op] of [[1, 0.12], [0.62, 0.22], [0.32, 0.4]]) {
      kit.svg("circle", { cx: x, cy: y, r: r * k, fill: accent, opacity: op * a }, g);
    }
  };

  // --- Schematic transmission spectrum: a broad bright-mode dip; c > 0 cuts a narrow window into it ---
  const spec = (x, c) => {
    const B = 1 / (1 + ((x - 0.58) / 0.2) ** 2);
    const N = 1 / (1 + ((x - 0.42) / 0.05) ** 2);
    return 1 - 0.8 * B * (1 - c * N);
  };
  const NX = 140;
  const curve = (box, c) => Array.from({ length: NX + 1 }, (_, j) => {
    const x = j / NX;
    return [box.x + x * box.w, box.y + ((1 - spec(x, c)) / 0.85) * box.h];
  });
  // extremum positions for the full window (dip I, peak III, dip II), found once
  const C_FULL = 0.75;
  const ext = (() => {
    const v = Array.from({ length: 1001 }, (_, j) => spec(j / 1000, C_FULL));
    let pk = 300; for (let j = 300; j <= 550; j++) if (v[j] > v[pk]) pk = j;
    let d1 = 150; for (let j = 150; j < pk; j++) if (v[j] < v[d1]) d1 = j;
    let d2 = pk; for (let j = pk; j <= 900; j++) if (v[j] < v[d2]) d2 = j;
    return { d1: d1 / 1000, pk: pk / 1000, d2: d2 / 1000 };
  })();
  const at = (box, x, c) => [box.x + x * box.w, box.y + ((1 - spec(x, c)) / 0.85) * box.h];
  const axes = (g, box) => {
    line(g, [box.x, box.y + box.h + 8], [box.x + box.w, box.y + box.h + 8], { stroke: body, w: 1.4 });
    line(g, [box.x, box.y + box.h + 8], [box.x, box.y - 10], { stroke: body, w: 1.4 });
    text(g, box.x + box.w, box.y + box.h + 34, L.wl, { size: 17, anchor: "end", fill: body });
    text(g, box.x + 8, box.y - 18, L.tr, { size: 17, anchor: "start", fill: body });
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
        // unit cell with its parameters; polarization legend on the right
        text(g, 190, 26, L.cell, { size: 19, fill: body, weight: 600 });
        const TOP = 78;
        const u = unit(g, 190, TOP, { opacity: e });
        const v = kit.easeOut(seg01(t, 0.4, 1));
        dim(g, [u.rx, TOP - 12], [u.rx + ROD_L, TOP - 12], { stroke: body, w: 1.3, opacity: v });
        text(g, 190, TOP - 18, "l", { size: 19, italic: true, opacity: v });
        dim(g, [u.rx - 12, TOP], [u.rx - 12, TOP + ROD_W], { stroke: body, w: 1.3, opacity: v, head: 7 });
        text(g, u.rx - 20, TOP + 22, "w", { size: 19, italic: true, anchor: "end", opacity: v });
        line(g, [u.apex[0], u.apex[1]], [u.apex[0] + 40, u.apex[1]], { stroke: mute, w: 1, opacity: v });
        dim(g, [u.apex[0] + 36, TOP + ROD_W], [u.apex[0] + 36, u.apex[1]], { stroke: body, w: 1.3, opacity: v, head: 6 });
        text(g, u.apex[0] + 46, u.apex[1] - 2, "g", { size: 19, italic: true, anchor: "start", opacity: v });
        dim(g, [u.bl[0], u.bl[1] + 16], [u.br[0], u.br[1] + 16], { stroke: body, w: 1.3, opacity: v });
        text(g, 190, u.bl[1] + 40, "s", { size: 19, italic: true, opacity: v });
        text(g, 190, 340, L.dims, { size: 17, fill: body, opacity: v });

        // light: k out of the page, toward the viewer (circle with a dot), H and V arrows
        const lx = 470, ly = 130;
        text(g, lx, 30, L.light, { size: 18, fill: body, weight: 600 });
        kit.svg("circle", { cx: lx, cy: 70, r: 13, fill: "none", stroke: accent, "stroke-width": 2 }, g);
        kit.svg("circle", { cx: lx, cy: 70, r: 3.5, fill: accent }, g);
        text(g, lx + 22, 76, "k", { size: 19, italic: true, anchor: "start", fill: accent });
        const a = kit.easeOut(seg01(t, 0.3, 0.9));
        dim(g, [lx - 50 * a, ly + 40], [lx + 50 * a + 0.01, ly + 40], { stroke: accent, w: 2.4 });
        dim(g, [lx, ly + 40 - 45 * a], [lx, ly + 40 + 45 * a + 0.01], { stroke: accent, w: 2.4 });
        text(g, lx + 60, ly + 46, "H", { size: 19, anchor: "start", fill: accent, weight: 700 });
        text(g, lx + 10, ly - 10, "V", { size: 19, anchor: "start", fill: accent, weight: 700 });
        text(g, lx, 258, L.hpol, { size: 17, fill: body, opacity: a });
        text(g, lx, 284, L.vpol, { size: 17, fill: body, opacity: a });
        text(g, lx, 320, L.vary, { size: 17, fill: accent, weight: 600, opacity: v });
      }

      if (i === 1) {
        // V field drives the triangle as a dipole; the rod stays quiet
        const u = unit(g, 190, 70, { rodFade: 0.45 });
        const cy = (u.apex[1] + u.bl[1]) / 2;
        const sw = Math.sin(e * Math.PI * 2.5); // ends pointing up, toward the + apex
        // the V field arrow, oscillating and ending along the induced dipole (+ at the apex)
        arrow(g, [30, cy + 34 * sw], [30, cy - 34 * sw], { stroke: accent, w: 3 });
        text(g, 34, cy + 70, L.eField, { size: 17, fill: accent, weight: 600 });
        const a = kit.easeOut(seg01(t, 0.2, 0.8));
        charge(g, u.apex[0], u.apex[1] + 26, 1, { opacity: a });
        charge(g, u.bl[0] + 40, u.bl[1] - 12, -1, { opacity: a });
        charge(g, u.br[0] - 40, u.br[1] - 12, -1, { opacity: a });
        // broad radiation: concentric arcs around the triangle
        for (let k = 0; k < 3; k++) {
          const r = 92 + k * 14 + 8 * e;
          kit.svg("circle", { cx: 190, cy: cy + 10, r, fill: "none", stroke: accent, "stroke-width": 1.5, "stroke-dasharray": "3 7", opacity: a * (0.55 - k * 0.15) }, g);
        }
        text(g, 470, 140, L.bright, { size: 22, fill: accent, weight: 700, opacity: a });
        text(g, 470, 170, L.brightSub, { size: 17, fill: body, opacity: a });
        const b = kit.easeOut(seg01(t, 0.5, 1));
        line(g, [u.rx + ROD_L + 6, 86], [368, 86], { stroke: mute, w: 1.2, dash: "4 4", opacity: b });
        text(g, 378, 92, L.notDriven, { size: 17, anchor: "start", fill: body, opacity: b });
        // small broad-dip sketch
        const box = { x: 400, y: 210, w: 140, h: 70 };
        kit.svg("path", { d: path(curve(box, 0)), fill: "none", stroke: accent, "stroke-width": 2.5, opacity: a }, g);
        line(g, [box.x, box.y + box.h + 12], [box.x + box.w, box.y + box.h + 12], { stroke: body, w: 1.2, opacity: a });
        text(g, box.x + box.w + 10, box.y + box.h + 18, L.wl.replace(" →", ""), { size: 15, anchor: "start", fill: body, opacity: a });
      }

      if (i === 2) {
        // tip near field excites the rod's j = 2 mode: three charge parts
        const u = unit(g, 190, 70);
        const a = kit.easeOut(seg01(t, 0, 0.5));
        glow(g, u.apex[0], u.apex[1] - 8, 44, a);
        const b = kit.easeOut(seg01(t, 0.35, 0.9));
        const yr = u.top + ROD_W / 2;
        charge(g, u.rx + 30, yr, -1, { opacity: b });
        charge(g, u.rx + ROD_L / 2, yr, 1, { opacity: b });
        charge(g, u.rx + ROD_L - 30, yr, -1, { opacity: b });
        // node markers between the charge parts
        for (const fx of [0.3, 0.7]) line(g, [u.rx + ROD_L * fx, u.top - 6], [u.rx + ROD_L * fx, u.top + ROD_W + 6], { stroke: ink, w: 1.4, dash: "3 3", opacity: b });
        line(g, [u.apex[0] + 30, u.apex[1] - 6], [372, 200], { stroke: mute, w: 1.2, dash: "4 4", opacity: a });
        text(g, 470, 206, L.tip, { size: 17, fill: accent, weight: 600, opacity: a });
        line(g, [u.rx + ROD_L + 6, 86], [372, 100], { stroke: mute, w: 1.2, dash: "4 4", opacity: b });
        text(g, 470, 92, L.dark, { size: 22, fill: accent, weight: 700, opacity: b });
        text(g, 470, 122, L.darkSub, { size: 17, fill: body, opacity: b });
        // narrow-resonance sketch
        const box = { x: 410, y: 250, w: 120, h: 60 };
        const nar = Array.from({ length: 61 }, (_, j) => {
          const x = j / 60;
          return [box.x + x * box.w, box.y + box.h * 0.85 / (1 + ((x - 0.5) / 0.06) ** 2)];
        });
        kit.svg("path", { d: path(nar), fill: "none", stroke: accent, "stroke-width": 2.5, opacity: b }, g);
        line(g, [box.x, box.y + box.h + 6], [box.x + box.w, box.y + box.h + 6], { stroke: body, w: 1.2, opacity: b });
      }

      if (i === 3) {
        // destructive interference: the V spectrum grows a window; H keeps one broad dip
        const box = { x: 70, y: 60, w: 380, h: 230 };
        axes(g, box);
        text(g, 468, 62, L.sch, { size: 16, anchor: "start", fill: body, weight: 600 });
        kit.svg("path", { d: path(curve(box, 0)), fill: "none", stroke: mute, "stroke-width": 2.5, "stroke-dasharray": "7 5" }, g);
        const c = C_FULL * kit.easeOut(seg01(t, 0.1, 0.8));
        kit.svg("path", { d: path(curve(box, c)), fill: "none", stroke: accent, "stroke-width": 3.2 }, g);
        // legend
        line(g, [468, 92], [496, 92], { stroke: accent, w: 3.2 });
        text(g, 504, 98, L.vCurve, { size: 16, anchor: "start", fill: body });
        line(g, [468, 122], [496, 122], { stroke: mute, w: 2.5, dash: "7 5" });
        text(g, 504, 128, L.hCurve, { size: 16, anchor: "start", fill: body });
        const v = kit.easeOut(seg01(t, 0.7, 1));
        const p1 = at(box, ext.d1, C_FULL), p3 = at(box, ext.pk, C_FULL), p2 = at(box, ext.d2, C_FULL);
        arrow(g, [p3[0] + 28, p3[1] - 28], [p3[0] + 6, p3[1] - 6], { stroke: ink, w: 1.6, opacity: v, head: 8 });
        text(g, p3[0] + 32, p3[1] - 32, L.pIII, { size: 17, anchor: "start", fill: accent, weight: 700, opacity: v });
        arrow(g, [p1[0] - 40, p1[1] + 34], [p1[0] - 4, p1[1] + 6], { stroke: ink, w: 1.6, opacity: v, head: 8 });
        text(g, p1[0] - 44, p1[1] + 52, L.dI, { size: 17, anchor: "end", fill: body, opacity: v });
        arrow(g, [p2[0] + 36, p2[1] + 8], [p2[0] + 7, p2[1] + 2], { stroke: ink, w: 1.6, opacity: v, head: 8 });
        text(g, p2[0] + 40, p2[1] + 14, L.dII, { size: 17, anchor: "start", fill: body, opacity: v });
      }

      if (i === 4) {
        // slide the rod sideways: the window shrinks and is gone at 120 nm
        const m = kit.easeOut(seg01(t, 0.05, 0.85));
        const dnm = Math.round(120 * m);
        const u = unit(g, 150, 80, { off: dnm * SC * 1.2 });
        // dashed outline: rod centred (Δd = 0)
        kit.svg("rect", { x: 150 - ROD_L / 2, y: 80, width: ROD_L, height: ROD_W, fill: "none", stroke: mute, "stroke-width": 1.3, "stroke-dasharray": "5 4" }, g);
        line(g, [150, 70], [150, u.apex[1]], { stroke: ink, w: 1.3, dash: "4 3" });
        line(g, [u.rodMid[0], 70], [u.rodMid[0], 80 + ROD_W], { stroke: ink, w: 1.3, dash: "4 3" });
        text(g, 150, 330, L.offset + dnm + L.nm, { size: 20, fill: ink, weight: 700 });
        text(g, 132, 130, L.fixed, { size: 17, anchor: "end", fill: body });
        glow(g, u.apex[0], u.apex[1] - 8, 40, 1 - m);

        const box = { x: 330, y: 70, w: 280, h: 190 };
        axes(g, box);
        kit.svg("path", { d: path(curve(box, C_FULL * (1 - m))), fill: "none", stroke: accent, "stroke-width": 3 }, g);
        const v = kit.easeOut(seg01(t, 0.4, 0.9));
        text(g, box.x + box.w / 2, 318, L.weaker, { size: 17, fill: body, opacity: v });
        text(g, box.x + box.w / 2, 346, L.gone, { size: 18, fill: accent, weight: 700, opacity: kit.easeOut(seg01(t, 0.85, 1)) });
      }
    },
  });
}
