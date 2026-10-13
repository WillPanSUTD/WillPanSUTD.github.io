const NS = "http://www.w3.org/2000/svg";
const TAG = { en: "Schematic illustration", zh: "原理示意" };
const NAV = { en: ["Prev", "Next"], zh: ["上一步", "下一步"] };

export function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function svg(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

export function pick(labels, lang) {
  return labels[lang] ?? labels.en;
}

// ---- Shared drawing helpers for hand-written explainers ----------------------

/** Deterministic PRNG in [0,1) (mulberry32). Same seed, same sequence. */
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Cubic ease-in-out; t is clamped to [0,1]. */
export function ease(t) {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Cubic ease-out (the curve the original sample explainers use); t is clamped to [0,1]. */
export function easeOut(t) {
  return 1 - Math.pow(1 - clamp01(t), 3);
}

/** Theme colours read from the page's CSS custom properties, with the site's light-theme fallbacks. */
export function palette() {
  return {
    ink: token("--c-ink") || "#0a0a0a",
    body: token("--c-body") || "#525252",
    accent: token("--c-accent") || "#1e3a8a",
    mute: token("--c-mute") || "#a3a3a3",
    rule: token("--c-rule") || "#e5e5e5",
    bg: token("--c-bg") || "#ffffff",
  };
}

/**
 * SVG <text>. Options (all optional): size (default 14), weight, anchor (default "middle"), fill
 * (default palette body), italic (serif italic), halo (true = background-coloured outline, or a colour),
 * opacity. Any other key is set as a raw SVG attribute. The font comes from the page via `style`
 * (CSS var() is not reliable inside SVG presentation attributes); attrs.style is appended after it.
 */
export function text(parent, x, y, str, attrs = {}) {
  const { size = 14, weight, anchor = "middle", fill, italic, halo, opacity, style = "", ...rest } = attrs;
  const node = svg("text", {
    x, y, "font-size": size, fill: fill ?? palette().body, "text-anchor": anchor,
    ...(weight !== undefined && { "font-weight": weight }),
    ...(italic && { "font-style": "italic" }),
    ...(opacity !== undefined && { opacity }),
    ...(halo && {
      "paint-order": "stroke", stroke: halo === true ? palette().bg : halo,
      "stroke-width": 4, "stroke-linejoin": "round",
    }),
    ...rest,
    style: `font-family:${italic ? "var(--f-serif, serif)" : "var(--f-sans, sans-serif)"};${style}`,
  }, parent);
  node.textContent = str;
  return node;
}

/** SVG <line> with round caps; stroke defaults to the body colour. */
export function line(parent, x1, y1, x2, y2, attrs = {}) {
  return svg("line", {
    x1, y1, x2, y2, "stroke-width": 1.5, "stroke-linecap": "round", ...attrs, stroke: attrs.stroke ?? palette().body,
  }, parent);
}

/** Line plus filled head at (x2, y2), in a <g>. attrs.head sets the head length (default 9). */
export function arrow(parent, x1, y1, x2, y2, attrs = {}) {
  const { head = 9, ...rest } = attrs;
  const g = svg("g", {}, parent);
  line(g, x1, y1, x2, y2, rest);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const pts = [[x2, y2],
    [x2 - head * Math.cos(ang - 0.45), y2 - head * Math.sin(ang - 0.45)],
    [x2 - head * Math.cos(ang + 0.45), y2 - head * Math.sin(ang + 0.45)]];
  svg("polygon", {
    points: pts.map((q) => q.join(",")).join(" "),
    fill: rest.stroke ?? palette().body, opacity: rest.opacity ?? 1,
  }, g);
  return g;
}

/**
 * Per-explainer drawing set with point-array signatures: { text(parent, x, y, str, o), line(parent, a, b, o),
 * arrow(parent, a, b, o) }. defaults: textSize, stroke (line/arrow colour), width, head.
 * Per-call o: text takes size/fill/anchor/weight/italic/opacity and halo (false = no outline; on by default);
 * line/arrow take stroke, w, dash, opacity (arrow also head).
 */
export function pen({ textSize = 14, stroke, width = 1.5, head = 9 } = {}) {
  const lineAttrs = (o) => ({
    stroke: o.stroke ?? stroke ?? palette().body, "stroke-width": o.w ?? width,
    ...(o.dash && { "stroke-dasharray": o.dash }),
    ...(o.opacity !== undefined && { opacity: o.opacity }),
  });
  return {
    text: (parent, x, y, str, o = {}) => text(parent, x, y, str, {
      size: o.size ?? textSize, fill: o.fill ?? palette().ink, anchor: o.anchor, weight: o.weight,
      italic: o.italic, opacity: o.opacity, halo: o.halo !== false,
    }),
    line: (parent, a, b, o = {}) => line(parent, a[0], a[1], b[0], b[1], lineAttrs(o)),
    arrow: (parent, a, b, o = {}) => arrow(parent, a[0], a[1], b[0], b[1], { ...lineAttrs(o), head: o.head ?? head }),
  };
}

export function stepper(el, { steps, render, lang = "en" }) {
  const stage = document.createElement("div");
  stage.className = "explainer-stage";
  const bar = document.createElement("div");
  bar.className = "explainer-bar";
  const [prevLabel, nextLabel] = NAV[lang] ?? NAV.en;
  bar.innerHTML = `
    <button type="button" data-prev>${prevLabel}</button>
    <span class="explainer-count"></span>
    <span class="explainer-caption" aria-live="polite"></span>
    <button type="button" data-next>${nextLabel}</button>
    <span class="explainer-tag">${TAG[lang] ?? TAG.en}</span>`;
  el.append(stage, bar);
  const prev = bar.querySelector("[data-prev]");
  const next = bar.querySelector("[data-next]");
  let index = 0;
  let frame = 0;
  if (!steps.length) {
    prev.disabled = true;
    next.disabled = true;
    return { stage, show() {} };
  }

  function show(i) {
    index = Math.max(0, Math.min(steps.length - 1, i));
    bar.querySelector(".explainer-count").textContent = `${index + 1} / ${steps.length}`;
    bar.querySelector(".explainer-caption").textContent = steps[index];
    const atFirst = index === 0;
    const atLast = index === steps.length - 1;
    // A focused button that is about to be disabled would drop focus to <body>; hand it to its sibling.
    if (atLast && document.activeElement === next && !atFirst) prev.focus();
    if (atFirst && document.activeElement === prev && !atLast) next.focus();
    prev.disabled = atFirst;
    next.disabled = atLast;
    cancelAnimationFrame(frame);
    if (reducedMotion()) {
      render(stage, index, 1);
      return;
    }
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 700);
      render(stage, index, t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  el.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === "ArrowLeft") show(index - 1);
    else if (e.key === "ArrowRight") show(index + 1);
    else return;
    e.preventDefault();
  });
  show(0);
  return { stage, show };
}
