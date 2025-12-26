// shader.frag
#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

uniform vec2  uResolution;
uniform float uTime;
uniform sampler2D uMask;   // R=id, G=tone, A=alpha
uniform float uBorderPx;

varying vec2 vTexCoord;

float hash21(vec2 p){
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float sat(float x){ return clamp(x, 0.0, 1.0); }

// スクリーントーン（ドット）っぽい簡易
float toneDots(vec2 uv, float dens, float seed){
  // uv: 0..1
  float s = mix(80.0, 220.0, dens);
  vec2 p = uv * s;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;

  float rnd = hash21(ip + seed*17.0);
  float rad = mix(0.08, 0.36, rnd);
  float d = length(fp);
  // ドットは黒、背景は白に寄せる
  return step(rad, d); // 0=黒,1=白
}

// 簡易ノイズトーン（ハッチ/砂目っぽい）
float toneNoise(vec2 uv, float dens, float seed){
  float n = hash21(floor(uv * mix(90.0, 260.0, dens)) + seed*31.0);
  float thr = mix(0.45, 0.72, dens);
  return step(thr, n); // 0=黒,1=白
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution.xy;

  // ページ余白は白
  vec4 m  = texture2D(uMask, uv);
  float a = m.a;

  if (a <= 0.0) {
    gl_FragColor = vec4(1.0);
    return;
  }

  // パネルID（境界判定に使う）
  float id = m.r;
  float tone = m.g;

  // ベース：白
  vec3 col = vec3(1.0);

  // トーン or ベタ（黒）を入れる
  // tone で種類を分岐
  float seed = id * 97.0;

  float tsel = tone;
  float toneW = 1.0;

  if (tsel < 0.18) {
    // ベタ（黒）
    col = mix(col, vec3(0.0), 0.92);
  } else if (tsel < 0.62) {
    // ドットトーン
    float w = toneDots(uv, sat((tsel - 0.18) / 0.44), seed);
    col *= vec3(w);
  } else {
    // ノイズトーン
    float w = toneNoise(uv, sat((tsel - 0.62) / 0.38), seed);
    col *= vec3(w);
  }

  // 枠線：マスクの差分で検出（均一幅）
  vec2 px = 1.0 / uResolution.xy;
  float bwx = uBorderPx * px.x;
  float bwy = uBorderPx * px.y;

  // 近傍サンプル（同一パネルかどうか）
  vec4 mL = texture2D(uMask, uv + vec2(-bwx, 0.0));
  vec4 mR = texture2D(uMask, uv + vec2( bwx, 0.0));
  vec4 mU = texture2D(uMask, uv + vec2(0.0, -bwy));
  vec4 mD = texture2D(uMask, uv + vec2(0.0,  bwy));

  // “外側（白）” or “別ID” を境界とみなす
  float edge =
    step(0.001, a) * (
      step(mL.a, 0.001) + step(mR.a, 0.001) + step(mU.a, 0.001) + step(mD.a, 0.001)
      + step(0.02, abs(mL.r - id)) + step(0.02, abs(mR.r - id))
      + step(0.02, abs(mU.r - id)) + step(0.02, abs(mD.r - id))
    );

  edge = sat(edge);

  // 枠線は黒
  col = mix(col, vec3(0.0), edge);

  // フェード（slide/popも含む）
  col = mix(vec3(1.0), col, a);

  gl_FragColor = vec4(col, 1.0);
}
