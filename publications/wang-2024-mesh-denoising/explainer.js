// Segmentation-driven mesh denoising schematic, on a noisy triangulated "roof" with one sharp ridge:
// normal filters still let faces across the ridge contribute (with small weights) ->
// edge test: normal cosine against Nthr plus the area-based edge operator D(e) against Dthr ->
// region growing from seeds S1, S2, ... stops at feature edges; noise leaves a small cluster ->
// refinement merges the small cluster into the neighbouring label with the largest summed normal cosine ->
// each region is denoised using only its own faces, so the ridge stays sharp.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A noisy triangle mesh with one sharp edge. Many normal-based filters give faces across the edge small weights, but those faces still take part and still affect the result near the edge.",
        "Every edge shared by two faces is tested. The region stops growing across it only if the cosine between the two face normals is at most the global threshold Nthr and the area-based edge operator ‖D(e)‖₂, computed from the four surrounding vertices, is at least Dthr. Noise can also make some edges look like features.",
        "Region growing: a seed face S1 passes its label to edge-connected faces through edges that pass the test, until no more faces qualify; then a new seed S2 starts from the unclustered faces, and so on until every face has a label.",
        "Noise can leave small leftover clusters (S3 here). Clusters below 50 faces are dissolved: each of their faces takes the neighbouring label with the largest sum of normal cosines over its 2-ring neighbourhood.",
        "Each region is then denoised by an existing filter (BNF, UNF, GNF or L1) that uses only faces of the same region, so faces across the sharp edge no longer interfere.",
      ],
      noisy: "noisy mesh", sharp: "sharp edge", face: "face f",
      same: "same side", other: "other side:", small: "small weight,", still: "still counts",
      stops: "growth stops if", and: "and", noiseEdge: "false edges from noise",
      flat: "flat edge: ‖D(e)‖", flatTail: " = 0",
      grow: ["seed grows across", "edges that pass", "the test"],
      next: "then a new seed",
      smallC: "small cluster",
      merge: ["clusters < 50 faces:", "each face joins the", "label with max Σ cos"],
      merged: "merged",
      filter: ["filter each region", "with its own faces"],
      methods: "BNF · UNF · GNF · L1",
      kept: "edge stays sharp",
    },
    zh: {
      steps: [
        "一个带有一条尖锐棱边的含噪三角网格。许多基于法向的滤波方法会给棱边另一侧的面片较小的权重，但这些面片仍参与计算，依然会影响棱边附近的结果。",
        "对两个面片共享的每条边进行检验：只有当两面片法向夹角的余弦不大于全局阈值 Nthr，且由周围四个顶点计算的面积型边算子 ‖D(e)‖₂ 不小于 Dthr 时，区域才不跨过这条边生长。噪声也可能使个别边被误判为特征边。",
        "区域生长：种子面片 S1 通过检验合格的边，把自身标签传给相邻面片，直到再无符合条件的面片；随后从未聚类的面片中选取新种子 S2，如此重复，直到所有面片都被标记。",
        "噪声可能留下零散的小簇（图中的 S3）。面片数少于 50 的小簇会被拆散：其中每个面片在二环邻域内按标签累加法向余弦，改归余弦和最大的相邻标签。",
        "随后用现有的去噪方法（BNF、UNF、GNF 或 L1）逐区域去噪，每个面片只使用同一区域内的面片，棱边另一侧的面片不再产生干扰。",
      ],
      noisy: "含噪网格", sharp: "尖锐棱边", face: "面片 f",
      same: "同侧", other: "棱边另一侧：", small: "权重虽小，", still: "仍参与计算",
      stops: "停止生长的条件", and: "且", noiseEdge: "噪声造成的伪特征边",
      flat: "平坦边：‖D(e)‖", flatTail: " = 0",
      grow: ["种子跨过检验", "合格的边", "向外生长"],
      next: "随后选取新种子",
      smallC: "小簇",
      merge: ["面片数 < 50 的小簇：", "每个面片改归", "Σ cos 最大的标签"],
      merged: "已合并",
      filter: ["逐区域滤波，", "只用本区域的面片"],
      methods: "BNF · UNF · GNF · L1",
      kept: "棱边保持尖锐",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal semantic colours: three region labels and the detected feature edges.
  const REG = ["#b0457a", "#d9a400", "#2a9d8f"]; // S1, S2, S3 (small cluster)
  const FEAT = "#d62828";

  const { line, arrow } = kit.pen({ textSize: 17, stroke: accent, width: 1.4 });
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const seg01 = (t, a, b) => clamp01((t - a) / (b - a));

  // Text from parts: plain strings, or { sub: "…" } for a real subscript (≥ 14 viewBox units).
  const label = (parent, x, y, parts, o = {}) => {
    const size = o.size ?? 17;
    const n = kit.text(parent, x, y, "", {
      size, fill: o.fill ?? ink, anchor: o.anchor ?? "middle", weight: o.weight, opacity: o.opacity, halo: true,
    });
    for (const p of Array.isArray(parts) ? parts : [parts]) {
      if (typeof p === "string") {
        kit.svg("tspan", {}, n).textContent = p;
      } else {
        const s = kit.svg("tspan", { "baseline-shift": "sub", "font-size": Math.max(14, Math.round(size * 0.8)) }, n);
        s.textContent = p.sub;
      }
    }
    return n;
  };

  // --- Deterministic mesh: grid (i = 0..NX across, j = 0..NY in depth), ridge at i = RIDGE -------------
  const NX = 8, NY = 4, RIDGE = 4, SLOPE = 0.75, H = 3;
  const rnd = kit.rng(7);
  const verts = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const z = H - Math.abs(i - RIDGE) * SLOPE;
      verts.push({ i, j, z, nz: (rnd() - 0.5) * 0.5, nx: (rnd() - 0.5) * 0.18, ny: (rnd() - 0.5) * 0.18 });
    }
  }
  const vid = (i, j) => j * (NX + 1) + i;
  const faces = [];
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const a = vid(i, j), b = vid(i + 1, j), c = vid(i + 1, j + 1), d = vid(i, j + 1);
      faces.push({ v: [a, b, c], qi: i, qj: j, k: 0 });
      faces.push({ v: [a, c, d], qi: i, qj: j, k: 1 });
    }
  }
  faces.forEach((f, n) => { f.id = n; f.side = f.qi < RIDGE ? 0 : 1; });

  // Edge -> adjacent faces.
  const edges = new Map();
  const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const f of faces) {
    for (let m = 0; m < 3; m++) {
      const a = f.v[m], b = f.v[(m + 1) % 3], key = ekey(a, b);
      if (!edges.has(key)) edges.set(key, { a, b, f: [] });
      edges.get(key).f.push(f.id);
    }
  }
  // Small cluster: both triangles of quad (2, 1). Noise makes its outer edges look like features.
  const isSmall = (f) => f.qi === 2 && f.qj === 1;
  for (const e of edges.values()) {
    e.ridge = verts[e.a].i === RIDGE && verts[e.b].i === RIDGE && e.f.length === 2;
    e.falseFeat = e.f.length === 2 && isSmall(faces[e.f[0]]) !== isSmall(faces[e.f[1]]);
  }

  // Region growing (BFS) with seeds S1 (left slope), S2 (right slope), S3 (left-over cluster).
  const label0 = new Array(faces.length).fill(-1);
  const order = [[], [], []];
  const seedOf = [faces.find((f) => f.qi === 0 && f.qj === 2 && f.k === 0), faces.find((f) => f.qi === 6 && f.qj === 2 && f.k === 0),
    faces.find((f) => isSmall(f) && f.k === 0)];
  seedOf.forEach((seed, r) => {
    const q = [seed.id];
    label0[seed.id] = r;
    while (q.length) {
      const fid = q.shift();
      order[r].push(fid);
      const f = faces[fid];
      for (let m = 0; m < 3; m++) {
        const e = edges.get(ekey(f.v[m], f.v[(m + 1) % 3]));
        if (e.f.length < 2 || e.ridge || e.falseFeat) continue;
        const o = e.f[0] === fid ? e.f[1] : e.f[0];
        if (label0[o] === -1) { label0[o] = r; q.push(o); }
      }
    }
  });
  const rank = new Array(faces.length);
  order.forEach((list) => list.forEach((fid, n) => { rank[fid] = n / list.length; }));

  // --- Projection and shading --------------------------------------------------------------------------
  const X0 = 34, SX = 46, DX = 6, Y0 = 318, SZ = 24, DY = 34;
  const pos = (v, noise) => {
    const x = v.i + v.nx * noise, y = v.j + v.ny * noise, z = v.z + v.nz * noise;
    return { x, y, z };
  };
  const proj = (p) => [X0 + p.x * SX + p.y * DX, Y0 - p.z * SZ - p.y * DY];
  const LIGHT = (() => { const l = [-0.55, -0.35, 1]; const n = Math.hypot(...l); return l.map((c) => c / n); })();
  const shadeOf = (P) => {
    const u = [P[1].x - P[0].x, P[1].y - P[0].y, P[1].z - P[0].z];
    const w = [P[2].x - P[0].x, P[2].y - P[0].y, P[2].z - P[0].z];
    let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const len = Math.hypot(...n) || 1;
    n = n.map((c) => c / len);
    if (n[2] < 0) n = n.map((c) => -c);
    return clamp01(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  };
  const drawOrder = [...faces].sort((a, b) => b.qj - a.qj || a.qi - b.qi);
  const centroid = (f, noise) => {
    const p = f.v.map((v) => proj(pos(verts[v], noise)));
    return [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3];
  };

  // colourOf(f) -> { c, a } or null (grey). edgeMode: which detected edges to draw in FEAT.
  const drawMesh = (g, { noise = 1, colourOf = () => null, ridgeA = 0, falseA = 0 }) => {
    for (const f of drawOrder) {
      const P = f.v.map((v) => pos(verts[v], noise));
      const pts = P.map((p) => proj(p).join(",")).join(" ");
      const s = shadeOf(P);
      kit.svg("polygon", { points: pts, fill: bg, stroke: "none" }, g);
      kit.svg("polygon", { points: pts, fill: mute, opacity: 0.2 + 0.55 * (1 - s), stroke: "none" }, g);
      const col = colourOf(f);
      if (col && col.a > 0) kit.svg("polygon", { points: pts, fill: col.c, opacity: col.a * (0.55 + 0.4 * s), stroke: "none" }, g);
      kit.svg("polygon", { points: pts, fill: "none", stroke: body, "stroke-width": 0.8, "stroke-opacity": 0.55, "stroke-linejoin": "round" }, g);
    }
    for (const e of edges.values()) {
      const a = (e.ridge ? ridgeA : 0) || (e.falseFeat ? falseA : 0);
      if (a <= 0) continue;
      const A = proj(pos(verts[e.a], noise)), B = proj(pos(verts[e.b], noise));
      line(g, A, B, { stroke: FEAT, w: 3, opacity: a });
    }
  };

  // Probe face: left-slope face touching the ridge, mid-depth.
  const F = faces.find((f) => f.qi === RIDGE - 1 && f.qj === 2 && f.k === 0);
  const ring = faces.filter((f) => f.id !== F.id && f.v.some((v) => F.v.includes(v)));
  const drawProbe = (g, noise, { across = true, a = 1 }) => {
    const c = centroid(F, noise);
    for (const f of ring) {
      if (f.side !== F.side && !across) continue;
      const d = centroid(f, noise);
      const end = [c[0] + (d[0] - c[0]) * a, c[1] + (d[1] - c[1]) * a];
      if (f.side === F.side) line(g, c, end, { stroke: accent, w: 2.2 });
      else line(g, c, end, { stroke: accent, w: 1.3, dash: "3 3" });
    }
    kit.svg("circle", { cx: c[0], cy: c[1], r: 4.5, fill: accent, stroke: bg, "stroke-width": 1.5 }, g);
    return c;
  };

  const ridgeTop = proj({ x: RIDGE, y: NY, z: H });
  const PX = 536; // centre of the right-hand annotation panel

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        drawMesh(g, {});
        const c = drawProbe(g, 1, { a: e });
        line(g, [c[0] + 30, c[1] + 70], [c[0] + 4, c[1] + 6], { stroke: accent, w: 1.2, opacity: e });
        label(g, c[0] + 34, c[1] + 90, L.face, { fill: accent, weight: 600, opacity: e });
        label(g, 120, 62, L.noisy, { weight: 600 });
        label(g, ridgeTop[0], ridgeTop[1] - 22, L.sharp, { fill: body });
        // legend
        line(g, [PX - 70, 150], [PX - 30, 150], { stroke: accent, w: 2.2, opacity: e });
        label(g, PX - 20, 156, L.same, { anchor: "start", opacity: e });
        line(g, [PX - 70, 196], [PX - 30, 196], { stroke: accent, w: 1.3, dash: "3 3", opacity: e });
        label(g, PX - 20, 202, L.other, { anchor: "start", opacity: e });
        label(g, PX - 20, 226, L.small, { anchor: "start", opacity: e, fill: body });
        label(g, PX - 20, 250, L.still, { anchor: "start", opacity: e, fill: body });
      }

      if (i === 1) {
        drawMesh(g, { ridgeA: e, falseA: e });
        label(g, ridgeTop[0], ridgeTop[1] - 22, L.sharp, { fill: FEAT, weight: 600 });
        // Four-vertex stencil of D(e): two triangles sharing edge e = p1p3.
        const p1 = [PX, 44], p2 = [PX - 62, 86], p3 = [PX, 128], p4 = [PX + 62, 86];
        kit.svg("polygon", { points: [p1, p2, p3, p4].map((q) => q.join(",")).join(" "), fill: "none", stroke: body, "stroke-width": 1.4 }, g);
        line(g, p1, p3, { stroke: FEAT, w: 2.6 });
        label(g, PX + 12, 92, "e", { anchor: "start", fill: FEAT, weight: 600 });
        label(g, p1[0], p1[1] - 8, ["p", { sub: "1" }], { size: 16 });
        label(g, p2[0] - 8, p2[1] + 6, ["p", { sub: "2" }], { size: 16, anchor: "end" });
        label(g, p3[0], p3[1] + 22, ["p", { sub: "3" }], { size: 16 });
        label(g, p4[0] + 8, p4[1] + 6, ["p", { sub: "4" }], { size: 16, anchor: "start" });
        const o = seg01(t, 0.2, 1);
        label(g, PX, 186, L.stops, { weight: 600, opacity: o });
        label(g, PX, 214, ["cos(n", { sub: "i" }, ", n", { sub: "j" }, ") ≤ N", { sub: "thr" }], { opacity: o });
        label(g, PX, 250, L.and, { fill: body, opacity: o, size: 15 });
        label(g, PX, 280, ["‖D(e)‖", { sub: "2" }, " ≥ D", { sub: "thr" }], { opacity: o, fill: FEAT });
        label(g, PX, 322, [L.flat, { sub: "2" }, L.flatTail], { opacity: o, fill: body, size: 15 });
        // The small cluster's outline: edges that noise makes look like features.
        const sc = centroid(faces.find((f) => isSmall(f) && f.k === 0), 1);
        arrow(g, [104, 134], [sc[0] - 8, sc[1] - 22], { stroke: body, w: 1.3, opacity: o });
        label(g, 100, 122, L.noiseEdge, { fill: FEAT, opacity: o });
      }

      if (i === 2) {
        const r0 = seg01(t, 0, 0.45), r1 = seg01(t, 0.4, 0.85), r2 = seg01(t, 0.8, 1);
        const prog = [r0, r1, r2];
        drawMesh(g, {
          ridgeA: 1, falseA: 1,
          colourOf: (f) => {
            const r = label0[f.id];
            return rank[f.id] <= prog[r] * 1.0001 && prog[r] > 0 ? { c: REG[r], a: 1 } : null;
          },
        });
        seedOf.forEach((sd, r) => {
          if (prog[r] <= 0) return;
          const c = centroid(sd, 1);
          label(g, c[0], c[1] + 6, ["S", { sub: String(r + 1) }], { size: 16, weight: 700 });
        });
        L.grow.forEach((ln, k) => label(g, PX, 150 + k * 26, ln, { fill: body }));
        label(g, PX, 250, L.next, { fill: body, opacity: r1 });
      }

      if (i === 3) {
        const m = e;
        drawMesh(g, {
          ridgeA: 1, falseA: 1 - m,
          colourOf: (f) => ({ c: REG[label0[f.id] === 2 ? 0 : label0[f.id]], a: 1 }),
        });
        // Small cluster: overlay its own colour, fading out as it merges into S1.
        for (const f of faces.filter(isSmall)) {
          const pts = f.v.map((v) => proj(pos(verts[v], 1)).join(",")).join(" ");
          kit.svg("polygon", { points: pts, fill: REG[2], opacity: 0.9 * (1 - m), stroke: "none" }, g);
        }
        const sc = centroid(faces.find((f) => isSmall(f) && f.k === 0), 1);
        arrow(g, [sc[0] - 10, 74], [sc[0] - 2, sc[1] - 16], { stroke: body, w: 1.4 });
        label(g, sc[0] - 10, 62, m < 0.6 ? L.smallC : L.merged, { fill: m < 0.6 ? REG[2] : REG[0], weight: 600 });
        for (const sd of seedOf.slice(0, 2)) {
          const c = centroid(sd, 1);
          label(g, c[0], c[1] + 6, ["S", { sub: String(seedOf.indexOf(sd) + 1) }], { size: 16, weight: 700 });
        }
        L.merge.forEach((ln, k) => label(g, PX, 150 + k * 26, ln, { fill: body }));
      }

      if (i === 4) {
        const noise = 1 - e;
        drawMesh(g, {
          noise, ridgeA: 1 - e,
          colourOf: (f) => ({ c: REG[label0[f.id] === 2 ? 0 : label0[f.id]], a: 1 - 0.3 * e }),
        });
        drawProbe(g, noise, { across: false });
        label(g, ridgeTop[0], ridgeTop[1] - 22, L.kept, { fill: ink, weight: 600, opacity: e });
        L.filter.forEach((ln, k) => label(g, PX, 150 + k * 26, ln, { fill: body }));
        label(g, PX, 222, L.methods, { fill: accent, weight: 600 });
        line(g, [PX - 70, 262], [PX - 30, 262], { stroke: accent, w: 2.2 });
        label(g, PX - 20, 268, L.same, { anchor: "start" });
      }
    },
  });
}
