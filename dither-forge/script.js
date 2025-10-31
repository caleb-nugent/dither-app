/* Dither Forge — zero-dependency image dithering
 * Algorithms: Threshold, Ordered Bayer (4x4, 8x8), Floyd–Steinberg, Atkinson, Halftone (dots), and None (posterize).
 * MIT License
 */
const fileInput = document.getElementById("file");
const algoSel   = document.getElementById("algo");
const levelsEl  = document.getElementById("levels");
const levelsVal = document.getElementById("levelsVal");
const scaleEl   = document.getElementById("scale");
const scaleVal  = document.getElementById("scaleVal");
const paletteEl = document.getElementById("palette");
const invertEl  = document.getElementById("invert");
const contrastEl= document.getElementById("contrast");
const contrastVal=document.getElementById("contrastVal");
const brightnessEl= document.getElementById("brightness");
const brightnessVal= document.getElementById("brightnessVal");
const gammaEl   = document.getElementById("gamma");
const gammaVal  = document.getElementById("gammaVal");
const applyBtn  = document.getElementById("apply");
const dlBtn     = document.getElementById("download");

const srcCVS = document.getElementById("src");
const outCVS = document.getElementById("out");
const sctx = srcCVS.getContext("2d");
const octx = outCVS.getContext("2d", { willReadFrequently: true });

levelsEl.addEventListener("input", () => levelsVal.textContent = levelsEl.value);
scaleEl.addEventListener("input", () => scaleVal.textContent = `${scaleEl.value}×`);
contrastEl.addEventListener("input", () => contrastVal.textContent = contrastEl.value);
brightnessEl.addEventListener("input", () => brightnessVal.textContent = brightnessEl.value);
gammaEl.addEventListener("input", () => gammaVal.textContent = (gammaEl.value/100).toFixed(2));

fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    srcCVS.width = w; srcCVS.height = h;
    sctx.drawImage(img, 0, 0);
    // scale preview
    const sc = Number(scaleEl.value);
    outCVS.style.imageRendering = "pixelated";
    outCVS.width = w; outCVS.height = h;
    render(); // initial
  };
  img.src = url;
});

applyBtn.addEventListener("click", render);
dlBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "dither.png";
  a.href = outCVS.toDataURL("image/png");
  a.click();
});

