// sketch.js  (見開き対応版)
// shader.vert / shader.frag は「前の（気に入ってる）やつ」をそのまま使ってOK

let sh;
let maskG;

let panels = [];   // {x,y,w,h, id01, tone01, startTime, duration, effect, dir, slidePx, popScale}
let lastResetSec = -999;
const RESET_EVERY = 5.0;

// ===== 調整したい値（今のトンマナを維持） =====
let gutterX = 12;        // コマ間の横余白(px)
let gutterY = 24;        // コマ間の縦余白(px)
let innerMarginX = 48;   // ページ内枠（表示しない／断ち切り判定用）左右(px)
let innerMarginY = 48;   // ページ内枠（表示しない／断ち切り判定用）天地(px)
let borderPx = 4.0;      // コマ枠の太さ(px)

// 見開き中央（ノド）の余白(px)
let spreadGapPx = 42;


// 横長判定（これ以上で見開き）
let spreadAspect = 1.15;

function preload() {
  sh = loadShader("shader.vert", "shader.frag");
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);

  maskG = createGraphics(width, height);
  maskG.pixelDensity(1);

  resetLayout();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  maskG = createGraphics(width, height);
  maskG.pixelDensity(1);

  resetLayout();
}

function draw() {
  const t = millis() * 0.001;

  // 5秒ごとにリセット
  const k = floor(t / RESET_EVERY);
  if (k !== lastResetSec) {
    lastResetSec = k;
    resetLayout();
  }

  // マスク更新
  maskG.clear();       // alpha=0
  maskG.noStroke();

  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const tt = (t - p.startTime);
    const a = clamp01(easeOutQuintBound(tt / p.duration));

    // slide/pop はフェードセット（alpha=a）
    const e = applyEffect(p, a);

    // R: panelId, G: toneSeed, A: alpha
    const r = Math.floor(clamp01(p.id01) * 255);
    const g = Math.floor(clamp01(p.tone01) * 255);
    const aa = Math.floor(clamp01(e.alpha) * 255);

    maskG.fill(r, g, 0, aa);
    maskG.rect(e.x, e.y, e.w, e.h);
  }

  // シェーダ合成
  shader(sh);
  sh.setUniform("uResolution", [width, height]);
  sh.setUniform("uTime", t);
  sh.setUniform("uMask", maskG);
  sh.setUniform("uBorderPx", borderPx);

  // 全面
  noStroke();
  rectMode(CENTER);
  rect(0, 0, width, height);
}

// =========================
// 見開きページ領域を作る
// =========================
function getPageRects() {
  const isSpread = (width / max(1, height)) >= spreadAspect;

  if (!isSpread) {
    return [{
      x0: 0, y0: 0, x1: width, y1: height,
      pageIndex: 0,
      isSpread: false
    }];
  }

  // 見開き：左右2ページ + ノド(中央gap)
  const gap = spreadGapPx;

  // 左右ページに均等割り
  const pageW = (width - gap) * 0.5;
  const pageH = height;

  const left = {
    x0: 0,
    y0: 0,
    x1: pageW,
    y1: pageH,
    pageIndex: 0,
    isSpread: true
  };
  const right = {
    x0: pageW + gap,
    y0: 0,
    x1: pageW + gap + pageW,
    y1: pageH,
    pageIndex: 1,
    isSpread: true
  };

  return [left, right];
}

