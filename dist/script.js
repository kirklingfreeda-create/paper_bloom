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

scene.add(new THREE.HemisphereLight(0xfffbef, 0x46525a, 0.46));
const keyLight = new THREE.DirectionalLight(0xffefd0, 3.8);
keyLight.position.set(-5.4, 6.2, 7.2);
scene.add(keyLight);
const sideLight = new THREE.DirectionalLight(0x9dbad0, 0.22);
sideLight.position.set(4.8, -1.8, 4.4);
scene.add(sideLight);
const edgeLight = new THREE.DirectionalLight(0xffffff, 0.14);
edgeLight.position.set(0.5, 1.2, -5);
scene.add(edgeLight);

// One indexed Delaunay sheet. Random Voronoi nodes replace the old uniform
// grid, while shared indices guarantee that every fold remains connected.
const PAPER_WIDTH = 3.18;
const PAPER_HEIGHT = 4.24;
const random = (() => {
  let seed = 0x51f2a9d3;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
})();

function hashNoise(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function makePaperNodes() {
  const nodes = [];
  const add = (x, y, boundary = false) => nodes.push({ x, y, boundary });
  const halfW = PAPER_WIDTH / 2;
  const halfH = PAPER_HEIGHT / 2;
  const edgeColumns = 23;
  const edgeRows = 31;

  add(-halfW, -halfH, true);
  add(halfW, -halfH, true);
  add(halfW, halfH, true);
  add(-halfW, halfH, true);
  for (let i = 1; i < edgeColumns; i += 1) {
    const x = THREE.MathUtils.lerp(-halfW, halfW, i / edgeColumns);
    add(x, -halfH, true);
    add(x, halfH, true);
  }
  for (let i = 1; i < edgeRows; i += 1) {
    const y = THREE.MathUtils.lerp(-halfH, halfH, i / edgeRows);
    add(-halfW, y, true);
    add(halfW, y, true);
  }

  // Poisson-like rejection keeps the random cells readable and prevents
  // clusters of tiny, game-like triangles.
  let attempts = 0;
  while (nodes.length < 296 && attempts < 9000) {
    attempts += 1;
    const x = THREE.MathUtils.lerp(-halfW + 0.08, halfW - 0.08, random());
    const y = THREE.MathUtils.lerp(-halfH + 0.08, halfH - 0.08, random());
    const clear = nodes.every((node) => Math.hypot(node.x - x, node.y - y) > 0.102);
    if (clear) add(x, y);
  }
  return nodes;
}

function circumcircle(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return { x: 0, y: 0, radius2: -1 };
  const aa = a.x * a.x + a.y * a.y;
  const bb = b.x * b.x + b.y * b.y;
  const cc = c.x * c.x + c.y * c.y;
  const x = (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d;
  const y = (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d;
  return { x, y, radius2: (x - a.x) ** 2 + (y - a.y) ** 2 };
}

function makeTriangle(a, b, c, nodes) {
  const area = (nodes[b].x - nodes[a].x) * (nodes[c].y - nodes[a].y)
    - (nodes[b].y - nodes[a].y) * (nodes[c].x - nodes[a].x);
  const triangle = area < 0 ? { a, b: c, c: b } : { a, b, c };
  triangle.circle = circumcircle(nodes[triangle.a], nodes[triangle.b], nodes[triangle.c]);
  return triangle;
}

function delaunay(inputNodes) {
  const nodes = inputNodes.slice();
  const span = Math.max(PAPER_WIDTH, PAPER_HEIGHT) * 8;
  const superStart = nodes.length;
  nodes.push(
    { x: -span, y: -span },
    { x: span, y: -span },
    { x: 0, y: span }
  );
  let triangles = [makeTriangle(superStart, superStart + 1, superStart + 2, nodes)];

  for (let pointIndex = 0; pointIndex < inputNodes.length; pointIndex += 1) {
    const point = nodes[pointIndex];
    const bad = triangles.filter((triangle) => {
      if (triangle.circle.radius2 < 0) return false;
      const dx = point.x - triangle.circle.x;
      const dy = point.y - triangle.circle.y;
      return dx * dx + dy * dy <= triangle.circle.radius2 + 1e-8;
    });
    const badSet = new Set(bad);
    const polygon = new Map();
    const addEdge = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const existing = polygon.get(key);
      if (existing) existing.count += 1;
      else polygon.set(key, { a, b, count: 1 });
    };
    bad.forEach((triangle) => {
      addEdge(triangle.a, triangle.b);
      addEdge(triangle.b, triangle.c);
      addEdge(triangle.c, triangle.a);
    });
    triangles = triangles.filter((triangle) => !badSet.has(triangle));
    polygon.forEach((edge) => {
      if (edge.count === 1) triangles.push(makeTriangle(edge.a, edge.b, pointIndex, nodes));
    });
  }

  return triangles.filter((triangle) => (
    triangle.a < superStart && triangle.b < superStart && triangle.c < superStart
  ));
}

const nodes = makePaperNodes();
const triangles = delaunay(nodes);
const indexArray = [];
const uniqueEdges = new Map();
triangles.forEach((triangle) => {
  indexArray.push(triangle.a, triangle.b, triangle.c);
  [[triangle.a, triangle.b], [triangle.b, triangle.c], [triangle.c, triangle.a]].forEach(([a, b]) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!uniqueEdges.has(key)) uniqueEdges.set(key, { a: Math.min(a, b), b: Math.max(a, b) });
  });
});

