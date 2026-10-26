import * as THREE from "./vendor/three.module.min.js";

const control = document.querySelector(".paper-interaction");
const canvasWrap = document.querySelector(".canvas-wrap");
const hint = document.querySelector(".hint");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
camera.position.set(0, 0.03, 9.3);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
canvasWrap.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.45));
const keyLight = new THREE.DirectionalLight(0xfff2d5, 2.8);
keyLight.position.set(-4.2, 5.2, 7.5);
scene.add(keyLight);
const sideLight = new THREE.DirectionalLight(0xaec7d8, 1.12);
sideLight.position.set(4.8, -1.5, 5.2);
scene.add(sideLight);
const edgeLight = new THREE.DirectionalLight(0xffffff, 0.72);
edgeLight.position.set(0.5, 1.2, -5);
scene.add(edgeLight);

// A deliberately coarse, non-indexed sheet. Large planar triangles and flat
// normals make the material read as stiff paper instead of a soft cloth mesh.
const PAPER_WIDTH = 3.18;
const PAPER_HEIGHT = 4.24;
const geometry = new THREE.PlaneGeometry(PAPER_WIDTH, PAPER_HEIGHT, 18, 24).toNonIndexed();
const position = geometry.attributes.position;
const vertexCount = position.count;
const opened = new Float32Array(vertexCount * 3);
const crumpled = new Float32Array(vertexCount * 3);

function triangleWave(value) {
  const wrapped = ((value % 2) + 2) % 2;
  return 1 - 2 * Math.abs(wrapped - 1);
}

function crease(x, y, angle, offset, width, height) {
  const distance = x * Math.cos(angle) + y * Math.sin(angle) - offset;
  const envelope = Math.exp(-Math.pow(distance / width, 2));
  return triangleWave(distance / width) * envelope * height;
}

function openedRelief(x, y) {
  // Sparse straight folds, not all-over noise. Paper remembers a few hard
  // creases while the printed surface remains legible and colour-accurate.
  return crease(x, y, 0.39, -0.16, 0.078, 0.033)
    + crease(x, y, 2.21, 0.31, 0.073, -0.027)
    + crease(x, y, 1.45, -0.66, 0.065, 0.021)
    + crease(x, y, 2.72, -0.92, 0.061, -0.017)
    + Math.pow(Math.abs(x) / (PAPER_WIDTH / 2), 12) * Math.sin(y * 1.45) * 0.022;
}

for (let index = 0; index < vertexCount; index += 1) {
  const x = position.getX(index);
  const y = position.getY(index);
  const u = x / (PAPER_WIDTH / 2);
  const v = y / (PAPER_HEIGHT / 2);
  const i3 = index * 3;

  opened[i3] = x;
  opened[i3 + 1] = y;
  opened[i3 + 2] = openedRelief(x, y);

  // Preserve the sheet's angular character while packing it into an irregular
  // crumple. Quantised ridges create long facets and pointed d-cone-like peaks.
  const foldA = triangleWave(u * 3.55 + v * 1.82 + 0.17);
  const foldB = triangleWave(v * 4.1 - u * 1.47 - 0.36);
  const foldC = triangleWave((u + v) * 4.65 + 0.22);
  const azimuth = u * Math.PI * 2.05 + v * 1.34 + foldB * 0.43;
  const latitude = v * Math.PI * 0.78 + foldA * 0.3 - foldC * 0.08;
  const radius = 0.66 + foldA * 0.11 + foldB * 0.085 + foldC * 0.065;
  const cosLatitude = Math.cos(latitude);

  crumpled[i3] = radius * cosLatitude * Math.cos(azimuth) + foldB * 0.09 - 0.04;
  crumpled[i3 + 1] = radius * Math.sin(latitude) * 0.91 + foldA * 0.075;
  crumpled[i3 + 2] = radius * cosLatitude * Math.sin(azimuth) + foldC * 0.105;
}

const texture = await new Promise((resolve, reject) => {
  new THREE.TextureLoader().load("./assets/paper-pattern.png", resolve, undefined, reject);
});
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;

// Use the supplied image directly. No white wash, transparency, desaturation,
// contrast reduction, crop, or redraw is applied to the final sheet.
const material = new THREE.MeshStandardMaterial({
  map: texture,
  color: 0xffffff,
  roughness: 0.94,
  metalness: 0,
  side: THREE.DoubleSide,
  flatShading: true
});

const paper = new THREE.Mesh(geometry, material);
scene.add(paper);

const POSE_COUNT = 13;
const poses = Array.from({ length: POSE_COUNT }, () => new Float32Array(vertexCount * 3));

