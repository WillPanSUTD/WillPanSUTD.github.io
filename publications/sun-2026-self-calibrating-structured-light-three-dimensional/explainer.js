// Self-calibrating fringe projection, schematic of the stages named in the abstract:
// vibration slowly moves the camera-projector extrinsics -> independent camera / projector
// calibration as initial values -> camera, projector parameters and the scene's 3D points
// (surface point cloud as a constraint) optimised together -> extrinsics corrected.
export default function mount(el, { kit, lang }) {
  const L = kit.pick({
    en: {
      steps: [
        "A camera and a projector measure the object by phase-shifting fringe projection and triangulation. Vibration slowly moves the system's extrinsic parameters, weakening the triangulation constraint.",
        "The camera and the projector are each calibrated independently; these calibration parameters are the initial values.",
        "The surface point cloud of the object being reconstructed enters the optimisation as a constraint: camera parameters, projector parameters and the scene's 3D points are optimised together.",
        "With this model the system's extrinsic parameters are corrected rapidly and accurately, without interrupting the measurement process.",
      ],
      cam: "camera", proj: "projector", vib: "vibration", object: "object surface",
      stale: "calibrated pose", drift: "extrinsics drift",
      camCal: "camera calibration", projCal: "projector calibration", init: "initial values",
      opt: "collaborative optimisation", optSub: "camera + projector + 3D points",
      cloud: "surface point cloud as constraint",
      fixed: "extrinsics corrected", cont: "measurement continues",
    },
    zh: {
      steps: [
        "相机与投影仪通过相移条纹投影和三角测量获取物体表面。振动使系统外参缓慢移动，三角测量约束随之减弱。",
        "相机和投影仪各自独立标定，这些标定参数作为初值。",
        "待重建物体的表面点云作为约束条件纳入优化：相机参数、投影仪参数与场景三维点被联合优化。",
        "借助该模型，系统外参得到快速、准确的校正，测量过程无需中断。",
      ],
      cam: "相机", proj: "投影仪", vib: "振动", object: "物体表面",
      stale: "标定位姿", drift: "外参漂移",
      camCal: "相机标定", projCal: "投影仪标定", init: "初值",
      opt: "协同优化", optSub: "相机 + 投影仪 + 三维点",
      cloud: "表面点云作为约束",
      fixed: "外参已校正", cont: "测量不中断",
    },
  }, lang);

  const { ink, body, accent, mute, bg } = kit.palette();
  // Literal semantic colours: drift (error) and corrected state.
  const DRIFT = "#c2410c";
  const OK = "#15803d";

  const { text, line, arrow } = kit.pen({ textSize: 17, stroke: body, width: 1.6 });
  const rnd = kit.rng(11);

  // Geometry (viewBox units)
  const CAM = [130, 132];
  const PRJ = [510, 132];
  const surfY = (x) => 282 + 12 * Math.sin((x - 150) / 48);
  const P = [320, surfY(320)];
  const DRIFT_DEG = 8;
  const deg = (a) => (a * 180) / Math.PI;
  const camAxis = deg(Math.atan2(P[1] - CAM[1], P[0] - CAM[0]));
  const prjAxis = deg(Math.atan2(P[1] - PRJ[1], P[0] - PRJ[0]));

  // Ray from o along angle a (deg) until it meets the surface.
  const hit = (o, a) => {
    const r = (a * Math.PI) / 180, dx = Math.cos(r), dy = Math.sin(r);
    let x = o[0], y = o[1];
    for (let k = 0; k < 600 && y < surfY(x); k++) { x += dx; y += dy; }
    return [x, y];
  };
  const P2 = hit(PRJ, prjAxis + DRIFT_DEG); // where the drifted projector actually points

  // Surface sample points (the reconstructed point cloud), deterministic jitter.
  const cloud = [];
  for (let x = 168; x <= 472; x += 19) cloud.push([x + (rnd() - 0.5) * 4, surfY(x) + (rnd() - 0.5) * 3]);

  const device = (g, c, a, { kind, dash, stroke = ink, opacity = 1 }) => {
    const d = kit.svg("g", { transform: `translate(${c[0]} ${c[1]}) rotate(${a})`, opacity }, g);
    const common = { fill: dash ? "none" : bg, stroke, "stroke-width": 1.8, ...(dash && { "stroke-dasharray": "5 4" }) };
    kit.svg("rect", { x: -24, y: -15, width: 44, height: 30, rx: 4, ...common }, d);
    if (kind === "cam") kit.svg("rect", { x: 20, y: -9, width: 11, height: 18, rx: 2, ...common }, d);
    else kit.svg("path", { d: "M20 -8 L32 -13 L32 13 L20 8 Z", ...common }, d);
  };
  const surface = (g) => {
    let d = "";
    for (let x = 150; x <= 490; x += 5) d += `${x === 150 ? "M" : "L"}${x} ${surfY(x).toFixed(1)} `;
    kit.svg("path", { d, fill: "none", stroke: ink, "stroke-width": 2.2 }, g);
    text(g, 520, surfY(490) + 6, L.object, { anchor: "start", size: 16, fill: body });
  };
  // Light cone with fringes from the projector, centred on angle a.
  const fringes = (g, a, opacity) => {
    for (let k = -4; k <= 4; k++) {
      const end = hit(PRJ, a + k * 2.4);
      if (end[0] < 152 || end[0] > 488) continue;
      line(g, PRJ, end, { stroke: accent, w: k % 2 ? 1 : 2.4, opacity: opacity * (k % 2 ? 0.25 : 0.4) });
    }
  };
  const vibration = (g, opacity) => {
    for (let k = 0; k < 3; k++) {
      const x = PRJ[0] + 44 + k * 9;
      kit.svg("path", { d: `M${x} ${PRJ[1] - 16} q5 8 0 16 q-5 8 0 16`, fill: "none", stroke: DRIFT, "stroke-width": 1.8, opacity }, g);
    }
  };
  const box = (g, cx, cy, w, h, stroke, opacity) =>
    kit.svg("rect", { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 6, fill: bg, stroke, "stroke-width": 1.6, opacity }, g);

  kit.stepper(el, {
    steps: L.steps,
    lang,
    render(stage, i, t) {
      stage.replaceChildren();
      const e = kit.easeOut(t);
      const s = kit.svg("svg", { viewBox: "0 0 640 360", role: "img", "aria-label": L.steps[i] }, stage);
      const g = kit.svg("g", {}, s);

      if (i === 0) {
        const a = prjAxis + DRIFT_DEG * e;
        const end = hit(PRJ, a);
        surface(g);
        fringes(g, a, 1);
        line(g, CAM, P, { stroke: ink, w: 1.6 });
        line(g, PRJ, end, { stroke: accent, w: 2 });
        device(g, PRJ, prjAxis, { kind: "proj", dash: true, stroke: mute, opacity: e });
        device(g, CAM, camAxis, { kind: "cam" });
        device(g, PRJ, a, { kind: "proj" });
        vibration(g, 0.4 + 0.6 * e);
        kit.svg("circle", { cx: P[0], cy: P[1], r: 5, fill: ink }, g);
        if (e > 0.3) {
          kit.svg("circle", { cx: end[0], cy: end[1], r: 5, fill: DRIFT, opacity: e }, g);
          line(g, [P[0] + 6, P[1] + 14], [end[0] - 6, end[1] + 14], { stroke: DRIFT, w: 1.6, dash: "3 3", opacity: e });
        }
        text(g, CAM[0], CAM[1] - 34, L.cam, { weight: 600 });
        text(g, PRJ[0], PRJ[1] - 34, L.proj, { weight: 600 });
        text(g, PRJ[0] + 62, PRJ[1] + 46, L.vib, { size: 16, fill: DRIFT, opacity: 0.4 + 0.6 * e });
        text(g, 320, 52, L.drift, { size: 19, weight: 600, fill: DRIFT, opacity: e });
        text(g, 320, 76, `– – ${L.stale}`, { size: 16, fill: body, opacity: e });
      }

      if (i === 1) {
        const a = prjAxis + DRIFT_DEG;
        surface(g);
        fringes(g, a, 0.6);
        line(g, CAM, P, { stroke: ink, w: 1.4, opacity: 0.6 });
        line(g, PRJ, P2, { stroke: accent, w: 1.6, opacity: 0.6 });
        device(g, PRJ, prjAxis, { kind: "proj", dash: true, stroke: mute });
        device(g, CAM, camAxis, { kind: "cam" });
        device(g, PRJ, a, { kind: "proj" });
        box(g, CAM[0], 66, 196, 40, ink, e);
        box(g, PRJ[0], 66, 196, 40, ink, e);
        text(g, CAM[0], 72, L.camCal, { size: 17, opacity: e });
        text(g, PRJ[0], 72, L.projCal, { size: 17, opacity: e });
        line(g, [CAM[0], 87], [CAM[0], 112], { w: 1.4, opacity: e });
        line(g, [PRJ[0], 87], [PRJ[0], 112], { w: 1.4, opacity: e });
        text(g, 320, 72, L.init, { size: 19, weight: 600, fill: accent, opacity: e });
      }

      if (i === 2) {
        const a = prjAxis + DRIFT_DEG;
        surface(g);
        line(g, CAM, P, { stroke: ink, w: 1.4, opacity: 0.25 });
        line(g, PRJ, P2, { stroke: accent, w: 1.6, opacity: 0.25 });
        device(g, PRJ, prjAxis, { kind: "proj", dash: true, stroke: mute });
        device(g, CAM, camAxis, { kind: "cam" });
        device(g, PRJ, a, { kind: "proj" });
        box(g, CAM[0], 66, 196, 40, ink, 1);
        box(g, PRJ[0], 66, 196, 40, ink, 1);
        text(g, CAM[0], 72, L.camCal, { size: 17 });
        text(g, PRJ[0], 72, L.projCal, { size: 17 });
        // point cloud on the surface
        cloud.forEach((c, k) => {
          const o = kit.easeOut(Math.max(0, Math.min(1, t * 1.6 - k * 0.04)));
          kit.svg("circle", { cx: c[0], cy: c[1], r: 4.5, fill: accent, opacity: o }, g);
        });
        // central optimisation block
        const B = [320, 182];
        box(g, B[0], B[1], 272, 62, accent, e);
        text(g, B[0], B[1] - 4, L.opt, { size: 18, weight: 600, fill: accent, opacity: e });
        text(g, B[0], B[1] + 20, L.optSub, { size: 15, opacity: e });
        arrow(g, [CAM[0] + 40, 88], [B[0] - 110, B[1] - 32], { opacity: e });
        arrow(g, [PRJ[0] - 40, 88], [B[0] + 110, B[1] - 32], { opacity: e });
        for (const k of [2, 5, 8, 11, 14]) {
          const c = cloud[k];
          arrow(g, [c[0], c[1] - 10], [B[0] + (c[0] - B[0]) * 0.55, B[1] + 34], { stroke: accent, w: 1.3, opacity: 0.7 * e });
        }
        text(g, 320, 340, L.cloud, { size: 16, fill: accent, opacity: e });
      }

      if (i === 3) {
        const a = prjAxis + DRIFT_DEG;
        surface(g);
        fringes(g, a, 0.6);
        const ghost = prjAxis + DRIFT_DEG * e;
        line(g, CAM, P2, { stroke: ink, w: 1.6, opacity: e });
        line(g, PRJ, P2, { stroke: accent, w: 2 });
        device(g, CAM, camAxis, { kind: "cam" });
        device(g, PRJ, a, { kind: "proj" });
        device(g, PRJ, ghost, { kind: "proj", dash: true, stroke: e > 0.98 ? OK : mute });
        kit.svg("circle", { cx: P2[0], cy: P2[1], r: 6, fill: OK, opacity: e }, g);
        text(g, CAM[0], CAM[1] - 34, L.cam, { weight: 600 });
        text(g, PRJ[0], PRJ[1] - 34, L.proj, { weight: 600 });
        text(g, 320, 52, L.fixed, { size: 19, weight: 600, fill: OK, opacity: e });
        text(g, 320, 340, L.cont, { size: 16, fill: body, opacity: e });
      }
    },
  });
}