// A restrained subset of actual Delaunay edges becomes persistent crease
// memory. These lines cannot cross because they belong to the triangulation.
const creaseEdges = [...uniqueEdges.values()]
  .filter((edge) => {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    return !a.boundary && !b.boundary && length > 0.19 && length < 0.62;
  })
  .sort((left, right) => hashNoise(left.a, left.b) - hashNoise(right.a, right.b))
  .slice(0, 18)
  .map((edge, index) => ({
    ...edge,
    amplitude: (0.026 + Math.abs(hashNoise(edge.a + 7, edge.b + 13)) * 0.026)
      * (index % 2 ? -1 : 1)
  }));

function openedRelief(x, y) {
  let z = 0;
  creaseEdges.forEach((edge) => {
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length2 = ex * ex + ey * ey;
    const length = Math.sqrt(length2);
    const along = ((x - a.x) * ex + (y - a.y) * ey) / length2;
    if (along <= -0.12 || along >= 1.12) return;
    const signedDistance = ((x - a.x) * ey - (y - a.y) * ex) / length;
    const alongEnvelope = Math.pow(Math.max(0, Math.sin(Math.PI * THREE.MathUtils.clamp(along, 0, 1))), 0.55);
    const side = Math.sign(signedDistance) || 1;
    const wedge = side * Math.min(Math.abs(signedDistance) / 0.14, 1);
    z += wedge * Math.exp(-Math.abs(signedDistance) / 0.24) * alongEnvelope * edge.amplitude;
  });
  return z;
}

const geometry = new THREE.BufferGeometry();
const vertexCount = nodes.length;
const opened = new Float32Array(vertexCount * 3);
const crumpled = new Float32Array(vertexCount * 3);
const uvs = new Float32Array(vertexCount * 2);

nodes.forEach((node, index) => {
  const u = node.x / PAPER_WIDTH + 0.5;
  const v = node.y / PAPER_HEIGHT + 0.5;
  const i3 = index * 3;
  const i2 = index * 2;
  opened[i3] = node.x;
  opened[i3 + 1] = node.y;
  opened[i3 + 2] = openedRelief(node.x, node.y);
  uvs[i2] = u;
  uvs[i2 + 1] = v;

  const foldA = triangleWave(u * 4.12 + v * 2.23 + 0.17);
  const foldB = triangleWave(v * 4.74 - u * 1.91 - 0.36);
  const foldC = triangleWave((u + v) * 5.28 + 0.22);
  const randomKick = hashNoise(index + 3, index * 0.37 + 11);
  const edgeDamping = node.boundary ? 0.3 : 1;
  // Radial compression: the centre stays on the visible front while the
  // perimeter is pressed around toward the rear. This avoids a latitude seam
  // and reads as a sheet being compacted in several directions.
  const centredU = (u - 0.5) * 2;
  const centredV = (v - 0.5) * 2;
  const radial = Math.min(Math.hypot(centredU, centredV), 1);
  const azimuth = Math.atan2(centredV, centredU)
    + (foldB * 0.23 + randomKick * 0.075) * edgeDamping;
  const polar = THREE.MathUtils.clamp(
    radial * Math.PI * 0.92 + (foldA * 0.13 - foldC * 0.045) * edgeDamping,
    0,
    Math.PI * 0.96
  );
  const radiusNoise = node.boundary ? 0.58 : 1;
  const radius = 0.68 - (node.boundary ? 0.06 : 0)
    + (foldA * 0.095 + foldB * 0.072 + foldC * 0.052 + randomKick * 0.048) * radiusNoise;
  const sinPolar = Math.sin(polar);
  const shellX = radius * sinPolar * Math.cos(azimuth);
  const shellY = radius * sinPolar * Math.sin(azimuth);
  const shellZ = radius * Math.cos(polar);
  const compressionBand = 0.88 + (triangleWave(v * 3.1 + foldC * 0.2) + 1) * 0.045;
  const lateralShift = Math.sin((v - 0.5) * Math.PI * 3.2) * 0.055;
  const facetKickX = hashNoise(index + 41, index * 0.71 + 5) * 0.026 * edgeDamping;
  const facetKickY = hashNoise(index + 83, index * 0.43 + 17) * 0.026 * edgeDamping;
  const facetKickZ = hashNoise(index + 127, index * 0.59 + 29) * 0.085 * edgeDamping;
  // Uneven axial compression creates a tall, lopsided paper bundle rather
  // than a uniformly imploded sphere.
  crumpled[i3] = shellX * compressionBand * 0.9 + foldB * 0.065 + lateralShift + facetKickX - 0.025;
  crumpled[i3 + 1] = shellY * 1.06 + foldA * 0.055 + facetKickY - 0.025;
  crumpled[i3 + 2] = shellZ * compressionBand * 0.74 + foldC * 0.072 + facetKickZ;
});