function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// Pre-bake a short sequence of held poses. Real stop-motion paper does not
// continuously melt between a ball and a rectangle: facets pop open, pause,
// then another group releases.
for (let poseIndex = 0; poseIndex < POSE_COUNT; poseIndex += 1) {
  const t = poseIndex / (POSE_COUNT - 1);
  const release = smootherstep(t);
  const snap = Math.sin(t * Math.PI);
  const pose = poses[poseIndex];

  for (let index = 0; index < vertexCount; index += 1) {
    const i3 = index * 3;
    const x = opened[i3];
    const y = opened[i3 + 1];
    const u = x / (PAPER_WIDTH / 2);
    const v = y / (PAPER_HEIGHT / 2);
    const sector = triangleWave(u * 2.1 - v * 1.62 + poseIndex * 0.13);
    const hinge = triangleWave(u * 3.05 + v * 2.46 - poseIndex * 0.18);
    const middleKick = snap * (1 - release) * 0.2;

    pose[i3] = THREE.MathUtils.lerp(crumpled[i3], opened[i3], release)
      + sector * middleKick * (0.8 + Math.abs(v) * 0.35);
    pose[i3 + 1] = THREE.MathUtils.lerp(crumpled[i3 + 1], opened[i3 + 1], release)
      + hinge * middleKick * 0.72;
    pose[i3 + 2] = THREE.MathUtils.lerp(crumpled[i3 + 2], opened[i3 + 2], release)
      + (sector * 0.55 + hinge * 0.35) * snap * (1 - t) * 0.34;
  }
}

let progress = 0;
let target = 0;
let transitionFrom = 0;
let transitionStart = 0;
let transitionActive = false;
let activePose = -1;
let pointerX = 0;
let pointerY = 0;

function applyPose(poseIndex) {
  if (poseIndex === activePose) return;
  activePose = poseIndex;
  const pose = poses[poseIndex];
  for (let index = 0; index < vertexCount; index += 1) {
    const i3 = index * 3;
    position.setXYZ(index, pose[i3], pose[i3 + 1], pose[i3 + 2]);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function updateComposition(amount) {
  const release = smootherstep(amount);
  const poseIndex = Math.round(release * (POSE_COUNT - 1));
  applyPose(poseIndex);

  // Each held pose gets a tiny, deterministic stop-motion registration error.
  const jitter = Math.sin(poseIndex * 91.37) * (1 - release);
  paper.rotation.x = THREE.MathUtils.lerp(-0.28, -0.025 + pointerY * 0.025, release) + jitter * 0.009;
  paper.rotation.y = THREE.MathUtils.lerp(0.47, pointerX * 0.045, release) - jitter * 0.012;
  paper.rotation.z = THREE.MathUtils.lerp(-0.19, -0.012, release) + jitter * 0.008;
  const scale = THREE.MathUtils.lerp(1.33, 1, release);
  paper.scale.setScalar(scale);
}

function resize() {
  const width = canvasWrap.clientWidth;
  const height = canvasWrap.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate(now) {
  if (transitionActive) {
    const duration = reduceMotion ? 1 : 1180;
    const elapsed = THREE.MathUtils.clamp((now - transitionStart) / duration, 0, 1);
    const travel = smootherstep(elapsed);
    progress = THREE.MathUtils.lerp(transitionFrom, target, travel);
    if (elapsed >= 1) {
      progress = target;
      transitionActive = false;
    }
  }

  updateComposition(progress);
  keyLight.position.x = -4.2 + pointerX * 1.2;
  keyLight.position.y = 5.2 - pointerY * 0.8;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

control.addEventListener("click", () => {
  transitionFrom = progress;
  target = target > 0.5 ? 0 : 1;
  transitionStart = performance.now();
  transitionActive = true;
  const isOpen = target === 1;
  control.classList.toggle("is-open", isOpen);
  control.setAttribute("aria-pressed", String(isOpen));
  control.setAttribute("aria-label", isOpen ? "收拢纸张" : "展开纸团");
  hint.textContent = isOpen ? "CLICK TO CRUMPLE" : "CLICK TO UNFOLD";
});

control.addEventListener("pointermove", (event) => {
  const bounds = control.getBoundingClientRect();
  pointerX = (event.clientX - bounds.left) / bounds.width * 2 - 1;
  pointerY = (event.clientY - bounds.top) / bounds.height * 2 - 1;
});
control.addEventListener("pointerleave", () => {
  pointerX = 0;
  pointerY = 0;
});

window.addEventListener("resize", resize);
resize();
updateComposition(0);
requestAnimationFrame(animate);
