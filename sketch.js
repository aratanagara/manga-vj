// sketch.js
// p5.js (WEBGL) + custom shader (shader.vert / shader.frag)

const MAX_PANELS = 16;

let sh;
let panels = [];
let lastCycleIndex = -1;

function preload(){
  sh = loadShader("shader.vert", "shader.frag");
}

function setup(){
  pixelDensity(1);
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();

  // 初期レイアウト
  rebuildLayout(0);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

function draw(){
  const t = millis() * 0.001;

  // 周期でレイアウト更新（同時にコマ割りが出現→保持→消失）
  const cycleLen = 7.0;
  const cycleIndex = Math.floor(t / cycleLen);
  const cycleT = t - cycleIndex * cycleLen;

  if (cycleIndex !== lastCycleIndex){
    lastCycleIndex = cycleIndex;
    rebuildLayout(t);
  }

  shader(sh);

  // uniforms
  sh.setUniform("uResolution", [width, height]);
  sh.setUniform("uTime", t);
  sh.setUniform("uCycleT", cycleT);
  sh.setUniform("uCycleLen", cycleLen);

  const borderPx = Math.max(4.0, Math.min(width, height) * 0.010);  // 均一枠
  const gutterPx = Math.max(8.0, Math.min(width, height) * 0.018);  // 均一余白（斜め無し）
  sh.setUniform("uBorderPx", borderPx);
  sh.setUniform("uGutterPx", gutterPx);

  const n = Math.min(panels.length, MAX_PANELS);
  sh.setUniform("uPanelCount", n);

  // pack arrays
  const rects = new Array(MAX_PANELS * 4).fill(0);
  const anims = new Array(MAX_PANELS * 4).fill(0);
  const styles = new Array(MAX_PANELS * 4).fill(0);

  for (let i = 0; i < n; i++){
    const p = panels[i];

    rects[i*4+0] = p.x;
    rects[i*4+1] = p.y;
    rects[i*4+2] = p.w;
    rects[i*4+3] = p.h;

    anims[i*4+0] = p.t0;
    anims[i*4+1] = p.dur;
    anims[i*4+2] = p.fx;   // 0 popup / 1 slide / 2 fade
    anims[i*4+3] = p.seed;

    styles[i*4+0] = p.tone;  // 0 dots / 1 lines / 2 black / 3 noise
    styles[i*4+1] = p.toneS;
    styles[i*4+2] = p.ink;   // 0..1
    styles[i*4+3] = p.cut;   // 0/1 (断ち切り)
  }

  sh.setUniform("uRects", rects);
  sh.setUniform("uAnims", anims);
  sh.setUniform("uStyles", styles);

  // fullscreen quad
  rect(-width/2, -height/2, width, height);
}

function rebuildLayout(globalT){
  // コマ割り：1-3列、1-4行、右→左、上→下で充填
  const cols = 1 + Math.floor(Math.random() * 3);
  const rows = 1 + Math.floor(Math.random() * 4);

  const borderPx = Math.max(4.0, Math.min(windowWidth, windowHeight) * 0.010);
  const gutterPx = Math.max(8.0, Math.min(windowWidth, windowHeight) * 0.018);

  // バラバラ幅（ただし合計で画面を充填）
  const colW = randWeights(cols, 0.6, 1.6);
  const rowH = randWeights(rows, 0.7, 1.7);

  // グリッド占有
  const occ = Array.from({length: rows}, () => Array(cols).fill(-1));
  const rects = [];

  // 走査順：右→左、上→下
  let id = 0;
  for (let r = 0; r < rows; r++){
    for (let c = cols - 1; c >= 0; c--){
      if (occ[r][c] !== -1) continue;

      // スパン選択（日本漫画っぽく大小を混ぜる）
      const maxC = cols - c;
      const maxR = rows - r;

      const spanC = pickSpan(maxC, 0.55);
      const spanR = pickSpan(maxR, 0.60);

      // 置ける最大に調整（重なり禁止）
      let sc = spanC, sr = spanR;
      while (!canPlace(occ, r, c, sr, sc)){
        if (sc > 1) sc--;
        else if (sr > 1) sr--;
        else break;
      }

      mark(occ, r, c, sr, sc, id);
      rects.push({r, c, sr, sc, id});
      id++;
      if (id >= MAX_PANELS) break;
    }
    if (id >= MAX_PANELS) break;
  }

  // 実ピクセル位置（余白を意味なく作らず、全面充填）
  const usableW = Math.max(16, windowWidth  - (cols + 1) * gutterPx);
  const usableH = Math.max(16, windowHeight - (rows + 1) * gutterPx);

  const colPx = colW.map(w => w * usableW);
  const rowPx = rowH.map(h => h * usableH);

  const x0 = [];
  const y0 = [];
  let x = 0;
  for (let i = 0; i < cols; i++){
    x += gutterPx;
    x0[i] = x;
    x += colPx[i];
  }
  let y = 0;
  for (let j = 0; j < rows; j++){
    y += gutterPx;
    y0[j] = y;
    y += rowPx[j];
  }

  // 断ち切り（四隅中心に確率で）
  const cornerProb = 0.45;

  panels = rects.map((g, idx) => {
    let rx = x0[g.c];
    let ry = y0[g.r];

    let rw = 0;
    for (let cc = 0; cc < g.sc; cc++){
      rw += colPx[g.c + cc];
      if (cc > 0) rw += gutterPx;
    }
    let rh = 0;
    for (let rr = 0; rr < g.sr; rr++){
      rh += rowPx[g.r + rr];
      if (rr > 0) rh += gutterPx;
    }

    // 右上/左上/右下/左下のどれかに触れていれば断ち切り候補
    const touchesLeft   = (g.c === 0);
    const touchesRight  = (g.c + g.sc === cols);
    const touchesTop    = (g.r === 0);
    const touchesBottom = (g.r + g.sr === rows);

    let cut = 0;
    if ((touchesTop && touchesRight) || (touchesTop && touchesLeft) ||
        (touchesBottom && touchesRight) || (touchesBottom && touchesLeft)){
      if (Math.random() < cornerProb) cut = 1;
    } else {
      // 角以外も少しだけ
      if (Math.random() < 0.12) cut = 1;
    }

    if (cut){
      if (touchesLeft)  rx = 0;
      if (touchesTop)   ry = 0;
      if (touchesRight) rw = windowWidth - rx;
      if (touchesBottom)rh = windowHeight - ry;
    }

    // アニメ（同時出現っぽく：t0は近接させる）
    const fx = (Math.random() < 0.40) ? 0 : (Math.random() < 0.70 ? 1 : 2); // popup/slide/fade
    const t0 = globalT + (Math.random() * 0.18);
    const dur = 1.05 + Math.random() * 0.35;

    // トーン/ベタ（必ず入る）
    const tonePick = Math.random();
    let tone = 0;
    if (tonePick < 0.46) tone = 0;        // dots
    else if (tonePick < 0.78) tone = 1;   // lines
    else if (tonePick < 0.92) tone = 3;   // noise
    else tone = 2;                        // black

    const seed = Math.random() * 10000.0;
    const ink = 0.70 + Math.random() * 0.30;
    const toneS = 0.8 + Math.random() * 1.8;

    return {
      x: rx, y: ry, w: rw, h: rh,
      t0, dur, fx, seed,
      tone, toneS, ink,
      cut
    };
  });
}

function randWeights(n, lo, hi){
  const a = [];
  for (let i = 0; i < n; i++){
    a.push(lo + Math.random() * (hi - lo));
  }
  const s = a.reduce((p,c)=>p+c, 0);
  return a.map(v => v / s);
}

function pickSpan(maxSpan, biasSmall){
  if (maxSpan <= 1) return 1;
  const r = Math.random();
  if (r < biasSmall) return 1;
  if (maxSpan >= 3 && r < biasSmall + 0.30) return 2;
  return Math.min(maxSpan, 3 + Math.floor(Math.random() * Math.min(2, maxSpan - 2)));
}

function canPlace(occ, r, c, sr, sc){
  const rows = occ.length;
  const cols = occ[0].length;
  if (r + sr > rows || c + sc > cols) return false;
  for (let y = r; y < r + sr; y++){
    for (let x = c; x < c + sc; x++){
      if (occ[y][x] !== -1) return false;
    }
  }
  return true;
}

function mark(occ, r, c, sr, sc, id){
  for (let y = r; y < r + sr; y++){
    for (let x = c; x < c + sc; x++){
      occ[y][x] = id;
    }
  }
}