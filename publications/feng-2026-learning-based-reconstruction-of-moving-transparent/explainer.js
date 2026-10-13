// Abstract-level schematic of learning-based reconstruction of moving transparent objects:
// PSP fringes reflected by the front and rear surfaces superimpose in the captured image ->
// a diffusion model separates the superimposed fringe patterns ->
// the moving object is reconstructed with SIFT and two-dimensional motion equations.
// Shapes are deliberately generic: the source is the abstract only.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "Phase-shifting profilometry projects fringe patterns onto a moving transparent object. Both its front and rear surfaces reflect them, so the captured image contains superimposed fringes.",
        "A diffusion model separates the superimposed fringe patterns.",
        "The moving object is then reconstructed based on the SIFT algorithm and two-dimensional motion equations.",
      ],
      projector: "projector", camera: "camera", front: "front surface", rear: "rear surface",
      motion: "motion", captured: "superimposed fringes", input: "superimposed",
      diffusion: "diffusion model", separated: "separated fringe patterns",
      f1: "frame 1", f2: "frame 2", sift: "SIFT", eq: "2D motion equations", recon: "reconstruction",
    },
    zh: {
      steps: [
        "相移轮廓术（PSP）向运动的透明物体投射条纹图案；条纹同时被物体的前、后表面反射，采集图像中出现叠加条纹。",
        "利用扩散模型分离叠加的条纹图案。",
        "随后基于 SIFT 算法和二维运动方程重建运动物体。",
      ],
      projector: "投影仪", camera: "相机", front: "前表面", rear: "后表面",
      motion: "运动", captured: "叠加条纹", input: "叠加条纹",
      diffusion: "扩散模型", separated: "分离后的条纹图案",
      f1: "第 1 帧", f2: "第 2 帧", sift: "SIFT", eq: "二维运动方程", recon: "重建结果",
    },
  }, lang);

  const { ink, body, accent, mute, rule } = kit.palette();
  // Literal semantic colours: light reflected by the front surface and by the rear surface.
  const FRONT = "#d9822b";
  const REAR = "#2a9d8f";

  const { text, line, arrow } = kit.pen({ textSize: 18, stroke: body, width: 1.6, head: 9 });
  const partial = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

  // Vertical fringe stripes inside a panel; period and phase in px, opacity scales the whole set.
  const fringes = (g, x, y, w, h, colour, period, phase, opacity) => {
    const n = 48;
    const dw = w / n;
    for (let k = 0; k < n; k++) {
      const cx = x + (k + 0.5) * dw;
      const v = 0.5 + 0.5 * Math.cos((2 * Math.PI * (cx - x + phase)) / period);
      kit.svg("rect", { x: x + k * dw, y, width: dw + 0.4, height: h, fill: colour, opacity: v * 0.55 * opacity }, g);
    }
  };
  const panel = (g, x, y, w, h, opacity = 1) =>
    kit.svg("rect", { x, y, width: w, height: h, rx: 3, fill: "none", stroke: body, "stroke-width": 1.4, opacity }, g);
  const superimposed = (g, x, y, w, h, opacity) => {
    fringes(g, x, y, w, h, FRONT, 26, 0, opacity);
    fringes(g, x, y, w, h, REAR, 34, 9, opacity);
    panel(g, x, y, w, h, opacity);
  };

  // Deterministic feature points on a generic object outline (step 3).
  const rnd = kit.rng(11);
  const feats = Array.from({ length: 6 }, (_, k) => {
    const a = ((k + 0.5 + 0.3 * (rnd() - 0.5)) / 6) * 2 * Math.PI, r = 0.5 + 0.35 * rnd();
    return [Math.cos(a) * r * 34, Math.sin(a) * r * 22];
  });

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        // Projector and camera on the left, transparent slab in the middle, captured image on the right.
        const P = [92, 92], C = [92, 268];
        kit.svg("rect", { x: 46, y: 74, width: 52, height: 36, rx: 4, fill: "none", stroke: ink, "stroke-width": 1.6 }, g);
        kit.svg("rect", { x: 46, y: 250, width: 52, height: 36, rx: 4, fill: "none", stroke: ink, "stroke-width": 1.6 }, g);
        text(g, 72, 60, L.projector, { fill: body });
        text(g, 72, 312, L.camera, { fill: body });

        const xF = 250, xR = 290, y0 = 70, y1 = 290;
        kit.svg("rect", { x: xF, y: y0, width: xR - xF, height: y1 - y0, fill: accent, opacity: 0.08 }, g);
        line(g, [xF, y0], [xF, y1], { stroke: FRONT, w: 2.4 });
        line(g, [xR, y0], [xR, y1], { stroke: REAR, w: 2.4 });
        text(g, xF - 8, 48, L.front, { fill: FRONT, anchor: "end", size: 17 });
        text(g, xR + 8, 48, L.rear, { fill: REAR, anchor: "start", size: 17 });

        // Incident light and two reflected paths that both reach the camera.
        const hitF = [xF, 172], hitR = [xR, 184], exitR = [xF, 196];
        const u1 = Math.min(1, e * 2), u2 = Math.max(0, Math.min(1, e * 2 - 1));
        line(g, P, partial(P, hitF, u1), { stroke: mute, w: 1.6 });
        if (u1 >= 1) {
          line(g, hitF, hitR, { stroke: REAR, w: 1.6, dash: "4 3" });
          line(g, hitR, exitR, { stroke: REAR, w: 1.6, dash: "4 3" });
        }
        if (u2 > 0) {
          arrow(g, hitF, partial(hitF, C, u2), { stroke: FRONT, w: 1.8 });
          arrow(g, exitR, partial(exitR, [C[0], C[1] + 4], u2), { stroke: REAR, w: 1.8 });
        }

        // Motion of the object.
        arrow(g, [xF - 6, 316], [xR + 34, 316], { stroke: ink, w: 1.6 });
        text(g, (xF + xR) / 2 + 14, 344, L.motion, { fill: ink });

        // Captured image: both fringe sets overlap.
        superimposed(g, 400, 100, 200, 150, u2);
        text(g, 500, 82, L.captured, { fill: ink, weight: 600, opacity: u2 });
      }

      if (i === 1) {
        superimposed(g, 24, 120, 150, 120, 1);
        text(g, 99, 104, L.input, { fill: ink, weight: 600 });

        kit.svg("rect", { x: 236, y: 145, width: 152, height: 70, rx: 10, fill: accent, opacity: 0.1 }, g);
        kit.svg("rect", { x: 236, y: 145, width: 152, height: 70, rx: 10, fill: "none", stroke: accent, "stroke-width": 1.6 }, g);
        text(g, 312, 186, L.diffusion, { fill: accent, weight: 600 });

        arrow(g, [180, 180], partial([180, 180], [230, 180], Math.min(1, e * 2)), { stroke: body });
        const u = Math.max(0, Math.min(1, e * 2 - 1));
        if (u > 0) {
          arrow(g, [392, 170], partial([392, 170], [418, 112], u), { stroke: body });
          arrow(g, [392, 190], partial([392, 190], [418, 248], u), { stroke: body });
        }
        fringes(g, 426, 52, 160, 110, FRONT, 26, 0, u);
        panel(g, 426, 52, 160, 110, u);
        fringes(g, 426, 198, 160, 110, REAR, 34, 9, u);
        panel(g, 426, 198, 160, 110, u);
        text(g, 506, 338, L.separated, { fill: ink, weight: 600, opacity: u });
      }

      if (i === 2) {
        // Two frames of the moving object with matched feature points.
        const F1 = [24, 70, 170, 120], F2 = [224, 70, 170, 120];
        const o1 = [24 + 64, 70 + 52], o2 = [224 + 104, 70 + 70];
        for (const [F, o, lab] of [[F1, o1, L.f1], [F2, o2, L.f2]]) {
          panel(g, F[0], F[1], F[2], F[3]);
          kit.svg("ellipse", { cx: o[0], cy: o[1], rx: 40, ry: 28, fill: accent, opacity: 0.1, stroke: accent, "stroke-width": 1.4 }, g);
          text(g, F[0] + F[2] / 2, 54, lab, { fill: body });
          for (const f of feats) {
            kit.svg("circle", { cx: o[0] + f[0], cy: o[1] + f[1], r: 3.4, fill: ink }, g);
          }
        }
        const uM = Math.min(1, e * 2);
        for (const f of feats) {
          const a = [o1[0] + f[0], o1[1] + f[1]], b = [o2[0] + f[0], o2[1] + f[1]];
          line(g, a, partial(a, b, uM), { stroke: accent, w: 1.1, opacity: 0.7 });
        }
        text(g, 209, 222, L.sift, { fill: accent, weight: 600 });

        const u = Math.max(0, Math.min(1, e * 2 - 1));
        kit.svg("rect", { x: 109, y: 262, width: 200, height: 54, rx: 10, fill: "none", stroke: body, "stroke-width": 1.5 }, g);
        text(g, 209, 295, L.eq, { fill: ink });
        arrow(g, [209, 230], [209, 256], { stroke: body });

        // Generic reconstruction output: a shaded surface patch.
        arrow(g, [316, 289], partial([316, 289], [436, 210], u), { stroke: body });
        const rg = kit.svg("g", { opacity: u }, g);
        const cx = 520, cy = 180;
        for (let k = -3; k <= 3; k++) {
          const yy = cy + k * 14;
          const half = 70 * Math.sqrt(1 - (k / 4) ** 2);
          kit.svg("path", {
            d: `M${cx - half} ${yy} Q${cx} ${yy - 22 * Math.sqrt(1 - (k / 4) ** 2)} ${cx + half} ${yy}`,
            fill: "none", stroke: accent, "stroke-width": 1.3,
          }, rg);
        }
        kit.svg("ellipse", { cx, cy, rx: 80, ry: 60, fill: accent, opacity: 0.06, stroke: rule, "stroke-width": 1.2 }, rg);
        text(g, cx, 272, L.recon, { fill: ink, weight: 600, opacity: u });
      }
    },
  });
}
