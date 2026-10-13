// Differential chain-code contour matching schematic:
// run-length contour -> smoothed, uniformly sampled points ->
// three-point differential codes (angle quantised to 0-4) ->
// local code split into short segments, each slid along the model code to give a cost array ->
// sliding-window minimum, offset-aligned sum, local minima = candidate start positions ->
// SVD alignment per candidate; the smaller mean point distance wins.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "The contour traced from run-length encoding is dense (about 1 px apart) and noisy. It is smoothed with a neighbour mean and resampled at a fixed spacing into an ordered point set.",
        "Each point gets a differential code from the turning angle θ between the vectors to its two neighbours, quantised to 0–4. The whole contour becomes a short code sequence.",
        "The local contour's code is split into short segments. Each segment slides along the model code, and at every shift the cost Σ|b − a| is recorded, giving one cost array per segment.",
        "A sliding window (size 3) writes the minimum of each window into its centre. The arrays are aligned by segment offset and summed; local minima of the total become candidate start positions.",
        "For each candidate, point pairs are formed and a rigid transform is estimated by SVD. The candidate with the smaller mean point distance is kept; ICP can refine the result.",
      ],
      raw: "run-length contour", smooth: "smoothed + resampled",
      model: "model A", local: "local B", cost: "cost per shift: Σ |b − a|",
      seg: (k) => `segment ${k}`,
      filt: "window min (w = 3), aligned by segment offset",
      total: "total cost", cand: "candidates",
      svd: "SVD → R, t", good: "mean distance small ✓", bad: "mean distance large ✗",
      icp: "+ optional ICP refinement",
      noise: "noise point",
      start: "candidate start",
    },
    zh: {
      steps: [
        "由游程编码提取的轮廓点很密（间距约 1 像素）且含噪声。先用邻域均值平滑，再按固定间距重采样，得到有序点集。",
        "每个点由其与前后两点构成的两个向量之间的转角 θ 确定差分码，量化为 0–4。整条轮廓由此变成一段短的码序列。",
        "将局部轮廓的码序列切成若干短段。每一段沿模板码序列逐位滑动，记录每个位置的代价 Σ|b − a|，每段得到一个代价数组。",
        "用大小为 3 的滑动窗口把窗口内的最小值写入中心位置；再按各段的偏移对齐并求和，总代价的局部极小处即候选起始位置。",
        "对每个候选位置建立点对，用 SVD 估计刚体变换；保留变换后平均点距较小的候选，并可再用 ICP 精化。",
      ],
      raw: "游程编码轮廓", smooth: "平滑 + 均匀采样",
      model: "模板 A", local: "局部 B", cost: "逐位代价：Σ |b − a|",
      seg: (k) => `第 ${k} 段`,
      filt: "窗口取最小（w = 3），按段偏移对齐",
      total: "总代价", cand: "候选位置",
      svd: "SVD → R, t", good: "平均距离小 ✓", bad: "平均距离大 ✗",
      icp: "+ 可选 ICP 精化",
      noise: "噪声点",
      start: "候选起点",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  // Literal semantic colours for the three local-contour segments.
  const SEG = ["#d9822b", "#2f8f5b", "#7a5bd6"];
  const BAD = "#c4413b";

  // --- Deterministic geometry (contour units, y up) -------------------------------------------
  const POLY = [[0, 0], [10, 0], [10, 7], [7, 7], [7, 4], [5, 4], [5, 7], [0, 7]];
  const M = 24, N = 12, SL = 4, K = 3, S0 = 2, NOISE = 8;
  const edges = POLY.map((a, k) => {
    const b = POLY[(k + 1) % POLY.length];
    return [a, b, Math.hypot(b[0] - a[0], b[1] - a[1])];
  });
  const PER = edges.reduce((s, e) => s + e[2], 0);
  const at = (d) => {
    d = ((d % PER) + PER) % PER;
    for (const [a, b, len] of edges) {
      if (d <= len) return [a[0] + ((b[0] - a[0]) * d) / len, a[1] + ((b[1] - a[1]) * d) / len];
      d -= len;
    }
    return POLY[0];
  };
  const P = [...Array(M)].map((_, i) => at(((i + 0.5) * PER) / M));
  const turn = (p0, p1, p2) => {
    const a1 = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const a2 = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    return ((((a2 - a1) * 180) / Math.PI + 540) % 360) - 180;
  };
  const code = (deg) => Math.min(4, Math.floor((Math.abs(deg) + 22.5) / 45));
  const A = P.map((p, i) => code(turn(P[(i - 1 + M) % M], p, P[(i + 1) % M])));

  // Local contour: model points S0-1 .. S0+N, one of them displaced by noise.
  const loc = [...Array(N + 2)].map((_, t) => P[(S0 + t - 1 + M) % M].slice());
  loc[NOISE + 1][1] += 0.9;
  loc[NOISE + 1][0] += 0.3;
  const B = [...Array(N)].map((_, t) => code(turn(loc[t], loc[t + 1], loc[t + 2])));
  const LP = loc.slice(1, N + 1); // the N coded local points

  const C = [...Array(K)].map((_, s) => [...Array(M)].map((_, j) => {
    let c = 0;
    for (let t = 0; t < SL; t++) c += Math.abs(B[s * SL + t] - A[(j + t) % M]);
    return c;
  }));
  const F = C.map((r) => r.map((_, j) => Math.min(r[(j - 1 + M) % M], r[j], r[(j + 1) % M])));
  const T = [...Array(M)].map((_, j) => F.reduce((s, r, k) => s + r[(j + k * SL) % M], 0));
  // Candidates: centres of the lowest plateaus of the total cost.
  const minT = Math.min(...T);
  const cands = [];
  for (let j = 0; j < M; j++) {
    if (T[j] !== minT || T[(j - 1 + M) % M] === minT) continue;
    let e = j;
    while (T[(e + 1) % M] === minT) e++;
    cands.push(Math.round((j + e) / 2) % M);
  }

  // 2D Kabsch / SVD alignment of LP onto model points starting at index j.
  const align = (j) => {
    const dst = LP.map((_, t) => P[(j + t) % M]);
    const ca = [0, 0], cb = [0, 0];
    LP.forEach((p, t) => { ca[0] += p[0] / N; ca[1] += p[1] / N; cb[0] += dst[t][0] / N; cb[1] += dst[t][1] / N; });
    let sxx = 0, sxy = 0;
    LP.forEach((p, t) => {
      const ax = p[0] - ca[0], ay = p[1] - ca[1], bx = dst[t][0] - cb[0], by = dst[t][1] - cb[1];
      sxx += ax * bx + ay * by;
      sxy += ax * by - ay * bx;
    });
    const th = Math.atan2(sxy, sxx);
    const map = (p) => {
      const x = p[0] - ca[0], y = p[1] - ca[1];
      return [cb[0] + x * Math.cos(th) - y * Math.sin(th), cb[1] + x * Math.sin(th) + y * Math.cos(th)];
    };
    const err = LP.reduce((s, p, t) => { const q = map(p); return s + Math.hypot(q[0] - dst[t][0], q[1] - dst[t][1]); }, 0) / N;
    return { th, ca, cb, err, dst };
  };
  const fits = cands.map((j) => ({ j, ...align(j) })).sort((a, b) => b.err - a.err); // worst first

  // Dense "run-length" contour for step 1: pixel-staircase points with jitter.
  const rnd = kit.rng(15);
  const RAW = [...Array(Math.round(PER / 0.22))].map((_, k) => {
    const p = at(k * 0.22);
    return [Math.round(p[0] * 5) / 5 + (rnd() - 0.5) * 0.22, Math.round(p[1] * 5) / 5 + (rnd() - 0.5) * 0.22];
  });

  const { text, line, arrow } = kit.pen({ textSize: 16, stroke: accent, width: 1.6 });
  const dot = (g, q, r, fill, o = {}) => kit.svg("circle", { cx: q[0], cy: q[1], r, fill, ...o }, g);
  const place = (ox, oy, s) => (p) => [ox + p[0] * s, oy - p[1] * s];
  const outline = (g, f, o = {}) => kit.svg("polygon", {
    points: POLY.map((p) => f(p).join(",")).join(" "), fill: "none", stroke: rule, "stroke-width": 1.2, ...o,
  }, g);

  // Code-box row helper (box width 20).
  const BW = 20, X0 = 120;
  const box = (g, x, y, v, o = {}) => {
    kit.svg("rect", {
      x, y: y - 15, width: BW - 2, height: 22, rx: 3,
      fill: o.fill ?? "none", "fill-opacity": o.fillOpacity ?? 1,
      stroke: o.stroke ?? rule, "stroke-width": o.sw ?? 1, opacity: o.opacity ?? 1,
    }, g);
    if (v !== null) text(g, x + (BW - 2) / 2, y + 1, String(v), { size: 15, fill: o.textFill ?? ink, opacity: o.opacity ?? 1, halo: false });
  };
  const label = (g, y, s, o = {}) => text(g, X0 - 10, y + 1, s, { anchor: "end", size: 16, fill: body, ...o });

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        const fl = place(55, 270, 22), fr = place(370, 270, 22);
        text(g, 165, 60, L.raw, { weight: 600 });
        text(g, 480, 60, L.smooth, { weight: 600 });
        for (const p of RAW) dot(g, fl(p), 1.6, mute);
        arrow(g, [292, 193], [348, 193], { w: 2 });
        outline(g, fr, { opacity: 0.6 * e, "stroke-dasharray": "4 4" });
        const shown = Math.round(e * M);
        P.slice(0, shown).forEach((p) => dot(g, fr(p), 4.2, accent));
        if (shown > 1) arrow(g, fr(P[0]), fr(P[1]), { w: 1.6, head: 8 });
      }

      if (i === 1) {
        const f = place(40, 250, 20);
        outline(g, f, { opacity: 0.6 });
        P.forEach((p) => dot(g, f(p), 3.6, mute));
        const cur = Math.min(M - 1, Math.floor(e * M));
        const p0 = f(P[(cur - 1 + M) % M]), p1 = f(P[cur]), p2 = f(P[(cur + 1) % M]);
        arrow(g, p0, p1, { w: 2.2, head: 8 });
        arrow(g, p1, p2, { w: 2.2, head: 8 });
        dot(g, p1, 5.5, accent, { stroke: ink, "stroke-width": 1.5 });
        // dial: sectors of 45° centred on 0°, codes symmetric for ± turns (Fig. 3b of the paper)
        const cx = 480, cy = 140, R = 78;
        kit.svg("circle", { cx, cy, r: R, fill: "none", stroke: rule, "stroke-width": 1.2 }, g);
        for (let k = 0; k < 8; k++) {
          const a = ((22.5 + 45 * k) * Math.PI) / 180;
          line(g, [cx, cy], [cx + R * Math.cos(a), cy - R * Math.sin(a)], { stroke: rule, w: 1 });
        }
        for (let k = 0; k < 8; k++) {
          const a = (45 * k * Math.PI) / 180;
          const c = k <= 4 ? k : 8 - k;
          text(g, cx + 0.78 * R * Math.cos(a), cy - 0.78 * R * Math.sin(a) + 6, String(c), { size: 17, fill: body, halo: false });
        }
        const deg = turn(P[(cur - 1 + M) % M], P[cur], P[(cur + 1) % M]);
        const ra = (-deg * Math.PI) / 180; // screen y is flipped
        arrow(g, [cx, cy], [cx + 0.52 * R * Math.cos(-ra), cy + 0.52 * R * Math.sin(ra)], { stroke: ink, w: 2.4 });
        text(g, cx, cy + R + 28, `θ = ${Math.round(deg)}° → ${A[cur]}`, { size: 17, weight: 600 });
        label(g, 320, "A");
        A.forEach((v, k) => box(g, X0 + k * BW, 320, k <= cur ? v : null, {
          stroke: k === cur ? accent : rule, sw: k === cur ? 2 : 1,
        }));
      }

      if (i === 2) {
        const last = M - SL;
        const pos = Math.min(last, Math.floor(e * (last + 1)));
        const shown = t >= 1 ? M - 1 : pos;
        label(g, 52, L.local);
        B.forEach((v, k) => box(g, X0 + k * BW, 52, v, { fill: SEG[Math.floor(k / SL)], fillOpacity: 0.18, stroke: SEG[Math.floor(k / SL)] }));
        const nx = X0 + NOISE * BW + (BW - 2) / 2;
        arrow(g, [nx, 90], [nx, 68], { stroke: body, w: 1.4, head: 7 });
        text(g, nx + 8, 92, L.noise, { anchor: "start", size: 14, fill: body });
        label(g, 120, L.model);
        A.forEach((v, k) => box(g, X0 + k * BW, 120, v));
        // segment 1 sliding under the model code
        kit.svg("rect", { x: X0 + pos * BW - 2, y: 102, width: SL * BW + 2, height: 26, rx: 4, fill: "none", stroke: SEG[0], "stroke-width": 2 }, g);
        for (let t2 = 0; t2 < SL; t2++) {
          const k = pos + t2;
          box(g, X0 + k * BW, 152, B[t2], { fill: SEG[0], fillOpacity: 0.18, stroke: SEG[0] });
        }
        C.forEach((r, k) => {
          const y = 200 + k * 34;
          label(g, y, `C${k + 1}`, { fill: SEG[k], weight: 600 });
          r.forEach((v, j) => box(g, X0 + j * BW, y, j <= shown ? v : null, { stroke: j === pos ? SEG[k] : rule }));
        });
        text(g, 360, 330, L.cost, { size: 16, fill: body });
      }

      if (i === 3) {
        text(g, 360, 30, L.filt, { size: 16, fill: body });
        F.forEach((r, k) => {
          const y = 62 + k * 30;
          label(g, y, `C${k + 1}`, { fill: SEG[k], weight: 600 });
          for (let j = 0; j < M; j++) {
            const v = r[(j + k * SL) % M];
            box(g, X0 + j * BW, y, v, { stroke: SEG[k], opacity: 0.35 + 0.65 * e });
          }
        });
        const base = 300, hS = 12;
        line(g, [X0 - 4, base], [X0 + M * BW, base], { stroke: rule, w: 1.2 });
        label(g, 230, L.total);
        T.forEach((v, j) => {
          const h = v * hS * e;
          const isC = cands.includes(j);
          kit.svg("rect", { x: X0 + j * BW + 2, y: base - h, width: BW - 6, height: h, fill: isC ? accent : mute, opacity: isC ? 0.95 : 0.55 }, g);
          if (t > 0.5) text(g, X0 + j * BW + (BW - 2) / 2, base - h - 6, String(v), { size: 14, fill: isC ? ink : body, opacity: Math.min(1, (t - 0.5) * 2) });
        });
        cands.forEach((j) => {
          const x = X0 + j * BW + (BW - 2) / 2;
          kit.svg("polygon", { points: `${x},${base + 6} ${x - 6},${base + 16} ${x + 6},${base + 16}`, fill: accent, opacity: e }, g);
        });
        const cx = cands.length ? cands.reduce((a, j) => a + X0 + j * BW, 0) / cands.length + BW / 2 : 360;
        text(g, cx, base + 38, L.cand, { size: 16, fill: accent, weight: 600, opacity: e });
        cands.forEach((j) => line(g, [cx, base + 22], [X0 + j * BW + BW / 2, base + 18], { stroke: accent, w: 1.2, opacity: e }));
      }

      if (i === 4) {
        text(g, 320, 34, L.svd, { weight: 600, size: 17 });
        fits.forEach((fit, k) => {
          const ox = k === 0 ? 50 : 370, f = place(ox, 230, 22);
          outline(g, f, { opacity: 0.8 });
          fit.dst.forEach((q) => dot(g, f(q), 3, mute));
          const ok = k === fits.length - 1;
          const col = ok ? accent : BAD;
          // start pose: local points rotated, offset; end pose: SVD alignment
          const th0 = fit.th + 0.9, off = [1.6, -2.2];
          const thE = th0 + (fit.th - th0) * e;
          const mp = (p) => {
            const x = p[0] - fit.ca[0], y = p[1] - fit.ca[1];
            return [fit.cb[0] + off[0] * (1 - e) + x * Math.cos(thE) - y * Math.sin(thE),
              fit.cb[1] + off[1] * (1 - e) + x * Math.sin(thE) + y * Math.cos(thE)];
          };
          const pts = LP.map((p) => f(mp(p)));
          if (e > 0.6) pts.forEach((q, n) => line(g, q, f(fit.dst[n]), { stroke: col, w: 1, opacity: (e - 0.6) * 2 }));
          kit.svg("polyline", { points: pts.map((q) => q.join(",")).join(" "), fill: "none", stroke: col, "stroke-width": 1.4, opacity: 0.7 }, g);
          pts.forEach((q) => dot(g, q, 3.8, col));
          text(g, ox + 110, 290, `${L.start} ${fit.j}`, { size: 16, fill: body });
          text(g, ox + 110, 316, ok ? L.good : L.bad, { size: 16, weight: 600, fill: col, opacity: e });
        });
        text(g, 320, 348, L.icp, { size: 15, fill: body, opacity: e });
      }
    },
  });
}
