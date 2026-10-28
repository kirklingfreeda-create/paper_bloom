import * as THREE from "./vendor/three.module.min.js";

const control = document.querySelector(".paper-interaction");
const canvasWrap = document.querySelector(".canvas-wrap");
const hint = document.querySelector(".hint");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
camera.position.set(0, 0, 10.8);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasWrap.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfffcf4, 0x5f707b, 0.64));
const keyLight = new THREE.DirectionalLight(0xfff8e7, 1.88);
keyLight.position.set(-3.7, 4.8, 7.4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc7d9df, 0.74);
rimLight.position.set(4.2, -2.2, 5.2);
scene.add(rimLight);

function makePaperGrain() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  const image = context.createImageData(512, 512);
  let seed = 4817;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = 112 + random() * 35;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = grain;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = 0.18;
  context.strokeStyle = "#f6f4ed";
  context.lineWidth = 0.5;
  for (let i = 0; i < 420; i += 1) {
    const x = random() * 512, y = random() * 512, length = 5 + random() * 24;
    context.beginPath();
    context.moveTo(x, y);
    context.quadraticCurveTo(x + length * 0.5, y + (random() - 0.5) * 5, x + length, y + (random() - 0.5) * 7);
    context.stroke();
  }
  // Four broad, low-contrast pressure lines remain after the sheet opens.
  const creasePaths = [
    [[-20, 105], [170, 205], [535, 82]],
    [[35, 420], [245, 292], [540, 365]],
    [[258, -20], [222, 184], [330, 535]],
    [[-10, 275], [142, 330], [310, 514]],
  ];
  context.globalAlpha = 0.28;
  context.lineCap = "round";
  for (const points of creasePaths) {
    context.beginPath();
    context.moveTo(...points[0]);
    context.quadraticCurveTo(...points[1], ...points[2]);
    context.strokeStyle = "#575757";
    context.lineWidth = 3.2;
    context.stroke();
    context.translate(1.4, 1.4);
    context.strokeStyle = "#d9d9d9";
    context.lineWidth = 2.2;
    context.stroke();
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

const textureCanvas = document.createElement("canvas");
textureCanvas.width = 768;
textureCanvas.height = 1024;
const textureContext = textureCanvas.getContext("2d");
const paperTexture = new THREE.CanvasTexture(textureCanvas);
paperTexture.colorSpace = THREE.SRGBColorSpace;
paperTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
let patternImage = null;
let copy = { title: "", body: "" };

function redrawPaperTexture() {
  const ctx = textureContext;
  ctx.clearRect(0, 0, textureCanvas.width, textureCanvas.height);
  ctx.fillStyle = "#faf8f1";
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);
  if (patternImage) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.filter = "saturate(.72) contrast(.9) brightness(1.08)";
    ctx.drawImage(patternImage, 0, 0, textureCanvas.width, textureCanvas.height);
    ctx.restore();
  }
  // Very faint paired strokes read as compressed paper fibres once opened;
  // they stay subtle enough that the printed pattern remains the hero.
  const printedCreases = [
    [[-30, 205], [265, 410], [805, 175]],
    [[-20, 825], [360, 565], [800, 735]],
    [[395, -30], [320, 355], [505, 1055]],
  ];
  ctx.save();
  ctx.lineCap = "round";
  for (const points of printedCreases) {
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    ctx.quadraticCurveTo(...points[1], ...points[2]);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#344650";
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.translate(2.5, 2.5);
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = "#fffdf4";
    ctx.lineWidth = 4.2;
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.restore();
  if (copy.title || copy.body) {
    ctx.fillStyle = "rgba(44,55,61,.82)";
    ctx.textAlign = "center";
    ctx.font = "600 48px Georgia, serif";
    ctx.fillText(copy.title, textureCanvas.width / 2, 420);
    ctx.font = "28px Georgia, serif";
    ctx.fillText(copy.body, textureCanvas.width / 2, 475);
  }
  paperTexture.needsUpdate = true;
}
redrawPaperTexture();

const material = new THREE.MeshPhysicalMaterial({
  color: 0xfffdf8, map: paperTexture, bumpMap: makePaperGrain(), bumpScale: 0.085,
  roughness: 0.94, metalness: 0, clearcoat: 0, sheen: 0.12, sheenRoughness: 0.9,
  side: THREE.DoubleSide, flatShading: true, vertexColors: true,
});

