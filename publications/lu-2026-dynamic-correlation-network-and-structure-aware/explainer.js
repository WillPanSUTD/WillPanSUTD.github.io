// DC-SAM schematic: rotated input scans -> rotation-invariant neighbourhood cue (VN magnitude) ->
// dynamic kernel assembly from correlation scores (DCN) -> patch context by linear self-attention (SAPM)
// -> row-column masked softmax, mutual top-k, per-patch SVD hypotheses -> final pose.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Two partially overlapping scans P and Q at an arbitrary relative rotation. Rotation augmentation in training cannot cover all of SO(3), so an unseen orientation can make feature correlations, and the matches built on them, unstable.",
        "In each k-nearest-neighbour patch, DCN builds vector-neuron features from the offset to each neighbour, the mean offset and their cross product. These vectors rotate with the scan; their magnitudes do not.",
        "A channel reallocation network turns these invariant magnitudes into softmax scores over a bank of kernels (4 in the paper). Each neighbour's kernel is the score-weighted sum of the bank, so kernel selection does not change with rotation.",
        "Matched superpoints define a pair of local patches. SAPM refines every point inside a patch with linear self-attention over that patch; points that belong to a neighbouring superpoint are masked out.",
        "Row- and column-wise masked softmax are fused into one confidence matrix, and mutual top-k entries become dense matches. Each patch gives a pose by SVD, and the best hypothesis is kept, without RANSAC.",
      ],
      P: "P (source)", Q: "Q (target)", rot: "unseen rotation", rt: "R, t ?",
      knn: "k-NN patch", rotate: "rotate", inv: "‖ unchanged", vec: "vectors rotate",
      cra: ["channel", "reallocation"], softmax: "softmax", gamma: "scores γ", kern: "kernel bank",
      spm: "superpoint match", gx: "patch of P", gy: "patch of Q", masked: "masked", lsa: "linear self-attention",
      rowcol: "row × column softmax", topk: "mutual top-k", svd: "SVD per patch", best: "best (R, t)", aligned: "aligned",
    },
    zh: {
      steps: [
        "两帧部分重叠的扫描 P 和 Q，彼此之间存在任意的相对旋转。训练时的旋转增强无法覆盖整个 SO(3)，遇到未见过的朝向时，特征相关性以及基于它的匹配都可能变得不稳定。",
        "在每个 k 近邻邻域内，DCN 由指向各邻点的偏移、邻域平均偏移及二者的叉积构造向量神经元特征。这些向量随扫描一起旋转，而它们的模长保持不变。",
        "通道重分配网络把这些旋转不变的模长转换为对一组卷积核（论文中为 4 个）的 softmax 得分，每个邻点的卷积核即按得分对这组卷积核加权求和，因此核的选择不随旋转改变。",
        "匹配的超点各自确定一个局部 patch。SAPM 在 patch 内用线性自注意力细化每个点的描述子；属于相邻超点的点被掩码排除。",
        "按行和按列的掩码 softmax 融合为一个置信度矩阵，双向 top-k 的元素构成稠密匹配。每个 patch 用 SVD 求出一个位姿假设，保留最优者，无需 RANSAC。",
      ],
      P: "P（源）", Q: "Q（目标）", rot: "未见过的旋转", rt: "R, t ?",
      knn: "k 近邻邻域", rotate: "旋转", inv: "‖ 不变", vec: "向量随之旋转",
      cra: ["通道", "重分配"], softmax: "softmax", gamma: "得分 γ", kern: "核库",
      spm: "超点匹配", gx: "P 的 patch", gy: "Q 的 patch", masked: "掩码", lsa: "线性自注意力",
      rowcol: "行 × 列 softmax", topk: "双向 top-k", svd: "逐 patch SVD", best: "最优 (R, t)", aligned: "已对齐",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  // Literal colours for the two scans (the paper's figures draw P in gold and Q in blue).
  const CP = "#d39b16";
  const CQ = "#2f8fd0";
  const rnd = kit.rng(11);
  const { text, line, arrow } = kit.pen({ textSize: 16, stroke: body, width: 1.6 });
  const lerp = (a, b, u) => a + (b - a) * u;
  const partial = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
  const rot = (x, y, deg) => {
    const r = (deg * Math.PI) / 180;
    return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
  };

  // --- Scene: a room corner with a box (side view, local units) -------------------
  const pts = [];
  const seg = (x0, y0, x1, y1, step = 9) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push({ x: lerp(x0, x1, u) + (rnd() - 0.5) * 3, y: lerp(y0, y1, u) + (rnd() - 0.5) * 3 });
    }
  };
  seg(-90, -60, -90, 50);   // wall
  seg(-90, 50, 90, 50);     // floor
  seg(10, 10, 60, 10);      // box top
  seg(10, 12, 10, 48); seg(60, 12, 60, 48); // box sides
  seg(-60, -20, -20, -40);  // shelf
  const SP = pts.filter((p) => p.x <= 55);
  const SQ = pts.filter((p) => p.x >= -45);
  const ANG = 48;
  const POSE_P = { cx: 165, cy: 200, a: 0, s: 1.05 };
  const POSE_Q = { cx: 475, cy: 195, a: ANG, s: 1.05 };
  const place = (p, P) => {
    const [x, y] = rot(p.x * P.s, p.y * P.s, P.a);
    return [P.cx + x, P.cy + y];
  };
  // Shift a scan so that its centroid sits at the local origin (used for the side-by-side view).
  const centred = (set) => {
    const c = set.reduce((m, p) => [m[0] + p.x / set.length, m[1] + p.y / set.length], [0, 0]);
    return set.map((p) => ({ x: p.x - c[0], y: p.y - c[1] }));
  };
  const drawCloud = (g, set, pose, fill, o = 1, r = 3.2) => {
    for (const p of set) {
      const [x, y] = place(p, pose);
      kit.svg("circle", { cx: x, cy: y, r, fill, opacity: o }, g);
    }
  };

  // --- Neighbourhood for step 2 ---------------------------------------------------
  // A lopsided neighbourhood, so that the mean offset p̄_i is clearly non-zero.
  const NB = [[30, -56], [56, -20], [24, 46], [62, 30], [-26, 34], [2, -58], [40, 8]];
  const JN = 4; // highlighted neighbour j
  const mean = NB.reduce((s, p) => [s[0] + p[0] / NB.length, s[1] + p[1] / NB.length], [0, 0]);
  const MEAN = [mean[0] * 2.4, mean[1] * 2.4]; // drawn longer for legibility
  // Label position just beyond the tip of vector v (local coordinates).
  const beyond = (v, d = 22) => { const n = Math.hypot(v[0], v[1]); return [v[0] + (v[0] / n) * d, v[1] + (v[1] / n) * d]; };
  // Text with subscripts: parts = [["‖X", 0], ["j", 1], ["‖", 0]].
  const rich = (g, x, y, parts, o = {}) => {
    const n = text(g, x, y, "", o);
    const size = o.size ?? 16;
    for (const [str, isSub] of parts) {
      const ts = kit.svg("tspan", isSub ? { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) } : {}, n);
      ts.textContent = str;
    }
    return n;
  };
  const NORMS = [0.82, 0.46, 0.66, 0.3, 0.74, 0.54];

  // --- Kernel scores for step 3 ---------------------------------------------------
  const GAMMA = [0.18, 0.52, 0.08, 0.22];
  const KCELLS = [0, 1, 2, 3].map(() => Array.from({ length: 9 }, () => 0.25 + rnd() * 0.75));

  // --- Patch points for steps 4-5 -------------------------------------------------
  const PATCH = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.4 + (rnd() - 0.5) * 0.5;
    const r = 26 + rnd() * 34;
    PATCH.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const MASKED = [30, 66]; // inside the k-NN patch, but closer to a neighbouring superpoint
  const COLS = [3, 0, 4, 1, 5, 2]; // column order of Q's patch points in the matrix
  const SCORE = PATCH.map((_, r) => COLS.map((c) => (c === r ? 0.75 + rnd() * 0.2 : 0.05 + rnd() * 0.25)));

  const header = (g, a, b, o = 1) => {
    text(g, 165, 44, a, { weight: 600, size: 18, opacity: o });
    text(g, 475, 44, b, { weight: 600, size: 18, opacity: o });
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
        header(g, L.P, L.Q);
        drawCloud(g, centred(SP), POSE_P, CP);
        const pq = { ...POSE_Q, a: ANG * e };
        drawCloud(g, centred(SQ), pq, CQ);
        // rotation arc around Q
        const r = 110, a0 = -48, a1 = a0 + ANG * e;
        const p0 = [475 + r * Math.cos((a0 * Math.PI) / 180), 195 + r * Math.sin((a0 * Math.PI) / 180)];
        const p1 = [475 + r * Math.cos((a1 * Math.PI) / 180), 195 + r * Math.sin((a1 * Math.PI) / 180)];
        if (e > 0.05) {
          kit.svg("path", { d: `M${p0[0]} ${p0[1]} A${r} ${r} 0 0 1 ${p1[0]} ${p1[1]}`, fill: "none", stroke: accent, "stroke-width": 2 }, g);
          const ang = ((a1 + 90) * Math.PI) / 180;
          arrow(g, [p1[0] - Math.cos(ang) * 2, p1[1] - Math.sin(ang) * 2], p1, { stroke: accent, w: 2, head: 10 });
        }
        text(g, 475, 336, L.rot, { fill: accent, size: 16, opacity: e });
        arrow(g, [292, 200], [342, 200], { stroke: mute, w: 1.6 });
        text(g, 317, 186, L.rt, { size: 16, fill: body });
      }

      if (i === 1) {
        const panel = (cx, cy, deg, colour) => {
          kit.svg("circle", { cx, cy, r: 82, fill: "none", stroke: mute, "stroke-width": 1.3, "stroke-dasharray": "4 4" }, g);
          const T = (p) => { const q = rot(p[0], p[1], deg); return [cx + q[0], cy + q[1]]; };
          NB.forEach((p, k) => kit.svg("circle", { cx: T(p)[0], cy: T(p)[1], r: k === JN ? 5 : 4, fill: colour, opacity: k === JN ? 1 : 0.7 }, g));
          arrow(g, [cx, cy], T(NB[JN]), { stroke: accent, w: 2.2 });
          arrow(g, [cx, cy], T(MEAN), { stroke: ink, w: 2.2, dash: "5 4" });
          kit.svg("circle", { cx, cy, r: 6, fill: colour, stroke: ink, "stroke-width": 2 }, g);
          const lj = T(beyond(NB[JN]));
          const lm = T(beyond(MEAN));
          rich(g, lj[0], lj[1] + 5, [["p", 0], ["ij", 1]], { size: 17, fill: accent, italic: true });
          rich(g, lm[0], lm[1] + 5, [["p̄", 0], ["i", 1]], { size: 17, italic: true });
        };
        text(g, 165, 40, L.knn, { size: 16, fill: body });
        text(g, 475, 40, L.vec, { size: 16, fill: body, opacity: e });
        panel(165, 140, 0, CP);
        panel(475, 140, 115 * e, CQ);
        arrow(g, [282, 140], [356, 140], { stroke: mute, w: 1.6 });
        text(g, 319, 128, L.rotate, { size: 16, fill: body });
        // invariant magnitudes: identical bars under both panels
        for (const cx of [165, 475]) {
          NORMS.forEach((v, k) => {
            const h = 52 * v;
            kit.svg("rect", { x: cx - 57 + k * 20, y: 292 - h, width: 14, height: h, fill: accent, opacity: 0.75 }, g);
          });
          line(g, [cx - 62, 292], [cx + 62, 292], { stroke: mute, w: 1.2 });
        }
        rich(g, 165, 320, [["‖X", 0], ["j", 1], ["‖", 0]], { size: 17 });
        rich(g, 475, 320, [["‖X", 0], ["j", 1], [L.inv, 0]], { size: 17, fill: accent, weight: 600, opacity: e });
      }

      if (i === 2) {
        // invariant descriptor
        NORMS.forEach((v, k) => {
          const h = 60 * v;
          kit.svg("rect", { x: 26 + k * 15, y: 210 - h, width: 10, height: h, fill: accent, opacity: 0.75 }, g);
        });
        line(g, [22, 210], [116, 210], { stroke: mute, w: 1.2 });
        rich(g, 69, 238, [["‖X", 0], ["j", 1], ["‖", 0]], { size: 17 });
        arrow(g, [122, 180], [148, 180], { stroke: body });
        // channel reallocation box
        kit.svg("rect", { x: 152, y: 140, width: 104, height: 80, rx: 8, fill: "none", stroke: ink, "stroke-width": 1.6 }, g);
        text(g, 204, 175, L.cra[0], { size: 16 });
        text(g, 204, 197, L.cra[1], { size: 16 });
        arrow(g, [262, 180], [326, 180], { stroke: body });
        text(g, 293, 168, L.softmax, { size: 15, fill: body });
        // gamma bars
        GAMMA.forEach((v, k) => {
          const h = 110 * v * e;
          kit.svg("rect", { x: 336 + k * 26, y: 230 - h, width: 18, height: h, fill: accent }, g);
          rich(g, 345 + k * 26, 254, [["W", 0], [String(k + 1), 1]], { size: 16, fill: body });
        });
        line(g, [332, 230], [434, 230], { stroke: mute, w: 1.2 });
        text(g, 384, 104, L.gamma, { size: 17, weight: 600 });
        // kernel bank, weighted by gamma
        text(g, 520, 48, L.kern, { size: 16, fill: body });
        GAMMA.forEach((v, k) => {
          const x0 = 470 + (k % 2) * 56, y0 = 64 + Math.floor(k / 2) * 56;
          KCELLS[k].forEach((c, m) => {
            kit.svg("rect", { x: x0 + (m % 3) * 14, y: y0 + Math.floor(m / 3) * 14, width: 13, height: 13, fill: ink, opacity: c * lerp(0.6, 0.15 + 0.85 * v / 0.52, e) }, g);
          });
        });
        // assembled kernel
        arrow(g, [520, 182], [520, 214], { stroke: body });
        const mix = Array.from({ length: 9 }, (_, m) => GAMMA.reduce((sum, v, k) => sum + v * KCELLS[k][m], 0));
        mix.forEach((c, m) => {
          kit.svg("rect", { x: 499 + (m % 3) * 14, y: 222 + Math.floor(m / 3) * 14, width: 13, height: 13, fill: accent, opacity: e * Math.min(1, c * 1.3) }, g);
        });
        rich(g, 520, 296, [["g = Σ γ", 0], ["l", 1], [" W", 0], ["l", 1]], { size: 18, weight: 600, opacity: e });
        arrow(g, [440, 170], [462, 140], { stroke: mute, w: 1.4, opacity: e });
      }

      if (i === 3) {
        const CX = 170, CY = 190, DX = 470;
        const posX = PATCH.map((p) => [CX + p[0], CY + p[1]]);
        const posY = PATCH.map((p) => { const q = rot(p[0], p[1], ANG); return [DX + q[0], CY + q[1]]; });
        const mX = [CX + MASKED[0], CY + MASKED[1]];
        const mq = rot(MASKED[0], MASKED[1], ANG);
        const mY = [DX + mq[0], CY + mq[1]];
        for (const [c, colour] of [[CX, CP], [DX, CQ]]) {
          kit.svg("circle", { cx: c, cy: CY, r: 82, fill: colour, opacity: 0.06 }, g);
          kit.svg("circle", { cx: c, cy: CY, r: 82, fill: "none", stroke: colour, "stroke-width": 1.4, "stroke-dasharray": "5 4" }, g);
        }
        // coarse superpoint match
        line(g, [CX + 10, CY], [DX - 10, CY], { stroke: mute, dash: "6 5", w: 1.6 });
        text(g, 320, CY - 10, L.spm, { size: 15, fill: body });
        // intra-patch self-attention
        for (const [set, colour] of [[posX, CP], [posY, CQ]]) {
          for (let a = 0; a < set.length; a++) for (let b = a + 1; b < set.length; b++) {
            line(g, set[a], partial(set[a], set[b], e), { stroke: colour, w: 1.1, opacity: 0.55 });
          }
          set.forEach((p) => kit.svg("circle", { cx: p[0], cy: p[1], r: 5.5, fill: colour }, g));
        }
        for (const [c, colour] of [[CX, CP], [DX, CQ]]) {
          kit.svg("rect", { x: c - 7, y: CY - 7, width: 14, height: 14, fill: colour, stroke: ink, "stroke-width": 1.8, transform: `rotate(45 ${c} ${CY})` }, g);
        }
        for (const m of [mX, mY]) {
          kit.svg("circle", { cx: m[0], cy: m[1], r: 5.5, fill: bg, stroke: mute, "stroke-width": 1.8 }, g);
        }
        text(g, mX[0] + 12, mX[1] + 5, L.masked, { size: 15, fill: body, anchor: "start", opacity: e });
        text(g, mY[0] - 12, mY[1] + 5, L.masked, { size: 15, fill: body, anchor: "end", opacity: e });
        text(g, CX, 72, L.gx, { size: 17, weight: 600 });
        text(g, DX, 72, L.gy, { size: 17, weight: 600 });
        text(g, 320, 318, L.lsa, { size: 17, fill: accent, weight: 600, opacity: e });
      }

      if (i === 4) {
        const n = PATCH.length + 1; // last row / column is the masked point
        const cs = 24, x0 = 70, y0 = 98;
        text(g, x0 + (n * cs) / 2, 52, L.rowcol, { size: 16, weight: 600 });
        for (let r = 0; r < n; r++) {
          kit.svg("circle", { cx: x0 - 14, cy: y0 + r * cs + cs / 2, r: 5, fill: r < n - 1 ? CP : bg, stroke: r < n - 1 ? "none" : mute, "stroke-width": 1.6 }, g);
          kit.svg("circle", { cx: x0 + r * cs + cs / 2, cy: y0 - 14, r: 5, fill: r < n - 1 ? CQ : bg, stroke: r < n - 1 ? "none" : mute, "stroke-width": 1.6 }, g);
          for (let c = 0; c < n; c++) {
            const masked = r === n - 1 || c === n - 1;
            const v = masked ? 0 : SCORE[r][c];
            kit.svg("rect", { x: x0 + c * cs, y: y0 + r * cs, width: cs - 2, height: cs - 2, fill: masked ? rule : accent, opacity: masked ? 0.9 : 0.12 + 0.8 * v * (0.4 + 0.6 * e) }, g);
            if (!masked && COLS[c] === r && e > 0.5) {
              kit.svg("rect", { x: x0 + c * cs - 1, y: y0 + r * cs - 1, width: cs, height: cs, fill: "none", stroke: ink, "stroke-width": 2.2 }, g);
            }
          }
        }
        text(g, x0 + (n * cs) / 2, y0 + n * cs + 26, L.topk, { size: 15, fill: body, opacity: e });
        // hypotheses
        arrow(g, [250, 182], [290, 182], { stroke: body });
        text(g, 352, 104, L.svd, { size: 15, fill: body });
        const best = 1;
        ["1", "2", "3"].forEach((i, k) => {
          const y = 124 + k * 46, on = k === best && e > 0.6;
          kit.svg("rect", { x: 302, y, width: 100, height: 34, rx: 5, fill: on ? accent : "none", "fill-opacity": on ? 0.12 : 0, stroke: on ? accent : mute, "stroke-width": on ? 2.2 : 1.4 }, g);
          rich(g, 352, y + 23, [["R", 0], [i, 1], [", t", 0], [i, 1]], { size: 16, fill: on ? accent : body, weight: on ? 600 : 400 });
        });
        text(g, 352, 290, L.best, { size: 15, fill: accent, weight: 600, opacity: e });
        arrow(g, [410, 182], [446, 182], { stroke: body, opacity: e });
        // aligned scans (mini)
        const mini = { cx: 540, cy: 182, a: 0, s: 0.52 };
        const mq = { cx: 540, cy: 182, a: ANG * (1 - e), s: 0.52 };
        drawCloud(g, SQ, mq, CQ, 0.85, 2.2);
        drawCloud(g, SP, mini, CP, 0.85, 2.2);
        text(g, 540, 252, L.aligned, { size: 16, weight: 600, opacity: e });
      }
    },
  });
}
