#ifdef GL_ES
precision mediump float;
precision mediump int;
#endif

uniform vec2  uResolution;
uniform float uTime;

varying vec2 vTexCoord;

// 軽いノイズ
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main(){
  // 0..1
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  // アスペクト補正付き -1..1
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;

  float t = uTime;

  // それっぽい流れ
  float a = atan(p.y, p.x);
  float r = length(p);
  float waves = sin(8.0*a + 6.0*r - t*2.0);

  float n = hash(floor(gl_FragCoord.xy * 0.75));
  float ink = smoothstep(0.2, -0.2, waves + (n - 0.5) * 0.35);

  // 白黒漫画っぽく
  vec3 col = mix(vec3(1.0), vec3(0.0), ink);

  gl_FragColor = vec4(col, 1.0);
}
