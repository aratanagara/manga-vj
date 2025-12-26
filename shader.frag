// shader.frag
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 vTexCoord;

uniform vec2  uResolution;
uniform float uTime;

uniform int   uPanelCount;
uniform float uRects[48]; // MAX_PANELS(12)*4 : x,y,w,h (0..1)
uniform float uAnims[48]; // start,dur,type,seed
uniform float uFrameWpx;
uniform float uGutterPx;

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

// Quint + Bound（0..1に収める）
float easeOutQuintBound(float t){
  t = clamp(t, 0.0, 1.0);
  float q = 1.0 - pow(1.0 - t, 5.0); // easeOutQuint
  // Bound: 終盤だけ微振動→0..1にクランプ
  float wob = 0.045 * sin(t * 3.14159265 * 3.0) * (1.0 - t) * t;
  return clamp(q + wob, 0.0, 1.0);
}

float sdBox(vec2 p, vec2 b){
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main(){
  vec2 uv = vTexCoord;      // 0..1
  vec2 px = uv * uResolution;

  // 背景（余白＝白）
  vec3 col = vec3(1.0);

  float frameN = uFrameWpx / min(uResolution.x, uResolution.y);

  // 余白のルール：斜めを作らず、水平垂直のみ（ここでは単純に白）
  // パネル枠を順に合成（最後に黒い線が勝つ）
  for (int i = 0; i < 12; i++){
    if (i >= uPanelCount) break;

    float x = uRects[i*4+0];
    float y = uRects[i*4+1];
    float w = uRects[i*4+2];
    float h = uRects[i*4+3];

    float start = uAnims[i*4+0];
    float dur   = uAnims[i*4+1];
    float typeF = uAnims[i*4+2];
    float seed  = uAnims[i*4+3];

    // セル（クリップ領域：最終セルに固定）
    vec2 cellMin = vec2(x, y);
    vec2 cellMax = vec2(x+w, y+h);
    if (uv.x < cellMin.x || uv.y < cellMin.y || uv.x > cellMax.x || uv.y > cellMax.y) {
      continue;
    }

    float t = (uTime - start) / max(dur, 1e-4);
    float e = easeOutQuintBound(t);

    // 基本の箱（セル内に収まる）
    vec2 baseC = vec2(x + 0.5*w, y + 0.5*h);
    vec2 baseB = vec2(0.5*w, 0.5*h);

    // 演出ごとの変形（セル外へは出さない：クリップで抑える）
    vec2 c = baseC;
    vec2 b = baseB;
    float a = 1.0;

    int type = int(floor(typeF + 0.5));

    if (type == 0) {
      // fade
      a = e;
    } else if (type == 1) {
      // popup（中心スケール）
      float s = mix(0.18, 1.0, e);
      b *= s;
    } else {
      // slide（セル内だけでスライドイン：距離はセルサイズに比例）
      float r = hash11(seed + float(i) * 13.7);
      vec2 dir;
      if (r < 0.25) dir = vec2(-1.0, 0.0);
      else if (r < 0.50) dir = vec2( 1.0, 0.0);
      else if (r < 0.75) dir = vec2(0.0, -1.0);
      else dir = vec2(0.0,  1.0);

      float dist = 0.35 * min(w, h); // セル内
      c += dir * dist * (1.0 - e);
    }

    // パネル内は白で「塗り」（将来ここを画像テクスチャに差し替えられる）
    vec2 p = uv - c;
    float d = sdBox(p, b);

    // 内部
    float inside = step(d, -frameN);
    // 枠線（均一幅）
    float border = smoothstep(frameN, 0.0, abs(d));

    // 合成：塗りは白、線は黒（線の出現だけアニメの影響を強める）
    // ※ inside は常に白なので背景と同化、線だけ見える（漫画枠の見え方を優先）
    float line = border * a;

    col = mix(col, vec3(0.0), line);
  }

  gl_FragColor = vec4(col, 1.0);
}