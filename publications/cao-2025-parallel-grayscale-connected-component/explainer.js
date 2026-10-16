// Parallel grayscale CCA on a toy 8 x 6 image (a dark U on a light background):
// causal neighbour labeling -> boundary pairs between preliminary regions ->
// region-ID mapping (larger ID -> smaller) -> relabel and count areas.
// Labels, edges and areas are computed from the toy image, not hard-coded.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Each pixel checks four neighbours already scanned (upper-left, up, upper-right, left) in that order and links to the first one whose intensity differs by at most τ. All pixels do this in parallel; path compression gives each pixel its root, so the image falls into preliminary regions. The U is split in two.",
        "Where two adjacent pixels have similar intensity but different labels, the two region IDs are recorded as an edge. The edges form a small region adjacency graph.",
        "Merging runs on region IDs, not pixels: for each edge, the larger ID is mapped to the smaller one. One pass over the image then replaces each label by its root.",
        "Region areas are counted per GPU block in shared memory and added to global memory once per block. The result: three grayscale components, found without binarizing the image.",
      ],
      img: "grayscale image", prelim: "preliminary regions", final: "final components",
      mask: "causal mask", cur: "p", tau: "|ΔI| ≤ τ", order: "priority 1 → 4",
      edges: "edge list", pair: "region pair",
      table: "mapping table M", id: "ID", root: "root",
      area: "area", px: "px", comp: "component", oneAdd: "one global add per block",
    },
    zh: {
      steps: [
        "每个像素按左上、上、右上、左的顺序检查四个已扫描的邻居，连接到第一个灰度差不超过 τ 的邻居。所有像素并行完成这一步；路径压缩为每个像素找到根，图像被分成若干初步区域。U 形被拆成了两部分。",
        "若两个相邻像素灰度相近但标签不同，就把这两个区域 ID 记为一条边。这些边构成一个很小的区域邻接图。",
        "合并在区域 ID 上进行，而不是在像素上：对每条边，把较大的 ID 映射到较小的 ID。再遍历一次图像，把每个标签替换为它的根。",
        "区域面积先在每个 GPU 线程块的共享内存中计数，再按块一次性累加到全局内存。结果是三个灰度连通域，全程无需二值化。",
      ],
      img: "灰度图像", prelim: "初步区域", final: "最终连通域",
      mask: "因果掩膜", cur: "p", tau: "|ΔI| ≤ τ", order: "优先级 1 → 4",
      edges: "边列表", pair: "区域对",
      table: "映射表 M", id: "ID", root: "根",
      area: "面积", px: "像素", comp: "连通域", oneAdd: "每块一次全局累加",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  const { text, line, arrow } = kit.pen({ textSize: 16, stroke: body, width: 1.6, head: 9 });
  const HUES = ["#e0a458", "#4f86c6", "#7bbf8a", "#c46aa8", "#d4c04a", "#8a7fd0"];

  // Toy image: a dark U (value ~60) on a light background (~200); tau = 5.
  const NC = 8, NR = 6, TAU = 5;
  const rnd = kit.rng(7);
  const isObj = (r, c) => (r <= 4 && (c === 1 || c === 2 || c === 5 || c === 6)) || (r === 4 && c >= 1 && c <= 6);
  const I = [];
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    I.push((isObj(r, c) ? 60 : 200) + Math.round((rnd() - 0.5) * 4));
  }
  const idx = (r, c) => r * NC + c;
  const near = (a, b) => Math.abs(I[a] - I[b]) <= TAU;

  // Stage 1: parent = first similar neighbour among NW, N, NE, W; then path compression.
  const P = I.map((_, k) => k);
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    const k = idx(r, c);
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || cc >= NC) continue;
      if (near(k, idx(rr, cc))) { P[k] = idx(rr, cc); break; }
    }
  }
  const findRoot = (k) => { while (P[k] !== k) k = P[k]; return k; };
  const roots = [...new Set(I.map((_, k) => findRoot(k)))].sort((a, b) => a - b);
  const pre = I.map((_, k) => roots.indexOf(findRoot(k)) + 1); // preliminary IDs 1..K
  const K = roots.length;

  // Stage 2: region pairs of adjacent similar pixels with different labels.
  const pairs = [];
  const seen = new Set();
  const links = [];
  for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
    for (const [dr, dc] of [[0, 1], [1, -1], [1, 0], [1, 1]]) {
      const rr = r + dr, cc = c + dc;
      if (rr >= NR || cc < 0 || cc >= NC) continue;
      const a = idx(r, c), b = idx(rr, cc);
      if (pre[a] === pre[b] || !near(a, b)) continue;
      links.push([r, c, rr, cc]);
      const u = Math.min(pre[a], pre[b]), v = Math.max(pre[a], pre[b]);
      if (!seen.has(`${u},${v}`)) { seen.add(`${u},${v}`); pairs.push([u, v]); }
    }
  }

  // Stage 3: M[max] <- min with root following, then flatten.
  const M = Array.from({ length: K + 1 }, (_, i) => i);
  const rootOf = (x) => { while (M[x] !== x) x = M[x]; return x; };
  for (const [u, v] of pairs) {
    const a = rootOf(u), b = rootOf(v);
    if (a !== b) M[Math.max(a, b)] = Math.min(a, b);
  }
  for (let i = 1; i <= K; i++) M[i] = rootOf(i);
  const fin = pre.map((p) => M[p]);
  const compIds = [...new Set(fin)].sort((a, b) => a - b);
  const areas = compIds.map((id) => fin.filter((x) => x === id).length);

  // Drawing helpers.
  const GX = 40, GY = 96, CS = 32;
  const grey = (v) => { const t = Math.round(40 + (v / 255) * 200); return `rgb(${t},${t},${t})`; };
  const cellXY = (r, c) => [GX + c * CS, GY + r * CS];
  const drawGrid = (g, colourOf, tint) => {
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      const [x, y] = cellXY(r, c);
      const k = idx(r, c);
      kit.svg("rect", { x: x + 1, y: y + 1, width: CS - 2, height: CS - 2, rx: 3, fill: grey(I[k]) }, g);
      if (tint > 0) {
        kit.svg("rect", { x: x + 1, y: y + 1, width: CS - 2, height: CS - 2, rx: 3, fill: colourOf(k), opacity: 0.85 * tint }, g);
      }
    }
    kit.svg("rect", { x: GX, y: GY, width: NC * CS, height: NR * CS, fill: "none", stroke: rule, "stroke-width": 1.2 }, g);
  };
  const idLabels = (g, ids, opacity) => {
    // write each region's ID once, on its first pixel in raster order
    const done = new Set();
    for (let k = 0; k < ids.length; k++) {
      if (done.has(ids[k])) continue;
      done.add(ids[k]);
      const r = Math.floor(k / NC), c = k % NC;
      const [x, y] = cellXY(r, c);
      text(g, x + CS / 2, y + CS / 2 + 6, String(ids[k]), { size: 16, weight: 700, fill: ink, opacity });
    }
  };
  const hue = (id) => HUES[(id - 1) % HUES.length];
  const RX = 350;

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);
      const gridTitle = (str, o = 1) => text(g, GX + (NC * CS) / 2, 76, str, { size: 18, weight: 600, opacity: o });

      if (i === 0) {
        gridTitle(e < 0.5 ? L.img : L.prelim);
        drawGrid(g, (k) => hue(pre[k]), e);
        idLabels(g, pre, e);
        // causal mask diagram
        const mx = RX + 70, my = 120, ms = 40;
        text(g, mx + 1.5 * ms, 100, L.mask, { size: 18, weight: 600 });
        const cells = [[0, 0, "1"], [0, 1, "2"], [0, 2, "3"], [1, 0, "4"]];
        for (const [r, c, n] of cells) {
          kit.svg("rect", { x: mx + c * ms, y: my + r * ms, width: ms - 3, height: ms - 3, rx: 4, fill: accent, opacity: 0.18, stroke: accent, "stroke-width": 1.4 }, g);
          text(g, mx + c * ms + ms / 2 - 1.5, my + r * ms + ms / 2 + 5, n, { size: 16, weight: 700, fill: accent });
        }
        kit.svg("rect", { x: mx + ms, y: my + ms, width: ms - 3, height: ms - 3, rx: 4, fill: ink, opacity: 0.85 }, g);
        text(g, mx + 1.5 * ms - 1.5, my + 1.5 * ms + 5, L.cur, { size: 16, weight: 700, fill: bg, halo: false });
        for (const [r, c] of [[0, 0], [0, 1], [0, 2], [1, 0]]) {
          arrow(g, [mx + 1.5 * ms - 1.5, my + 1.5 * ms - 1.5], [mx + c * ms + ms / 2 + (c - 1) * -6, my + r * ms + ms / 2 + (r - 1) * -6], { stroke: body, w: 1.3, head: 7, opacity: 0.6 });
        }
        text(g, mx + 1.5 * ms, my + 2 * ms + 30, L.tau, { size: 17, fill: ink });
        text(g, mx + 1.5 * ms, my + 2 * ms + 56, L.order, { size: 15, fill: body });
      }

      if (i === 1) {
        gridTitle(L.prelim);
        drawGrid(g, (k) => hue(pre[k]), 1);
        idLabels(g, pre, 1);
        const n = Math.ceil(links.length * Math.min(1, e * 1.2));
        for (const [r, c, rr, cc] of links.slice(0, n)) {
          const [x1, y1] = cellXY(r, c), [x2, y2] = cellXY(rr, cc);
          line(g, [x1 + CS / 2, y1 + CS / 2], [x2 + CS / 2, y2 + CS / 2], { stroke: ink, w: 3 });
          kit.svg("circle", { cx: x1 + CS / 2, cy: y1 + CS / 2, r: 3.5, fill: ink }, g);
          kit.svg("circle", { cx: x2 + CS / 2, cy: y2 + CS / 2, r: 3.5, fill: ink }, g);
        }
        text(g, RX + 130, 100, L.edges, { size: 18, weight: 600 });
        pairs.forEach(([u, v], k) => {
          const y = 140 + k * 46, o = Math.min(1, Math.max(0, e * 2 - k * 0.4));
          kit.svg("rect", { x: RX + 50, y: y - 22, width: 160, height: 34, rx: 6, fill: bg, stroke: rule, "stroke-width": 1.2, opacity: o }, g);
          kit.svg("circle", { cx: RX + 80, cy: y - 5, r: 11, fill: hue(u), opacity: o }, g);
          text(g, RX + 80, y + 1, String(u), { size: 15, weight: 700, opacity: o });
          line(g, [RX + 92, y - 5], [RX + 118, y - 5], { stroke: body, w: 2, opacity: o });
          kit.svg("circle", { cx: RX + 130, cy: y - 5, r: 11, fill: hue(v), opacity: o }, g);
          text(g, RX + 130, y + 1, String(v), { size: 15, weight: 700, opacity: o });
          text(g, RX + 150, y + 1, L.pair, { size: 14, anchor: "start", fill: body, opacity: o });
        });
      }

      if (i === 2) {
        gridTitle(e < 0.6 ? L.prelim : L.final);
        const mix = Math.max(0, (e - 0.35) / 0.65);
        drawGrid(g, (k) => hue(mix > 0.5 ? fin[k] : pre[k]), 1);
        idLabels(g, mix > 0.5 ? fin : pre, 1);
        text(g, RX + 130, 100, L.table, { size: 18, weight: 600 });
        text(g, RX + 60, 134, L.id, { size: 15, fill: body });
        text(g, RX + 200, 134, L.root, { size: 15, fill: body });
        for (let id = 1; id <= K; id++) {
          const y = 150 + (id - 1) * 36;
          const changed = M[id] !== id;
          kit.svg("circle", { cx: RX + 60, cy: y + 6, r: 13, fill: hue(id) }, g);
          text(g, RX + 60, y + 12, String(id), { size: 15, weight: 700 });
          arrow(g, [RX + 80, y + 6], [RX + 178, y + 6], { stroke: changed ? accent : rule, w: changed ? 2.2 : 1.4, opacity: changed ? Math.max(0.25, e) : 1 });
          const shown = changed && e > 0.3 ? M[id] : id;
          kit.svg("circle", { cx: RX + 200, cy: y + 6, r: 13, fill: hue(shown) }, g);
          text(g, RX + 200, y + 12, String(shown), { size: 15, weight: 700 });
        }
      }

      if (i === 3) {
        gridTitle(L.final);
        drawGrid(g, (k) => hue(fin[k]), 1);
        idLabels(g, fin, 1);
        text(g, RX + 130, 100, `${L.comp} · ${L.area}`, { size: 18, weight: 600 });
        compIds.forEach((id, k) => {
          const y = 140 + k * 44, w = areas[k] * 5 * e;
          kit.svg("circle", { cx: RX + 30, cy: y, r: 13, fill: hue(id) }, g);
          text(g, RX + 30, y + 6, String(id), { size: 15, weight: 700 });
          kit.svg("rect", { x: RX + 54, y: y - 10, width: w, height: 20, rx: 3, fill: hue(id), opacity: 0.85 }, g);
          text(g, RX + 62 + w, y + 6, `${areas[k]} ${L.px}`, { size: 15, anchor: "start", fill: ink, opacity: e });
        });
        text(g, RX + 130, 140 + compIds.length * 44 + 20, L.oneAdd, { size: 15, fill: body, opacity: e });
      }
    },
  });
}