new THREE.TextureLoader().load("./assets/paper-pattern.png", texture => {
  patternImage = texture.image;
  redrawPaperTexture();
});

// The fixed UV map makes future text/pattern editing independent of animation.
window.paperBloom = {
  setText(title = "", body = "") { copy = { title, body }; redrawPaperTexture(); },
  setPattern(image) { patternImage = image; redrawPaperTexture(); },
};

async function loadTypedArray(url, Type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}`);
  return new Type(await response.arrayBuffer());
}

let paper = null, geometry = null, cache = null, position = null, colors = null, metadata = null;
let tipCorrection = null;
let neighbors = null;
let progress = 0, target = 0, velocity = 0;
let pointerX = 0, pointerY = 0, previousTime = performance.now(), paperFaceted = true;
const foldedFrame = 10;

async function preparePaper() {
  const metaResponse = await fetch("./assets/paper-cache/paper-cache.json");
  metadata = await metaResponse.json();
  const [frames, indices, uv] = await Promise.all([
    loadTypedArray("./assets/paper-cache/paper-frames.bin", Float32Array),
    loadTypedArray("./assets/paper-cache/paper-index.bin", Uint16Array),
    loadTypedArray("./assets/paper-cache/paper-uv.bin", Float32Array),
  ]);
  cache = frames;
  tipCorrection = null;
  position = new THREE.BufferAttribute(new Float32Array(metadata.vertices * 3), 3);
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", position);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  colors = new THREE.BufferAttribute(new Float32Array(metadata.vertices * 3).fill(1), 3);
  geometry.setAttribute("color", colors);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  neighbors = Array.from({ length: metadata.vertices }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i], b = indices[i + 1], c = indices[i + 2];
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
  }
  paper = new THREE.Mesh(geometry, material);
  scene.add(paper);
  updateGeometry(0, true);
  control.classList.add("is-ready");
}

function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function buildTipCorrection(frames, frameIndex = 0) {
  const correction = new Float32Array(metadata.vertices * 3);
  const frameOffset = frameIndex * metadata.vertices * 3;
  const rotation = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(-0.08, 0.30, -0.14, "XYZ"),
  );
  const inverseRotation = rotation.clone().invert();
  const local = new THREE.Vector3();
  const displayed = new THREE.Vector3();
  const tucked = new THREE.Vector3();

  for (let vertex = 0; vertex < metadata.vertices; vertex += 1) {
    const offset = vertex * 3;
    local.set(frames[frameOffset + offset], frames[frameOffset + offset + 1], frames[frameOffset + offset + 2]);
    displayed.copy(local).applyMatrix4(rotation);

    // Tuck only the narrow lower-right flap seen in the initial presentation
    // angle. Two smooth masks keep the surrounding silhouette untouched.
    const vertical = smootherstep((-0.56 - displayed.y) / 0.30);
    const horizontal = smootherstep((displayed.x + 0.03) / 0.18);
    const strength = vertical * horizontal * 0.68;
    if (strength <= 0) continue;

    tucked.copy(displayed);
    tucked.x = THREE.MathUtils.lerp(displayed.x, 0.06, strength * 0.62);
    tucked.y = THREE.MathUtils.lerp(displayed.y, -0.54, strength);
    tucked.applyMatrix4(inverseRotation).sub(local);
    correction[offset] = tucked.x;
    correction[offset + 1] = tucked.y;
    correction[offset + 2] = tucked.z;
  }
  return correction;
}

function updateGeometry(amount, force = false) {
  if (!paper || !cache) return;
  const eased = smootherstep(amount);
  // The first ten cache frames are a secondary inward squeeze after the paper
  // has already reached its intended ball silhouette. Start playback at that
  // silhouette so crumpling stops there instead of continuing to collapse.
  const frame = foldedFrame + eased * (metadata.frames - 1 - foldedFrame);
  const a = Math.min(Math.floor(frame), metadata.frames - 1);
  const b = Math.min(a + 1, metadata.frames - 1);
  const mix = frame - a, stride = metadata.vertices * 3;
  const output = position.array, startA = a * stride, startB = b * stride;
  for (let i = 0; i < stride; i += 1) output[i] = cache[startA + i] * (1 - mix) + cache[startB + i] * mix;
  const tipFade = 1 - smootherstep(amount / 0.32);
  if (tipCorrection && tipFade > 0) {
    for (let i = 0; i < stride; i += 1) output[i] += tipCorrection[i] * tipFade;
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  // Concave vertices receive a soft baked occlusion term.  Unlike a painted
  // triangle pattern this follows the actual moving surface and remains as a
  // restrained crease shadow after the sheet has opened.
  const shade = colors.array;
  for (let vertex = 0; vertex < metadata.vertices; vertex += 1) {
    let neighborZ = 0;
    for (const other of neighbors[vertex]) neighborZ += output[other * 3 + 2];
    neighborZ /= Math.max(neighbors[vertex].size, 1);
    const z = output[vertex * 3 + 2];
    const valley = Math.max(0, neighborZ - z);
    const ridge = Math.max(0, z - neighborZ);
    const valleyStrength = THREE.MathUtils.lerp(5.0, 2.8, eased);
    const value = THREE.MathUtils.clamp(1 - valley * valleyStrength + ridge * 0.12, 0.50, 1.02);
    const facetId = Math.floor(vertex / 3);
    const facetNoise = Math.sin((facetId + 1) * 12.9898) * 43758.5453;
    const facetRandom = facetNoise - Math.floor(facetNoise);
    const facetTone = metadata.microfacets ? 0.93 + facetRandom * 0.11 : 1;
    const tone = value * THREE.MathUtils.lerp(facetTone, 1, smootherstep(amount / 0.72));
    shade[vertex * 3] = tone * 0.98;
    shade[vertex * 3 + 1] = tone * 0.995;
    shade[vertex * 3 + 2] = tone;
  }
  colors.needsUpdate = true;

  const shouldBeFaceted = amount < 0.72;
  if (force || shouldBeFaceted !== paperFaceted) {
    paperFaceted = shouldBeFaceted;
    material.flatShading = paperFaceted;
    material.needsUpdate = true;
  }
  paper.rotation.x = THREE.MathUtils.lerp(-0.08, pointerY * 0.025, eased);
  paper.rotation.y = THREE.MathUtils.lerp(0.30, pointerX * 0.045, eased);
  paper.rotation.z = THREE.MathUtils.lerp(-0.14, -0.015, eased);
  paper.scale.setScalar(THREE.MathUtils.lerp(0.60, 1, eased));
}

function resize() {
  const width = canvasWrap.clientWidth, height = canvasWrap.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate(now) {
  const delta = Math.min((now - previousTime) / 1000, 0.033);
  previousTime = now;
  if (reduceMotion) progress = target;
  else {
    const acceleration = (target - progress) * 3.6 - velocity * 3.8;
    velocity += acceleration * delta;
    progress += velocity * delta;
    if (Math.abs(target - progress) < 0.00035 && Math.abs(velocity) < 0.002) { progress = target; velocity = 0; }
  }
  updateGeometry(THREE.MathUtils.clamp(progress, 0, 1));
  const lightOpen = smootherstep(THREE.MathUtils.clamp(progress, 0, 1));
  keyLight.position.x = -3.7 + pointerX * 1.2;
  keyLight.position.y = 4.8 - pointerY * 0.8;
  keyLight.position.z = THREE.MathUtils.lerp(3.0, 7.4, lightOpen);
  keyLight.intensity = THREE.MathUtils.lerp(1.62, 1.88, lightOpen);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

control.addEventListener("click", () => {
  if (!paper) return;
  target = target > 0.5 ? 0 : 1;
  const isOpen = target === 1;
  control.classList.toggle("is-open", isOpen);
  control.setAttribute("aria-pressed", String(isOpen));
  control.setAttribute("aria-label", isOpen ? "收拢纸张" : "展开纸团");
  hint.textContent = isOpen ? "CLICK TO CRUMPLE" : "CLICK TO UNFOLD";
});
control.addEventListener("pointermove", event => {
  const bounds = control.getBoundingClientRect();
  pointerX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointerY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
});
control.addEventListener("pointerleave", () => { pointerX = 0; pointerY = 0; });
window.addEventListener("resize", resize);

resize();
preparePaper().catch(error => { console.error(error); hint.textContent = "PAPER FAILED TO LOAD"; });
requestAnimationFrame(animate);
