#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

uniform vec2  uResolution;
uniform float uTime;

#define MAX_PANELS 24
uniform int   uPanelCount;
uniform vec4  uRects[MAX_PANELS]; // xywh (0..1)
uniform float uAlpha[MAX_PANELS];
uniform float uLineW;

varying vec2 vTexCoord;

// --------------------
// Utils
// --------------------
float hash21(vec2 p){
  p = fract(p*vec2(123.34,456.21));
  p += dot(p,p+45.32);
  return fract(p.x*p.y);
}

float boxMask(vec2 uv, vec4 r){
  vec2 p = (uv-r.xy)/r.zw;
  return step(0.0,p.x)*step(0.0,p.y)*step(p.x,1.0)*step(p.y,1.0);
}

float boxBorder(vec2 uv, vec4 r, float px){
  vec2 eps = vec2(px)/uResolution;
  vec2 p = (uv-r.xy)/r.zw;
  if(p.x<0.0||p.y<0.0||p.x>1.0||p.y>1.0) return 0.0;
  float d = min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
  float t = max(eps.x/r.z, eps.y/r.w);
  return 1.0-step(t,d);
}

// --------------------
// Main
// --------------------
void main(){
  vec2 uv = vTexCoord;

  // paper base
  float n = hash21(uv*uResolution.xy+uTime);
  vec3 col = vec3(0.93 + 0.05*(n-0.5));

  float border = 0.0;

  for(int i=0;i<MAX_PANELS;i++){
    if(i>=uPanelCount) break;

    float a = uAlpha[i];
    if(a<0.001) continue;

    float m = boxMask(uv,uRects[i]);
    if(m>0.5){
      // inside = white (漫画の紙)
      col = mix(col, vec3(1.0), a);
    }
    border = max(border, boxBorder(uv,uRects[i],uLineW));
  }

  // black frame
  col = mix(col, vec3(0.0), border);

  gl_FragColor = vec4(col,1.0);
}