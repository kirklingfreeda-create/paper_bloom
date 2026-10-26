const control = document.querySelector(".paper-interaction");
const piecesRoot = document.querySelector(".pieces");

const columns = 8;
const rows = 10;
const sheetWidth = 736;
const sheetHeight = 981;
const cellWidth = 100 / columns;
const cellHeight = 100 / rows;

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const random = seededRandom(2077);

for (let row = 0; row < rows; row += 1) {
  for (let column = 0; column < columns; column += 1) {
    const piece = document.createElement("span");
    const centerX = (column + 0.5) / columns;
    const centerY = (row + 0.5) / rows;
    const pull = 0.88 + random() * 0.14;
    const tx = (0.5 - centerX) * 440 * pull + (random() - 0.5) * 70;
    const ty = (0.48 - centerY) * 590 * pull + (random() - 0.5) * 76;

    piece.className = "piece";
    piece.style.left = `${column * cellWidth}%`;
    piece.style.top = `${row * cellHeight}%`;
    piece.style.width = `${cellWidth + 0.36}%`;
    piece.style.height = `${cellHeight + 0.28}%`;
    piece.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
    piece.style.backgroundPosition = `${columns === 1 ? 0 : (column / (columns - 1)) * 100}% ${rows === 1 ? 0 : (row / (rows - 1)) * 100}%`;
    piece.style.setProperty("--tx", `${tx}px`);
    piece.style.setProperty("--ty", `${ty}px`);
    piece.style.setProperty("--tz", `${36 + random() * 128}px`);
    piece.style.setProperty("--rx", `${-78 + random() * 156}deg`);
    piece.style.setProperty("--ry", `${-84 + random() * 168}deg`);
    piece.style.setProperty("--rz", `${-145 + random() * 290}deg`);
    piece.style.setProperty("--scale", `${0.62 + random() * 0.65}`);
    piece.style.setProperty("--light", `${0.55 + random() * 0.72}`);
    piece.style.setProperty("--duration", `${1.15 + random() * 0.48}s`);
    piece.style.setProperty("--delay", `${(Math.abs(centerX - 0.5) + Math.abs(centerY - 0.5)) * 0.12 + random() * 0.08}s`);
    piecesRoot.appendChild(piece);
  }
}

function togglePaper() {
  const isOpen = control.classList.toggle("is-open");
  control.setAttribute("aria-pressed", String(isOpen));
  control.setAttribute("aria-label", isOpen ? "收拢纸张" : "展开纸团");
}

control.addEventListener("click", togglePaper);
