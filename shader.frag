// shader.frag
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

varying vec2 vTexCoord;

uniform vec2  uResolution;
uniform float uTime;

uniform int   uCount;
uniform float uPanels[48]; // 12 * vec4
uniform float uAnim[48];   // 12 * vec4 (t0,dur,fx,dir)

uniform float uBleedChance;
uniform float uFramePx;
uniform float uGutterPx;
uniform float uToneAmt;

// --------------------
// hash
// --------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// --------------------
// Quint + Bound
// --------------------
float easeOutQuint(float x){
  x = clamp(x, 0.0, 1.0);
  float a = 1.0 - x;
  return 1.0 - a*a*a*a*a;
}
// Bound: 少しオーバー→戻る（軽いバウンド）
float easeOutQuintBound(float x){
  x = clamp(x, 0.0, 1.0);
  float y = easeOutQuint(x);
  // 0.85 付近でちょい跳ね（やりすぎない）
  float b = smoothstep(0.70, 1.0, x);
  float wob = sin((x - 0.70) * 8.0) * (1.0 - x) * 0.12;
  return clamp(y + b * wob, 0.0, 1.25);
}

// --------------------
// panel helpers
// --------------------
vec4 getPanel(int i){
  int o = i * 4;
  return vec4(uPanels[o+0], uPanels[o+1], uPanels[o+2], uPanels[o+3]); // x0,y0,x1,y1
}
vec4 getAnim(int i){
  int o = i * 4;
  return vec4(uAnim[o+0], uAnim[o+1], uAnim[o+2], uAnim[o+3]); // t0,dur,fx,dir
}

float sdBox(vec2 p, vec2 b){
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// 点描トーン（簡易）
float halftone(vec2 uv, float scale, float thr){
  vec2 p = uv * scale;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;
  float r = 0.35 + 0.25 * hash21(ip);
  float d = length(fp);
  float m = smoothstep(r, r - 0.06, d);
  return step(thr, m);
}

// 速度線（放射）
float speedLines(vec2 uv, float seed){
  vec2 c = uv - 0.5;
  float ang = atan(c.y, c.x);
  float k = 22.0 + 14.0 * seed;
  float s = abs(sin(ang * k + seed * 6.2831));
  float v = smoothstep(0.92, 1.0, s);
  float d = length(c);
  v *= smoothstep(0.55, 0.05, d);
  return v;
}

// --------------------
// main
// --------------------
void main() {
  vec2 uv = vTexCoord;            // 0..1
  vec2 px = 1.0 / uResolution;    // 1px
  float frame = uFramePx * px.y;  // だいたい同じ見え方にするため y基準
  float gutter = uGutterPx * px.y;

  // ページ地：白
  vec3 col = vec3(1.0);

  // どのパネルに属するか（アニメ中の重なりに備え、alpha 最大のものを採用）
  int bestId = -1;
  float bestA = 0.0;
  vec4 bestRect = vec4(0.0);
  vec2 bestLocal = vec2(0.0);

  for (int i = 0; i < 12; i++){
    if (i >= uCount) break;

    vec4 r = getPanel(i);
    vec4 a = getAnim(i);
    float t0 = a.x;
    float dur = max(a.y, 0.001);
    float fx  = a.z;
    float dir = a.w;

    float x = (uTime - t0) / dur;
    float e = easeOutQuintBound(x);
    float alpha = clamp(e, 0.0, 1.0);

    // 断ち切り判定（外枠に触れる辺は gutter を 0 に）
    float cornerish =
      (r.x < 0.02 && r.y < 0.02) ||
      (r.z > 0.98 && r.y < 0.02) ||
      (r.x < 0.02 && r.w > 0.98) ||
      (r.z > 0.98 && r.w > 0.98) ? 1.0 : 0.0;

    float bleed = step(0.5, cornerish) * step(hash11(float(i) + 7.0), uBleedChance);

    // gutter を引いた内側矩形（断ち切りは外周側の gutter を 0）
    vec2 g0 = vec2(gutter);
    vec2 g1 = vec2(gutter);

    if (bleed > 0.5){
      if (r.x <= 0.0005) g0.x = 0.0;
      if (r.y <= 0.0005) g0.y = 0.0;
      if (r.z >= 0.9995) g1.x = 0.0;
      if (r.w >= 0.9995) g1.y = 0.0;
    }

    vec4 inner = vec4(
      r.x + g0.x,
      r.y + g0.y,
      r.z - g1.x,
      r.w - g1.y
    );

    // アニメ用に矩形を変形
    vec2 c = (inner.xy + inner.zw) * 0.5;
    vec2 hs = (inner.zw - inner.xy) * 0.5;

    vec2 cA = c;
    vec2 hsA = hs;

    if (fx < 0.5) {
      // fade: 形は固定
    } else if (fx < 1.5) {
      // slide
      vec2 offs = vec2(0.0);
      if (dir < 0.5) offs = vec2(-1.2, 0.0);
      else if (dir < 1.5) offs = vec2( 1.2, 0.0);
      else if (dir < 2.5) offs = vec2( 0.0,-1.2);
      else offs = vec2(0.0, 1.2);

      // 最初は外から
      cA = mix(c + offs, c, e);
    } else {
      // pop (scale)
      float s = mix(0.05, 1.0, e);
      hsA = hs * s;
    }

    vec2 p = uv - cA;
    float inside = step(max(abs(p.x) - hsA.x, abs(p.y) - hsA.y), 0.0);

    if (inside > 0.5 && alpha > bestA) {
      bestA = alpha;
      bestId = i;
      bestRect = vec4(cA - hsA, cA + hsA); // x0,y0,x1,y1
      bestLocal = (uv - (cA - hsA)) / max((hsA * 2.0), vec2(1e-6));
    }
  }

  // パネルが選ばれた
  if (bestId >= 0) {
    // 枠線：均一
    vec2 p = uv;
    vec2 dEdge = min(p - bestRect.xy, bestRect.zw - p);
    float dMin = min(dEdge.x, dEdge.y);

    // 枠：黒
    float line = 1.0 - smoothstep(frame, frame + 1.5 * px.y, dMin);

    // 中身：白ベース + トーン / ベタ
    float sid = float(bestId);
    float seed = hash11(sid + 13.0);

    vec3 ink = vec3(1.0);
    float tonePick = seed;

    // トーン生成（3タイプ）
    float tone = 0.0;
    if (tonePick < 0.34) {
      // ドット
      float ht = halftone(bestLocal, mix(55.0, 115.0, hash11(sid + 21.0)), 0.35);
      tone = 1.0 - ht; // 黒寄せ
      ink = mix(vec3(1.0), vec3(0.0), 0.70 * tone * uToneAmt);
    } else if (tonePick < 0.67) {
      // ベタ（グレー～黒）
      float g = mix(0.15, 0.55, hash11(sid + 31.0));
      ink = vec3(g);
    } else {
      // 効果線（放射）
      float sp = speedLines(bestLocal, seed);
      ink = mix(vec3(1.0), vec3(0.0), 0.85 * sp * uToneAmt);
    }

    // 枠線優先
    vec3 panelCol = mix(ink, vec3(0.0), line);

    // フェード系（fx=0）だけ alpha を強めに効かせる
    vec4 a = getAnim(bestId);
    float fx = a.z;
    float alpha = bestA;
    if (fx < 0.5) {
      alpha = bestA;
    } else {
      // slide/pop は形が出るので色は少し早め
      alpha = clamp(bestA * 1.15, 0.0, 1.0);
    }

    col = mix(col, panelCol, alpha);
  }

  gl_FragColor = vec4(col, 1.0);
}
