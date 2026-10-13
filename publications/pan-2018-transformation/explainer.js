// LEGO transformation schematic (side view): pick-and-place constraints -> RT vs FT target
// generation -> Strategies 1, 2, 3 (source, buffer, stock -> target), with each PnP ticked off.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Every brick move is one pick-and-place (PnP). Only bricks with nothing on top can be picked. The source is taken apart from the top down, and the target is built from the bottom up.",
        "RT fixes the target's bricks before the transformation, with large bricks first. FT tiles the target's voxels on the fly, favouring brick types that are movable on the source.",
        "Strategy 1: disassemble the whole source into a buffer, then build the target layer by layer from the buffer, taking a brick from the stock only when the buffer has no match.",
        "Strategy 2: move bricks straight from source to target. If none fits, use the buffer, or disassemble one more source layer into it; the stock is the last resort.",
        "Strategy 3: no buffer. A movable source brick goes straight to the target when it fits; otherwise the stock supplies one. Shown here with an RT target.",
      ],
      source: "Source", target: "Target", buffer: "Buffer", stock: "Stock",
      movable: "movable", covered: "covered: not movable", pnp: "1 move = 1 PnP",
      down: "top → bottom", up: "bottom → top",
      voxels: "Target voxels", rt: "RT · large bricks first", ft: "FT · source types first",
      s: ["Strategy 1", "Strategy 2", "Strategy 3"], cost: "PnP", reused: "from source", fromStock: "from stock", toBuffer: "into buffer",
    },
    zh: {
      steps: [
        "每移动一块积木记为一次拾放（PnP）。只有上方没有其他积木的积木才能被拾取；源模型自上而下拆解，目标模型自下而上搭建。",
        "RT 在变换开始前就确定目标模型的积木，并优先使用大积木；FT 在变换过程中对目标体素即时拼砖，优先选用源模型上可移动的积木类型。",
        "策略 1：先把源模型全部拆到缓冲区，再从缓冲区逐层搭建目标；只有缓冲区里找不到匹配积木时才从库存中取。",
        "策略 2：积木直接从源模型移到目标模型；若没有合适的，就从缓冲区取，或再拆一层源模型放入缓冲区；库存是最后的选择。",
        "策略 3：不使用缓冲区。源模型上可移动的积木若合适就直接移到目标，否则由库存提供。图中以 RT 目标为例。",
      ],
      source: "源模型", target: "目标模型", buffer: "缓冲区", stock: "库存",
      movable: "可移动", covered: "被压住：不可移动", pnp: "移动一块 = 1 次 PnP",
      down: "自上而下", up: "自下而上",
      voxels: "目标体素", rt: "RT · 优先大积木", ft: "FT · 优先源模型类型",
      s: ["策略 1", "策略 2", "策略 3"], cost: "PnP", reused: "来自源模型", fromStock: "来自库存", toBuffer: "移入缓冲区",
    },
  }, lang);

  const { ink, body, accent, mute, rule, bg } = kit.palette();
  const BUF = "#5aa9c9"; // buffer (cyan, as in Fig. 4 of the paper)
  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6, head: 9 });

  // ---- Toy models (side view; layer 0 at the bottom, start/len in stud columns) ----------
  const SRC = [
    [0, 0, 4], [0, 4, 4],
    [1, 0, 2], [1, 2, 4], [1, 6, 2],
    [2, 1, 3], [2, 4, 3],
    [3, 2, 2], [3, 5, 1],
  ].map(([layer, start, len], id) => ({ id, layer, start, len }));
  const RT_T = [[0, 0, 4], [0, 4, 3], [1, 0, 3], [1, 3, 4], [2, 1, 4], [2, 5, 1], [3, 2, 2]]
    .map(([layer, start, len]) => ({ layer, start, len }));
  const FT_T = [[0, 0, 4], [0, 4, 3], [1, 0, 2], [1, 2, 3], [1, 5, 2], [2, 1, 2], [2, 3, 2], [2, 5, 1], [3, 2, 2]]
    .map(([layer, start, len]) => ({ layer, start, len }));
  const TGT_ROWS = [[0, 7], [0, 7], [1, 5], [2, 2]]; // voxel rows [start, width] per layer

  const U = 18, H = 16, GROUND = 250;
  const SX = 30, TX = 456;
  const at = (x0, ground, layer, start) => [x0 + start * U, ground - (layer + 1) * H];

  // ---- Strategy simulation (deterministic; RT target) -------------------------------------
  const overlaps = (a, b) => a.start < b.start + b.len && b.start < a.start + a.len;
  function simulate(strategy) {
    const present = new Set(SRC.map((b) => b.id));
    const movable = (b) => present.has(b.id) && !SRC.some((c) => present.has(c.id) && c.layer === b.layer + 1 && overlaps(b, c));
    const buffer = []; // ids currently in buffer
    const moves = [];
    let bufCount = 0, stockCount = 0;
    const toBuffer = (b) => { present.delete(b.id); buffer.push(b.id); moves.push({ id: b.id, from: "source", to: "buffer", slot: bufCount++ }); };
    const disassembleTop = () => {
      const top = Math.max(...SRC.filter((b) => present.has(b.id)).map((b) => b.layer));
      SRC.filter((b) => present.has(b.id) && b.layer === top).forEach(toBuffer);
    };
    if (strategy === 1) [...SRC].sort((a, b) => b.layer - a.layer || a.start - b.start).forEach(toBuffer);
    for (const slot of RT_T) {
      for (;;) {
        const m = strategy !== 1 && SRC.find((b) => movable(b) && b.len === slot.len);
        if (m) { present.delete(m.id); moves.push({ id: m.id, from: "source", to: "target", slot }); break; }
        const k = strategy !== 3 ? buffer.findIndex((id) => SRC[id].len === slot.len) : -1;
        if (k >= 0) { const id = buffer.splice(k, 1)[0]; moves.push({ id, from: "buffer", to: "target", slot }); break; }
        if (strategy === 2 && present.size) { disassembleTop(); continue; }
        moves.push({ id: `s${stockCount++}`, len: slot.len, from: "stock", to: "target", slot }); break;
      }
    }
    return moves;
  }
  const SIMS = [1, 2, 3].map(simulate);

  // Buffer packing: arrival order -> position inside the buffer box.
  const BOX = { x: 216, y: 64, w: 196, h: 84 };
  const bufPos = (() => {
    const pos = [];
    let x = BOX.x + 8, y = BOX.y + 8;
    for (const b of [...SRC].sort((a, c) => c.layer - a.layer || a.start - c.start)) {
      if (x + b.len * U > BOX.x + BOX.w - 6) { x = BOX.x + 8; y += H + 8; }
      pos.push([x, y]); x += b.len * U + 6;
    }
    return pos;
  })();
  const STOCK = { x: 254, y: 182, w: 120, h: 56 };

  // ---- Drawing helpers ---------------------------------------------------------------------
  function brick(g, x, y, len, { fill = accent, opacity = 1, dashed = false } = {}) {
    const w = len * U;
    if (dashed) {
      kit.svg("rect", { x: x + 1, y: y + 1, width: w - 2, height: H - 2, fill: "none", stroke: mute, "stroke-width": 1.2, "stroke-dasharray": "3 3", opacity }, g);
      return;
    }
    for (let k = 0; k < len; k++) {
      kit.svg("rect", { x: x + k * U + 5, y: y - 3, width: U - 10, height: 4, rx: 1, fill, opacity }, g);
    }
    kit.svg("rect", { x: x + 0.75, y: y + 0.75, width: w - 1.5, height: H - 1.5, rx: 2, fill, stroke: bg, "stroke-width": 1.5, opacity }, g);
  }
  function ground(g, x0, cols, label) {
    line(g, [x0 - 8, GROUND + 1], [x0 + cols * U + 8, GROUND + 1], { stroke: mute, w: 1.4 });
    if (label) text(g, x0 + (cols * U) / 2, GROUND + 26, label, { weight: 600 });
  }
  function voxels(g, x0, gy, opacity = 1) {
    TGT_ROWS.forEach(([start, width], layer) => {
      for (let c = start; c < start + width; c++) {
        kit.svg("rect", { x: x0 + c * U + 1, y: gy - (layer + 1) * H + 1, width: U - 2, height: H - 2, fill: "none", stroke: mute, "stroke-width": 1.2, "stroke-dasharray": "3 3", opacity }, g);
      }
    });
  }
  function tiling(g, x0, gy, slots, opacity) {
    for (const s of slots) {
      const [x, y] = at(x0, gy, s.layer, s.start);
      brick(g, x, y, s.len, { opacity });
    }
  }

  function strategyScene(g, n, t) {
    const moves = SIMS[n];
    const e = kit.easeOut(t);
    const done = e * moves.length; // moves completed so far (fractional)
    text(g, SX, 34, L.s[n], { anchor: "start", weight: 700, size: 22 });

    // Boxes and routes (arrow width = priority, as in Fig. 4 of the paper)
    const useBuffer = n !== 2;
    if (useBuffer) {
      kit.svg("rect", { x: BOX.x, y: BOX.y, width: BOX.w, height: BOX.h, rx: 6, fill: BUF, "fill-opacity": 0.16, stroke: BUF, "stroke-width": 1.6 }, g);
      text(g, BOX.x + BOX.w / 2, BOX.y - 10, L.buffer, { fill: body, weight: 600 });
    }
    kit.svg("rect", { x: STOCK.x, y: STOCK.y, width: STOCK.w, height: STOCK.h, rx: 6, fill: mute, "fill-opacity": 0.22, stroke: mute, "stroke-width": 1.6 }, g);
    text(g, STOCK.x + STOCK.w / 2, STOCK.y + STOCK.h / 2 + 6, L.stock, { fill: body, weight: 600 });

    const thick = 4.2, mid = 2.6, thin = 1.4;
    if (n === 0) {
      arrow(g, [182, 150], [BOX.x - 6, 116], { w: thick, head: 13 });
      arrow(g, [BOX.x + BOX.w + 6, 116], [TX - 10, 150], { w: thick, head: 13 });
    }
    if (n === 1) {
      arrow(g, [182, 150], [BOX.x - 6, 116], { w: mid, head: 11 });
      arrow(g, [BOX.x + BOX.w + 6, 116], [TX - 10, 150], { w: mid, head: 11 });
    }
    if (n >= 1) arrow(g, [182, 166], [TX - 10, 166], { w: thick, head: 13 });
    arrow(g, [STOCK.x + STOCK.w + 6, STOCK.y + STOCK.h / 2], [TX - 10, 214], { w: thin, head: 8 });

    ground(g, SX, 8, L.source);
    ground(g, TX, 7, L.target);
    for (const s of RT_T) { const [x, y] = at(TX, GROUND, s.layer, s.start); brick(g, x, y, s.len, { dashed: true }); }

    // Bricks: walk the move list; a brick sits at its last finished move, or flies along the current one.
    const posOf = (m) => (m.to === "buffer" ? bufPos[m.slot] : at(TX, GROUND, m.slot.layer, m.slot.start));
    const fromOf = (m, cur) => (m.from === "stock" ? [STOCK.x + STOCK.w / 2 - (m.len * U) / 2, STOCK.y + 20] : cur);
    const where = new Map(SRC.map((b) => [b.id, at(SX, GROUND, b.layer, b.start)]));
    const fly = [];
    moves.forEach((m, i) => {
      const p = Math.max(0, Math.min(1, done - i));
      if (p <= 0) return;
      const a = fromOf(m, where.get(m.id));
      const b = posOf(m);
      if (p >= 1) { where.set(m.id, b); return; }
      const lift = Math.sin(Math.PI * p) * 34;
      where.set(m.id, [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p - lift]);
      fly.push(m.id);
    });
    for (const [id, [x, y]] of where) {
      const isStock = typeof id === "string";
      const len = isStock ? moves.find((m) => m.id === id).len : SRC[id].len;
      if (!fly.includes(id)) brick(g, x, y, len, { fill: isStock ? mute : accent });
    }
    for (const id of fly) {
      const [x, y] = where.get(id);
      const isStock = typeof id === "string";
      brick(g, x, y, isStock ? moves.find((m) => m.id === id).len : SRC[id].len, { fill: isStock ? mute : accent });
    }

    // Cost: one tick per PnP so far.
    text(g, SX, 322, L.cost, { anchor: "start", size: 16, fill: body, weight: 600 });
    const ticks = Math.floor(done + 1e-6);
    for (let k = 0; k < ticks; k++) {
      const m = moves[k];
      kit.svg("rect", { x: SX + 44 + k * 13, y: 306, width: 8, height: 20, rx: 1.5, fill: m.from === "stock" ? mute : m.to === "buffer" ? BUF : accent }, g);
    }
    // Legend: bricks (and ticks) by route.
    const keys = [[accent, L.reused], [mute, L.fromStock], ...(useBuffer ? [[BUF, L.toBuffer]] : [])];
    keys.forEach(([fill, label], k) => {
      kit.svg("rect", { x: 408, y: 290 + k * 23, width: 16, height: 14, rx: 2, fill }, g);
      text(g, 430, 302 + k * 23, label, { anchor: "start", size: 16, fill: body });
    });
  }

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        ground(g, SX, 8, L.source);
        ground(g, TX, 7, L.target);
        voxels(g, TX, GROUND);
        const movable = (b) => !SRC.some((c) => (e === 0 || c.id !== 7) && c.layer === b.layer + 1 && overlaps(b, c));
        for (const b of SRC) {
          if (b.id === 7) continue; // the brick being moved
          const [x, y] = at(SX, GROUND, b.layer, b.start);
          brick(g, x, y, b.len, { opacity: movable(b) ? 1 : 0.35 });
        }
        // One brick lifted from the source top and carried over to the target's bottom layer.
        const b = SRC[7];
        const a = at(SX, GROUND, b.layer, b.start);
        const z = at(TX, GROUND, 0, 5);
        const lift = Math.sin(Math.PI * e) * 80;
        const p = [a[0] + (z[0] - a[0]) * e, a[1] + (z[1] - a[1]) * e - lift];
        brick(g, a[0], a[1], b.len, { dashed: true, opacity: e });
        const path = [];
        for (let k = 0; k <= 24; k++) {
          const u = k / 24;
          path.push(`${a[0] + (z[0] - a[0]) * u + U},${a[1] + (z[1] - a[1]) * u - Math.sin(Math.PI * u) * 80 + H / 2}`);
        }
        kit.svg("polyline", { points: path.join(" "), fill: "none", stroke: mute, "stroke-width": 1.4, "stroke-dasharray": "5 5", opacity: e }, g);
        brick(g, p[0], p[1], b.len);
        text(g, 320, 100, L.pnp, { fill: ink, weight: 600, opacity: e });
        arrow(g, [196, 196], [196, 240], { stroke: mute, w: 2 });
        text(g, 206, 224, L.down, { anchor: "start", size: 16, fill: body });
        arrow(g, [440, 240], [440, 196], { stroke: mute, w: 2 });
        text(g, 430, 224, L.up, { anchor: "end", size: 16, fill: body });
        kit.svg("rect", { x: 30, y: 304, width: 16, height: 14, rx: 2, fill: accent }, g);
        text(g, 54, 316, L.movable, { anchor: "start", size: 16, fill: body });
        kit.svg("rect", { x: 30, y: 330, width: 16, height: 14, rx: 2, fill: accent, opacity: 0.35 }, g);
        text(g, 54, 342, L.covered, { anchor: "start", size: 16, fill: body });
      }

      if (i === 1) {
        const VX = 40, VG = 222, RX = 420;
        voxels(g, VX, VG);
        text(g, VX + 63, VG + 28, L.voxels, { weight: 600 });
        arrow(g, [176, 170], [RX - 16, 118], { w: 2 });
        arrow(g, [176, 196], [RX - 16, 268], { w: 2 });
        text(g, RX + 63, 50, L.rt, { weight: 600 });
        line(g, [RX - 6, 145], [RX + 132, 145], { stroke: mute, w: 1.4 });
        tiling(g, RX, 144, RT_T, e);
        text(g, RX + 63, 206, L.ft, { weight: 600 });
        line(g, [RX - 6, 301], [RX + 132, 301], { stroke: mute, w: 1.4 });
        tiling(g, RX, 300, FT_T, e);
      }

      if (i >= 2) strategyScene(g, i - 2, t);
    },
  });
}
