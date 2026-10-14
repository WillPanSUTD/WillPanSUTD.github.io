// Robust 6D pose under high dynamic ambient light (Gen6D + VGG-ECA) schematic:
// glare and shadow make Gen6D lock onto the weakly reflective handle only ->
// ECA reweights backbone channels (GAP -> 1D conv -> sigmoid -> multiply) ->
// detector: reference features as kernels give a heat map; peak = centre q, box size Sq -> translation ->
// selector: the most similar reference view gives the initial rotation ->
// refiner: a 3D CNN regresses the pose residual and updates the pose until the box covers the whole knife.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Under a strong, uneven light, the metal blade turns into glare and shadow. The original Gen6D then finds only the weakly reflective plastic handle, and its pose box misses the blade.",
        "The fix sits in the backbone. After the VGG layers with 64, 128 and 256 filters, an ECA module pools each channel to one number, runs a small 1D convolution across neighbouring channels, and turns the result into 0–1 weights that rescale the channels, damping noisy ones.",
        "Detector: VGG-ECA features of the reference images act as convolution kernels on the query image at several scales. The heat-map peak gives the object centre q, and the box size Sq gives its depth, so together they set the initial translation.",
        "Selector: the query crop is compared with the reference views, and the most similar one supplies the initial rotation.",
        "Refiner: a 3D CNN regresses the residual between the current pose and the true pose and updates the pose. With VGG-ECA features in all three stages, the final 3D box covers the blade as well as the handle.",
      ],
      light: "light", glare: "glare on metal", shadow: "shadow", gen6d: "Gen6D: handle only",
      fmap: "C × H × W", gap: "global avg pool", conv: "1D conv", sig: "sigmoid → 0–1", mul: "×", out: "reweighted",
      where: "in VGG after 64 / 128 / 256-filter layers",
      ref: "reference features", query: "query image", scales: "Ns scales", heat: "heat map",
      centre: "centre q", size: "Sq → depth", trans: "initial translation",
      refs: "reference views", best: "most similar → initial rotation",
      init: "initial pose", cnn: "3D CNN", resid: "pose residual", upd: "update", refined: "refined pose",
    },
    zh: {
      steps: [
        "在强烈且不均匀的光照下，金属刀身上同时出现高光和阴影。原始 Gen6D 只能识别反光较弱的塑料刀柄，位姿框漏掉了刀身。",
        "改进位于骨干网络中：在 VGG 中 64、128、256 个滤波器的卷积层之后加入 ECA 模块。它先把每个通道池化为一个数值，再沿相邻通道做一维卷积，经 Sigmoid 得到 0–1 的权重，用来重新缩放各通道、抑制噪声通道。",
        "检测器：以参考图像的 VGG-ECA 特征为卷积核，在多个尺度上与查询图像做卷积。热图峰值给出物体中心 q，包围框尺寸 Sq 给出深度，二者共同确定初始平移。",
        "选择器：将查询图像块与各参考视角逐一比较，最相似的参考视角给出初始旋转。",
        "精化器：3D CNN 回归当前位姿与真实位姿之间的残差，并据此更新位姿。三个阶段都使用 VGG-ECA 特征，最终的三维包围框同时覆盖刀柄和刀身。",
      ],
      light: "光源", glare: "金属高光", shadow: "阴影", gen6d: "Gen6D：仅框住刀柄",
      fmap: "C × H × W", gap: "全局平均池化", conv: "一维卷积", sig: "Sigmoid → 0–1", mul: "×", out: "重新加权",
      where: "插入 VGG 中 64 / 128 / 256 滤波器层之后",
      ref: "参考图像特征", query: "查询图像", scales: "Ns 个尺度", heat: "热图",
      centre: "中心 q", size: "Sq → 深度", trans: "初始平移",
      refs: "参考视角", best: "最相似 → 初始旋转",
      init: "初始位姿", cnn: "3D CNN", resid: "位姿残差", upd: "更新", refined: "精化位姿",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal semantic colours: light/glare, pose box, plastic handle.
  const LIGHT = "#e0a800";
  const BOX = "#d64545";
  const HANDLE = "#4a7fb5";

  const { text, line, arrow } = kit.pen({ stroke: body, head: 9 });
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));
  const path = (pts) => "M" + pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join("L");
  const rnd = kit.rng(7);

  // --- Knife in local units: handle x -75..-20, blade -20..85 -----------------
  const HANDLE_PTS = [[-75, -8], [-20, -8], [-20, 8], [-75, 8]];
  const BLADE_PTS = [[-20, -6], [62, -6], [85, 3], [-20, 7]];
  const place = (P, [x, y]) => {
    const r = (P.a * Math.PI) / 180;
    return [P.cx + P.s * (x * Math.cos(r) - y * Math.sin(r)), P.cy + P.s * (x * Math.sin(r) + y * Math.cos(r))];
  };
  const knife = (g, P, o = {}) => {
    kit.svg("path", { d: path(BLADE_PTS.map((q) => place(P, q))) + "Z", fill: o.blade ?? mute, stroke: body, "stroke-width": 1.2, opacity: o.opacity ?? 1 }, g);
    kit.svg("path", { d: path(HANDLE_PTS.map((q) => place(P, q))) + "Z", fill: HANDLE, stroke: body, "stroke-width": 1.2, opacity: o.opacity ?? 1 }, g);
  };
  // 3D pose box: local rect [x0,x1] x [y0,y1] in the knife frame, lifted by `lift` px straight up.
  const box3 = (g, P, x0, x1, y0, y1, lift, o = {}) => {
    const base = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((q) => place(P, q));
    const top = base.map((q) => [q[0], q[1] - lift]);
    const attrs = { stroke: o.stroke ?? BOX, w: o.w ?? 2, dash: o.dash, opacity: o.opacity };
    for (let k = 0; k < 4; k++) {
      line(g, base[k], base[(k + 1) % 4], attrs);
      line(g, top[k], top[(k + 1) % 4], attrs);
      line(g, base[k], top[k], attrs);
    }
  };
  const frame = (g, x, y, w, h, o = {}) => kit.svg("rect", {
    x, y, width: w, height: h, rx: 3, fill: o.fill ?? rule, "fill-opacity": o.fo ?? 0.45, stroke: o.stroke ?? mute, "stroke-width": o.sw ?? 1.2,
  }, g);

  // ECA channel data (built once): descriptor value and resulting weight per channel.
  const NC = 9;
  const desc = Array.from({ length: NC }, () => 0.2 + 0.8 * rnd());
  const noisy = new Set([2, 6]);
  const wts = desc.map((d, k) => (noisy.has(k) ? 0.15 + 0.1 * rnd() : 0.55 + 0.4 * d));

  // Reference views for the selector: rotations and similarity scores (best = index 3).
  const REF_A = [-70, -40, -10, 18, 48];
  const QUERY_A = 20;
  const sim = REF_A.map((a) => Math.exp(-Math.pow((a - QUERY_A) / 26, 2)));
  const BEST = sim.indexOf(Math.max(...sim));

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const e = kit.easeOut(t);

      if (i === 0) {
        // query image with a light source: glare on the blade, a shadow, Gen6D's box on the handle only
        frame(g, 30, 30, 400, 300, { fill: ink, fo: 0.08 });
        const P = { cx: 245, cy: 200, s: 1.7, a: -12 };
        // light cone from the top-left source
        const src = [70, 62];
        kit.svg("circle", { cx: src[0], cy: src[1], r: 13, fill: LIGHT }, g);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          line(g, [src[0] + 17 * Math.cos(a), src[1] + 17 * Math.sin(a)], [src[0] + 24 * Math.cos(a), src[1] + 24 * Math.sin(a)], { stroke: LIGHT, w: 2 });
        }
        kit.svg("path", { d: path([src, [300, 140], [345, 250]]) + "Z", fill: LIGHT, "fill-opacity": 0.13 * e }, g);
        // shadow under the blade
        const sh = place(P, [40, 30]);
        kit.svg("ellipse", { cx: sh[0], cy: sh[1], rx: 100, ry: 20, fill: ink, opacity: 0.32 * e, transform: `rotate(${P.a} ${sh[0]} ${sh[1]})` }, g);
        knife(g, P);
        // glare on the blade
        const gl = place(P, [42, 0]);
        kit.svg("ellipse", { cx: gl[0], cy: gl[1], rx: 40, ry: 6, fill: "#ffffff", opacity: 0.9 * e, transform: `rotate(${P.a} ${gl[0]} ${gl[1]})` }, g);
        kit.svg("ellipse", { cx: gl[0], cy: gl[1], rx: 54, ry: 11, fill: LIGHT, opacity: 0.3 * e, transform: `rotate(${P.a} ${gl[0]} ${gl[1]})` }, g);
        // Gen6D: box around the handle only
        const b = kit.easeOut(seg01(t, 0.45, 1));
        if (b > 0) box3(g, P, -80, -16, -12, 12, 26, { opacity: b });
        // callouts on the right
        text(g, src[0] + 34, src[1] + 6, L.light, { size: 17, anchor: "start", fill: body });
        line(g, [gl[0] + 30, gl[1] - 10], [458, 120], { stroke: mute, w: 1.2, opacity: e });
        text(g, 464, 126, L.glare, { size: 17, anchor: "start", fill: body, opacity: e });
        line(g, [sh[0] + 60, sh[1] + 2], [458, 240], { stroke: mute, w: 1.2, opacity: e });
        text(g, 464, 246, L.shadow, { size: 17, anchor: "start", fill: body, opacity: e });
        const hb = place(P, [-48, -12]);
        line(g, [hb[0], hb[1] - 30], [hb[0] + 10, 76], { stroke: BOX, w: 1.2, opacity: b });
        text(g, hb[0] - 6, 70, L.gen6d, { size: 17, anchor: "start", fill: BOX, weight: 600, opacity: b });
      }

      if (i === 1) {
        // feature map stack -> GAP -> descriptor column -> 1D conv (k neighbours) -> sigmoid weights -> x -> reweighted stack
        text(g, 320, 30, L.where, { size: 16, fill: body });
        const stack = (x0, y0, alpha) => {
          for (let k = NC - 1; k >= 0; k--) {
            const x = x0 + k * 6, y = y0 - k * 6;
            kit.svg("rect", { x, y, width: 62, height: 120, fill: accent, "fill-opacity": 0.12 + 0.55 * alpha(k), stroke: body, "stroke-width": 0.8 }, g);
          }
        };
        stack(18, 150, (k) => desc[k] * 0.6);
        text(g, 72, 300, L.fmap, { size: 16, fill: body });
        // GAP -> descriptor
        const CX = 196, CY0 = 92, CH = 20;
        arrow(g, [128, 160], [180, 160], { w: 1.6 });
        text(g, 207, 300, L.gap, { size: 16, fill: body });
        for (let k = 0; k < NC; k++) {
          kit.svg("rect", { x: CX, y: CY0 + k * CH, width: 22, height: CH - 2, fill: accent, "fill-opacity": 0.15 + 0.7 * desc[k], stroke: body, "stroke-width": 0.8 }, g);
        }
        // 1D conv window sliding down the descriptor
        const pos = Math.min(NC - 3, Math.floor(e * (NC - 2)));
        kit.svg("rect", { x: CX - 4, y: CY0 + pos * CH - 3, width: 30, height: 3 * CH + 4, fill: "none", stroke: accent, "stroke-width": 2 }, g);
        text(g, 207, 82, L.conv + " (k)", { size: 16, fill: accent, weight: 600 });
        // weights column (sigmoid output), bars proportional to weight
        const WX = 300;
        arrow(g, [226, 180], [290, 180], { w: 1.6 });
        for (let k = 0; k < NC; k++) {
          const w = 60 * wts[k] * e;
          kit.svg("rect", { x: WX, y: CY0 + k * CH, width: Math.max(1, w), height: CH - 2, fill: noisy.has(k) ? mute : accent, "fill-opacity": 0.85 }, g);
        }
        line(g, [WX, CY0 - 4], [WX, CY0 + NC * CH], { stroke: body, w: 1.2 });
        text(g, 340, 300, L.sig, { size: 16, fill: body });
        // multiply
        text(g, 398, 190, L.mul, { size: 30, fill: ink, weight: 700 });
        arrow(g, [416, 180], [458, 180], { w: 1.6, opacity: e });
        const o = kit.easeOut(seg01(t, 0.4, 1));
        stack(466, 150, (k) => (desc[k] * 0.6) * (1 - o) + wts[k] * 0.85 * o);
        text(g, 524, 300, L.out, { size: 16, fill: accent, weight: 600, opacity: o });
      }

      if (i === 2) {
        // reference features as kernels -> score maps at Ns scales -> heat map on the query; peak q and box Sq
        text(g, 80, 42, L.ref, { size: 16, fill: body, weight: 600 });
        for (let k = 0; k < 3; k++) {
          frame(g, 26 + k * 38, 60, 32, 32, { fill: accent, fo: 0.25, stroke: accent });
        }
        text(g, 80, 150, L.query, { size: 16, fill: body, weight: 600 });
        frame(g, 20, 160, 120, 90, { fill: ink, fo: 0.06 });
        knife(g, { cx: 80, cy: 205, s: 0.55, a: -12 });
        arrow(g, [148, 150], [196, 150], { w: 1.6 });
        // score maps at Ns scales
        for (let k = 2; k >= 0; k--) {
          const sz = 70 + k * 18, x = 210 + k * 12, y = 112 - k * 12;
          frame(g, x, y, sz, sz, { fill: bg, fo: 1, stroke: body, sw: 1 });
          const c = [x + sz * 0.52, y + sz * 0.5];
          kit.svg("circle", { cx: c[0], cy: c[1], r: sz * 0.22, fill: accent, opacity: 0.35 * e }, g);
        }
        text(g, 268, 238, L.scales, { size: 16, fill: body });
        arrow(g, [330, 150], [372, 150], { w: 1.6 });
        // heat map over the query, right
        const HX = 384, HY = 52, HW = 236, HH = 196;
        frame(g, HX, HY, HW, HH, { fill: ink, fo: 0.06 });
        const P = { cx: HX + 112, cy: HY + 96, s: 0.78, a: -12 };
        knife(g, P);
        const q = place(P, [5, 0]);
        const GX = 12, GY = 10;
        for (let r = 0; r < GY; r++) for (let c = 0; c < GX; c++) {
          const x = HX + (c * HW) / GX, y = HY + (r * HH) / GY;
          const d2 = Math.pow((x + HW / GX / 2 - q[0]) / 60, 2) + Math.pow((y + HH / GY / 2 - q[1]) / 45, 2);
          const v = Math.exp(-d2);
          if (v < 0.05) continue;
          kit.svg("rect", { x, y, width: HW / GX, height: HH / GY, fill: accent, opacity: 0.5 * v * e }, g);
        }
        text(g, HX + HW / 2, 42, L.heat, { size: 16, fill: body, weight: 600 });
        const b = kit.easeOut(seg01(t, 0.45, 1));
        // peak marker and square box
        kit.svg("circle", { cx: q[0], cy: q[1], r: 5, fill: BOX, stroke: bg, "stroke-width": 1.5, opacity: b }, g);
        const half = 70;
        kit.svg("rect", { x: q[0] - half, y: q[1] - half * 0.98, width: 2 * half, height: 2 * half * 0.98, fill: "none", stroke: BOX, "stroke-width": 2, "stroke-dasharray": "6 4", opacity: b }, g);
        text(g, q[0], q[1] + 40, L.centre, { size: 16, anchor: "middle", fill: BOX, weight: 600, opacity: b });
        text(g, HX + HW / 2, 282, L.size, { size: 16, fill: BOX, weight: 600, opacity: b });
        text(g, HX + HW / 2, 318, "→ " + L.trans, { size: 17, fill: ink, weight: 600, opacity: b });
      }

      if (i === 3) {
        // query crop on top, five reference views below with similarity bars; the best one supplies R0
        text(g, 320, 30, L.query, { size: 16, fill: body, weight: 600 });
        frame(g, 260, 40, 120, 80, { fill: ink, fo: 0.06 });
        knife(g, { cx: 320, cy: 80, s: 0.55, a: QUERY_A });
        text(g, 320, 284, L.refs, { size: 16, fill: body, weight: 600 });
        REF_A.forEach((a, k) => {
          const x = 40 + k * 116, y = 164;
          const best = k === BEST;
          const hi = best ? kit.easeOut(seg01(t, 0.55, 1)) : 0;
          frame(g, x, y, 96, 72, { fill: ink, fo: 0.06, stroke: hi > 0 ? accent : mute, sw: 1.2 + 1.8 * hi });
          knife(g, { cx: x + 48, cy: y + 36, s: 0.42, a });
          // similarity bar
          const w = 90 * sim[k] * kit.easeOut(seg01(t, 0, 0.6));
          kit.svg("rect", { x: x + 3, y: y + 82, width: Math.max(1, w), height: 10, fill: best ? accent : mute }, g);
          line(g, [320, 124], [x + 48, y - 2], { stroke: best ? accent : rule, w: best ? 1.6 + hi : 1, opacity: best ? 0.5 + 0.5 * hi : 0.9 });
        });
        const bx = 40 + BEST * 116 + 48;
        text(g, Math.min(bx, 520), 326, L.best, { size: 17, fill: accent, weight: 600, opacity: kit.easeOut(seg01(t, 0.55, 1)) });
      }

      if (i === 4) {
        // the pose box moves from the initial estimate to the refined pose; loop: 3D CNN -> residual -> update
        frame(g, 30, 40, 360, 270, { fill: ink, fo: 0.06 });
        const P = { cx: 210, cy: 190, s: 1.6, a: -12 };
        knife(g, P);
        const I = { cx: 186, cy: 182, s: 1.6, a: -24 };
        const lerp = (A, B, u) => ({ cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u, s: A.s, a: A.a + (B.a - A.a) * u });
        // initial pose, faint and dashed
        box3(g, I, -80, 40, -12, 12, 26, { dash: "5 4", w: 1.4, opacity: 0.55 });
        text(g, 40, 64, L.init, { size: 16, anchor: "start", fill: BOX, opacity: 0.8 });
        const cur = lerp(I, P, e);
        const x1 = 40 + (90 - 40) * e;
        box3(g, cur, -80, x1, -12, 12, 26, { w: 2.2 });
        text(g, 380, 296, L.refined, { size: 17, anchor: "end", fill: BOX, weight: 600, opacity: e });
        // refinement loop on the right
        kit.svg("rect", { x: 440, y: 60, width: 150, height: 52, rx: 6, fill: bg, stroke: accent, "stroke-width": 2 }, g);
        text(g, 515, 92, L.cnn, { size: 18, fill: accent, weight: 700 });
        arrow(g, [515, 114], [515, 168], { stroke: accent, w: 1.8 });
        text(g, 515, 194, L.resid, { size: 17, fill: ink, weight: 600 });
        arrow(g, [515, 206], [515, 246], { stroke: accent, w: 1.8 });
        text(g, 515, 272, L.upd, { size: 17, fill: ink, weight: 600 });
        arrow(g, [394, 86], [436, 86], { stroke: accent, w: 1.8 });
        arrow(g, [474, 266], [396, 266], { stroke: accent, w: 1.8, dash: "5 4" });
      }
    },
  });
}
