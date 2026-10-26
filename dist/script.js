import * as THREE from "./vendor/three.module.min.js";

const control = document.querySelector(".paper-interaction");
const canvasWrap = document.querySelector(".canvas-wrap");
const hint = document.querySelector(".hint");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 40);
camera.position.set(0, 0.08, 9.4);

const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasWrap.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xfffbef, 0x60717e, 2.35));
const keyLight = new THREE.DirectionalLight(0xfff5db, 4.5);
keyLight.position.set(-3.6, 4.8, 6.5);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xb9d0da, 2.4);
rimLight.position.set(4.5, -2, 4);
scene.add(rimLight);

const geometry = new THREE.PlaneGeometry(3.18, 4.24, 58, 76);
const position = geometry.attributes.position;
const vertexCount = position.count;
const flat = new Float32Array(vertexCount * 3);
const crumpled = new Float32Array(vertexCount * 3);

function ridge(x, y, angle, offset, width, height) {
  const distance = x * Math.cos(angle) + y * Math.sin(angle) - offset;
  const falloff = Math.exp(-Math.pow(distance / width, 2));
  return Math.sin(distance * 45) * falloff * height;
}

function paperCreases(x, y) {
  const sharpCreases = ridge(x,y,.41,-.22,.09,.07) + ridge(x,y,2.22,.35,.085,.052) +
    ridge(x,y,1.42,-.63,.074,.042) + ridge(x,y,2.76,-.84,.078,.034);
  const softMemory = Math.sin(x*3.2+y*2.1)*Math.sin(y*2.8-x*1.7)*.014;
  const sideCurl = Math.pow(Math.abs(x)/1.59,10)*Math.sin(y*1.34+.45)*.055;
  const cornerCurl = Math.pow(Math.max(0,(y-1.55)/.57),3)*Math.sin(x*2.4)*.045;
  return sharpCreases + softMemory + sideCurl + cornerCurl;
}

for (let index = 0; index < vertexCount; index += 1) {
  const x = position.getX(index), y = position.getY(index), u = x / 1.59, v = y / 2.12, i3 = index * 3;
  flat[i3] = x; flat[i3+1] = y; flat[i3+2] = paperCreases(x,y);
  const phi = u*Math.PI*2.05 + v*1.38 + Math.sin(v*6.2)*.31;
  const latitude = v*Math.PI*.83 + Math.sin(u*7.1)*.2;
  const crush = Math.sin(u*15.3+v*7.7)*.085 + Math.sin(u*5.8-v*16.4)*.06 + Math.cos((u+v)*13.2)*.045;
  const radius = .72 + crush + Math.abs(Math.sin(u*9.4)*Math.cos(v*8.7))*.07;
  const cosLatitude = Math.cos(latitude);
  crumpled[i3] = radius*cosLatitude*Math.cos(phi) + Math.sin(v*18)*.045;
  crumpled[i3+1] = radius*Math.sin(latitude)*.9 + Math.sin(u*13)*.055;
  crumpled[i3+2] = radius*cosLatitude*Math.sin(phi) + Math.cos((u-v)*17)*.055;
  position.setXYZ(index,crumpled[i3],crumpled[i3+1],crumpled[i3+2]);
}
geometry.computeVertexNormals();

const texture = new THREE.TextureLoader().load("./assets/paper-pattern.png", () => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.needsUpdate = true;
});
const material = new THREE.MeshStandardMaterial({ map:texture, roughness:.93, metalness:0, side:THREE.DoubleSide });
const paper = new THREE.Mesh(geometry, material);
paper.rotation.set(-.22,.42,-.17);
scene.add(paper);

let progress = reduceMotion ? 1 : 0, target = progress, velocity = 0;
let pointerX = 0, pointerY = 0, previousTime = performance.now(), normalFrame = 0;

function smootherstep(value) { const t = THREE.MathUtils.clamp(value,0,1); return t*t*t*(t*(t*6-15)+10); }
function updateGeometry(amount) {
  const eased = smootherstep(amount);
  for (let index=0; index<vertexCount; index+=1) {
    const i3=index*3;
    position.setXYZ(index,
      THREE.MathUtils.lerp(crumpled[i3],flat[i3],eased),
      THREE.MathUtils.lerp(crumpled[i3+1],flat[i3+1],eased),
      THREE.MathUtils.lerp(crumpled[i3+2],flat[i3+2],eased));
  }
  position.needsUpdate=true; normalFrame+=1;
  if (normalFrame%2===0 || amount<.02 || amount>.98) geometry.computeVertexNormals();
  paper.rotation.x=THREE.MathUtils.lerp(-.22,-.035+pointerY*.035,eased);
  paper.rotation.y=THREE.MathUtils.lerp(.42,pointerX*.06,eased);
  paper.rotation.z=THREE.MathUtils.lerp(-.17,-.015,eased);
}
function resize() {
  const width=canvasWrap.clientWidth, height=canvasWrap.clientHeight;
  renderer.setSize(width,height,false); camera.aspect=width/Math.max(height,1); camera.updateProjectionMatrix();
}
function animate(now) {
  const delta=Math.min((now-previousTime)/1000,.033); previousTime=now;
  if (reduceMotion) progress=target;
  else {
    const acceleration=(target-progress)*16.5-velocity*6.1;
    velocity+=acceleration*delta; progress+=velocity*delta;
    if (Math.abs(target-progress)<.0004 && Math.abs(velocity)<.002) { progress=target; velocity=0; }
  }
  updateGeometry(progress);
  keyLight.position.x=-3.6+pointerX*1.5; keyLight.position.y=4.8-pointerY*.9;
  renderer.render(scene,camera); requestAnimationFrame(animate);
}
control.addEventListener("click",()=>{
  target=target>.5?0:1; const isOpen=target===1;
  control.classList.toggle("is-open",isOpen); control.setAttribute("aria-pressed",String(isOpen));
  control.setAttribute("aria-label",isOpen?"收拢纸张":"展开纸团");
  hint.textContent=isOpen?"CLICK TO CRUMPLE":"CLICK TO UNFOLD";
});
control.addEventListener("pointermove",event=>{
  const bounds=control.getBoundingClientRect();
  pointerX=(event.clientX-bounds.left)/bounds.width*2-1; pointerY=(event.clientY-bounds.top)/bounds.height*2-1;
});
control.addEventListener("pointerleave",()=>{pointerX=0;pointerY=0;});
window.addEventListener("resize",resize); resize(); updateGeometry(progress); requestAnimationFrame(animate);
