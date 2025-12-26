// sketch.js (p5.js)
// requires: shader.vert, shader.frag

let sh;
let panels = [];
let cols = 3, rows = 4;
let frameWpx = 8;      // 枠線の太さ(px) ※均一
let gutterPx = 16;     // 余白(px) ※最小限・充填
let cycleSec = 3.6;    // 生成→表示→再生成

const MAX_PANELS = 12;

function preload(){
  sh = loadShader("shader.vert", "shader.frag");
}

function setup(){
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);

  // ここで「後から外部画像のコマを入れる」ための入れ物だけ用意（未使用）
  // panelImages[i] = loadImage(...) などに差し替えて拡張していける
  makeLayout(true);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

function draw(){
  const t = millis() * 0.001;

  // 周期ごとに「一気にコマ割りが現れる」
  const phase = t % cycleSec;
  if (phase < 0.016) makeLayout(false);

  shader(sh);

  // パネル情報を uniform 配列として詰める（最大12）
  const rects = new Array(MAX_PANELS * 4).fill(0);
  const anims = new Array(MAX_PANELS * 4).fill(0);

  for (let i = 0; i < panels.length; i++){
    const p = panels[i];
    rects[i*4+0] = p.x;
    rects[i*4+1] = p.y;
    rects[i*4+2] = p.w;
    rects[i*4+3] = p.h;

    // anim: start, dur, type, seed
    anims[i*4+0] = p.start;
    anims[i*4+1] = p.dur;
    anims[i*4+2] = p.type;
    anims[i*4+3] = p.seed;
  }

  sh.setUniform("uResolution", [width, height]);
  sh.setUniform("uTime", t);
  sh.setUniform("uPanelCount", panels.length);
  sh.setUniform("uRects", rects);
  sh.setUniform("uAnims", anims);
  sh.setUniform("uFrameWpx", frameWpx);
  sh.setUniform("uGutterPx", gutterPx);

  // 全画面
  rectMode(CENTER);
  noStroke();
  rect(0, 0, width, height);
}

/**
 * 1-3列, 1-4行で完全充填レイアウトを作る
 * - 余白は gutterPx のみ（外周も同じ）
 * - パネルは重ならない（グリッド分割）
 * - 頂点データ（4隅）も panels[i].verts に保持
 * - 生成時に全パネル同時にアニメ開始（「一気に」）
 */
function makeLayout(first){
  // ランダムで列・行（指定範囲）
  cols = floor(random(1, 4)); // 1..3
  rows = floor(random(1, 5)); // 1..4

  // 画面が小さいときは太さ/余白を抑える
  const s = min(width, height);
  frameWpx = max(2, floor(s * 0.010));        // だいたい 1%
  gutterPx = max(frameWpx * 2, floor(s * 0.020)); // 最小限

  const now = millis() * 0.001;

  // 正規化座標(0..1)で「外周gutterを含む」割り付け
  const gx = gutterPx / width;
  const gy = gutterPx / height;

  const availW = 1.0 - gx * (cols + 1);
  const availH = 1.0 - gy * (rows + 1);

  const cellW = availW / cols;
  const cellH = availH / rows;

  panels = [];

  let idx = 0;
  for (let r = 0; r < rows; r++){
    for (let c = 0; c < cols; c++){
      if (idx >= MAX_PANELS) break;

      const x = gx + c * (cellW + gx);
      const y = gy + r * (cellH + gy);
      const w = cellW;
      const h = cellH;

      // ランダム演出（0=fade, 1=popup, 2=slide）
      const type = floor(random(0, 3));

      // 全パネル同時開始（「一気に」）
      const start = now;
      const dur = 0.75 + random(0.25); // 0.75..1.0

      const seed = random(1e6);

      // 4隅の頂点（後で画像貼り等に使える）
      const verts = [
        [x,     y    ],
        [x+w,   y    ],
        [x+w,   y+h  ],
        [x,     y+h  ],
      ];

      panels.push({ x, y, w, h, start, dur, type, seed, verts, index: idx });

      idx++;
    }
  }
}