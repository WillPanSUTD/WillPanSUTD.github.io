// LGASS schematic (cross-section of a sealing-nail weld):
// scanned points with surface normals -> normals turn sharply at defect edges ->
// LGAF graph attention over k nearest neighbours -> SAG-Pooling keeps distinctive points ->
// decoder labels every point (normal / burst / pit).
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A cross-section of a sealing-nail weld, scanned by a 3D laser profiler. LGASS gives each point's surface normal to the network; the coordinates are used to find its neighbours.",
        "Near a defect edge, two neighbouring points sit almost at the same position, yet their surface normals point in clearly different directions.",
        "Local Graph Attention Filter (LGAF): each point attends to its k nearest neighbours. A larger normal difference gives a higher attention weight, so defect edges stand out.",
        "Spatial Attention Graph Pooling (SAG-Pooling) scores points by spatial attention × normal difference and keeps the top-ranked ones, so edge points survive downsampling.",
        "The decoder upsamples back to every point and assigns each one a class, here normal surface, burst or pit; the defect regions are segmented in one pass.",
      ],
      section: "weld cross-section", normals: "surface normals",
      close: "close in position", differ: "normals differ",
      query: "query point", knn: "k nearest neighbours", weight: "larger normal difference → higher weight",
      keep: "top-ranked points kept", drop: "flat points thinned out",
      cls: ["normal", "burst", "pit"],
    },
    zh: {
      steps: [
        "三维激光轮廓仪扫描得到的密封钉焊缝截面。LGASS 以每个点的表面法向量作为网络输入，点的坐标则用于寻找近邻。",
        "在缺陷边缘处，相邻两点的位置几乎相同，表面法向量的方向却明显不同。",
        "局部图注意力滤波器（LGAF）：每个点对其 k 个最近邻计算注意力。法向量差异越大，注意力权重越高，缺陷边缘因此被突出。",
        "空间注意力图池化（SAG-Pooling）以“空间注意力 × 法向量差异”为点打分，只保留排名靠前的点，使边缘点在下采样中得以保留。",
        "解码器逐层上采样回到全部点，并为每个点分配类别（此处为正常表面、爆点或凹坑），一次完成缺陷区域的分割。",
      ],
      section: "焊缝截面", normals: "表面法向量",
      close: "位置相近", differ: "法向量不同",
      query: "查询点", knn: "k 近邻", weight: "法向量差异越大，权重越高",
      keep: "保留高分点", drop: "平坦区域的点被稀疏化",
      cls: ["正常", "爆点", "凹坑"],
    },
  }, lang);

  const ink = kit.token("--c-ink") || "#0a0a0a";
  const body = kit.token("--c-body") || "#525252";
  const accent = kit.token("--c-accent") || "#1e3a8a";
  const mute = kit.token("--c-mute") || "#a3a3a3";
  const bg = kit.token("--c-bg") || "#ffffff";
  // Literal semantic class colours for the two defect classes shown (normal surface uses the mute token).
  const CLS = [mute, "#d9622b", "#2b7bb9"]; // normal, burst, pit

  const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

  // --- Deterministic profile: flat weld surface with a burst (protrusion) and a pit (depression) ---
  let seed = 11;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const Y0 = 226;
  const burst = (x) => -80 * Math.exp(-Math.pow((x - 190) / 58, 4));
  const pit = (x) => 62 * Math.exp(-Math.pow((x - 455) / 52, 4));
  const surf = (x) => Y0 + burst(x) + pit(x);
  const pts = [];
  for (let x = 36; x <= 604; x += 8.5) {
    const px = x + (rnd() - 0.5) * 2;
    const y = surf(px) + (rnd() - 0.5) * 1.6;
    const d = (surf(px + 0.5) - surf(px - 0.5));
    const len = Math.hypot(d, 1);
    const n = [d / len, -1 / len]; // unit normal pointing up/out of the surface
    const c = Math.abs(burst(px)) > 3 ? 1 : Math.abs(pit(px)) > 3 ? 2 : 0;
    pts.push({ x: px, y, n, c });
  }
  // Local normal variation: largest normal difference to the 3 neighbours on either side.
  pts.forEach((p, i) => {
    let m = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(pts.length - 1, i + 3); k++) {
      m = Math.max(m, Math.hypot(p.n[0] - pts[k].n[0], p.n[1] - pts[k].n[1]));
    }
    p.v = m;
  });
  // Pooling: keep every distinctive point and a sparse subset of flat points.
  pts.forEach((p, i) => { p.keep = p.v > 0.12 || i % 3 === 0; });

  const near = (x) => pts.reduce((b, p) => (Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b));
  const knn = (q, k) => pts.filter((p) => p !== q)
    .sort((a, b) => Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y)).slice(0, k);

  const text = (parent, x, y, str, o = {}) => {
    const n = kit.svg("text", {
      x, y, "font-size": o.size || 22, fill: o.fill || ink, "text-anchor": o.anchor || "middle",
      "font-weight": o.weight || 400, "font-family": "var(--f-sans)", "paint-order": "stroke",
      stroke: bg, "stroke-width": 4, "stroke-linejoin": "round", opacity: o.opacity ?? 1,
    }, parent);
    n.textContent = str;
    return n;
  };
  // Symbol with a real subscript (e.g. n + "0" -> n₀).
  const subText = (parent, x, y, base, sub, o = {}) => {
    const n = text(parent, x, y, "", o);
    kit.svg("tspan", { "font-style": "italic" }, n).textContent = base;
    kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.round((o.size || 22) * 0.72) }, n).textContent = sub;
    return n;
  };
  const line = (parent, a, b, o = {}) => kit.svg("line", {
    x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.stroke || body, "stroke-width": o.w || 1.5,
    "stroke-dasharray": o.dash || "none", opacity: o.opacity ?? 1, "stroke-linecap": "round",
  }, parent);
  const arrow = (parent, a, b, o = {}) => {
    line(parent, a, b, o);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), s = o.head || 8;
    const p1 = [b[0] - s * Math.cos(ang - 0.45), b[1] - s * Math.sin(ang - 0.45)];
    const p2 = [b[0] - s * Math.cos(ang + 0.45), b[1] - s * Math.sin(ang + 0.45)];
    kit.svg("polygon", { points: [b, p1, p2].map((q) => q.join(",")).join(" "), fill: o.stroke || body, opacity: o.opacity ?? 1 }, parent);
  };
  const dot = (parent, p, o = {}) => kit.svg("circle", {
    cx: p.x, cy: p.y, r: o.r || 4, fill: o.fill || mute, opacity: o.opacity ?? 1,
    stroke: o.stroke || "none", "stroke-width": o.sw || 0,
  }, parent);
  const normalTick = (parent, p, len, o = {}) => line(parent, [p.x, p.y], [p.x + p.n[0] * len, p.y + p.n[1] * len], o);
  const reference = (g, opacity = 1) => line(g, [30, Y0], [610, Y0], { stroke: mute, dash: "4 6", w: 1, opacity: 0.6 * opacity });
  const legend = (g, opacity) => {
    const w = 128, x0 = 320 - w + 4 - 52;
    L.cls.forEach((name, k) => {
      kit.svg("circle", { cx: x0 + k * w, cy: 336, r: 7, fill: CLS[k], opacity }, g);
      text(g, x0 + k * w + 14, 344, name, { anchor: "start", fill: body, opacity, size: 21 });
    });
  };

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = ease(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        reference(g);
        // Points appear left to right, then their normals grow.
        pts.forEach((p, k) => {
          const a = Math.max(0, Math.min(1, e * 1.6 - (k / pts.length) * 0.6));
          if (a <= 0) return;
          normalTick(g, p, 26 * a, { stroke: accent, w: 1.4, opacity: 0.75 * a });
          dot(g, p, { opacity: a });
        });
        text(g, 320, 52, L.section, { weight: 600, size: 24 });
        text(g, 320, 330, L.normals, { fill: accent, size: 21, opacity: e });
      }

      if (i === 1) {
        reference(g);
        const p0 = near(376), p1 = near(393);
        pts.forEach((p) => {
          const hi = p === p0 || p === p1;
          if (!hi) normalTick(g, p, 22, { stroke: accent, w: 1.2, opacity: 0.25 });
          dot(g, p, { opacity: hi ? 1 : 0.45 });
        });
        const L0 = 80 * e + 10;
        const t0 = [p0.x + p0.n[0] * L0, p0.y + p0.n[1] * L0];
        const t1 = [p1.x + p1.n[0] * L0, p1.y + p1.n[1] * L0];
        arrow(g, [p0.x, p0.y], t0, { stroke: ink, w: 2.6, head: 11 });
        arrow(g, [p1.x, p1.y], t1, { stroke: accent, w: 2.6, head: 11 });
        dot(g, p0, { r: 6.5, fill: ink });
        dot(g, p1, { r: 6.5, fill: accent });
        subText(g, p0.x - 14, p0.y + 34, "p", "0", { size: 24 });
        subText(g, p1.x - 2, p1.y + 38, "p", "1", { size: 24, fill: accent });
        if (e > 0.4) {
          subText(g, t0[0] - 22, t0[1] + 6, "n", "0", { size: 24, opacity: e });
          subText(g, t1[0] + 22, t1[1] + 4, "n", "1", { size: 24, fill: accent, opacity: e });
        }
        text(g, 40, 82, L.close, { size: 22, opacity: e, anchor: "start" });
        text(g, 40, 112, L.differ, { size: 22, fill: accent, weight: 600, opacity: e, anchor: "start" });
      }

      if (i === 2) {
        reference(g);
        const qa = near(60), qb = near(401.5);
        pts.forEach((p) => {
          normalTick(g, p, 20, { stroke: accent, w: 1.1, opacity: 0.22 });
          dot(g, p, { opacity: 0.55 });
        });
        // Graph edges to the k nearest neighbours, drawn as arcs; width grows with the normal difference.
        const draw = (q, nb) => {
          for (const p of nb) {
            const d = Math.min(1, Math.hypot(q.n[0] - p.n[0], q.n[1] - p.n[1]) / 0.9);
            const dist = Math.hypot(p.x - q.x, p.y - q.y);
            const mx = (q.x + p.x) / 2, my = (q.y + p.y) / 2 - 1.1 * dist - 16;
            const ex = q.x + (p.x - q.x) * e, ey = q.y + (p.y - q.y) * e;
            const cx = q.x + (mx - q.x) * e, cy = q.y + (my - q.y) * e;
            kit.svg("path", { d: `M${q.x} ${q.y} Q${cx} ${cy} ${ex} ${ey}`, fill: "none", stroke: accent,
              "stroke-width": 1.6 + 5 * d, opacity: 0.45 + 0.5 * d, "stroke-linecap": "round" }, g);
          }
        };
        draw(qa, knn(qa, 8));
        draw(qb, knn(qb, 8));
        for (const q of [qa, qb]) dot(g, q, { r: 7, fill: ink, stroke: bg, sw: 2 });
        text(g, qa.x, qa.y + 38, L.query, { size: 21 });
        text(g, qb.x - 16, qb.y + 10, L.query, { size: 21, anchor: "end" });
        text(g, 320, 52, L.knn, { weight: 600, size: 24 });
        text(g, 320, 330, L.weight, { size: 21, fill: accent, opacity: e });
      }

      if (i === 3) {
        reference(g);
        pts.forEach((p) => {
          const a = p.keep ? 1 : 1 - 0.85 * e;
          dot(g, p, { r: p.keep ? 4 + 1.2 * e : 4, fill: p.keep && p.v > 0.12 ? (e > 0.2 ? ink : mute) : mute, opacity: a });
        });
        text(g, 320, 52, L.keep, { weight: 600, size: 24, opacity: e });
        text(g, 320, 330, L.drop, { size: 21, fill: body, opacity: e });
      }

      if (i === 4) {
        reference(g);
        pts.forEach((p) => {
          const back = p.keep ? 1 : 0.15 + 0.85 * e;
          dot(g, p, { r: 4.4, fill: mute, opacity: back * (1 - e) });
          dot(g, p, { r: 4.4, fill: CLS[p.c], opacity: back * e });
        });
        // Defect regions
        for (const [c, label] of [[1, L.cls[1]], [2, L.cls[2]]]) {
          const xs = pts.filter((p) => p.c === c);
          const x0 = xs[0].x - 9, x1 = xs[xs.length - 1].x + 9;
          const ys = xs.map((p) => p.y);
          const y0 = Math.min(...ys) - 12, y1 = Math.max(...ys) + 12;
          kit.svg("rect", { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 8, fill: "none", stroke: CLS[c], "stroke-width": 2, "stroke-dasharray": "6 4", opacity: e }, g);
          text(g, (x0 + x1) / 2, y0 - 12, label, { size: 22, weight: 600, fill: CLS[c], opacity: e });
        }
        legend(g, 1);
      }
    },
  });
}
