// SuP schematic: two low-overlap scans whose look-alike shelves cause wrong matches ->
// subdivide into sub-clouds -> Phase I (OPS) keeps candidate pairs -> Phase II (MPN) checks
// feature consensus after a preliminary alignment -> merge anchor-pair matches and align.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two scans of one room that share only a small region. Look-alike structures outside the overlap (the two shelves) pull whole-cloud matching toward wrong correspondences (red).",
        "SuP splits each scan into sub-clouds: centroids spread out by farthest point sampling, each gathering its nearest neighbours within a radius.",
        "Phase I (OPS) scores every source–target sub-cloud pair by how strongly their features agree and keeps the strongest as candidates for a closer check (24 of the 36 pairs in the paper's setup; a few are highlighted here).",
        "Phase II: each candidate pair is aligned with a quick preliminary pose, and the MPN network scores how well features agree where the points now overlap. True anchor pairs score high; the look-alike pair is rejected.",
        "Merge-to-match: correspondences from all anchor pairs are merged, and the final rigid transform brings the two scans into alignment.",
      ],
      src: "Source", tgt: "Target", similar: "look-alike", overlap: "overlap",
      sub: "sub-clouds", ops: "Phase I · OPS", mpn: "Phase II · MPN",
      anchor: "anchor", reject: "rejected", aligned: "aligned · R, t", merge: "merged matches",
    },
    zh: {
      steps: [
        "同一房间的两帧扫描，仅有一小块区域重叠。重叠区之外外形相似的结构（两个书架）会把整体匹配引向错误对应（红线）。",
        "SuP 把每帧点云划分为若干子点云：用最远点采样选出分散的中心点，再在半径约束内收集各中心的近邻点。",
        "第一阶段（OPS）按特征相关性为每一对源–目标子点云打分，保留得分最高的若干对作为候选，留待下一阶段进一步核验（论文设置中 36 对保留 24 对，图中仅突出其中几对）。",
        "第二阶段：先为每个候选对估计初步位姿并对齐，再由 MPN 网络评估对齐后重叠点之间的特征一致性。真正的锚点对得分高，外形相似的错误配对被剔除。",
        "合并匹配：将所有锚点对内的对应点合并，估计最终的刚体变换，两帧扫描随即对齐。",
      ],
      src: "源点云", tgt: "目标点云", similar: "外形相似", overlap: "重叠区",
      sub: "个子点云", ops: "第一阶段 · OPS", mpn: "第二阶段 · MPN",
      anchor: "锚点对", reject: "剔除", aligned: "已对齐 · R, t", merge: "合并对应点",
    },
  }, lang);

  const ink = kit.token("--c-ink") || "#0a0a0a";
  const body = kit.token("--c-body") || "#525252";
  const accent = kit.token("--c-accent") || "#1e3a8a";
  const mute = kit.token("--c-mute") || "#a3a3a3";
  const rule = kit.token("--c-rule") || "#e5e5e5";
  const bg = kit.token("--c-bg") || "#ffffff";
  // Literal colours: source scan, target scan, inlier match, outlier match (as in the paper's figures).
  const SRC_C = "#c99a12", TGT_C = "#2f6db5", GOOD = "#2e9d4f", BAD = "#d64545";

  // --- Deterministic scene (side view, local units, y down) -------------------
  let seed = 11;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const pts = [];
  const seg = (x0, y0, x1, y1, step = 7) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push({ x: x0 + (x1 - x0) * u + (rnd() - 0.5) * 2.2, y: y0 + (y1 - y0) * u + (rnd() - 0.5) * 2.2 });
    }
  };
  seg(-160, 60, 160, 60, 8);                                      // floor
  // shelf A (source only) and shelf B (target only): same frame, different shelf heights
  seg(-140, -50, -140, 56); seg(-95, -50, -95, 56);
  for (const y of [-50, -15, 20]) seg(-137, y, -98, y);
  seg(95, -50, 95, 56); seg(140, -50, 140, 56);
  for (const y of [-50, 4]) seg(98, y, 137, y);
  seg(117, -47, 117, 1);                                         // shelf B divider
  // overlap region: box, table, chair
  seg(-42, 40, -42, 56); seg(-30, 40, -30, 56); seg(-42, 40, -30, 40);
  seg(-25, 0, 25, 0); seg(-21, 5, -21, 56); seg(21, 5, 21, 56);
  seg(30, 25, 50, 25); seg(52, -10, 52, 56); seg(32, 30, 32, 56);
  pts.forEach((p, i) => { p.i = i; p.inS = p.x <= 45; p.inT = p.x >= -45; });
  const S = pts.filter((p) => p.inS);
  const T = pts.filter((p) => p.inT);

  // Sub-cloud centroids (local units) and radius; k = 6 per scan as in the paper.
  const R = 34;
  const CS = [[-118, -24], [-118, 36], [-70, 50], [-30, 26], [0, 16], [30, 28]];
  const CT = [[-28, 26], [2, 16], [32, 28], [70, 50], [118, -24], [118, 36]];
  const anchors = [[3, 0], [4, 1], [5, 2]];      // true high-overlap pairs (source idx, target idx)
  const lookalike = [[0, 4], [1, 5]];            // shelf A vs shelf B
  const candidates = [...anchors, ...lookalike];
  const isCand = (a, b) => candidates.some(([x, y]) => x === a && y === b);
  // OPS keeps 24 of 36 pairs: drop the 12 non-candidates whose centroids are farthest apart (schematic).
  const dropped = new Set([...Array(36).keys()].filter((n) => !isCand(Math.floor(n / 6), n % 6))
    .sort((m, n) => Math.hypot(CS[Math.floor(n / 6)][0] - CT[n % 6][0], CS[Math.floor(n / 6)][1] - CT[n % 6][1])
      - Math.hypot(CS[Math.floor(m / 6)][0] - CT[m % 6][0], CS[Math.floor(m / 6)][1] - CT[m % 6][1]) || m - n)
    .slice(0, 12));
  const within = (set, c) => set.filter((p) => Math.hypot(p.x - c[0], p.y - c[1]) < R);

  // Poses: screen = C + Rot(a) * (p - o) * K
  const K = 1.35;
  const SRC = { cx: 165, cy: 196, ox: -57, oy: 5, a: -12 };
  const TGT = { cx: 475, cy: 196, ox: 57, oy: 5, a: 0 };
  const MID = { cx: 320, cy: 200, ox: 0, oy: 5, a: 0 };
  const place = (p, P) => {
    const r = (P.a * Math.PI) / 180, dx = ((p.x ?? p[0]) - P.ox) * K, dy = ((p.y ?? p[1]) - P.oy) * K;
    return [P.cx + dx * Math.cos(r) - dy * Math.sin(r), P.cy + dx * Math.sin(r) + dy * Math.cos(r)];
  };
  const lerpPose = (A, B, u) => ({
    cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u,
    ox: A.ox + (B.ox - A.ox) * u, oy: A.oy + (B.oy - A.oy) * u, a: A.a + (B.a - A.a) * u,
  });
  const ease = (t) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
  const seg01 = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const partial = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  const text = (parent, x, y, str, o = {}) => {
    const n = kit.svg("text", {
      x, y, "font-size": o.size || 22, fill: o.fill || ink, "text-anchor": o.anchor || "middle",
      "font-weight": o.weight || 400, "font-family": "var(--f-sans)", "paint-order": "stroke",
      stroke: bg, "stroke-width": 4, "stroke-linejoin": "round", opacity: o.opacity ?? 1,
    }, parent);
    n.textContent = str;
    return n;
  };
  const line = (parent, a, b, o = {}) => kit.svg("line", {
    x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.stroke || accent, "stroke-width": o.w || 1.5,
    "stroke-dasharray": o.dash || "none", opacity: o.opacity ?? 1, "stroke-linecap": "round",
  }, parent);
  const dots = (g, set, pose, colour, alpha = () => 1, r = 2.9) => {
    for (const p of set) {
      const [x, y] = place(p, pose);
      kit.svg("circle", { cx: x, cy: y, r, fill: colour, opacity: alpha(p) }, g);
    }
  };
  const titles = (g, opacity = 1) => {
    if (opacity <= 0.01) return;
    text(g, 165, 42, L.src, { weight: 600, opacity, size: 26, fill: SRC_C });
    text(g, 475, 42, L.tgt, { weight: 600, opacity, size: 26, fill: TGT_C });
  };
  const circles = (g, cs, pose, o = {}) => cs.forEach((c, k) => {
    const [x, y] = place(c, pose);
    const hi = o.hi ? o.hi(k) : false;
    kit.svg("circle", {
      cx: x, cy: y, r: R * K * (o.grow ?? 1), fill: hi ? accent : "none", "fill-opacity": hi ? 0.08 : 0,
      stroke: hi ? accent : body, "stroke-width": hi ? 2 : 1.3, "stroke-dasharray": "5 4",
      opacity: (o.opacity ?? 1) * (o.dim && o.dim(k) ? 0.3 : 1),
    }, g);
    kit.svg("circle", { cx: x, cy: y, r: 4, fill: accent, opacity: o.opacity ?? 1 }, g);
  });
  const matchPairs = (set) => set.filter((p) => p.inS && p.inT && p.y < 58).filter((_, k) => k % 2 === 0);
  const anchorPts = matchPairs(pts.filter((p) => anchors.some(([a]) => Math.hypot(p.x - CS[a][0], p.y - CS[a][1]) < R)));

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = ease(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        titles(g);
        // overlap band on both scans
        for (const [pose, xs] of [[SRC, [-45, 45]], [TGT, [-45, 45]]]) {
          const a = place([xs[0], -56], pose), b = place([xs[1], -56], pose);
          const c = place([xs[1], 64], pose), d = place([xs[0], 64], pose);
          kit.svg("polygon", { points: [a, b, c, d].map((q) => q.join(",")).join(" "), fill: accent, opacity: 0.07 * e }, g);
        }
        dots(g, S, SRC, SRC_C);
        dots(g, T, TGT, TGT_C);
        const goods = pts.filter((p) => p.inS && p.inT && p.y < 56 && p.x > -40).filter((_, k) => k % 3 === 0);
        for (const p of goods) {
          const a = place(p, SRC);
          line(g, a, partial(a, place(p, TGT), e), { stroke: GOOD, w: 1.6, opacity: 0.9 });
        }
        // wrong matches: shelf A points to the similar-looking shelf B
        const shelfA = pts.filter((p) => p.x < -90 && p.x > -142 && p.y < 50).filter((_, k) => k % 5 === 0);
        for (const p of shelfA) {
          const q = T.reduce((b, c) => (Math.hypot(c.x - (p.x + 235), c.y - p.y) < Math.hypot(b.x - (p.x + 235), b.y - p.y) ? c : b));
          const a = place(p, SRC);
          line(g, a, partial(a, place(q, TGT), e), { stroke: BAD, w: 1.4, opacity: 0.75 });
        }
        text(g, 320, 92, L.similar, { size: 24, fill: BAD, weight: 600, opacity: e });
        text(g, 165, 334, L.overlap, { size: 23, fill: body, opacity: e, anchor: "start" });
        const ob = place([0, 64], SRC);
        line(g, [ob[0] + 6, ob[1] + 4], [176, 314], { stroke: mute, w: 1.2, opacity: e });
      }

      if (i === 1) {
        titles(g);
        dots(g, S, SRC, SRC_C);
        dots(g, T, TGT, TGT_C);
        circles(g, CS, SRC, { grow: e, opacity: e });
        circles(g, CT, TGT, { grow: e, opacity: e });
        text(g, 165, 338, `k = 6 ${L.sub}`, { size: 24, fill: body, opacity: e });
        text(g, 475, 338, `k = 6 ${L.sub}`, { size: 24, fill: body, opacity: e });
      }

      if (i === 2) {
        titles(g);
        dots(g, S, SRC, SRC_C, () => 0.45);
        dots(g, T, TGT, TGT_C, () => 0.45);
        // all k*k pair lines, non-candidates fade out
        for (let a = 0; a < 6; a++) {
          for (let b = 0; b < 6; b++) {
            const p = place(CS[a], SRC), q = place(CT[b], TGT);
            if (isCand(a, b)) line(g, p, q, { stroke: accent, w: 1.2 + 1.3 * e, opacity: 0.55 + 0.4 * e });
            else if (dropped.has(a * 6 + b)) line(g, p, q, { stroke: mute, w: 1, opacity: 0.45 * (1 - e) });
            else line(g, p, q, { stroke: mute, w: 1.4, opacity: 0.6 });
          }
        }
        circles(g, CS, SRC, {});
        circles(g, CT, TGT, {});
        text(g, 320, 338, L.ops, { size: 25, weight: 600, fill: accent });
      }

      if (i === 3) {
        text(g, 320, 42, L.mpn, { size: 25, weight: 600, fill: accent });
        // three candidate cards: table pair, look-alike shelves, chair pair
        const cards = [
          { a: 4, b: 1, shift: 0, ok: true },
          { a: 0, b: 4, shift: 236, ok: false },
          { a: 5, b: 2, shift: 0, ok: true },
        ];
        const KC = 1.9;
        cards.forEach((c, n) => {
          const cx = 112 + n * 208, cy = 170;
          kit.svg("rect", { x: cx - 92, y: cy - 88, width: 184, height: 176, rx: 10, fill: "none", stroke: rule, "stroke-width": 1.5 }, g);
          const ct = CT[c.b];
          const slide = (1 - ease(seg01(t, 0, 0.6))) * 30;
          const toCard = (x, y, off) => [cx + (x - ct[0]) * KC + off, cy + (y - ct[1]) * KC - off * 0.4];
          for (const p of within(T, ct)) {
            const [x, y] = toCard(p.x, p.y, 0);
            kit.svg("circle", { cx: x, cy: y, r: 3.2, fill: TGT_C, opacity: 0.85 }, g);
          }
          for (const p of within(S, CS[c.a])) {
            const [x, y] = toCard(p.x + c.shift, p.y, slide);
            kit.svg("circle", { cx: x, cy: y, r: 2.4, fill: SRC_C, opacity: 0.95 }, g);
          }
          // consensus verdict after alignment
          const v = ease(seg01(t, 0.55, 1));
          const w = c.ok ? 0.88 : 0.18;
          kit.svg("rect", { x: cx - 70, y: cy + 104, width: 140, height: 10, rx: 5, fill: rule, opacity: v }, g);
          kit.svg("rect", { x: cx - 70, y: cy + 104, width: 140 * w * v, height: 10, rx: 5, fill: c.ok ? GOOD : BAD, opacity: v }, g);
          text(g, cx, cy + 146, `${c.ok ? "✓" : "✗"} ${c.ok ? L.anchor : L.reject}`, {
            size: 25, weight: 600, fill: c.ok ? GOOD : BAD, opacity: v,
          });
        });
      }

      if (i === 4) {
        const u = ease(seg01(t, 0.35, 1));
        const sp = lerpPose(SRC, MID, u);
        const tp = lerpPose(TGT, MID, u);
        titles(g, 1 - u);
        dots(g, T, tp, TGT_C, () => 0.75);
        dots(g, S, sp, SRC_C, () => 0.9);
        const lu = ease(seg01(t, 0, 0.35));
        if (u < 0.95) {
          for (const p of anchorPts) {
            const a = place(p, sp);
            line(g, a, partial(a, place(p, tp), lu), { stroke: GOOD, w: 1.5, opacity: 0.85 * (1 - u) });
          }
        }
        text(g, 320, 338, L.merge, { size: 24, fill: GOOD, weight: 600, opacity: lu * (1 - u) });
        text(g, 320, 70, L.aligned, { size: 26, weight: 600, opacity: u });
      }
    },
  });
}
