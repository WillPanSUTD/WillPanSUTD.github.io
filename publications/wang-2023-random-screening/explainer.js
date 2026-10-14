// Random screening-based feature aggregation, schematic:
// ball query of a local patch -> encode (F, N x C), global feature G, random screen to N/2 ->
// copy G and concatenate with the sub-patch features (F', N/2 x 2C) ->
// repeat (F'', N/4 x 4C) -> point-wise weights + max-pool -> displacement d moves the point.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "For each noisy point, the neighbours within a ball of radius r form a local patch. The patch is centred, scaled to a unit sphere, aligned by PCA and resampled to N = 500 points.",
        "A graph-based encoder turns the patch into per-point features F (N × C), which are pooled into one global feature G. Random screening then keeps half of the point features.",
        "The denser patch's global feature G is copied N/2 times and concatenated with the screened sub-patch's features; an MLP gives F′ (N/2 × 2C). The sparser points now carry the denser patch's geometric information.",
        "The same screening and fusion are repeated on F′: N/4 points remain, each with 4C channels (F″). In the paper's ablation this two-stage cascade beats a single fusion step.",
        "Point-wise weights, trained to be higher near the tangent plane of the centre point, scale F″. The result is max-pooled and decoded into a displacement d that moves the noisy point towards the clean surface.",
      ],
      cloud: "noisy point cloud", patch: "patch", n500: "N = 500",
      encode: "encode", pool: "pool", half: "random ½",
      copy: "copy ×N/2", fuse: "concat + MLP", fuse2: "screen + fuse",
      kept: ["N points", "N/2 kept", "N/4 kept"],
      tangent: "tangent plane", wlab: "weights", maxp: "max-pool + MLP",
    },
    zh: {
      steps: [
        "对每个含噪点，取半径 r 的球邻域内的点构成局部块。该局部块经过平移居中、缩放到单位球、PCA 对齐，并重采样为 N = 500 个点。",
        "基于图的编码器为局部块中的每个点提取特征 F（N × C），再池化得到一个全局特征 G。随后，随机筛选只保留一半的点特征。",
        "将较稠密局部块的全局特征 G 复制 N/2 份，与筛选后子块的特征拼接，经 MLP 得到 F′（N/2 × 2C）。较稀疏的点由此获得了稠密局部块的几何信息。",
        "对 F′ 重复同样的筛选与融合：保留 N/4 个点，每个点 4C 个通道（F″）。论文的消融实验表明，这种两级级联优于单次融合。",
        "逐点权重经训练后在中心点切平面附近更大，用来加权 F″；加权结果经最大池化后解码为位移 d，把含噪点移向干净曲面。",
      ],
      cloud: "含噪点云", patch: "局部块", n500: "N = 500",
      encode: "编码", pool: "池化", half: "随机 ½",
      copy: "复制 ×N/2", fuse: "拼接 + MLP", fuse2: "筛选 + 融合",
      kept: ["N 个点", "保留 N/2", "保留 N/4"],
      tangent: "切平面", wlab: "权重", maxp: "最大池化 + MLP",
    },
  }, lang);

  const { ink, body, accent, mute } = kit.palette();
  // Literal semantic colours (after the paper's Fig. 1): point features, global feature, sub-patch features.
  const FEAT = "#c06c9a";
  const GLOB = "#d9822b";
  const SUB = "#5b7fb8";

  const { line, arrow } = kit.pen({ stroke: body, width: 1.6, head: 9 });
  // Text made of parts: plain strings, or { sub: "…" } for a real subscript.
  const label = (g, x, y, parts, o = {}) => {
    const size = o.size || 20;
    const n = kit.text(g, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor, weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      const s = kit.svg("tspan", typeof p === "string" ? {} : { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
      s.textContent = typeof p === "string" ? p : p.sub;
    }
    return n;
  };
  const box = (g, x, y, w, h, fill, o = {}) =>
    kit.svg("rect", { x, y, width: w, height: h, rx: 3, fill, stroke: o.stroke ?? "none", opacity: o.opacity ?? 1 }, g);

  // --- Deterministic geometry ---------------------------------------------------
  const rnd = kit.rng(11);
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.15;

  // Step 1: a noisy point cloud along a curved surface (side view).
  const surf = (x) => 220 + 42 * Math.sin((x - 60) / 105);
  const cloud = [];
  for (let k = 0; k < 130; k++) {
    const x = 30 + (580 * (k + rnd() * 0.8)) / 130;
    cloud.push({ x, y: surf(x) + gauss() * 13 });
  }
  const Q = { x: 330, y: surf(330) - 15 };
  const RB = 66;

  // Steps 2-5: the normalised patch (PCA-aligned, so the surface is roughly horizontal).
  const PX = 140, PY = 186, R = 92, OFF = 26; // query point sits OFF above the clean surface
  const ys = (x) => OFF + 0.0016 * x * x;
  const patch = [];
  while (patch.length < 48) {
    const x = (rnd() * 2 - 1) * (R - 8);
    const y = ys(x) + gauss() * 34;
    if (Math.hypot(x, y) < R - 6 && Math.hypot(x, y) > 9) patch.push({ x, y });
  }
  // Random screening: a fixed random order; first 24 survive level 1, first 12 survive level 2.
  const order = patch.map((_, k) => k);
  for (let k = order.length - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [order[k], order[j]] = [order[j], order[k]];
  }
  order.forEach((idx, rank) => { patch[idx].lvl = rank < 12 ? 2 : rank < 24 ? 1 : 0; });
  // Weight from the distance to the tangent plane through the patch centre (Eqs. 6-7); after PCA alignment it is horizontal.
  const sigma = 0.3 * patch.reduce((s, p) => s + p.y ** 2, 0) / patch.length;
  patch.forEach((p) => { p.w = Math.exp(-(p.y ** 2) / Math.max(sigma, 40)); });

  const lerp = (a, b, u) => a + (b - a) * u;

  // Patch disk. level: 0 = all, 1 = N/2 kept, 2 = N/4 kept; fade = progress of the current screening.
  const drawPatch = (g, level, fade, o = {}) => {
    kit.svg("circle", { cx: PX, cy: PY, r: R, fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "5 5" }, g);
    for (const p of patch) {
      const keptBefore = p.lvl >= level - 1 || level === 0;
      const keptNow = p.lvl >= level;
      let op = keptNow ? 1 : keptBefore ? lerp(1, 0.18, fade) : 0.18;
      let r = 3.6, fill = keptNow && level > 0 ? accent : ink;
      if (o.weights) {
        if (!keptNow) continue;
        r = 2.6 + 4.2 * p.w;
        op = 0.35 + 0.65 * p.w;
        fill = accent;
      }
      if (!keptNow && level > 0) fill = mute;
      kit.svg("circle", { cx: PX + p.x, cy: PY + p.y, r, fill, opacity: op }, g);
    }
    if (!o.hideCentre) kit.svg("circle", { cx: PX, cy: PY, r: 6, fill: "none", stroke: ink, "stroke-width": 2.2 }, g);
    label(g, PX, PY - R - 16, L.kept[level], { size: 20, fill: body });
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
        label(g, 30, 52, L.cloud, { anchor: "start", fill: body });
        const rr = RB * e;
        kit.svg("circle", { cx: Q.x, cy: Q.y, r: Math.max(1, rr), fill: accent, opacity: 0.08 }, g);
        kit.svg("circle", { cx: Q.x, cy: Q.y, r: Math.max(1, rr), fill: "none", stroke: accent, "stroke-width": 1.6, "stroke-dasharray": "5 4" }, g);
        for (const p of cloud) {
          const inside = Math.hypot(p.x - Q.x, p.y - Q.y) < rr;
          kit.svg("circle", { cx: p.x, cy: p.y, r: 3.4, fill: inside ? accent : mute, opacity: inside ? 1 : 0.85 }, g);
        }
        kit.svg("circle", { cx: Q.x, cy: Q.y, r: 6, fill: ink }, g);
        line(g, [Q.x, Q.y], [Q.x + rr * 0.8, Q.y - rr * 0.6], { stroke: ink, w: 1.6 });
        if (e > 0.3) {
          label(g, Q.x + rr * 0.4 + 4, Q.y - rr * 0.3 - 10, "r", { size: 22, opacity: e });
          label(g, Q.x - 18, Q.y - 22, ["p̂", { sub: "i" }], { anchor: "end", size: 22 });
          label(g, Q.x, Q.y + RB + 32, [L.patch + " P̂", { sub: "i" }, " · " + L.n500], { size: 21, opacity: e, fill: accent });
        }
      }

      if (i === 1) {
        drawPatch(g, 1, kit.easeOut(Math.max(0, t * 2 - 1)));
        // F_i (N x C)
        const fx = 292, fy = 126, fw = 28, fh = 128;
        arrow(g, [PX + R + 8, PY], [fx - 8, PY]);
        label(g, (PX + R + fx) / 2, PY - 10, L.encode, { size: 16, fill: body });
        box(g, fx, fy, fw, fh * e + 2, FEAT);
        label(g, fx + fw / 2, fy - 20, ["F", { sub: "i" }], { size: 22 });
        label(g, fx + fw / 2, fy + fh + 26, "N × C", { size: 18, fill: body, opacity: e });
        // G_i (1 x C_G)
        const gx = 420, gy = 122;
        arrow(g, [fx + fw + 6, fy + 22], [gx - 8, gy + 7], { opacity: e });
        label(g, 372, 112, L.pool, { size: 16, fill: body, opacity: e });
        box(g, gx, gy, 64 * e, 14, GLOB);
        label(g, gx + 32, gy - 20, ["G", { sub: "i" }], { size: 22, opacity: e });
        label(g, gx + 74, gy + 13, ["1 × C", { sub: "G" }], { size: 18, fill: body, anchor: "start", opacity: e });
        // screened sub-patch features (N/2 x C)
        const u = kit.easeOut(Math.max(0, t * 2 - 1));
        arrow(g, [fx + fw + 6, 222], [gx - 8, 222], { stroke: accent, dash: "6 4", opacity: u });
        label(g, 372, 212, L.half, { size: 16, fill: accent, opacity: u });
        box(g, gx, 190, 28, 64 * u + 1, SUB);
        label(g, gx + 40, 228, "N/2 × C", { size: 18, fill: body, anchor: "start", opacity: u });
      }

      if (i === 2) {
        drawPatch(g, 1, 1);
        const bx = 286, by = 160, h = 64;
        box(g, bx, by, 28, h, SUB);
        label(g, bx + 14, by + h + 26, "N/2 × C", { size: 18, fill: body });
        // duplicated global feature grows row by row
        const rows = 8, shown = Math.max(1, Math.round(rows * e));
        for (let k = 0; k < shown; k++) box(g, bx + 32, by + (k * h) / rows, 60, h / rows - 1, GLOB, { opacity: 0.95 });
        label(g, bx + 62, by - 20, ["G", { sub: "i" }, " " + L.copy], { size: 18 });
        // concat + MLP -> F'_i
        const ax = bx + 102, fx = 500;
        arrow(g, [ax, by + h / 2], [ax + (fx - 10 - ax) * e, by + h / 2], { opacity: 0.4 + 0.6 * e });
        label(g, (ax + fx) / 2 - 4, by + h / 2 + 26, L.fuse, { size: 16, fill: body, opacity: e });
        box(g, fx, by, 56 * e + 1, h, FEAT, { opacity: e });
        label(g, fx + 28, by - 20, ["F", { sub: "i" }, "′"], { size: 22, opacity: e });
        label(g, fx + 28, by + h + 26, "N/2 × 2C", { size: 18, fill: body, opacity: e });
      }

      if (i === 3) {
        drawPatch(g, 2, e);
        const cy = PY;
        const m = [
          { x: 274, w: 28, h: 128, name: ["F", { sub: "i" }], dims: "N × C" },
          { x: 352, w: 56, h: 64, name: ["F", { sub: "i" }, "′"], dims: "N/2 × 2C" },
          { x: 462, w: 112, h: 32, name: ["F", { sub: "i" }, "″"], dims: "N/4 × 4C" },
        ];
        m.forEach((b, k) => {
          const op = k < 2 ? 1 : e;
          const w = k < 2 ? b.w : b.w * e + 1;
          box(g, b.x, cy - b.h / 2, w, b.h, FEAT, { opacity: op });
          label(g, b.x + b.w / 2, cy - b.h / 2 - 20, b.name, { size: 21, opacity: op });
          label(g, b.x + b.w / 2, cy + b.h / 2 + 26, b.dims, { size: 17, fill: body, opacity: op });
          if (k > 0) {
            const a0 = m[k - 1].x + m[k - 1].w + 6, a1 = b.x - 6;
            arrow(g, [a0, cy], [a1, cy], { stroke: accent, opacity: op });
          }
        });
        label(g, 518, 112, L.fuse2, { size: 16, fill: accent, opacity: e });
        line(g, [440, cy - 10], [490, 120], { stroke: accent, w: 1, dash: "3 3", opacity: e * 0.7 });
      }

      if (i === 4) {
        // tangent plane through the patch centre
        line(g, [PX - R - 10, PY], [PX + R + 10, PY], { stroke: mute, dash: "7 5", w: 1.6 });
        drawPatch(g, 2, 1, { weights: true, hideCentre: true });
        label(g, PX - R + 6, PY - 10, L.tangent, { size: 14, fill: body, anchor: "start" });
        // centre point moves by d
        const dy = OFF * e;
        kit.svg("circle", { cx: PX, cy: PY, r: 6, fill: "none", stroke: ink, "stroke-width": 2.2, opacity: 1 - 0.6 * e }, g);
        if (e > 0.15) arrow(g, [PX, PY], [PX, PY + dy], { stroke: ink, w: 2, head: 8 });
        kit.svg("circle", { cx: PX, cy: PY + dy, r: 6, fill: ink, opacity: e }, g);
        label(g, PX + 14, PY - 10, ["p̂", { sub: "i" }], { size: 20, anchor: "start" });
        label(g, PX, PY + R + 32, ["p̄", { sub: "i" }, " = p̂", { sub: "i" }, " + d", { sub: "i" }], { size: 20, opacity: e });
        // right: W_i ⊙ F''_i -> max-pool + MLP -> d_i
        const cy = 140;
        const wx = 300, fx = 352;
        for (let k = 0; k < 4; k++) {
          const w = [0.9, 0.35, 0.75, 0.2][k];
          box(g, wx, cy - 16 + k * 8, 14, 7, accent, { opacity: 0.2 + 0.8 * w });
        }
        label(g, wx + 7, cy - 34, ["W", { sub: "i" }], { size: 21 });
        label(g, wx + 7, cy + 42, L.wlab, { size: 16, fill: body });
        label(g, (wx + 14 + fx) / 2, cy + 7, "⊙", { size: 22 });
        box(g, fx, cy - 16, 112, 32, FEAT);
        label(g, fx + 56, cy - 34, ["F", { sub: "i" }, "″"], { size: 21 });
        arrow(g, [fx + 118, cy], [fx + 118 + 56 * e, cy], { opacity: 0.4 + 0.6 * e });
        label(g, 548, cy + 7, ["d", { sub: "i" }], { size: 24, weight: 600, anchor: "start", opacity: e });
        label(g, fx + 146, cy + 46, L.maxp, { size: 16, fill: body, opacity: e });
      }
    },
  });
}
