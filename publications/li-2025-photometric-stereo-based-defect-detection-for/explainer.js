// Line-scan photometric stereo for battery top covers, following Sections 2-3 of the paper:
// encoder line signal -> frequency divider -> four strobe signals, one light partition per scan line ->
// the interleaved lines form four images, one per lighting direction ->
// Lambertian model I_k = rho L_k . N, least squares over four lights -> normal N and albedo rho ->
// normals -> curvature; contrast stretching and weighted-least-squares filtering keep scratches, smooth texture ->
// ROI, difference image, thresholding, morphology, feature filtering -> scratches and pits.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Acquisition on the move: the motion platform's encoder sends a line signal; a frequency divider turns it into four strobe signals. Each scan line of the line-scan camera is lit by one partition of a four-part spherical integrating light, in the cycle 1 → 2 → 3 → 4.",
        "The interleaved scan lines are sorted by partition, so one pass over the moving top cover yields four images, each lit from a different direction.",
        "At every pixel, the Lambertian model gives one equation per light: Iₖ = ρ Lₖ · N. With four equations for the three components of ρN, least squares gives the surface normal N and the albedo ρ.",
        "From the normals the method computes a mean curvature map, in which scratches stand out from the surrounding surface. Contrast stretching enlarges these differences, and weighted least-squares filtering smooths the surface texture while keeping the scratch edges.",
        "Detection: select the region of interest, take a difference image, threshold it, refine with morphology and keep regions by shape and grey-level features. On 100 test images, 95.38% of scratches and 96.43% of pits were detected.",
      ],
      dome: "4-partition dome light", slit: "slit", motion: "motion", cover: "top cover",
      enc: "encoder", cam: "camera", cycle: "one light per line: 1 → 2 → 3 → 4 → 1 …",
      lines: "scan lines", sort: "sort by light", img: "image",
      eq1: "4 lights → 4 equations", eq2: "unknowns: 3 components of ρN",
      ls: "least squares → N, ρ", normal: "N", groove: "shallow scratch",
      outA: "albedo ρ → stains, foreign matter", outC: "normals → curvature → scratches, pits",
      curv: "curvature profile", raw: "raw", stretch: "① contrast stretch", wls: "② WLS filter",
      kept: "scratch kept", smooth: "texture smoothed",
      chain: "ROI → difference → threshold → morphology → features",
      roi: "ROI", bin: "binarize", scratch: "scratch", pit: "pit",
      rate: "detection rate: scratches 95.38%, pits 96.43%",
    },
    zh: {
      steps: [
        "运动中采集：运动平台的编码器发出行信号，经分频器生成四路频闪信号。线阵相机每采集一行，只点亮四分区球形积分光源中的一个分区，按 1 → 2 → 3 → 4 循环。",
        "把交错采集的扫描行按光源分区重新归类，运动的顶盖只需扫描一遍，就得到四幅分别从不同方向照明的图像。",
        "对每个像素，朗伯反射模型为每个光源给出一个方程：Iₖ = ρ Lₖ · N。四个方程对应 ρN 的三个分量，用最小二乘法求得表面法向 N 和反射率 ρ。",
        "由法向计算平均曲率图，划痕在其中从周围表面中凸显出来。对比度拉伸放大这些差异，加权最小二乘滤波在平滑表面纹理的同时保留划痕边缘。",
        "缺陷检测：选取感兴趣区域，求差分图像并二值化，经形态学处理后按形状和灰度特征筛选区域。在 100 幅测试图像上，划痕检出率为 95.38%，凹坑检出率为 96.43%。",
      ],
      dome: "四分区球形光源", slit: "狭缝", motion: "运动", cover: "电池顶盖",
      enc: "编码器", cam: "相机", cycle: "每行只亮一个分区：1 → 2 → 3 → 4 → 1 …",
      lines: "扫描行", sort: "按光源归类", img: "图像",
      eq1: "4 个光源 → 4 个方程", eq2: "未知量：ρN 的 3 个分量",
      ls: "最小二乘 → N、ρ", normal: "N", groove: "浅划痕",
      outA: "反射率 ρ → 污渍、异物", outC: "法向 → 曲率 → 划痕、凹坑",
      curv: "曲率剖面", raw: "原始", stretch: "① 对比度拉伸", wls: "② WLS 滤波",
      kept: "保留划痕", smooth: "平滑纹理",
      chain: "ROI → 差分 → 二值化 → 形态学 → 特征筛选",
      roi: "ROI", bin: "二值化", scratch: "划痕", pit: "凹坑",
      rate: "检出率：划痕 95.38%，凹坑 96.43%",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: the four light-source partitions.
  const LIGHT = ["#d64545", "#d98a1c", "#2f8f5b", "#3b6fd1"];

  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const { line, arrow } = kit.pen({ stroke: body, head: 9 });
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");

  // Text made of parts: plain strings, or { sub: "…" } for a subscript (never below 14 units).
  const text = (parent, x, y, parts, o = {}) => {
    const size = o.size || 18;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: o.halo !== false,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };

  // --- Deterministic geometry, built once -------------------------------------
  const rnd = kit.rng(14);
  // Curvature profile: fine texture plus one narrow scratch peak.
  const NP = 120;
  const tex = Array.from({ length: NP }, () => rnd() - 0.5);
  const texSmooth = tex.map((_, j) => {
    let s = 0, n = 0;
    for (let d = -4; d <= 4; d++) if (tex[j + d] !== undefined) { s += tex[j + d]; n++; }
    return s / n;
  });
  const SCR = 66; // scratch index
  const peak = (j) => Math.exp(-((j - SCR) ** 2) / 2.2);
  // Texture speckle on the detection tile (unit disc coordinates).
  const speck = Array.from({ length: 90 }, () => {
    const a = rnd() * Math.PI * 2, r = 0.25 + 0.72 * Math.sqrt(rnd());
    return [r * Math.cos(a), r * Math.sin(a)];
  });
  // Defects in unit-disc coordinates: three scratches and one pit.
  const SCRATCHES = [[[-0.62, -0.55], [-0.5, 0.05]], [[-0.18, 0.12], [0.42, -0.08]], [[0.05, 0.45], [0.22, 0.85]]];
  const PIT = [0.66, 0.5];

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // left: top view of the dome, split into four partitions, with a slit; the cover moves under it
        const C = [150, 190], R = 100, NPULSE = 8;
        const k = Math.min(NPULSE - 1, Math.floor(e * NPULSE));
        const active = k % 4;
        text(g, C[0], 48, L.dome, { size: 17, fill: body, weight: 600 });
        for (let q = 0; q < 4; q++) {
          const a0 = (q * Math.PI) / 2 - Math.PI, a1 = a0 + Math.PI / 2;
          const p0 = [C[0] + R * Math.cos(a0), C[1] + R * Math.sin(a0)], p1 = [C[0] + R * Math.cos(a1), C[1] + R * Math.sin(a1)];
          kit.svg("path", {
            d: `M${C[0]},${C[1]} L${p0[0]},${p0[1]} A${R},${R} 0 0 1 ${p1[0]},${p1[1]} Z`,
            fill: LIGHT[q], "fill-opacity": q === active ? 0.55 : 0.1, stroke: LIGHT[q], "stroke-width": 1.5,
          }, g);
          const am = (a0 + a1) / 2;
          text(g, C[0] + 0.7 * R * Math.cos(am), C[1] + 0.7 * R * Math.sin(am) + 7, String(q + 1), { size: 20, weight: 700, fill: LIGHT[q] });
        }
        // the moving cover (dashed outline) passes under the slit
        const cy = C[1] + 80 - 80 * e;
        kit.svg("circle", { cx: C[0], cy, r: 38, fill: "none", stroke: ink, "stroke-width": 1.6, "stroke-dasharray": "5 4" }, g);
        kit.svg("rect", { x: C[0] - R - 6, y: C[1] - 4, width: 2 * R + 12, height: 8, fill: bg, stroke: ink, "stroke-width": 1.4 }, g);
        text(g, C[0] + R + 10, C[1] + 6, L.slit, { size: 16, anchor: "start", fill: body });
        arrow(g, [28, 250], [28, 140], { stroke: body, w: 2 });
        text(g, 18, 274, L.motion, { size: 16, anchor: "start", fill: body });
        kit.svg("circle", { cx: C[0] - 52, cy: 310, r: 8, fill: "none", stroke: ink, "stroke-width": 1.6, "stroke-dasharray": "4 3" }, g);
        text(g, C[0] - 38, 316, L.cover, { size: 16, anchor: "start", fill: body });

        // right: timing diagram
        const X0 = 380, DX = 30, H = 16;
        const rows = [[L.enc, -1], [L.cam, -1], ["1", 0], ["2", 1], ["3", 2], ["4", 3]];
        rows.forEach(([lab, q], r) => {
          const y = 80 + r * 40;
          text(g, X0 - 14, y + 5, lab, { size: 16, anchor: "end", fill: q < 0 ? body : LIGHT[q], weight: q < 0 ? 400 : 700 });
          const pts = [[X0, y + H / 2]];
          for (let p = 0; p < NPULSE; p++) {
            const on = q < 0 || p % 4 === q;
            const x = X0 + p * DX + 6;
            if (on) pts.push([x, y + H / 2], [x, y - H / 2], [x + 14, y - H / 2], [x + 14, y + H / 2]);
          }
          pts.push([X0 + NPULSE * DX + 4, y + H / 2]);
          kit.svg("path", { d: path(pts), fill: "none", stroke: q < 0 ? body : LIGHT[q], "stroke-width": 2, opacity: 0.35 }, g);
          // pulses already fired are drawn solid
          for (let p = 0; p <= k; p++) {
            if (!(q < 0 || p % 4 === q)) continue;
            const x = X0 + p * DX + 6;
            kit.svg("path", { d: path([[x, y + H / 2], [x, y - H / 2], [x + 14, y - H / 2], [x + 14, y + H / 2]]), fill: "none", stroke: q < 0 ? ink : LIGHT[q], "stroke-width": 2.6 }, g);
          }
        });
        const cx = X0 + k * DX + 13;
        line(g, [cx, 58], [cx, 296], { stroke: accent, w: 1.4, dash: "4 4" });
        text(g, 320, 348, L.cycle, { size: 17, fill: accent, weight: 600 });
      }

      if (i === 1) {
        // left: interleaved scan lines; right: four images assembled from them
        const NL = 16, LX = 50, LY = 54, LW = 150, LH = 15;
        text(g, LX + LW / 2, 40, L.lines, { size: 17, fill: body, weight: 600 });
        for (let r = 0; r < NL; r++) {
          kit.svg("rect", { x: LX, y: LY + r * LH, width: LW, height: LH - 3, fill: LIGHT[r % 4], "fill-opacity": 0.55 }, g);
        }
        text(g, LX + LW / 2, LY + NL * LH + 24, "1 2 3 4 1 2 3 4 …", { size: 16, fill: body });
        arrow(g, [218, 180], [298, 180], { stroke: body, w: 2 });
        text(g, 258, 166, L.sort, { size: 16, fill: body });
        const T = 112;
        for (let q = 0; q < 4; q++) {
          const x = 330 + (q % 2) * (T + 40), y = 40 + Math.floor(q / 2) * (T + 46);
          const op = kit.easeOut(seg01(t, q * 0.15, q * 0.15 + 0.5));
          const tg = kit.svg("g", { opacity: op }, g);
          kit.svg("rect", { x, y, width: T, height: T, fill: ink, "fill-opacity": 0.85 }, tg);
          // the cover lit from direction q: a bright rim on the lit side, a scratch with direction-dependent contrast
          const ang = (q * Math.PI) / 2 - (3 * Math.PI) / 4;
          const c = [x + T / 2, y + T / 2], r = 44;
          kit.svg("circle", { cx: c[0], cy: c[1], r, fill: mute, "fill-opacity": 0.35 }, tg);
          kit.svg("path", {
            d: `M${c[0] + r * Math.cos(ang - 1.1)},${c[1] + r * Math.sin(ang - 1.1)} A${r},${r} 0 0 1 ${c[0] + r * Math.cos(ang + 1.1)},${c[1] + r * Math.sin(ang + 1.1)}`,
            fill: "none", stroke: bg, "stroke-width": 4, opacity: 0.9,
          }, tg);
          kit.svg("circle", { cx: c[0], cy: c[1], r: 16, fill: "none", stroke: bg, "stroke-width": 1.4, opacity: 0.5 }, tg);
          line(tg, [c[0] - 24, c[1] + 22], [c[0] + 20, c[1] - 8], { stroke: bg, w: 2, opacity: [0.9, 0.35, 0.6, 0.2][q] });
          kit.svg("rect", { x, y, width: T, height: T, fill: "none", stroke: LIGHT[q], "stroke-width": 3 }, tg);
          text(tg, x + T / 2, y + T + 22, `${L.img} ${q + 1}`, { size: 16, fill: LIGHT[q], weight: 700 });
        }
      }

      if (i === 2) {
        // left: side view of a pixel on a shallow scratch, lit by four directions; right: the equations
        const Y = 262, G0 = 150, G1 = 230, D = 16;
        const prof = (x) => (x < G0 || x > G1 ? Y : Y + D * (1 - Math.abs((x - (G0 + G1) / 2) / ((G1 - G0) / 2))));
        kit.svg("path", { d: path([[30, Y], [G0, Y], [(G0 + G1) / 2, Y + D], [G1, Y], [330, Y]]) + `L330,${Y + 40}L30,${Y + 40}Z`, fill: rule, stroke: body, "stroke-width": 1.6 }, g);
        text(g, (G0 + G1) / 2, Y + 66, L.groove, { size: 16, fill: body });
        // normals along the surface
        for (let x = 46; x <= 314; x += 22) {
          if (Math.abs(x - 172) < 14) continue;
          const y = prof(x);
          let nx = 0, ny = -1;
          if (x > G0 && x < G1) { const sl = (x < (G0 + G1) / 2 ? 1 : -1) * D / ((G1 - G0) / 2); const n = Math.hypot(sl, 1); nx = -sl / n; ny = -1 / n; }
          arrow(g, [x, y], [x + nx * 30 * e, y + ny * 30 * e], { stroke: mute, w: 1.4, head: 6, opacity: e });
        }
        // the highlighted pixel on the scratch flank, its four light directions and its normal
        const P = [172, prof(172)];
        const SRC = [[52, 76], [126, 52], [228, 52], [302, 76]];
        SRC.forEach((sp, q) => {
          const u = kit.easeOut(seg01(t, q * 0.1, q * 0.1 + 0.5));
          const d = Math.hypot(P[0] - sp[0], P[1] - sp[1]);
          const a = [sp[0] + ((P[0] - sp[0]) * 13) / d, sp[1] + ((P[1] - sp[1]) * 13) / d];
          line(g, a, [a[0] + (P[0] - a[0]) * u, a[1] + (P[1] - a[1]) * u], { stroke: LIGHT[q], w: 1.6, dash: "5 4" });
          kit.svg("circle", { cx: sp[0], cy: sp[1], r: 12, fill: bg, stroke: LIGHT[q], "stroke-width": 2 }, g);
          text(g, sp[0], sp[1] + 6, String(q + 1), { size: 16, weight: 700, fill: LIGHT[q], halo: false });
        });
        const sl = D / ((G1 - G0) / 2), nn = Math.hypot(sl, 1);
        arrow(g, P, [P[0] - (sl / nn) * 74, P[1] - (1 / nn) * 74], { stroke: accent, w: 3, head: 11 });
        text(g, P[0] - (sl / nn) * 74 - 4, P[1] - (1 / nn) * 74 - 12, L.normal, { size: 20, fill: accent, weight: 700 });
        kit.svg("circle", { cx: P[0], cy: P[1], r: 4.5, fill: ink }, g);

        const EX = 360;
        for (let q = 0; q < 4; q++) {
          text(g, EX, 70 + q * 32, ["I", { sub: String(q + 1) }, " = ρ L", { sub: String(q + 1) }, " · N"], { size: 19, anchor: "start", fill: LIGHT[q], weight: 600 });
        }
        const v = kit.easeOut(seg01(t, 0.45, 1));
        text(g, EX, 214, L.eq1, { size: 16, anchor: "start", fill: body, opacity: v });
        text(g, EX, 240, L.eq2, { size: 16, anchor: "start", fill: body, opacity: v });
        text(g, EX, 274, L.ls, { size: 18, anchor: "start", fill: accent, weight: 700, opacity: v });
        text(g, EX, 312, L.outA, { size: 15, anchor: "start", fill: body, opacity: v });
        text(g, EX, 336, L.outC, { size: 15, anchor: "start", fill: body, opacity: v });
      }

      if (i === 3) {
        // one curvature profile: raw -> stretched -> WLS-filtered (texture smoothed, scratch peak kept)
        // three stacked panels, revealed in turn
        const X0 = 236, X1 = 612;
        const sx = (j) => X0 + ((X1 - X0) * j) / (NP - 1);
        const panels = [
          { lab: L.raw, base: 112, f: (j) => 5 * tex[j] + 12 * peak(j), col: mute },
          { lab: L.stretch, base: 212, f: (j) => 2.6 * (5 * tex[j] + 12 * peak(j)), col: body },
          { lab: L.wls, base: 312, f: (j) => 2.6 * (5 * texSmooth[j] * 0.45 + 12 * peak(j)), col: accent },
        ];
        text(g, 320, 34, L.curv, { size: 17, fill: body, weight: 600 });
        panels.forEach((p, k) => {
          const v = k === 0 ? 1 : kit.easeOut(seg01(t, (k - 1) * 0.4, (k - 1) * 0.4 + 0.5));
          text(g, 30, p.base + 6, p.lab, { size: 17, anchor: "start", fill: k === 0 ? body : accent, weight: 600, opacity: v });
          line(g, [X0, p.base], [X1, p.base], { stroke: rule, w: 1.2, opacity: v });
          kit.svg("path", { d: path(Array.from({ length: NP }, (_, j) => [sx(j), p.base - p.f(j)])), fill: "none", stroke: p.col, "stroke-width": k === 2 ? 2.4 : 1.8, opacity: v }, g);
        });
        const v = kit.easeOut(seg01(t, 0.75, 1));
        const pk = [sx(SCR), 312 - panels[2].f(SCR)];
        line(g, [pk[0] + 10, pk[1] + 4], [pk[0] + 44, pk[1] + 4], { stroke: body, w: 1.2, opacity: v });
        text(g, pk[0] + 50, pk[1] + 10, L.kept, { size: 16, anchor: "start", fill: ink, weight: 600, opacity: v });
        text(g, sx(24), 312 - 34, L.smooth, { size: 16, fill: ink, weight: 600, opacity: v });
      }

      if (i === 4) {
        // left: enhanced image with the ROI; right: binarized result with detected regions
        const T = 210, Y0 = 62, LX = 40, RX = 390;
        text(g, 320, 36, L.chain, { size: 16, fill: body, weight: 600 });
        const disc = (x0, fn) => {
          const c = [x0 + T / 2, Y0 + T / 2], r = T / 2 - 8;
          return { c, r, at: (p) => [c[0] + p[0] * r, c[1] + p[1] * r], fn };
        };
        const A = disc(LX), B = disc(RX);
        kit.svg("rect", { x: LX, y: Y0, width: T, height: T, fill: mute, "fill-opacity": 0.3 }, g);
        for (const p of speck) { const q = A.at(p); kit.svg("circle", { cx: q[0], cy: q[1], r: 1.6, fill: body, opacity: 0.5 }, g); }
        for (const [a, b] of SCRATCHES) line(g, A.at(a), A.at(b), { stroke: ink, w: 2 });
        const pA = A.at(PIT);
        kit.svg("circle", { cx: pA[0], cy: pA[1], r: 5, fill: ink }, g);
        kit.svg("circle", { cx: A.c[0], cy: A.c[1], r: A.r, fill: "none", stroke: accent, "stroke-width": 2, "stroke-dasharray": "6 4" }, g);
        text(g, LX + 8, Y0 + 22, L.roi, { size: 16, anchor: "start", fill: accent, weight: 700 });

        arrow(g, [LX + T + 22, Y0 + T / 2], [RX - 22, Y0 + T / 2], { stroke: body, w: 2 });
        text(g, 320, Y0 + T / 2 - 14, L.bin, { size: 16, fill: body });

        const v = kit.easeOut(seg01(t, 0, 0.5));
        kit.svg("rect", { x: RX, y: Y0, width: T, height: T, fill: ink, opacity: v }, g);
        for (const [a, b] of SCRATCHES) line(g, B.at(a), B.at(b), { stroke: bg, w: 2.4, opacity: v });
        const pB = B.at(PIT);
        kit.svg("circle", { cx: pB[0], cy: pB[1], r: 5, fill: bg, opacity: v }, g);
        const w = kit.easeOut(seg01(t, 0.5, 1));
        const box = (p0, p1, lab) => {
          const x = Math.min(p0[0], p1[0]) - 7, y = Math.min(p0[1], p1[1]) - 7;
          kit.svg("rect", { x, y, width: Math.abs(p1[0] - p0[0]) + 14, height: Math.abs(p1[1] - p0[1]) + 14, fill: "none", stroke: LIGHT[2], "stroke-width": 2, opacity: w }, g);
          return [x, y];
        };
        SCRATCHES.forEach(([a, b]) => box(B.at(a), B.at(b)));
        box([pB[0] - 5, pB[1] - 5], [pB[0] + 5, pB[1] + 5]);
        text(g, 320, 340, L.rate, { size: 18, fill: accent, weight: 700, opacity: w });
      }
    },
  });
}
