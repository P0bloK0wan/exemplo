/**
 * Kliko — motor WebGL da escultura (Fase 4 experimental, Variante B).
 *
 * Não faz ray marching 3D de verdade — usa um CAMPO IMPLÍCITO 2D
 * clássico de metaballs (kernel de Blinn: soma de r²/dist² por
 * lóbulo) e deriva uma normal "falsa" por diferenças centrais do
 * próprio campo, o suficiente para luz difusa + Fresnel (brilho de
 * borda) convincentes sem o custo de marchar um raio em 3D de
 * verdade — o canvas é pequeno (o orb/painel tem só algumas centenas
 * de pixels), então o custo por pixel desse cálculo é desprezível.
 *
 * A "sombra na interseção" pedida vem do LAPLACIANO do campo (regiões
 * de curvatura côncava — onde dois lóbulos se encontram) escurecendo
 * a cor ali — não é um efeito pintado à mão, emerge da própria
 * geometria dos lóbulos.
 *
 * Framework-free e testável: `createSculptureGLRenderer` devolve
 * `null` quando WebGL não está disponível ou os shaders falham ao
 * compilar — é esse `null` que o componente React usa para cair no
 * fallback SVG automaticamente, sem exceção não tratada.
 */
import type { Lobe } from "./sculptureEngine";

const VERTEX_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec3 u_lobes[4]; // xy = centro (-1..1), z = raio
uniform float u_glow;

float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 c = u_lobes[i].xy;
    float r = u_lobes[i].z;
    vec2 d = p - c;
    float dist2 = dot(d, d) + 0.0008;
    f += (r * r) / dist2;
  }
  return f;
}

void main() {
  vec2 res = u_resolution;
  vec2 p = (gl_FragCoord.xy / res) * 2.0 - 1.0;
  p.y = -p.y;
  float aspect = res.x / res.y;
  if (aspect > 1.0) { p.x *= aspect; } else { p.y /= aspect; }

  float threshold = 1.0;
  float f = field(p);
  float alpha = smoothstep(threshold - 0.09, threshold + 0.09, f);
  if (alpha < 0.004) { discard; }

  float eps = 0.015;
  float fx = field(p + vec2(eps, 0.0)) - field(p - vec2(eps, 0.0));
  float fy = field(p + vec2(0.0, eps)) - field(p - vec2(0.0, eps));
  vec3 normal = normalize(vec3(-fx, -fy, 0.65));

  float lap = field(p + vec2(eps, 0.0)) + field(p - vec2(eps, 0.0))
            + field(p + vec2(0.0, eps)) + field(p - vec2(0.0, eps)) - 4.0 * f;
  float crease = clamp(smoothstep(0.0, -0.55, lap), 0.0, 1.0);

  vec3 lightDir = normalize(vec3(-0.5, 0.6, 0.7));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.4);

  vec3 bodyColor = vec3(0.92, 0.95, 0.99);
  vec3 blueTint = vec3(0.31, 0.56, 0.97);

  vec3 color = mix(bodyColor, vec3(1.0), diffuse * 0.55);
  color += fresnel * (0.35 + u_glow * 0.5);
  color = mix(color, blueTint, 0.07 + fresnel * 0.08);
  color *= mix(1.0, 0.5, crease);

  gl_FragColor = vec4(color, alpha);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export interface SculptureGLRenderer {
  render(lobes: Lobe[], glow: number): void;
  /** Redimensiona o framebuffer interno — `pixelRatio` é o multiplicador real usado (já adaptado, não necessariamente `devicePixelRatio` do dispositivo). */
  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void;
  dispose(): void;
}

export function createSculptureGLRenderer(canvas: HTMLCanvasElement): SculptureGLRenderer | null {
  const maybeGl = (canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true }) ??
    canvas.getContext("experimental-webgl", { alpha: true, antialias: true })) as WebGLRenderingContext | null;
  if (!maybeGl) return null;
  // Renomeado para um binding não-nulo: closures definidas abaixo (resize/render/dispose)
  // não herdam o estreitamento de tipo do `if` acima sobre a variável original.
  const gl: WebGLRenderingContext = maybeGl;

  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_pos");

  const u_resolution = gl.getUniformLocation(program, "u_resolution");
  const u_lobes = gl.getUniformLocation(program, "u_lobes");
  const u_glow = gl.getUniformLocation(program, "u_glow");

  gl.useProgram(program);
  gl.enableVertexAttribArray(posLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    const w = Math.max(1, Math.round(cssWidth * pixelRatio));
    const h = Math.max(1, Math.round(cssHeight * pixelRatio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  }

  function render(lobes: Lobe[], glow: number): void {
    if (gl.isContextLost()) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniform2f(u_resolution, canvas.width, canvas.height);
    gl.uniform1f(u_glow, glow);
    const flat = new Float32Array(12);
    for (let i = 0; i < 4; i++) {
      const lobe = lobes[i];
      flat[i * 3] = lobe?.cx ?? 0;
      flat[i * 3 + 1] = lobe?.cy ?? 0;
      flat[i * 3 + 2] = lobe?.r ?? 0;
    }
    gl.uniform3fv(u_lobes, flat);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function dispose(): void {
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.deleteBuffer(posBuffer);
  }

  return { render, resize, dispose };
}
