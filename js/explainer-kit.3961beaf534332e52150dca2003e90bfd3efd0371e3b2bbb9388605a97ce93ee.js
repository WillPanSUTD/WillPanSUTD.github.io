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