geometry.setAttribute("position", new THREE.BufferAttribute(crumpled.slice(), 3));
geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
geometry.setIndex(indexArray);
geometry.computeVertexNormals();
const position = geometry.attributes.position;

function triangleWave(value) {
  const wrapped = ((value % 2) + 2) % 2;
  return 1 - 2 * Math.abs(wrapped - 1);
}

const texture = await new Promise((resolve, reject) => {
  new THREE.TextureLoader().load("./assets/paper-pattern.png", resolve, undefined, reject);
});
texture.colorSpace = THREE.SRGBColorSpace;
texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
texture.wrapS = THREE.ClampToEdgeWrapping;
texture.wrapT = THREE.ClampToEdgeWrapping;

function segmentDistance(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const length2 = ex * ex + ey * ey;
  const t = THREE.MathUtils.clamp(((px - ax) * ex + (py - ay) * ey) / length2, 0, 1);
  return Math.hypot(px - (ax + ex * t), py - (ay + ey * t));
}

function createCreaseNormalMap() {
  const size = 384;
  const height = new Float32Array(size * size);
  const creaseMask = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1);
      const v = y / (size - 1);
      let value = 0.5
        + Math.sin(x * 0.19 + Math.sin(y * 0.047) * 2.1) * 0.0024
        + Math.sin(y * 0.23 + x * 0.031) * 0.0018;
      creaseEdges.forEach((edge) => {
        const a = nodes[edge.a];
        const b = nodes[edge.b];
        const ax = a.x / PAPER_WIDTH + 0.5;
        const ay = a.y / PAPER_HEIGHT + 0.5;
        const bx = b.x / PAPER_WIDTH + 0.5;
        const by = b.y / PAPER_HEIGHT + 0.5;
        const distance = segmentDistance(u, v, ax, ay, bx, by);
        const ridge = Math.exp(-Math.pow(distance / 0.0095, 2));
        value += ridge * 0.095;
        creaseMask[y * size + x] = Math.max(creaseMask[y * size + x], ridge);
      });
      height[y * size + x] = value;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const image = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = height[y * size + Math.max(0, x - 1)];
      const right = height[y * size + Math.min(size - 1, x + 1)];
      const down = height[Math.max(0, y - 1) * size + x];
      const up = height[Math.min(size - 1, y + 1) * size + x];
      let nx = -(right - left) * 6.4;
      let ny = -(up - down) * 6.4;
      let nz = 1;
      const inverseLength = 1 / Math.hypot(nx, ny, nz);
      nx *= inverseLength;
      ny *= inverseLength;
      nz *= inverseLength;
      const offset = (y * size + x) * 4;
      image.data[offset] = Math.round((nx * 0.5 + 0.5) * 255);
      image.data[offset + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      image.data[offset + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const normalMap = new THREE.CanvasTexture(canvas);
  normalMap.wrapS = THREE.ClampToEdgeWrapping;
  normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = size;
  maskCanvas.height = size;
  const maskContext = maskCanvas.getContext("2d");
  const maskImage = maskContext.createImageData(size, size);
  for (let index = 0; index < creaseMask.length; index += 1) {
    const value = Math.round(creaseMask[index] * 255);
    const offset = index * 4;
    maskImage.data[offset] = value;
    maskImage.data[offset + 1] = value;
    maskImage.data[offset + 2] = value;
    maskImage.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskImage, 0, 0);
  const shadeMap = new THREE.CanvasTexture(maskCanvas);
  shadeMap.wrapS = THREE.ClampToEdgeWrapping;
  shadeMap.wrapT = THREE.ClampToEdgeWrapping;
  shadeMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return { normalMap, shadeMap };
}

const creaseMaps = createCreaseNormalMap();

// Use the supplied image directly. No white wash, transparency, desaturation,
// contrast reduction, crop, or redraw is applied to the final sheet.
const material = new THREE.MeshStandardMaterial({
  map: texture,
  normalMap: creaseMaps.normalMap,
  normalScale: new THREE.Vector2(0.68, 0.68),
  color: 0xffffff,
  roughness: 0.76,
  metalness: 0,
  side: THREE.DoubleSide,
  // Face normals are intentionally not averaged. Every triangle therefore
  // reads as a rigid paper plane while remaining part of this one mesh.
  flatShading: true
});
// The supplied image is printed on the front only. A warm, faint show-through
// on back-facing folds prevents the texture from looking shrink-wrapped.
material.onBeforeCompile = (shader) => {
  shader.uniforms.creaseShadeMap = { value: creaseMaps.shadeMap };
  shader.fragmentShader = shader.fragmentShader.replace(
    "uniform vec3 diffuse;",
    "uniform vec3 diffuse;\nuniform sampler2D creaseShadeMap;"
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    `#include <map_fragment>\nfloat creaseShade = texture2D(creaseShadeMap, vMapUv).r;\ndiffuseColor.rgb *= mix(1.0, 0.84, creaseShade);\nif (!gl_FrontFacing) {\n  diffuseColor.rgb = mix(vec3(0.925, 0.905, 0.84), diffuseColor.rgb, 0.045);\n}`
  );
};
material.customProgramCacheKey = () => "paper-front-print-back-fiber-v2";

const paper = new THREE.Mesh(geometry, material);
scene.add(paper);

function smootherstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function updateGeometry(amount) {
  for (let index = 0; index < vertexCount; index += 1) {
    const i3 = index * 3;
    const x = opened[i3];
    const y = opened[i3 + 1];
    const u = x / (PAPER_WIDTH / 2);
    const v = y / (PAPER_HEIGHT / 2);
    const edge = Math.pow(Math.max(Math.abs(u), Math.abs(v)), 0.72);
    const releaseDelay = 0.025 + (1 - edge) * 0.27
      + (triangleWave(u * 2.4 + v * 1.7) + 1) * 0.014;
    const localRelease = smootherstep(THREE.MathUtils.clamp(
      (amount - releaseDelay) / Math.max(1 - releaseDelay, 0.001), 0, 1
    ));
    const openingPulse = Math.sin(localRelease * Math.PI);
    const remaining = 1 - localRelease;
    const sector = triangleWave(u * 2.08 - v * 1.58 + amount * 0.42);
    const hinge = triangleWave(u * 2.92 + v * 2.32 - amount * 0.36);
    const middleKick = openingPulse * remaining;

    position.setXYZ(index,
      THREE.MathUtils.lerp(crumpled[i3], opened[i3], localRelease)
        + sector * middleKick * (0.18 + edge * 0.1),
      THREE.MathUtils.lerp(crumpled[i3 + 1], opened[i3 + 1], localRelease)
        + hinge * middleKick * (0.13 + edge * 0.075),
      THREE.MathUtils.lerp(crumpled[i3 + 2], opened[i3 + 2], localRelease)
        + (sector * 0.6 + hinge * 0.4) * openingPulse * remaining * (0.31 + edge * 0.12)
    );
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

let progress = 0;
let target = 0;
let transitionFrom = 0;
let transitionStart = 0;
let transitionActive = false;
let pointerX = 0;
let pointerY = 0;

function updateComposition(amount) {
  const release = smootherstep(amount);
  updateGeometry(release);

  paper.rotation.x = THREE.MathUtils.lerp(-0.18, -0.025 + pointerY * 0.025, release);
  paper.rotation.y = THREE.MathUtils.lerp(0.36, pointerX * 0.045, release);
  paper.rotation.z = THREE.MathUtils.lerp(-0.1, -0.012, release);
  // The first part of the motion releases axial compression; the second
  // settles the expanded surface into its rectangular proportions.
  const decompression = smootherstep(THREE.MathUtils.clamp(release / 0.42, 0, 1));
  const flattening = smootherstep(THREE.MathUtils.clamp((release - 0.18) / 0.82, 0, 1));
  const compressedX = THREE.MathUtils.lerp(1.3, 1.12, decompression);
  const compressedY = THREE.MathUtils.lerp(1.28, 1.14, decompression);
  const compressedZ = THREE.MathUtils.lerp(0.78, 1.08, decompression);
  paper.scale.set(
    THREE.MathUtils.lerp(compressedX, 1, flattening),
    THREE.MathUtils.lerp(compressedY, 1, flattening),
    THREE.MathUtils.lerp(compressedZ, 1, flattening)
  );
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
    const duration = reduceMotion ? 1 : 1350;
    const elapsed = THREE.MathUtils.clamp((now - transitionStart) / duration, 0, 1);
    const travel = smootherstep(elapsed);
    progress = THREE.MathUtils.lerp(transitionFrom, target, travel);
    if (elapsed >= 1) {
      progress = target;
      transitionActive = false;
    }
  }

  updateComposition(progress);
  keyLight.position.x = -5.4 + pointerX * 0.8;
  keyLight.position.y = 6.2 - pointerY * 0.55;
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
