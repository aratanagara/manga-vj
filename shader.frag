#ifdef GL_ES
precision mediump float;
#endif

uniform vec2  uResolution;
uniform float uTime;

uniform sampler2D uCamTex;
uniform sampler2D uImgTex;
uniform int   uUseCam;
uniform int   uUseImg;

#define MAX_PANELS 32
uniform int   uPanelCount;
uniform vec4  uRects[MAX_PANELS];  // xywh (0..1)
uniform float uAlpha[MAX_PANELS];  // 0..1
uniform float uLineW;              // in pixels

varying vec2 vTexCoord;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 posterize(vec3 c, float steps){
  return floor(c * steps) / steps;
}

float boxMask(vec2 uv, vec4 r){
  // r: xywh in 0..1
  vec2 p = (uv - r.xy) / r.zw; // local 0..1
  float inside = step(0.0, p.x) * step(0.0, p.y) * step(p.x, 1.0) * step(p.y, 1.0);
  return inside;
}

float boxBorder(vec2 uv, vec4 r, float px){
  // px: border thickness in pixels
  vec2 eps = vec2(px) / uResolution;
  vec2 p = (uv - r.xy) / r.zw; // local 0..1
  float inside = step(0.0, p.x) * step(0.0, p.y) * step(p.x, 1.0) * step(p.y, 1.0);
  if(inside < 0.5) return 0.0;

  // border in UV space: compare distance to edges in local
  float bx = min(p.x, 1.0 - p.x);
  float by = min(p.y, 1.0 - p.y);

  // convert eps to local thickness (approx)
  float localX = eps.x / max(r.z, 1e-6);
  float localY = eps.y / max(r.w, 1e-6);
  float t = max(localX, localY);

  float border = 1.0 - step(t, min(bx, by));
  return border;
}

void main(){
  vec2 uv = vTexCoord;

  // paper-ish background
  float n = hash12(uv * uResolution.xy * 0.25 + uTime * 0.2);
  float paper = 0.93 + 0.05 * (n - 0.5);
  vec3 bg = vec3(paper);

  // pick source texture
  vec3 src = bg;
  if(uUseCam == 1){
    src = texture2D(uCamTex, uv).rgb;
  }
  if(uUseImg == 1){
    // img overrides cam if on
    src = texture2D(uImgTex, uv).rgb;
  }

  // comic-ish treatment (軽い)
  src = posterize(src, 5.0);
  float grain = hash12(uv * uResolution.xy + uTime) - 0.5;
  src += 0.06 * grain;

  // compose panels
  vec3 col = bg;

  float anyInside = 0.0;
  float border = 0.0;

  for(int i=0;i<MAX_PANELS;i++){
    if(i >= uPanelCount) break;

    float m = boxMask(uv, uRects[i]);
    float a = uAlpha[i];
    anyInside = max(anyInside, m * step(0.001, a));

    // interior (white base + content)
    if(m > 0.5 && a > 0.001){
      // simple: show treated source inside
      vec3 insideCol = src;

      // optional: speedline-ish vignette
      vec2 p = (uv - (uRects[i].xy + 0.5*uRects[i].zw)) / max(uRects[i].zw, vec2(1e-6));
      float ang = atan(p.y, p.x);
      float rays = abs(sin(ang * 18.0 + uTime * 0.6));
      insideCol = mix(insideCol, vec3(1.0), 0.10 * rays);

      // white paper bias
      insideCol = mix(vec3(1.0), insideCol, 0.75);

      col = mix(col, insideCol, a);
    }

    border = max(border, boxBorder(uv, uRects[i], uLineW));
  }

  // gutters: outside panels stays white-ish bg, borders are black
  col = mix(col, vec3(0.0), border);

  gl_FragColor = vec4(col, 1.0);
}