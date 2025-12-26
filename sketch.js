// ================================
// Manga Panel Animator (p5.js)
// ================================

let sh;
const MAX_PANELS = 24;

let panels = [];
let panelCount = 0;

let seed = 1;
let lastShuffle = 0;

// --------------------
// Easing (Quint + Bound)
// --------------------
function easeOutQuint(t){
  t = constrain(t, 0, 1);
  return 1 - pow(1 - t, 5);
}

function easeOutQuintBound(t){
  t = constrain(t, 0, 1);
  const q = easeOutQuint(t);
  const b = sin(t * PI) * (1 - t) * 0.12;
  return constrain(q + b, 0, 1);
}

// --------------------
// RNG
// --------------------
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --------------------
// Guillotine Split (axis-aligned)
// --------------------
function buildPanels(){
  const rng = mulberry32(seed);
  const gutter = min(width, height) * 0.025;

  let rects = [{ x:0, y:0, w:width, h:height }];

  const target = floor(8 + rng() * 10);

  for(let i=0;i<64 && rects.length < target;i++){
    rects.sort((a,b)=>b.w*b.h - a.w*a.h);
    const r = rects.shift();
    if(!r) break;

    const canV = r.w > width * 0.25;
    const canH = r.h > height * 0.25;
    if(!canV && !canH){
      rects.push(r);
      continue;
    }

    const splitV = canV && (!canH || rng() < 0.5);

    if(splitV){
      const cut = lerp(r.x + r.w*0.35, r.x + r.w*0.65, rng());
      rects.push(
        { x:r.x, y:r.y, w:cut-r.x, h:r.h },
        { x:cut, y:r.y, w:(r.x+r.w)-cut, h:r.h }
      );
    }else{
      const cut = lerp(r.y + r.h*0.35, r.y + r.h*0.65, rng());
      rects.push(
        { x:r.x, y:r.y, w:r.w, h:cut-r.y },
        { x:r.x, y:cut, w:r.w, h:(r.y+r.h)-cut }
      );
    }
  }

  panels = rects.map(r=>{
    const fx = floor(rng()*3); // 0 popup,1 slide,2 fade
    return {
      tx: r.x + gutter,
      ty: r.y + gutter,
      tw: r.w - gutter*2,
      th: r.h - gutter*2,
      fx,
      dir: rng()<0.5?-1:1,
      axis: rng()<0.5?0:1,
      start: millis()*0.001 + rng()*1.2,
      dur: lerp(0.8,1.6,rng()),
      life: lerp(2.5,5.0,rng())
    };
  }).filter(r=>r.tw>80 && r.th>80).slice(0,MAX_PANELS);

  panelCount = panels.length;
  lastShuffle = millis()*0.001;
}

// --------------------
// Animation state
// --------------------
function evalPanel(p, now){
  const t0 = p.start;
  const t1 = t0 + p.dur;
  const t2 = t0 + p.life;
  const t3 = t2 + p.dur;

  let k = 0;
  if(now<t0) k=0;
  else if(now<t1) k=easeOutQuintBound((now-t0)/p.dur);
  else if(now<t2) k=1;
  else if(now<t3) k=1-easeOutQuintBound((now-t2)/p.dur);
  else k=0;

  let x=p.tx,y=p.ty,w=p.tw,h=p.th;

  if(p.fx===0){
    const s = lerp(0.75,1,k);
    const cx=x+w*0.5, cy=y+h*0.5;
    w*=s; h*=s;
    x=cx-w*0.5; y=cy-h*0.5;
  }else if(p.fx===1){
    const off = (p.axis===0?width:height)*0.25*p.dir;
    if(p.axis===0) x+=off*(1-k);
    else y+=off*(1-k);
  }
  return {x,y,w,h,a:k};
}

// --------------------
// p5 lifecycle
// --------------------
function preload(){
  sh = loadShader("shader.vert","shader.frag");
}

function setup(){
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(1);
  noStroke();
  buildPanels();
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
  buildPanels();
}

function draw(){
  const now = millis()*0.001;
  if(now-lastShuffle>10.0){
    seed++;
    buildPanels();
  }

  shader(sh);

  const rects = new Array(MAX_PANELS*4).fill(0);
  const alphas = new Array(MAX_PANELS).fill(0);

  for(let i=0;i<panelCount;i++){
    const r = evalPanel(panels[i], now);
    rects[i*4+0] = r.x/width;
    rects[i*4+1] = r.y/height;
    rects[i*4+2] = r.w/width;
    rects[i*4+3] = r.h/height;
    alphas[i] = r.a;
  }

  sh.setUniform("uResolution",[width,height]);
  sh.setUniform("uTime",now);
  sh.setUniform("uPanelCount",panelCount);
  sh.setUniform("uRects",rects);
  sh.setUniform("uAlpha",alphas);
  sh.setUniform("uLineW",max(2,min(width,height)*0.004));

  rect(-width/2,-height/2,width,height);
}