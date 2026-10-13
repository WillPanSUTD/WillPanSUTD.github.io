// SemReg schematic: two partial scans -> 2D semantic features on the points ->
// semantic prior focuses cross-attention -> semantics-constrained matching -> alignment.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two partial 3D scans of one room, from different viewpoints. By shape alone, a tabletop and a chair seat look alike.",
        "SemReg lifts semantic features from the RGB frames (a pretrained DINOv2 network) onto the 3D points. Colour stands for semantics here.",
        "For a query point, a Gaussian-mixture semantic prior marks the similar region in the other scan, and cross-attention concentrates there.",
        "Points are matched only within semantically similar regions, so a tabletop-to-seat match is discarded.",
        "The rigid transform is estimated from the remaining matches (RANSAC), and the two scans snap into alignment.",
      ],
      src: "Source X", tgt: "Target Y", query: "query point", prior: "semantic prior",
      reject: "table ≠ chair", aligned: "aligned", rgb: "RGB → DINOv2",
      cls: ["wall", "table", "chair"],
    },
    zh: {
      steps: [
        "同一房间、不同视角下的两帧局部三维扫描。只看几何形状，桌面与椅面十分相似，容易混淆。",
        "SemReg 用预训练的 DINOv2 网络从 RGB 图像中提取语义特征，并投影到三维点上；图中颜色代表语义。",
        "对一个查询点，高斯混合语义先验标出另一帧中语义相近的区域，交叉注意力随之集中于该区域。",
        "只在语义相近的区域之间建立匹配，桌面与椅面之间的错误匹配被剔除。",
        "利用保留下来的匹配（RANSAC）估计刚体变换，两帧扫描随即对齐。",
      ],
      src: "源点云 X", tgt: "目标点云 Y", query: "查询点", prior: "语义先验",
      reject: "桌 ≠ 椅", aligned: "已对齐", rgb: "RGB → DINOv2",
      cls: ["墙", "桌", "椅"],
    },
  }, lang);

  const ink = kit.token("--c-ink") || "#0a0a0a";
  const body = kit.token("--c-body") || "#525252";
  const accent = kit.token("--c-accent") || "#1e3a8a";
  const mute = kit.token("--c-mute") || "#a3a3a3";
  const bg = kit.token("--c-bg") || "#ffffff";
  // Literal semantic class colours (schematic stand-ins for 2D semantic features).
  const CLS = ["#6b8cba", "#d9822b", "#b0457a"]; // wall, table, chair

  // --- Deterministic scene (side view, local units) ---------------------------
  let seed = 7;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const pts = [];
  const seg = (x0, y0, x1, y1, c, step = 8) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push({ x: x0 + (x1 - x0) * u + (rnd() - 0.5) * 2.4, y: y0 + (y1 - y0) * u + (rnd() - 0.5) * 2.4, c });
    }
  };
  seg(-90, -70, -90, 58, 0); seg(-82, -66, -82, 58, 0);          // left wall
  seg(-58, -30, -58, 12, 2); seg(-58, 17, -28, 17, 2);           // chair back + seat
  seg(-56, 24, -56, 58, 2); seg(-31, 24, -31, 58, 2);            // chair legs
  seg(-16, -6, 74, -6, 1); seg(-16, -1, 74, -1, 1);              // tabletop
  seg(-11, 6, -11, 58, 1); seg(69, 6, 69, 58, 1);                // table legs
  seg(98, -70, 98, 58, 0); seg(106, -66, 106, 58, 0);            // right wall
  pts.forEach((p, i) => { p.i = i; p.inS = p.x <= 38; p.inT = p.x >= -64; });
  const S = pts.filter((p) => p.inS);
  const T = pts.filter((p) => p.inT);

  // Poses: world = R(a) * (p - c0) + C
  const K = 1.45; // scene scale
  const SRC = { cx: 165, cy: 200, ox: -26, oy: -4, a: -22 };
  const TGT = { cx: 470, cy: 200, ox: 8, oy: -4, a: 0 };
  const MID = { cx: 320, cy: 200, ox: 8, oy: -4, a: 0 };
  const place = (p, P) => {
    const r = (P.a * Math.PI) / 180, dx = (p.x - P.ox) * K, dy = (p.y - P.oy) * K;
    return [P.cx + dx * Math.cos(r) - dy * Math.sin(r), P.cy + dx * Math.sin(r) + dy * Math.cos(r)];
  };
  const lerpPose = (A, B, u) => ({
    cx: A.cx + (B.cx - A.cx) * u, cy: A.cy + (B.cy - A.cy) * u,
    ox: A.ox + (B.ox - A.ox) * u, oy: A.oy + (B.oy - A.oy) * u, a: A.a + (B.a - A.a) * u,
  });
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const near = (arr, x, y) => arr.reduce((b, p) => (Math.hypot(p.x - x, p.y - y) < Math.hypot(b.x - x, b.y - y) ? p : b));

  const qPt = near(S, -44, 17);                    // query: chair seat
  const tableS = near(S, 34, -6);                  // tabletop point in source
  const seatT = near(T, -40, 17);                  // seat point in target (look-alike)
  const tableT = T.find((p) => p.i === tableS.i);  // true counterpart
  const overlap = S.filter((p) => p.inT && p.c !== 0);
  const pairs = overlap.filter((_, k) => k % 6 === 2);
  const attn = T.filter((p) => p.c === 2).filter((_, k) => k % 3 === 0);

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
    x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: o.stroke || accent, "stroke-width": o.w || 1.6,
    "stroke-dasharray": o.dash || "none", opacity: o.opacity ?? 1, "stroke-linecap": "round",
  }, parent);
  const partial = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  // Draw one scan. mode: "grey" | "colour"; alpha(p) optional per-point opacity.
  const drawScan = (g, set, pose, { colourMix = 0, alpha = () => 1, ring = false }) => {
    for (const p of set) {
      const [x, y] = place(p, pose);
      const a = alpha(p);
      if (ring) {
        kit.svg("circle", { cx: x, cy: y, r: 4.2, fill: "none", stroke: CLS[p.c], "stroke-width": 1.4, opacity: 0.75 * a }, g);
        continue;
      }
      if (colourMix < 1) kit.svg("circle", { cx: x, cy: y, r: 3.3, fill: mute, opacity: (1 - colourMix) * a }, g);
      if (colourMix > 0) kit.svg("circle", { cx: x, cy: y, r: 3.3, fill: CLS[p.c], opacity: colourMix * a }, g);
    }
  };
  const legend = (g, opacity) => {
    const w = 116, x0 = 320 - (w * 3) / 2 + 18;
    L.cls.forEach((name, k) => {
      kit.svg("circle", { cx: x0 + k * w, cy: 338, r: 7, fill: CLS[k], opacity }, g);
      text(g, x0 + k * w + 14, 346, name, { anchor: "start", fill: body, opacity, size: 21 });
    });
  };
  const titles = (g, opacity = 1) => {
    if (opacity <= 0.01) return;
    text(g, 165, 40, L.src, { weight: 600, opacity, size: 24 });
    text(g, 470, 40, L.tgt, { weight: 600, opacity, size: 24 });
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
        titles(g, e);
        drawScan(g, S, SRC, {});
        drawScan(g, T, TGT, {});
        const a = place(tableS, SRC);
        for (const target of [tableT, seatT]) {
          const b = place(target, TGT);
          line(g, a, partial(a, b, e), { stroke: body, dash: "5 5", w: 1.4, opacity: 0.8 });
          if (t > 0.6) {
            const m = partial(a, b, 0.62);
            text(g, m[0], m[1] - 6, "?", { size: 26, weight: 700, fill: body });
          }
        }
      }

      if (i === 1) {
        titles(g);
        drawScan(g, S, SRC, { colourMix: e });
        drawScan(g, T, TGT, { colourMix: e });
        for (const cx of [165, 470]) {
          kit.svg("rect", { x: cx - 26, y: 56, width: 52, height: 30, rx: 4, fill: "none", stroke: body, "stroke-width": 1.4, opacity: e }, g);
          kit.svg("path", { d: `M${cx - 18} 80 l10 -12 l8 8 l6 -5 l12 9`, fill: "none", stroke: body, "stroke-width": 1.4, opacity: e }, g);
        }
        text(g, 320, 76, L.rgb, { size: 21, fill: body, opacity: e });
        legend(g, e);
      }

      if (i === 2) {
        titles(g);
        drawScan(g, S, SRC, { colourMix: 1, alpha: (p) => (p.i === qPt.i ? 0 : 0.35) });
        drawScan(g, T, TGT, { colourMix: 1, alpha: (p) => (p.c === 2 ? 1 : 1 - 0.75 * e) });
        const q = place(qPt, SRC);
        for (const p of attn) {
          const b = place(p, TGT);
          line(g, q, partial(q, b, e), { w: 1.3, opacity: 0.55 });
        }
        // Gaussian halo over the semantically similar region in the target
        const cs = T.filter((p) => p.c === 2).map((p) => place(p, TGT));
        const hx = cs.reduce((s, c) => s + c[0], 0) / cs.length;
        const hy = cs.reduce((s, c) => s + c[1], 0) / cs.length;
        kit.svg("ellipse", { cx: hx, cy: hy, rx: 50 * e + 4, ry: 76 * e + 4, fill: accent, opacity: 0.1 }, g);
        kit.svg("ellipse", { cx: hx, cy: hy, rx: 50 * e + 4, ry: 76 * e + 4, fill: "none", stroke: accent, "stroke-width": 1.4, "stroke-dasharray": "4 4", opacity: 0.8 }, g);
        kit.svg("circle", { cx: q[0], cy: q[1], r: 6, fill: CLS[2], stroke: ink, "stroke-width": 2 }, g);
        text(g, q[0], q[1] + 32, L.query, { size: 21 });
        text(g, hx, hy - 76 * e - 14, L.prior, { size: 21, fill: accent, opacity: e });
        legend(g, 1);
      }

      if (i === 3) {
        titles(g);
        drawScan(g, S, SRC, { colourMix: 1, alpha: () => 0.75 });
        drawScan(g, T, TGT, { colourMix: 1, alpha: () => 0.75 });
        for (const p of pairs) {
          const a = place(p, SRC);
          const b = place(T.find((q) => q.i === p.i), TGT);
          line(g, a, partial(a, b, e), { w: 1.6, opacity: 0.85 });
        }
        const a = place(tableS, SRC);
        const b = place(seatT, TGT);
        line(g, a, b, { stroke: ink, dash: "6 5", w: 2.2, opacity: 0.85 });
        const m = partial(a, b, 0.5);
        const k = 7 * e;
        if (k > 0.5) {
          kit.svg("path", { d: `M${m[0] - k} ${m[1] - k} L${m[0] + k} ${m[1] + k} M${m[0] + k} ${m[1] - k} L${m[0] - k} ${m[1] + k}`, stroke: ink, "stroke-width": 2.6, "stroke-linecap": "round" }, g);
        }
        line(g, [m[0], 104], [m[0], m[1] - 12], { stroke: mute, w: 1.2, opacity: e });
        text(g, m[0], 96, L.reject, { size: 21, fill: ink, weight: 600, opacity: e });
        legend(g, 1);
      }

      if (i === 4) {
        const sp = lerpPose(SRC, MID, e);
        const tp = lerpPose(TGT, MID, e);
        titles(g, 1 - e);
        drawScan(g, T, tp, { ring: true });
        drawScan(g, S, sp, { colourMix: 1, alpha: () => 0.9 });
        if (t < 0.85) {
          for (const p of pairs) {
            line(g, place(p, sp), place(T.find((q) => q.i === p.i), tp), { w: 1.4, opacity: 0.8 * (1 - e) });
          }
        }
        text(g, 320, 64, `${L.aligned} · R, t`, { weight: 600, opacity: e });
        legend(g, 1);
      }
    },
  });
}
