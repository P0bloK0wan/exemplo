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

// Campo de um único "metaball" no estilo Wyvill/soft-object: limitado
// a [0,1], SEM singularidade no centro (ao contrário de um campo
// 1/dist² puro, cujo pico infinito no centro de cada lóbulo fazia
// qualquer detector de curvatura baseado em derivadas (Laplaciano)
// disparar erroneamente ali, em vez de nos vales entre lóbulos).
float lobeField(vec2 p, vec2 c, float r) {
  float d2 = dot(p - c, p - c);
  float r2 = r * r;
  if (d2 >= r2) return 0.0;
  float t = 1.0 - d2 / r2;
  return t * t * t;
}

// IMPORTANTE (GLSL ES 1.00 / WebGL1): o raio de influência de cada
// lóbulo (raio "visual" × 1.4, para permitir a fusão a distância) é
// calculado INLINE dentro de cada laço abaixo, em vez de numa função
// auxiliar separada tipo \`lobeInfluence(int i)\`. Passar o índice do
// laço como parâmetro de função e indexar \`u_lobes[i]\` LÁ DENTRO
// quebra em compiladores GLSL ES 1.00 estritos (confirmado com o
// SwiftShader usado pelo Chromium headless, e o mesmo tipo de
// restrição existe no ANGLE que a Safari do iOS usa por baixo) — a
// especificação só garante indexação dinâmica de arrays quando o
// índice é literalmente a variável do \`for\` usada na MESMA expressão
// sintática do laço, não repassada por uma chamada de função. Quando
// isso falhava, o shader não compilava, \`createSculptureGLRenderer\`
// devolvia \`null\`, e o componente caía pro fallback SVG silenciosamente
// — foi exatamente o que aconteceu aqui antes deste comentário existir.
float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 4; i++) {
    f += lobeField(p, u_lobes[i].xy, u_lobes[i].z * 1.4);
  }
  return f;
}

// Maior contribuição de UM ÚNICO lóbulo neste ponto — comparado à
// soma de todos (field()), a diferença entre os dois é exatamente o
// quanto um SEGUNDO (ou terceiro) lóbulo está empilhado ali por cima
// do dominante. Essa "sobra" é zero onde só um lóbulo importa (então
// nenhuma sombra) e cresce exatamente nas selas de verdade entre dois
// lóbulos — um sinal direto de sobreposição geométrica, mais robusto
// que inferir por derivadas numéricas do campo.
float maxLobeField(vec2 p) {
  float m = 0.0;
  for (int i = 0; i < 4; i++) {
    m = max(m, lobeField(p, u_lobes[i].xy, u_lobes[i].z * 1.4));
  }
  return m;
}

void main() {
  vec2 res = u_resolution;
  vec2 p = (gl_FragCoord.xy / res) * 2.0 - 1.0;
  p.y = -p.y;
  float aspect = res.x / res.y;
  if (aspect > 1.0) { p.x *= aspect; } else { p.y /= aspect; }

  // Limiar mais baixo = silhueta visível maior em relação ao raio
  // nominal de cada lóbulo — ajustado para a Variante B ocupar
  // proporcionalmente o mesmo espaço do quadro que a Variante A (SVG),
  // já que as duas precisam "parecer o mesmo objeto" em qualquer
  // tamanho de exibição, não só na mesma geometria normalizada.
  float threshold = 0.32;
  float f = field(p);
  float alpha = smoothstep(threshold - 0.05, threshold + 0.05, f);
  if (alpha < 0.004) { discard; }

  float eps = 0.012;
  float fx = field(p + vec2(eps, 0.0)) - field(p - vec2(eps, 0.0));
  float fy = field(p + vec2(0.0, eps)) - field(p - vec2(0.0, eps));
  vec3 normal = normalize(vec3(-fx, -fy, 0.6));

  // Sombra de interseção pela "sobra" de cobertura (ver maxLobeField
  // acima) — quase preta exatamente onde dois lóbulos se sobrepõem de
  // verdade, perto do zero em qualquer região dominada por um só.
  // Faixa alta de propósito: com o raio de influência de 1.4×, a
  // "sobra" cresce rápido perto do centro de qualquer sobreposição —
  // sem uma faixa larga aqui, a sombra tomava a metade do corpo em vez
  // de ficar concentrada só na linha da junção, como na referência.
  float excess = f - maxLobeField(p);
  float crease = clamp(smoothstep(0.1, 0.62, excess), 0.0, 1.0);

  vec3 lightDir = normalize(vec3(-0.5, 0.6, 0.7));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.1);

  // Leitosa: base quase branca, nunca cinza neutro — só esfria um pouco na sombra.
  vec3 bodyColor = vec3(0.90, 0.94, 0.99);
  vec3 blueTint = vec3(0.30, 0.55, 0.97);

  vec3 color = mix(bodyColor, vec3(1.0), diffuse * 0.5);
  // Brilho de borda mais forte, perto do branco estourado da referência.
  color += fresnel * (0.55 + u_glow * 0.55);
  // Ponto de brilho estreito e intenso (vidro/porcelana) — sem isso a
  // superfície fica só "clara", nunca com aquele brilho quase estourado
  // que a referência tem na zona mais iluminada.
  float specular = pow(diffuse, 9.0);
  color += specular * 0.6;
  color = mix(color, blueTint, 0.06 + fresnel * 0.07);
  // Interseção escurece bastante, mas não a um preto chapado sem
  // variação — a referência mantém alguma leitura de forma mesmo na
  // sombra mais funda.
  color *= mix(1.0, 0.22, crease);

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
