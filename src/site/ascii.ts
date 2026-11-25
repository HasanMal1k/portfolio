// The background: the skier clip redrawn as ASCII, live, in one WebGL2 draw call per frame.
// Dark pixels (the skier, his shadow) become dense glyphs; bright snow becomes sparse dots.
// The red jacket keeps its colour; everything else is ink.

const RAMP = ' .·:-=+*o#%@'
const LOOP = { start: 1.0, end: 6.2 } // seconds of the clip we play
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uVideo;
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec2  uRes;       // device px
uniform vec2  uCell;      // device px
uniform vec2  uK;         // cover-fit scale: screen → video uv
uniform vec2  uFocus;     // where the skier is in the clip (video uv)
uniform vec2  uAnchor;    // where he should sit on screen (0..1)
uniform float uZoom;
uniform vec2  uPointer;   // device px in the canvas, y down
uniform vec2  uDrag;      // device px: how far the cursor has run ahead of the lens (a spring)
uniform float uPointerOn;
uniform float uRadius;    // device px
uniform float uTime;
uniform float uReveal;
uniform vec3  uRing;      // the entrance ripple: where the visitor clicked (device px) and how far it has run
uniform float uRingW;     // device px between one swell and the next, roughly
uniform float uRingAmp;   // 1 as it leaves the click, 0 once it has crossed the screen
uniform float uIdle;      // how bright the picture is where the ripple hasn't reached yet
uniform float uShade;     // overall brightness: the post-intro fade and the sheet covering the hero
uniform vec3  uBg;
uniform vec3  uInk;
uniform vec3  uHot;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// The cursor is a soft lens that bends the picture, not the glyphs. Under it the skier swells,
// when it moves he's dragged along behind it like taffy, and when it stops he wobbles back.
vec2 warp(vec2 p) {
  if (uPointerOn < 0.002) return p;
  vec2 d = p - uPointer;
  float r2 = dot(d, d) / (uRadius * uRadius);
  float f = exp(-r2) * uPointerOn;
  float speed = min(length(uDrag) / uRadius, 1.0);
  vec2 q = p - d * f * 0.55;                                       // swell
  q -= uDrag * exp(-r2 * 0.5) * uPointerOn;                        // drag
  q += d * f * sin(sqrt(r2) * 10.0 - uTime * 7.0) * 0.1 * speed;   // ripples while it moves
  return q;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cellId = floor(frag / uCell);
  vec2 cuv = fract(frag / uCell);
  vec2 cc = (cellId + 0.5) * uCell;

  // The entrance: rings of glyphs run out from the click and wake the picture behind them.
  // ahead > 0: the wave hasn't got here yet; ahead < 0: it has passed, leaving smaller rings behind it.
  vec2 rd = cc - uRing.xy;
  float dist = max(length(rd), 1e-3);
  float ahead = (dist - uRing.z) / uRingW;
  float env = (ahead > 0.0 ? exp(-ahead * ahead * 2.0) : exp(ahead * 0.45)) * uRingAmp;
  float ring = env * max(cos(ahead * 2.4), 0.0);
  float wake = mix(uIdle, 1.0, smoothstep(0.6, -0.6, ahead));

  vec2 sp = warp(cc); // where this cell reads the picture from
  sp += rd / dist * sin(ahead * 2.4) * env * uRingW * 0.8; // the water bends the picture as it passes

  // follow-cam: the skier's spot in the clip lands on the anchor, zoomed in
  vec2 uv = uFocus + uK * (sp / uRes - uAnchor) / uZoom;
  float inClip = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec3 c = texture(uVideo, clamp(uv, 0.0, 1.0)).rgb;

  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  // skier, trees and shadows go dense; ski tracks and shade leave sparse marks that stream past
  float dens = smoothstep(0.52, 0.1, lum);
  // a soft spotlight on him: the trees and far snow stay as faint context
  vec2 off = (sp / uRes - uAnchor) * vec2(uRes.x / uRes.y, 1.0);
  dens *= mix(0.3, 1.0, smoothstep(0.75, 0.18, length(off)));
  float red = smoothstep(0.12, 0.3, c.r - max(c.g, c.b));
  dens = max(dens, red * 0.85) * inClip;
  red *= inClip;
  dens = max(dens, ring * 0.9);
  float idx = floor(clamp(dens, 0.0, 0.999) * uGlyphs);

  // decode in, top-left to bottom-right, with a little noise
  float h = hash12(cellId);
  float shown = step(h * 0.35 + (cc.x / uRes.x + cc.y / uRes.y) * 0.32, uReveal);

  float g = texture(uAtlas, vec2((idx + cuv.x) / uGlyphs, cuv.y)).r * shown;
  vec3 ink = uInk * (0.28 + 0.72 * dens);
  ink = mix(ink, uHot, max(red, ring * 0.45));
  vec3 col = uBg + (ink - uBg) * g * uShade * max(wake, ring);
  outColor = vec4(col, 1.0);
}`

export interface Ascii {
  /** the visitor pressed Enter: ripple out from this point (client px; null for no ripple), start the clip, retire the cursor warp */
  enter(at: { x: number; y: number } | null): void
  /** 0..1: sink the skier back once he has had his moment, so the name can take over */
  setFade(v: number): void
  setDim(v: number): void
  /** false once the hero is covered: stop drawing and pause the clip until it shows again */
  setActive(on: boolean): void
  setPlaying(on: boolean): void
  playing(): boolean
  onFrame(cb: (frame: number, total: number) => void): void
}

const hex = (h: number): [number, number, number] => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255]

export function startAscii(canvas: HTMLCanvasElement, video: HTMLVideoElement): Ascii | null {
  const glq = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' })
  if (!glq) return null
  const gl: WebGL2RenderingContext = glq

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? '')
    return s
  }
  const prog = gl.createProgram()!
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(prog)
  gl.useProgram(prog)
  gl.bindVertexArray(gl.createVertexArray())
  const U = (n: string) => gl.getUniformLocation(prog, n)
  const u = {
    video: U('uVideo'), atlas: U('uAtlas'), glyphs: U('uGlyphs'), res: U('uRes'), cell: U('uCell'),
    k: U('uK'), focus: U('uFocus'), anchor: U('uAnchor'), zoom: U('uZoom'),
    pointer: U('uPointer'), drag: U('uDrag'), pointerOn: U('uPointerOn'), radius: U('uRadius'), time: U('uTime'),
    reveal: U('uReveal'), shade: U('uShade'), bg: U('uBg'), ink: U('uInk'), hot: U('uHot'),
    ring: U('uRing'), ringW: U('uRingW'), ringAmp: U('uRingAmp'), idle: U('uIdle'),
  }
  gl.uniform1i(u.video, 0)
  gl.uniform1i(u.atlas, 1)
  gl.uniform1f(u.glyphs, RAMP.length)
  gl.uniform3fv(u.bg, hex(0x0e0e0d))
  gl.uniform3fv(u.ink, hex(0xe9e5dc))
  gl.uniform3fv(u.hot, hex(0xff4a26))
  gl.uniform1f(u.idle, 0.2)
  gl.uniform1f(u.ringW, 1) // never 0: the shader divides by it

  const tex = (unit: number, filter: number) => {
    const t = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
    return t
  }
  const videoTex = tex(0, gl.LINEAR)
  const atlasTex = tex(1, gl.NEAREST)

  // ------------------------------------------------------------------ glyph atlas
  const cell = { w: 8, h: 14 }
  function drawAtlas() {
    const n = RAMP.length
    const c = document.createElement('canvas')
    c.width = cell.w * n
    c.height = cell.h
    const x = c.getContext('2d')!
    x.fillStyle = '#000'
    x.fillRect(0, 0, c.width, c.height)
    let fs = cell.h * 0.8
    x.font = `400 ${fs}px ${MONO}`
    const adv = x.measureText('M').width
    if (adv > cell.w * 0.96) fs *= (cell.w * 0.96) / adv
    x.font = `400 ${fs}px ${MONO}`
    x.fillStyle = '#fff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    for (let i = 0; i < n; i++) x.fillText(RAMP[i], (i + 0.5) * cell.w, cell.h * 0.5 + fs * 0.04)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, atlasTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const w = canvas.clientWidth || innerWidth
    const h = canvas.clientHeight || innerHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(u.res, canvas.width, canvas.height)
    const narrow = w < 700
    const cw = Math.max(4, Math.round((narrow ? 6 : 8) * dpr))
    const ch = Math.max(7, Math.round((narrow ? 11 : 14) * dpr))
    if (cw !== cell.w || ch !== cell.h) {
      cell.w = cw
      cell.h = ch
      drawAtlas()
    }
    gl.uniform2f(u.cell, cell.w, cell.h)
    dirty = true
  }

  // ------------------------------------------------------------------ follow the skier
  // A 96×54 copy of each frame is enough to find the red jacket; the camera eases after it.
  const probe = document.createElement('canvas')
  probe.width = 96
  probe.height = 54
  const pctx = probe.getContext('2d', { willReadFrequently: true })!
  const seen = { x: 0.56, y: 0.36, zoom: 2 } // last place (video uv) and size of the jacket
  const focus = { x: 0.56, y: 0.36, zoom: 2 }
  function track() {
    pctx.drawImage(video, 0, 0, 96, 54)
    const d = pctx.getImageData(0, 0, 96, 54).data
    let sx = 0
    let sy = 0
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] - Math.max(d[i + 1], d[i + 2]) > 38) {
        const p = i >> 2
        sx += p % 96
        sy += (p / 96) | 0
        n++
      }
    }
    if (n >= 3) {
      seen.x = (sx / n + 0.5) / 96
      seen.y = (sy / n + 0.5) / 54 + 0.04 // the jacket is the top half of him
      // zoom in on him while he's far away, back off as he comes closer: a steady size on screen
      seen.zoom = Math.min(3.0, Math.max(1.6, 12 / Math.sqrt(n)))
      if (snap || Math.hypot(seen.x - focus.x, seen.y - focus.y) > 0.18) {
        // just looped, or he jumped across the frame: cut straight to him instead of a long pan
        Object.assign(focus, seen)
        snap = false
      }
    }
  }
  let snap = true
  function framing() {
    const w = canvas.width
    const h = canvas.height
    const sa = w / h
    const va = (video.videoWidth || 16) / (video.videoHeight || 9)
    const kx = sa > va ? 1 : sa / va
    const ky = sa > va ? va / sa : 1
    const narrow = (canvas.clientWidth || innerWidth) < 700
    const zoom = narrow ? Math.max(1, focus.zoom * 0.6) : focus.zoom
    const ax = narrow ? 0.5 : 0.8
    const ay = narrow ? 0.76 : 0.6
    gl.uniform2f(u.k, kx, ky)
    gl.uniform2f(u.anchor, ax, ay)
    gl.uniform1f(u.zoom, zoom)
    gl.uniform2f(u.focus, focus.x, focus.y)
  }

  // ------------------------------------------------------------------ video frames
  let fresh = false
  const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype
  const onVideoFrame = () => {
    fresh = true
    video.requestVideoFrameCallback(onVideoFrame)
  }
  if (rvfc) video.requestVideoFrameCallback(onVideoFrame)

  // ------------------------------------------------------------------ loop
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const RIPPLE = 1.9 // seconds for the entrance ripple to cross the screen
  const ring = { x: 0, y: 0, t: -1 } // client px of the click; t: seconds since it (-1 waiting for one, Infinity done)
  let dim = 0
  let fade = 0
  let reveal = reduced ? 1 : 0
  let pointerOn = 0
  let pointerTarget = 0
  let lensOn = true // the cursor warp plays over the still behind the gate; once in, the picture stays true
  const pointer = { x: -1e4, y: -1e4 } // client px
  const lens = { x: 0, y: 0, vx: 0, vy: 0 } // a point on a spring that trails the cursor
  let dirty = true
  let active = true
  let resume = false
  let frameCb: ((f: number, t: number) => void) | null = null
  let last = performance.now()
  let time = 0

  const aim = (e: PointerEvent) => {
    if (!lensOn) return
    if (pointerOn < 0.01) Object.assign(lens, { x: e.clientX, y: e.clientY, vx: 0, vy: 0 })
    pointer.x = e.clientX
    pointer.y = e.clientY
    pointerTarget = 1
    dirty = true
  }
  const drop = () => { pointerTarget = 0 }
  addEventListener('pointermove', aim, { passive: true })
  addEventListener('pointerdown', aim, { passive: true })
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') drop() })
  addEventListener('pointercancel', drop) // a touch that turns into a scroll
  addEventListener('blur', drop)
  document.documentElement.addEventListener('pointerleave', drop)

  function frame(now: number) {
    requestAnimationFrame(frame)
    if (active) step(now)
    else last = now
  }

  function springLens(dt: number) {
    if (reduced) { lens.x = pointer.x; lens.y = pointer.y; return }
    // underdamped, so it overshoots a little and wobbles when the cursor stops
    const n = Math.ceil(dt * 240)
    const h = dt / n
    for (let i = 0; i < n; i++) {
      lens.vx += ((pointer.x - lens.x) * 150 - lens.vx * 11) * h
      lens.vy += ((pointer.y - lens.y) * 150 - lens.vy * 11) * h
      lens.x += lens.vx * h
      lens.y += lens.vy * h
    }
  }

  function step(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    time += dt
    if (reveal < 1) { reveal = Math.min(1, reveal + dt / 1.4); dirty = true }
    if (ring.t >= 0 && ring.t < RIPPLE) { ring.t += dt; dirty = true }
    const p = pointerOn
    pointerOn += (pointerTarget - pointerOn) * Math.min(1, dt * 4)
    if (Math.abs(p - pointerOn) > 0.001 || pointerOn > 0.01) dirty = true
    springLens(dt)

    // loop only the clean run: open snow, skier in frame (the clip's last seconds swing into trees)
    if (!video.paused && video.currentTime >= LOOP.end) {
      video.currentTime = LOOP.start
      snap = true
    }

    if (video.readyState >= 2 && (fresh || (!rvfc && !video.paused))) {
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, videoTex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
      track()
      fresh = false
      dirty = true
      frameCb?.(Math.max(0, Math.floor((video.currentTime - LOOP.start) * 24)), Math.round((LOOP.end - LOOP.start) * 24))
    }
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7)
    const moved = Math.abs(seen.x - focus.x) + Math.abs(seen.y - focus.y) + Math.abs(seen.zoom - focus.zoom) > 1e-4
    focus.x += (seen.x - focus.x) * k
    focus.y += (seen.y - focus.y) * k
    focus.zoom += (seen.zoom - focus.zoom) * (reduced ? 1 : 1 - Math.exp(-dt * 2))
    if (moved) dirty = true
    if (!dirty) return
    framing()
    const rippling = ring.t >= 0 && ring.t < RIPPLE
    // client px → canvas px (the hero scales as the sheet covers it, so measure the real box)
    const r = pointerOn > 0.002 || rippling ? canvas.getBoundingClientRect() : null
    const sx = r ? canvas.width / (r.width || 1) : 1
    const sy = r ? canvas.height / (r.height || 1) : 1
    if (r && rippling) {
      const x = (ring.x - r.left) * sx
      const y = (ring.y - r.top) * sy
      const w = Math.min(canvas.width, canvas.height) * 0.045
      // far enough to clear the farthest corner, wake and all; fast at first, easing out like a splash
      const far = Math.max(Math.hypot(x, y), Math.hypot(canvas.width - x, y), Math.hypot(x, canvas.height - y), Math.hypot(canvas.width - x, canvas.height - y)) + w * 3
      const k = Math.min(1, ring.t / RIPPLE)
      gl.uniform3f(u.ring, x, y, far * (1 - (1 - k) ** 2))
      gl.uniform1f(u.ringW, w)
      gl.uniform1f(u.ringAmp, (1 - k) ** 1.3)
    } else {
      gl.uniform3f(u.ring, 0, 0, ring.t < 0 ? -1e5 : 1e6)
      gl.uniform1f(u.ringAmp, 0)
    }
    if (r && pointerOn > 0.002) {
      const radius = Math.min(canvas.width, canvas.height) * 0.2
      let dx = (pointer.x - lens.x) * sx
      let dy = (pointer.y - lens.y) * sy
      const len = Math.hypot(dx, dy)
      if (len > radius * 0.9) { dx *= (radius * 0.9) / len; dy *= (radius * 0.9) / len }
      gl.uniform2f(u.pointer, (pointer.x - r.left) * sx, (pointer.y - r.top) * sy)
      gl.uniform2f(u.drag, dx, dy)
      gl.uniform1f(u.radius, radius)
    }
    gl.uniform1f(u.pointerOn, pointerOn)
    gl.uniform1f(u.time, time)
    gl.uniform1f(u.reveal, reveal * 1.1)
    gl.uniform1f(u.shade, (1 - dim * 0.72) * (1 - fade * 0.7))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    dirty = false
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __ascii: {
        seen, focus, gl, prog, pointer, lens, ring, state: () => ({ active, pointerOn, fade, paused: video.paused }),
        step: (ms = 16) => { fresh = true; dirty = true; step(last + ms) },
      },
    })
  }

  new ResizeObserver(resize).observe(canvas)
  resize()
  drawAtlas()
  document.fonts.load(`400 16px "JetBrains Mono"`).finally(() => { drawAtlas(); dirty = true })
  video.addEventListener('loadeddata', () => { fresh = true })
  video.addEventListener('seeked', () => { fresh = true }) // the still frame behind the gate
  const toStart = () => { if (video.currentTime < LOOP.start || video.currentTime >= LOOP.end) { video.currentTime = LOOP.start; snap = true } }
  video.addEventListener('timeupdate', toStart) // also loops when frames are throttled
  if (video.readyState >= 1) toStart()
  else video.addEventListener('loadedmetadata', toStart, { once: true })
  // the clip waits behind the gate as a faint still; enter() starts it
  requestAnimationFrame((t) => { last = t; frame(t) })

  return {
    enter(at) {
      if (ring.t !== -1) return
      lensOn = false
      pointerTarget = 0 // the warp relaxes away as the ripple takes over
      if (at && !reduced) Object.assign(ring, { x: at.x, y: at.y, t: 0 })
      else ring.t = Infinity
      if (!reduced) video.play().catch(() => {})
      dirty = true
    },
    setFade(v) { if (Math.abs(v - fade) > 0.001) { fade = v; dirty = true } },
    setDim(v) { if (Math.abs(v - dim) > 0.001) { dim = v; dirty = true } },
    setActive(on) {
      if (on === active) return
      active = on
      if (!on) {
        resume = !video.paused // remember whether it was playing, so a Pause the visitor chose sticks
        video.pause()
      } else {
        if (resume) video.play().catch(() => {})
        dirty = true
      }
    },
    setPlaying(on) {
      if (on) video.play().catch(() => {})
      else video.pause()
    },
    playing: () => !video.paused,
    onFrame(cb) { frameCb = cb },
  }
}
