// shader.frag
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

#define MAX_PANELS 16

uniform vec2  uResolution;
uniform float uTime;

uniform float uCycleT;
uniform float uCycleLen;

uniform float uBorderPx;
uniform float uGutterPx;

uniform int   uPanelCount;
uniform float uRects[MAX_PANELS*4];   // x,y,w,h (pixel)
uniform float uAnims[MAX_PANELS*4];   // t0,dur,fx,seed
uniform float uStyles[MAX_PANELS*4];  // tone,toneS,ink,cut

// -------------------------
// util
// -------------------------
float sat(float x){ return clamp(x, 0.0, 1.0); }

float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float easeOutQuint(float t){
  t = sat(t);
  float a = 1.0 - t;
  return 1.0 - a*a*a*a*a;
}
// Bound：入力も出力も必ず [0,1] に閉じる
float easeOutQuintBound(float t){
  return sat(easeOutQuint(sat(t)));
}

// rect helpers (pixel space)
vec4 rectAt(int i){
  int k = i*4;
  return vec4(uRects[k+0], uRects[k+1], uRects[k+2], uRects[k+3]);
}
vec4 animAt(int i){
  int k = i*4;
  return vec4(uAnims[k+0], uAnims[k+1], uAnims[k+2], uAnims[k+3]);
}
vec4 styleAt(int i){
  int k = i*4;
  return vec4(uStyles[k+0], uStyles[k+1], uStyles[k+2], uStyles[k+3]);
}

float sdBox2(vec2 p, vec2 b){
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// パネル変形（fxに応じて）
// 返り値：local（最終rect中心基準）→表示空間へ逆変換した座標
vec2 inverseFx(vec2 fragPx, vec4 r, float fx, float prog){
  vec2 c = r.xy + 0.5 * r.zw;
  vec2 p = fragPx - c;

  // popup: scale
  if (fx < 0.5){
    float s = max(0.001, prog);
    p /= s;
    return p;
  }
  // slide: from right
  if (fx < 1.5){
    float slide = (1.0 - prog) * (0.65 * r.z);
    p.x -= slide;
    return p;
  }
  // fade: no geom change
  return p;
}

float panelAlpha(float cycleT){
  // in  : 0.0..1.4  (ease)
  // hold: 1.4..5.2
  // out : 5.2..6.6  (ease)
  float inEnd  = 1.4;
  float outBeg = 5.2;
  float outEnd = 6.6;

  if (cycleT < inEnd){
    return easeOutQuintBound(cycleT / inEnd);
  } else if (cycleT < outBeg){
    return 1.0;
  } else if (cycleT < outEnd){
    float tt = (cycleT - outBeg) / (outEnd - outBeg);
    return 1.0 - easeOutQuintBound(tt);
  } else {
    return 0.0;
  }
}

float panelProg(vec4 a){
  // 同時出現っぽい：cycleT基準で進める（t0は微差）
  // t0 は global time で入ってるが、ここでは uTime と比較
  float t = (uTime - a.x) / max(0.001, a.y);
  return easeOutQuintBound(t);
}

// -------------------------
// tones
// -------------------------
float halftoneDots(vec2 uv, float s, float seed){
  // uv: 0..1 in panel
  // dot grid with jitter
  float g = 18.0 * s;
  vec2 p = uv * g;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;

  float h = hash21(ip + seed);
  vec2 jitter = (vec2(hash21(ip + seed + 12.3), hash21(ip + seed + 45.6)) - 0.5) * 0.18;
  fp += jitter;

  float rad = mix(0.12, 0.42, h);
  float d = length(fp);
  return smoothstep(rad, rad - 0.06, d);
}

float screenLines(vec2 uv, float s, float seed){
  float ang = (hash11(seed + 7.7) * 0.9 + 0.05) * 3.14159265;
  vec2 dir = vec2(cos(ang), sin(ang));
  float f = dot(uv - 0.5, dir);
  float freq = 55.0 * s;
  float v = sin(f * freq + seed * 0.37);
  float w = 0.18;
  return smoothstep(-w, w, v);
}

float paperNoise(vec2 uv, float s, float seed){
  float n = 0.0;
  vec2 p = uv * (120.0 * s);
  n += hash21(floor(p) + seed);
  n += 0.5 * hash21(floor(p*2.0) + seed + 17.0);
  n += 0.25 * hash21(floor(p*4.0) + seed + 29.0);
  n /= (1.0 + 0.5 + 0.25);
  return n;
}

// -------------------------
// main
// -------------------------
void main(){
  vec2 frag = gl_FragCoord.xy;
  vec3 col = vec3(1.0); // 白背景

  float globalA = panelAlpha(uCycleT);

  // draw panels (small count)
  for (int i = 0; i < MAX_PANELS; i++){
    if (i >= uPanelCount) break;

    vec4 r = rectAt(i);
    vec4 a = animAt(i);
    vec4 s = styleAt(i);

    float prog = panelProg(a);
    float fx = a.z;

    // fade effect uses alpha too
    float localA = globalA;
    if (fx >= 1.5) {
      localA *= prog; // fade-in
    } else {
      // popup/slide: alpha follows prog a bit (still bounded)
      localA *= mix(0.15, 1.0, prog);
    }
    if (localA <= 0.001) continue;

    vec2 p = inverseFx(frag, r, fx, prog); // local around center after inverse
    vec2 half = 0.5 * r.zw;

    // inside rect?
    float d = sdBox2(p, half);
    if (d > 0.0) continue;

    // distance to edges (for border)
    vec2 q = abs(p);
    float distToEdge = min(half.x - q.x, half.y - q.y);

    // fill (tone/beta)
    vec2 uv = (p + half) / max(vec2(1.0), r.zw); // 0..1
    float seed = a.w;
    float toneType = s.x;
    float toneS = s.y;
    float ink = sat(s.z);

    float toneV = 0.0;
    if (toneType < 0.5){
      toneV = halftoneDots(uv, toneS, seed);
      // dots -> darker when ink high
      toneV = mix(toneV, toneV*toneV, ink);
    } else if (toneType < 1.5){
      toneV = screenLines(uv, toneS, seed);
      toneV = mix(toneV, smoothstep(0.35, 0.85, toneV), ink);
    } else if (toneType < 2.5){
      // black
      toneV = 1.0;
    } else {
      // noise
      toneV = smoothstep(0.35, 0.85, paperNoise(uv, toneS, seed));
    }

    // toneV: 0..1 (ink coverage)
    vec3 fill = mix(vec3(1.0), vec3(0.0), toneV * ink);

    // border (uniform width)
    float bw = uBorderPx;
    float b = smoothstep(bw, bw - 1.0, distToEdge);
    // b=1 on border, 0 inside
    vec3 panelCol = mix(fill, vec3(0.0), b);

    // composite (alpha)
    col = mix(col, panelCol, localA);
  }

  // tiny paper grain (outside too)
  float g = (hash21(frag * 0.75 + uTime*0.1) - 0.5) * 0.035;
  col += g;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}