// =========================
// レイアウト生成（ページごとに同じトンマナ）
// =========================
function resetLayout() {
  const t = millis() * 0.001;
  panels = [];

  const pages = getPageRects();

  for (const page of pages) {
    // ページ内枠（表示しない）…断ち切り/非断ち切りの差の基準
    const pageX0 = page.x0, pageY0 = page.y0, pageX1 = page.x1, pageY1 = page.y1;
    const innerX0 = pageX0 + innerMarginX;
    const innerY0 = pageY0 + innerMarginY;
    const innerX1 = pageX1 - innerMarginX;
    const innerY1 = pageY1 - innerMarginY;

    // 内枠が潰れると破綻するのでガード
    if (innerX1 <= innerX0 + 20 || innerY1 <= innerY0 + 20) continue;

    // 1-3列、1-4行
    const cols = 1 + floor(random(3));
    const rows = 1 + floor(random(4));

    // ベースは内枠を“完全充填”
    const W = (innerX1 - innerX0);
    const H = (innerY1 - innerY0);

    const usableW = max(10, W - gutterX * (cols - 1));
    const usableH = max(10, H - gutterY * (rows - 1));

    const colW = randParts(cols, usableW, 0.75);
    const rowH = randParts(rows, usableH, 0.75);

    // 右→左のx（ページ内で）
    const xs = [];
    {
      let x = innerX1;
      for (let c = 0; c < cols; c++) {
        const w = colW[c];
        x -= w;
        xs.push(x);
        x -= gutterX;
      }
    }

    // 上→下のy
    const ys = [];
    {
      let y = innerY0;
      for (let r = 0; r < rows; r++) {
        ys.push(y);
        y += rowH[r] + gutterY;
      }
    }

    // セル作成
    let cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells.push({
          r, c,
          x: xs[c],
          y: ys[r],
          w: colW[c],
          h: rowH[r],
          used: false
        });
      }
    }

    // 右→左、上→下で走査（読順）
    cells.sort((a, b) => (a.r - b.r) || (b.c - a.c));
    const pickCell = (r, c) => cells.find(v => v.r === r && v.c === c);

    // ランダムに連結して変化
    let merged = [];
    for (const cell of cells) {
      if (cell.used) continue;

      const canMergeLeft = (cell.c + 1 < cols) && !pickCell(cell.r, cell.c + 1).used;
      const canMergeDown = (cell.r + 1 < rows) && !pickCell(cell.r + 1, cell.c).used;

      let mergeDir = null;
      if ((canMergeLeft || canMergeDown) && random() < 0.45) {
        if (canMergeLeft && canMergeDown) mergeDir = (random() < 0.55) ? "down" : "left";
        else mergeDir = canMergeDown ? "down" : "left";
      }

      if (!mergeDir) {
        cell.used = true;
        merged.push({ x: cell.x, y: cell.y, w: cell.w, h: cell.h, tag: cornerTag(cell, rows, cols) });
        continue;
      }

      if (mergeDir === "left") {
        const other = pickCell(cell.r, cell.c + 1);
        cell.used = true;
        other.used = true;
        merged.push({
          x: cell.x,
          y: cell.y,
          w: cell.w + gutterX + other.w,
          h: cell.h,
          tag: cornerTag(cell, rows, cols)
        });
      } else {
        const other = pickCell(cell.r + 1, cell.c);
        cell.used = true;
        other.used = true;
        merged.push({
          x: cell.x,
          y: cell.y,
          w: cell.w,
          h: cell.h + gutterY + other.h,
          tag: cornerTag(cell, rows, cols)
        });
      }
    }

    // パネル化（断ち切りは四隅中心に確率）
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];

      const baseBleed = 0.10;
      const cornerBoost = (m.tag === "corner") ? 0.35 : (m.tag === "edge" ? 0.12 : 0.0);
      const doBleed = random() < (baseBleed + cornerBoost);

      let x = m.x, y = m.y, w = m.w, h = m.h;

      if (doBleed) {
        // 内枠をはみ出して“ページ端”へ（ページ外には出さない）
        const cx = x + w * 0.5;
        const cy = y + h * 0.5;

        // 左右
        if (cx > (pageX0 + pageX1) * 0.5) {
          // 右寄り -> 右端へ
          w = min(pageX1 - x, w + (innerX1 - (x + w)));
        } else {
          // 左寄り -> 左端へ
          const newX = pageX0;
          w = (x + w) - newX;
          x = newX;
        }

        // 上下
        if (cy < (pageY0 + pageY1) * 0.5) {
          // 上寄り -> 上端へ
          const newY = pageY0;
          h = (y + h) - newY;
          y = newY;
        } else {
          // 下寄り -> 下端へ
          h = min(pageY1 - y, h + (innerY1 + innerMarginY - (y + h)));
        }
      }

      // 演出：slide / pop / fade
      // ※「slide/pop は fade とセット」→ alpha は必ず a を使う（applyEffect側）
      const roll = random();
      let effect = "fade";
      if (roll < 0.34) effect = "slide";
      else if (roll < 0.68) effect = "pop";

      const dir = random(["L", "R", "U", "D"]);

      // IDはページ跨ぎでも被らないように割り当て（枠線の誤検出防止）
      // 0..1 に安全に収める
      const id01 = ((page.pageIndex * 32 + i + 1) / 256.0);

      panels.push({
        x, y, w, h,
        id01,
        tone01: random(), // トーン密度/種類の種

        startTime: t + random(0.02, 0.40),
        duration: random(0.55, 1.10),

        effect,
        dir,
        slidePx: random(40, 160),
        popScale: random(0.78, 0.92)
      });
    }
  }
}

// =========================
// エフェクト（Quint+Bound）
// slide/pop は fade とセット（alpha=a を必ず返す）
// =========================
function applyEffect(p, a01) {
  const a = clamp01(a01);

  let x = p.x, y = p.y, w = p.w, h = p.h;
  let alpha = a; // ←セット

  if (p.effect === "slide") {
    let dx = 0, dy = 0;
    if (p.dir === "L") dx = -p.slidePx * (1.0 - a);
    if (p.dir === "R") dx =  p.slidePx * (1.0 - a);
    if (p.dir === "U") dy = -p.slidePx * (1.0 - a);
    if (p.dir === "D") dy =  p.slidePx * (1.0 - a);
    x += dx; y += dy;
  } else if (p.effect === "pop") {
    const s = lerp(p.popScale, 1.0, a);
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    w *= s; h *= s;
    x = cx - w * 0.5;
    y = cy - h * 0.5;
  } else {
    // fade only
  }

  return { x, y, w, h, alpha };
}

function easeOutQuintBound(x) {
  const t = clamp01(x);
  const q = 1.0 - pow(1.0 - t, 5.0);
  const b = 1.0 + 0.10 * sin(q * PI * 1.5) * (1.0 - q);
  return clamp01(q * b);
}

// =========================
// util
// =========================
function clamp01(v){ return max(0, min(1, v)); }

function randParts(n, total, skew) {
  let a = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    const r = pow(random(0.0001, 1.0), skew);
    a.push(r); s += r;
  }
  const out = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const v = total * (a[i] / s);
    out.push(v);
    acc += v;
  }
  out[n - 1] += (total - acc);
  return out;
}

function cornerTag(cell, rows, cols) {
  const r = cell.r, c = cell.c;
  const isTop = (r === 0);
  const isBottom = (r === rows - 1);
  const isRight = (c === 0);         // 右→左配置なので c=0 が最右列
  const isLeft = (c === cols - 1);

  const isCorner = (isTop && isRight) || (isTop && isLeft) || (isBottom && isRight) || (isBottom && isLeft);
  if (isCorner) return "corner";

  const isEdge = isTop || isBottom || isRight || isLeft;
  if (isEdge) return "edge";

  return "inner";
}
