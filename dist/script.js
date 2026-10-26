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

scene.add(new THREE.HemisphereLight(0xfffbef, 0x60717e, 1.35));
const keyLight = new THREE.DirectionalLight(0xfff5db, 2.65);
keyLight.position.set(-3.6, 4.8, 6.5);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xb9d0da, 1.4);
rimLight.position.set(4.5, -2, 4);
scene.add(rimLight);

// One continuous sheet. A moderately coarse triangulation is intentional:
// flat face normals create the broad, sharp planes of dry writing paper.
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
  const sharpCreases = ridge(x,y,.41,-.22,.075,.038) + ridge(x,y,2.22,.35,.072,.027) +
    ridge(x,y,1.42,-.63,.064,.021) + ridge(x,y,2.76,-.84,.066,.017);
  const softMemory = Math.sin(x*3.2+y*2.1)*Math.sin(y*2.8-x*1.7)*.008;
  const sideCurl = Math.pow(Math.abs(x)/1.59,10)*Math.sin(y*1.34+.45)*.033;
  const cornerCurl = Math.pow(Math.max(0,(y-1.55)/.57),3)*Math.sin(x*2.4)*.027;
  return sharpCreases + softMemory + sideCurl + cornerCurl;
}

function triangleWave(value) {
  const wrapped = ((value % 2) + 2) % 2;
  return 1 - 2 * Math.abs(wrapped - 1);
}

for (let index = 0; index < vertexCount; index += 1) {
  const x = position.getX(index), y = position.getY(index), u = x / 1.59, v = y / 2.12, i3 = index * 3;
  flat[i3] = x; flat[i3+1] = y; flat[i3+2] = paperCreases(x,y);
  const broadFoldA = triangleWave(u*3.7 + v*2.15);
  const broadFoldB = triangleWave(v*4.2 - u*1.65 + .43);
  const phi = u*Math.PI*2.28 + v*1.55 + broadFoldB*.34 + Math.sin(v*5.4)*.18;
  const latitude = v*Math.PI*.86 + broadFoldA*.22 + Math.sin(u*6.1)*.1;
  const crush = broadFoldA*.105 + broadFoldB*.085 +
    Math.sin(u*11.3+v*6.7)*.06 + Math.cos((u-v)*9.2)*.04;
  const radius = .69 + crush + Math.abs(Math.sin(u*7.2)*Math.cos(v*6.8))*.085;
  const cosLatitude = Math.cos(latitude);
  crumpled[i3] = radius*cosLatitude*Math.cos(phi) + broadFoldB*.075;
  crumpled[i3+1] = radius*Math.sin(latitude)*.92 + broadFoldA*.07;
  crumpled[i3+2] = radius*cosLatitude*Math.sin(phi) + triangleWave((u-v)*4.6)*.07;
  position.setXYZ(index,crumpled[i3],crumpled[i3+1],crumpled[i3+2]);
}
geometry.computeVertexNormals();

function makePaperBumpTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext("2d");
  const image = context.createImageData(256,256);
  let seed = 4817;
  const random = () => ((seed = (seed*1664525+1013904223)>>>0) / 4294967296);
  for (let i=0;i<image.data.length;i+=4) {
    const grain = 118 + random()*30 + Math.sin((i/4%256)*.7)*3;
    image.data[i]=grain; image.data[i+1]=grain; image.data[i+2]=grain; image.data[i+3]=255;
  }
  context.putImageData(image,0,0);
  context.globalAlpha=.2; context.strokeStyle="#f2f2f2"; context.lineWidth=.55;
  for (let i=0;i<240;i+=1) {
    const x=random()*256, y=random()*256, length=4+random()*22;
    context.beginPath(); context.moveTo(x,y); context.quadraticCurveTo(x+length*.45,y+(random()-.5)*4,x+length,y+(random()-.5)*7); context.stroke();
  }
  const result = new THREE.CanvasTexture(canvas);
  result.wrapS=THREE.RepeatWrapping; result.wrapT=THREE.RepeatWrapping; result.repeat.set(2.8,3.7);
  return result;
}

const bumpTexture = makePaperBumpTexture();
const material = new THREE.MeshPhysicalMaterial({
  color:0xfffcf5, roughness:.91, metalness:0, clearcoat:0,
  bumpMap:bumpTexture, bumpScale:.045, side:THREE.DoubleSide, flatShading:true
});

new THREE.TextureLoader().load("./assets/paper-pattern.png", source => {
  const canvas=document.createElement("canvas"); canvas.width=512; canvas.height=682;
  const context=canvas.getContext("2d");
  context.fillStyle="#fbfaf6"; context.fillRect(0,0,canvas.width,canvas.height);
  context.globalAlpha=.3; context.filter="saturate(.72) contrast(.88)";
  context.drawImage(source.image,0,0,canvas.width,canvas.height);
  context.filter="none"; context.globalAlpha=1;
  const printTexture=new THREE.CanvasTexture(canvas);
  printTexture.colorSpace=THREE.SRGBColorSpace;
  printTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  material.map=printTexture; material.needsUpdate=true;
});
const paper = new THREE.Mesh(geometry, material);
paper.rotation.set(-.22,.42,-.17);
scene.add(paper);

// Always enter as a paper ball. Reduced-motion users still get the same
// starting composition; only the transition becomes immediate after a click.
let progress = 0, target = 0, velocity = 0;
let pointerX = 0, pointerY = 0, previousTime = performance.now(), normalFrame = 0;
let paperFaceted = true;

function smootherstep(value) { const t = THREE.MathUtils.clamp(value,0,1); return t*t*t*(t*(t*6-15)+10); }
function updateGeometry(amount) {
  const eased = smootherstep(amount);
  const shouldBeFaceted = amount < .64;
  if (shouldBeFaceted !== paperFaceted) {
    paperFaceted = shouldBeFaceted;
    material.flatShading = paperFaceted;
    material.needsUpdate = true;
  }
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
  const paperScale=THREE.MathUtils.lerp(1.34,1,eased);
  paper.scale.setScalar(paperScale);
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
