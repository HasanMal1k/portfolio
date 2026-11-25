// The paper pass. While you hold an animal, the world is redrawn as coloured ASCII on cream paper,
// switching cell by cell in a ripple that starts at the animal. The held animal is drawn on top, untouched.

export const POST_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const POST_FRAG = /* glsl */ `
uniform sampler2D tWorld;
uniform sampler2D tHeld;
uniform sampler2D tAtlas;
uniform float uHeldOn;
uniform vec2  uRes;     // device px
uniform vec2  uCell;    // glyph cell, device px
uniform float uGlyphs;
uniform float uAscii;   // 0 → 1
uniform vec2  uOrigin;  // device px, y up
uniform vec3  uPaper;

const float PI = 3.14159265;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 col = texture2D(tWorld, frag / uRes).rgb;

  if (uAscii > 0.0) {
    vec2 ft = vec2(frag.x, uRes.y - frag.y);           // y down, so glyphs stand upright
    vec2 cellId = floor(ft / uCell);
    vec2 cuv = fract(ft / uCell);
    vec2 ct = (cellId + 0.5) * uCell;
    vec2 c = vec2(ct.x, uRes.y - ct.y);
    float d = length(c - uOrigin) / length(uRes);
    float k = clamp((uAscii * 1.35 - d - hash12(cellId) * 0.1) / 0.14, 0.0, 1.0);
    if (k > 0.0) {
      vec3 cs = texture2D(tWorld, c / uRes).rgb;
      float lum = pow(dot(cs, vec3(0.2126, 0.7152, 0.0722)), 0.4545);
      float dens = smoothstep(0.06, 0.85, 1.0 - lum);
      float idx = floor(dens * 0.999 * uGlyphs);
      float pop = 1.0 + 0.8 * sin(k * PI);                 // glyphs bounce in
      vec2 gu = (cuv - 0.5) / pop + 0.5;
      float inside = step(0.0, gu.x) * step(gu.x, 1.0) * step(0.0, gu.y) * step(gu.y, 1.0);
      float g = texture2D(tAtlas, vec2((idx + clamp(gu.x, 0.0, 1.0)) / uGlyphs, clamp(gu.y, 0.0, 1.0))).r * inside;
      vec3 ink = pow(cs, vec3(1.3)) * 0.9;
      vec3 paper = mix(uPaper, cs, 0.07);
      col = mix(col, mix(paper, ink, g), smoothstep(0.0, 0.35, k));
    }
  }

  if (uHeldOn > 0.5) {
    vec4 held = texture2D(tHeld, frag / uRes);
    col = mix(col, held.rgb / max(held.a, 1e-4), held.a);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`
