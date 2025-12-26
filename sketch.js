let theShader;

function preload(){
  // 同階層の shader.vert / shader.frag を読む
  theShader = loadShader("./shader.vert", "./shader.frag");
}

function setup(){
  // P2Dでも動くが、シェーダ前提なのでWEBGL
  createCanvas(windowWidth, windowHeight, WEBGL);
  noStroke();
}

function draw(){
  shader(theShader);

  // p5はWEBGL座標が中心原点なので、frag側で正規化するのが楽
  theShader.setUniform("uResolution", [width, height]);
  theShader.setUniform("uTime", millis() * 0.001);

  // 全画面矩形
  rect(-width/2, -height/2, width, height);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}