function clamp(v, lo=0, hi=255){return Math.max(lo, Math.min(hi, v));}
function toGray(r,g,b){
  // perceptual weights (sRGB luma)
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
function parsePalette(str){
  if (!str || !str.trim()) return null;
  const parts = str.split(",").map(s => s.trim()).filter(Boolean);
  const arr = [];
  for (const p of parts){
    const m = /^#?([0-9a-f]{6})$/i.exec(p);
    if (m){
      const hex = m[1];
      const r = parseInt(hex.slice(0,2),16);
      const g = parseInt(hex.slice(2,4),16);
      const b = parseInt(hex.slice(4,6),16);
      arr.push([r,g,b]);
    }
  }
  return arr.length? arr : null;
}
function buildGrayPalette(levels){
  const arr = [];
  for (let i=0;i<levels;i++){
    const v = Math.round(255 * i/(levels-1));
    arr.push([v,v,v]);
  }
  return arr;
}
function nearestColor(r,g,b,palette){
  let best = 0, bestD = 1e9;
  for (let i=0;i<palette.length;i++){
    const [pr,pg,pb] = palette[i];
    const dr=r-pr,dg=g-pg,db=b-pb;
    const d = dr*dr+dg*dg+db*db;
    if (d < bestD){bestD=d;best=i;}
  }
  return palette[best];
}

// Precompute Bayer matrices
const BAYER4 = [
  [0, 8, 2,10],
  [12,4,14,6],
  [3,11,1,9],
  [15,7,13,5],
].map(row => row.map(v => (v+0.5)/16)); // normalize 0..1

const BAYER8 = (() => {
  // generate recursively from BAYER4 for brevity
  const b4 = [
    [0,32,8,40,2,34,10,42],
    [48,16,56,24,50,18,58,26],
    [12,44,4,36,14,46,6,38],
    [60,28,52,20,62,30,54,22],
    [3,35,11,43,1,33,9,41],
    [51,19,59,27,49,17,57,25],
    [15,47,7,39,13,45,5,37],
    [63,31,55,23,61,29,53,21],
  ];
  return b4.map(row => row.map(v => (v+0.5)/64));
})();

function applyAdjustments(r,g,b){
  // Brightness/contrast/gamma/invert in linear-ish sRGB space
  const inv = invertEl.checked;
  let rr=r,gg=g,bb=b;
  // brightness/contrast: scale -100..100
  const br = Number(brightnessEl.value) / 100 * 255;
  const ct = Number(contrastEl.value) / 100 + 1;
  rr = clamp((rr-128)*ct + 128 + br);
  gg = clamp((gg-128)*ct + 128 + br);
  bb = clamp((bb-128)*ct + 128 + br);
  // gamma
  const gma = Number(gammaEl.value)/100;
  const f = (v) => clamp(Math.round(255 * Math.pow(v/255, 1/gma)));
  rr=f(rr); gg=f(gg); bb=f(bb);
  if (inv){ rr=255-rr; gg=255-gg; bb=255-bb; }
  return [rr,gg,bb];
}

function render(){
  if (srcCVS.width===0) return;
  const w = srcCVS.width, h = srcCVS.height;
  outCVS.width = w; outCVS.height = h;
  const src = sctx.getImageData(0,0,w,h);
  const out = octx.createImageData(w,h);
  const algo = algoSel.value;
  const levels = Number(levelsEl.value);
  const custom = parsePalette(paletteEl.value);
  const palette = custom || buildGrayPalette(levels);

  if (algo==="none"){
    // Posterize without dithering
    for (let i=0;i<src.data.length;i+=4){
      let r=src.data[i],g=src.data[i+1],b=src.data[i+2];
      [r,g,b]=applyAdjustments(r,g,b);
      const [nr,ng,nb]=nearestColor(r,g,b,palette);
      out.data[i]=nr; out.data[i+1]=ng; out.data[i+2]=nb; out.data[i+3]=255;
    }
    octx.putImageData(out,0,0);
    return;
  }

  if (algo==="threshold" || algo.startsWith("bayer")){
    const mat = algo==="bayer4" ? BAYER4 : (algo==="bayer8" ? BAYER8 : null);
    for (let y=0;y<h;y++){
      for (let x=0;x<w;x++){
        const i = (y*w + x)*4;
        let r=src.data[i],g=src.data[i+1],b=src.data[i+2];
        [r,g,b]=applyAdjustments(r,g,b);
        let v = toGray(r,g,b)/255;
        if (mat){
          const m = mat[y % mat.length][x % mat.length]; // 0..1
          v = clamp(Math.round((v + (m-0.5)/levels) * (levels-1)),0,levels-1)/(levels-1);
        }else{
          v = Math.round(v*(levels-1))/(levels-1);
        }
        const c = Math.round(v*255);
        const [nr,ng,nb]=nearestColor(c,c,c,palette);
        out.data[i]=nr; out.data[i+1]=ng; out.data[i+2]=nb; out.data[i+3]=255;
      }
    }
    octx.putImageData(out,0,0);
    return;
  }

  if (algo==="halftone"){
    // Simple circular spot halftone on grayscale
    // Draw to outCVS directly with canvas primitives
    octx.clearRect(0,0,w,h);
    const block = 6; // pixel size per cell
    const cell = block;
    octx.fillStyle = "#fff";
    octx.fillRect(0,0,w,h);
    octx.fillStyle = "#000";
    for (let y=0;y<h;y+=cell){
      for (let x=0;x<w;x+=cell){
        const i = (y*w + x)*4;
        let r=src.data[i],g=src.data[i+1],b=src.data[i+2];
        [r,g,b]=applyAdjustments(r,g,b);
        const gray = toGray(r,g,b); // 0..255
        const t = 1 - gray/255; // ink amount
        const radius = (cell/2) * Math.sqrt(t);
        octx.beginPath();
        octx.arc(x+cell/2, y+cell/2, radius, 0, Math.PI*2);
        octx.closePath();
        octx.fill();
      }
    }
    return;
  }

  // Error diffusion (FS or Atkinson) on grayscale
  const errArr = new Float32Array(w*h);
  const useAtkinson = algo==="atkinson";
  for (let y=0;y<h;y++){
    for (let x=0;x<w;x++){
      const i = (y*w + x)*4;
      let r=src.data[i],g=src.data[i+1],b=src.data[i+2];
      [r,g,b]=applyAdjustments(r,g,b);
      let gray = toGray(r,g,b) + errArr[y*w+x];
      gray = clamp(gray);
      const q = Math.round((gray/255)*(levels-1))/(levels-1); // quantized 0..1
      const qv = q*255;
      const err = gray - qv;
      const [nr,ng,nb]=nearestColor(qv,qv,qv,palette);
      out.data[i]=nr; out.data[i+1]=ng; out.data[i+2]=nb; out.data[i+3]=255;

      // diffuse error
      if (useAtkinson){
        const share = err/8;
        addErr(x+1,y,share);
        addErr(x+2,y,share);
        addErr(x-1,y+1,share);
        addErr(x,y+1,share);
        addErr(x+1,y+1,share);
        addErr(x,y+2,share);
      }else{
        // Floyd–Steinberg
        // x+1,y (7/16); x-1,y+1 (3/16); x,y+1 (5/16); x+1,y+1 (1/16)
        addErr(x+1,y, err*7/16);
        addErr(x-1,y+1, err*3/16);
        addErr(x,  y+1, err*5/16);
        addErr(x+1,y+1, err*1/16);
      }
    }
  }
  octx.putImageData(out,0,0);

  function addErr(x,y,val){
    if (x<0||y<0||x>=w||y>=h) return;
    errArr[y*w+x]+=val;
  }
}
