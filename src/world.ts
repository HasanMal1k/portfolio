import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Mesh, MeshBasicMaterial,
  ShaderMaterial, PlaneGeometry, CircleGeometry, DirectionalLight, HemisphereLight, Fog, Color, Vector2,
  Vector3, Plane, Raycaster, WebGLRenderTarget, CanvasTexture, NearestFilter, PCFShadowMap,
  SRGBColorSpace, type IUniform,
} from 'three'
import { chunkGeometry, CHUNK } from './terrain'
import { toon } from './toon'
import { Flora, placeFlora, type Placement } from './flora'
import { Animal, spawnsFor } from './animals'
import { POST_VERT, POST_FRAG } from './post'
import { height, WATER } from './noise'
import type { Species } from './config'

export interface WorldHooks {
  onHover(a: Animal | null): void
  onTag(x: number, y: number): void
  onPick(a: Animal): void
  onDrop(): void
  onMove(): void
}

export interface World {
  drop(): void
  seek(species: Species): void
  setMotion(on: boolean): void
  motion(): boolean
}

const FOG = new Color(0xbfe6ff)
const PAPER = new Color(0xfbf3e0)
const RAMP = ' .:-=+*o#%@'
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const AZ = 0.62 // camera heading
const EL = 0.86 // camera pitch
const DIR = new Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL))
const RIGHT = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ))
const FWD = new Vector3(-Math.sin(AZ), 0, -Math.cos(AZ)) // away from the camera, on the ground
const RADIUS = 2 // chunks loaded around you, each side

const CLOUD_GLSL = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
float ch(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float cn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ch(i), ch(i + vec2(1, 0)), u.x), mix(ch(i + vec2(0, 1)), ch(i + vec2(1, 1)), u.x), u.y);
}
float clouds(vec2 p) {
  p = p * 0.045 + uTime * vec2(0.05, 0.025);
  return smoothstep(0.5, 0.56, cn(p) * 0.65 + cn(p * 2.1) * 0.35);   // hard-edged, like painted shadow
}
`

// foam that laps at the waterline, drawn on the shore
const FOAM_GLSL = /* glsl */ `
float foam(vec3 w) {
  float lap = 0.05 + 0.05 * sin(uTime * 1.6 + (w.x + w.z) * 0.7);
  float d = w.y - (${'WATER_LEVEL'} + lap);
  return step(-0.02, d) * step(d, 0.07) + step(0.13, d) * step(d, 0.16) * step(0.5, cn(w.xz * 0.8 + uTime * 0.2));
}
`

const WATER_GLSL = /* glsl */ `
uniform float uTime;
varying vec3 vWPos;
float wh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wh(i), wh(i + vec2(1, 0)), u.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), u.x), u.y);
}
float waves(vec2 p) {
  float n = wn(p * 0.16 + vec2(uTime * 0.04, uTime * 0.025)) * 0.7 + wn(p * 0.4 - uTime * 0.05) * 0.3;
  return smoothstep(0.44, 0.47, abs(fract(n * 4.0) - 0.5));        // thin white contour lines
}
`

export function createWorld(canvas: HTMLCanvasElement, hooks: WorldHooks): World | null {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, stencil: false, powerPreference: 'high-performance' })
  } catch {
    return null
  }
  if (!renderer.capabilities.isWebGL2) return null
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let motionOn = true
  let time = 0

  // ------------------------------------------------------------------ scene
  const scene = new Scene()
  scene.background = FOG
  scene.fog = new Fog(FOG, 40, 90)
  const camera = new PerspectiveCamera(30, 1, 1, 400)

  const hemi = new HemisphereLight(0xe8f6ff, 0x5f8f4a, 1.0)
  const sun = new DirectionalLight(0xfff3dc, 2.1)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 120 })
  sun.shadow.bias = -0.0008
  sun.shadow.normalBias = 0.04
  hemi.layers.enableAll()
  sun.layers.enableAll()
  scene.add(hemi, sun, sun.target)

  const cloudUniforms = { uTime: { value: 0 } } satisfies Record<string, IUniform>
  const ground = toon({ vertexColors: true })
  ground.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = cloudUniforms.uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${CLOUD_GLSL}\n${FOAM_GLSL.replace('WATER_LEVEL', WATER.toFixed(3))}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - 0.14 * clouds(vWPos.xz);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), foam(vWPos));`,
      )
  }

  const waterMat = new MeshBasicMaterial({ color: 0x2ea6e8 })
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = cloudUniforms.uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${WATER_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.98, 1.0), waves(vWPos.xz) * 0.9);')
  }
  const water = new Mesh(new PlaneGeometry(400, 400), waterMat)
  water.rotation.x = -Math.PI / 2
  water.position.y = WATER
  water.receiveShadow = true
  scene.add(water)

  const flora = new Flora(scene)

  // a soft shadow under whatever you are holding
  const blob = new Mesh(new CircleGeometry(0.8, 24), new MeshBasicMaterial({ color: 0x2d3a22, transparent: true, opacity: 0.22, depthWrite: false }))
  blob.rotation.x = -Math.PI / 2
  blob.visible = false
  scene.add(blob)

  // ------------------------------------------------------------------ endless field
  const chunks = new Map<string, { mesh: Mesh; flora: Placement[] }>()
  const animals: Animal[] = []
  const spawned = new Set<string>()
  let chunkX = Infinity
  let chunkZ = Infinity

  function streamChunks(limit: number) {
    const cx0 = Math.floor(target.x / CHUNK)
    const cz0 = Math.floor(target.z / CHUNK)
    let changed = false
    let built = 0
    const want: [number, number, number][] = []
    for (let dz = -RADIUS; dz <= RADIUS; dz++) for (let dx = -RADIUS; dx <= RADIUS; dx++) want.push([cx0 + dx, cz0 + dz, dx * dx + dz * dz])
    want.sort((a, b) => a[2] - b[2])
    for (const [cx, cz] of want) {
      const key = `${cx},${cz}`
      if (chunks.has(key) || built >= limit) continue
      const mesh = new Mesh(chunkGeometry(cx, cz), ground)
      mesh.receiveShadow = true
      scene.add(mesh)
      chunks.set(key, { mesh, flora: placeFlora(cx, cz) })
      if (!spawned.has(key)) {
        spawned.add(key)
        for (const s of spawnsFor(cx, cz)) addAnimal(new Animal(s.species, s.x, s.z, s.yaw, s.seed, key))
      }
      built++
      changed = true
    }
    for (const [key, c] of chunks) {
      const [cx, cz] = key.split(',').map(Number)
      if (Math.abs(cx - cx0) <= RADIUS + 1 && Math.abs(cz - cz0) <= RADIUS + 1) continue
      scene.remove(c.mesh)
      c.mesh.geometry.dispose()
      chunks.delete(key)
      changed = true
      spawned.delete(key)
      for (let i = animals.length - 1; i >= 0; i--) {
        const a = animals[i]
        if (a.home === key && a !== held && a.position.distanceTo(target) > CHUNK * 2) {
          scene.remove(a.rig.root)
          animals.splice(i, 1)
        }
      }
    }
    // terrain loads 5×5 chunks; plants only grow in the 3×3 you can actually see (fog hides the rest)
    if (changed || cx0 !== chunkX || cz0 !== chunkZ) {
      const near: Placement[][] = []
      for (const [key, c] of chunks) {
        const [cx, cz] = key.split(',').map(Number)
        if (Math.abs(cx - cx0) <= 1 && Math.abs(cz - cz0) <= 1) near.push(c.flora)
      }
      flora.rebuild(near)
    }
    chunkX = cx0
    chunkZ = cz0
  }

  function addAnimal(a: Animal) {
    animals.push(a)
    scene.add(a.rig.root)
  }

  // ------------------------------------------------------------------ paper pass
  const rtWorld = new WebGLRenderTarget(2, 2, { colorSpace: SRGBColorSpace })
  const rtHeld = new WebGLRenderTarget(2, 2, { colorSpace: SRGBColorSpace, samples: 4 })
  const atlasCanvas = document.createElement('canvas')
  const atlas = new CanvasTexture(atlasCanvas)
  atlas.flipY = false
  atlas.minFilter = NearestFilter
  atlas.magFilter = NearestFilter
  atlas.generateMipmaps = false
  const post = {
    tWorld: { value: rtWorld.texture },
    tHeld: { value: rtHeld.texture },
    tAtlas: { value: atlas },
    uHeldOn: { value: 0 },
    uRes: { value: new Vector2(1, 1) },
    uCell: { value: new Vector2(8, 14) },
    uGlyphs: { value: RAMP.length },
    uAscii: { value: 0 },
    uOrigin: { value: new Vector2() },
    uPaper: { value: PAPER },
  } satisfies Record<string, IUniform>
  const postScene = new Scene()
  const quad = new Mesh(new PlaneGeometry(2, 2), new ShaderMaterial({ uniforms: post, vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false }))
  quad.frustumCulled = false
  postScene.add(quad)
  const postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)

  function drawAtlas(cw: number, ch: number) {
    const n = RAMP.length
    atlasCanvas.width = cw * n
    atlasCanvas.height = ch
    const x = atlasCanvas.getContext('2d')!
    x.fillStyle = '#000'
    x.fillRect(0, 0, atlasCanvas.width, ch)
    let fs = ch * 0.82
    x.font = `500 ${fs}px ${MONO}`
    const adv = x.measureText('M').width
    if (adv > cw * 0.95) fs *= (cw * 0.95) / adv
    x.font = `500 ${fs}px ${MONO}`
    x.fillStyle = '#fff'
    x.textAlign = 'center'
    x.textBaseline = 'middle'
    for (let i = 0; i < n; i++) x.fillText(RAMP[i], (i + 0.5) * cw, ch * 0.5 + fs * 0.04)
    atlas.dispose()
    atlas.needsUpdate = true
  }

  // ------------------------------------------------------------------ camera rig
  const target = new Vector3(0, height(0, 0), 0)
  const glide = new Vector3()
  let gliding = false
  let dist = 21
  const panVel = new Vector3()
  const view = { w: 1, h: 1, ratio: 1 }
  let quality = 1

  function resize() {
    const w = canvas.clientWidth || innerWidth
    const h = canvas.clientHeight || innerHeight
    const ratio = Math.min(devicePixelRatio || 1, 1.75) * quality
    Object.assign(view, { w, h, ratio })
    renderer.setPixelRatio(ratio)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.fov = w / h < 0.8 ? 42 : 30
    camera.updateProjectionMatrix()
    const dw = Math.round(w * ratio)
    const dh = Math.round(h * ratio)
    rtWorld.setSize(dw, dh)
    rtHeld.setSize(dw, dh)
    post.uRes.value.set(dw, dh)
    const narrow = w < 700
    const cw = Math.max(5, Math.round((narrow ? 7 : 8) * ratio))
    const ch = Math.max(8, Math.round((narrow ? 12 : 14) * ratio))
    if (cw !== post.uCell.value.x || ch !== post.uCell.value.y || atlasCanvas.width === 0) {
      post.uCell.value.set(cw, ch)
      drawAtlas(cw, ch)
    }
  }
  document.fonts.load(`500 16px "JetBrains Mono"`).finally(() => drawAtlas(post.uCell.value.x, post.uCell.value.y))

  function placeCamera() {
    camera.position.copy(target).addScaledVector(DIR, dist)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const fogNear = dist * 1.05
    ;(scene.fog as Fog).near = fogNear
    ;(scene.fog as Fog).far = fogNear + dist * 1.3
    sun.position.copy(target).add(new Vector3(-18, 30, 14))
    sun.target.position.copy(target)
    water.position.x = target.x
    water.position.z = target.z
  }

  // ------------------------------------------------------------------ input
  const ray = new Raycaster()
  const plane = new Plane(new Vector3(0, 1, 0), 0)
  const ndc = new Vector2()
  let pointerIn = false
  let pointerDirty = false
  let hovered: Animal | null = null
  let held: Animal | null = null
  let carrying = false
  const pointers = new Map<number, { x: number; y: number }>()
  let pan: { anchor: Vector3; moved: boolean; sx: number; sy: number; dropOnClick: boolean } | null = null
  let pinch: { d: number; dist: number } | null = null
  let lastMove = performance.now()

  const setNdc = (x: number, y: number) => ndc.set((x / view.w) * 2 - 1, -(y / view.h) * 2 + 1)

  function groundAt(out: Vector3, follow = true): boolean {
    ray.setFromCamera(ndc, camera)
    let y = target.y
    for (let i = 0; i < (follow ? 3 : 1); i++) {
      plane.constant = -y
      if (!ray.ray.intersectPlane(plane, out)) return false
      if (follow) y = Math.max(WATER, height(out.x, out.z))
    }
    return true
  }

  function animalAt(): Animal | null {
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(animals.filter((a) => a !== held).map((a) => a.rig.hit), false)
    return (hits[0]?.object.userData.animal as Animal) ?? null
  }

  function pickUp(a: Animal) {
    if (held && held !== a) drop()
    held = a
    a.pickUp()
    hooks.onPick(a)
  }

  function drop() {
    if (!held) return
    held.drop()
    held = null
    carrying = false
    hooks.onDrop()
  }

  const handPoint = new Vector3()
  function moveHand() {
    if (!held || !groundAt(handPoint)) return
    held.hand.set(handPoint.x, handPoint.y + held.rig.lift, handPoint.z)
  }

  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    canvas.setPointerCapture(e.pointerId)
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist }
      pan = null
      return
    }
    setNdc(e.clientX, e.clientY)
    gliding = false
    panVel.set(0, 0, 0)
    const a = animalAt()
    if (a) {
      pickUp(a)
      carrying = true
      moveHand()
      return
    }
    const anchor = new Vector3()
    if (groundAt(anchor, false)) pan = { anchor, moved: false, sx: e.clientX, sy: e.clientY, dropOnClick: !!held }
  })

  canvas.addEventListener('pointermove', (e) => {
    pointerIn = true
    pointerDirty = true
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      dist = clampDist(pinch.dist * (pinch.d / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))))
      return
    }
    setNdc(e.clientX, e.clientY)
    if (carrying) { moveHand(); return }
    if (!pan) return
    if (!pan.moved && Math.hypot(e.clientX - pan.sx, e.clientY - pan.sy) < 5) return
    if (!pan.moved) { pan.moved = true; canvas.classList.add('is-dragging'); hooks.onMove() }
    const cur = new Vector3()
    plane.constant = -target.y
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(plane, cur)) return
    const delta = pan.anchor.clone().sub(cur).setY(0)
    const now = performance.now()
    const dt = Math.max(1, now - lastMove) / 1000
    lastMove = now
    panVel.copy(delta).divideScalar(dt).clampLength(0, 60)
    target.add(delta)
    placeCamera()
  })

  /** Glide so the held animal sits in the open part of the screen, clear of the panel. */
  function frameHeld(force: boolean) {
    if (!held) return
    const p = held.position
    tmp.copy(p).project(camera)
    const sx = (tmp.x * 0.5 + 0.5) * view.w
    const sy = (-tmp.y * 0.5 + 0.5) * view.h
    const wide = view.w > 760
    if (!force && (wide ? sx < view.w - 480 && sx > 60 : sy < view.h * 0.34 && sy > 60)) return
    const wpp = (2 * dist * Math.tan((camera.fov * Math.PI) / 360)) / view.h
    glide.copy(p)
    if (wide) glide.addScaledVector(RIGHT, 230 * wpp)
    else glide.addScaledVector(FWD, -(view.h * 0.24 * wpp) / Math.sin(EL))
    glide.y = Math.max(WATER, height(glide.x, glide.z))
    gliding = true
  }

  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch = null
    if (carrying) {
      carrying = false
      frameHeld(false)
      return
    }
    if (pan) {
      if (!pan.moved && pan.dropOnClick) drop()
      if (!pan.moved || performance.now() - lastMove > 80) panVel.set(0, 0, 0)
      pan = null
      canvas.classList.remove('is-dragging')
    }
  }
  canvas.addEventListener('pointerup', release)
  canvas.addEventListener('pointercancel', release)
  canvas.addEventListener('pointerleave', () => { pointerIn = false })

  const clampDist = (d: number) => Math.min(64, Math.max(20, d))
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    dist = clampDist(dist * Math.exp(e.deltaY * 0.0012))
  }, { passive: false })

  addEventListener('keydown', (e) => {
    const step = dist * 0.08
    const k: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
    const m = k[e.key]
    if (!m || (e.target as HTMLElement)?.closest?.('input, textarea, .panel')) return
    e.preventDefault()
    gliding = false
    target.addScaledVector(RIGHT, m[0] * step).addScaledVector(FWD, m[1] * step)
    hooks.onMove()
  })

  // ------------------------------------------------------------------ frame
  const tmp = new Vector3()
  let asciiAmt = 0
  let qAcc = 0
  let qN = 0
  let last = performance.now()

  function frame(now: number) {
    requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const adt = motionOn ? dt : 0
    time += adt

    // camera
    if (gliding) {
      target.lerp(glide, 1 - Math.exp(-dt * (reduced ? 60 : 3.5)))
      if (target.distanceTo(glide) < 0.05) gliding = false
    } else if (!pan && panVel.lengthSq() > 0.01) {
      target.addScaledVector(panVel, dt)
      panVel.multiplyScalar(Math.exp(-dt * 4))
    }
    target.y += (Math.max(WATER, height(target.x, target.z)) - target.y) * (1 - Math.exp(-dt * 4))
    placeCamera()
    if (Math.floor(target.x / CHUNK) !== chunkX || Math.floor(target.z / CHUNK) !== chunkZ || chunks.size < (RADIUS * 2 + 1) ** 2) streamChunks(3)

    // hover
    if (pointerDirty && !pan && !carrying) {
      pointerDirty = false
      const a = pointerIn ? animalAt() : null
      if (a !== hovered) {
        hovered = a
        canvas.classList.toggle('is-pointing', !!a)
        hooks.onHover(a)
      }
    }
    if (hovered && hovered !== held) {
      tmp.copy(hovered.position).setY(hovered.position.y + hovered.rig.top).project(camera)
      hooks.onTag((tmp.x * 0.5 + 0.5) * view.w, (-tmp.y * 0.5 + 0.5) * view.h)
    }

    // animals
    const faceYaw = AZ + 0.9
    if (held && !carrying) held.hand.y = Math.max(height(held.hand.x, held.hand.z), WATER) + held.rig.lift + Math.sin(time * 2) * 0.12
    for (const a of animals) {
      const busy = a.state === 'held' || a.state === 'fall' || a.state === 'land'
      if (busy) a.update(dt, time, false, faceYaw)
      else if (adt > 0) a.update(adt, time, !reduced, faceYaw)
    }
    if (held) {
      const g = Math.max(WATER, height(held.position.x, held.position.z))
      blob.visible = true
      blob.position.set(held.position.x, g + 0.03, held.position.z)
      const s = 1 / (1 + (held.position.y - g) * 0.25)
      blob.scale.setScalar(s * (held.rig.lift * 0.5))
    } else blob.visible = false

    flora.uniforms.uTime.value = time
    cloudUniforms.uTime.value = time

    // the paper ripple starts at the animal
    const goal = held ? 1 : 0
    asciiAmt = reduced ? goal : asciiAmt + Math.sign(goal - asciiAmt) * Math.min(Math.abs(goal - asciiAmt), dt / 0.9)
    if (held) {
      tmp.copy(held.position).project(camera)
      post.uOrigin.value.set((tmp.x * 0.5 + 0.5) * post.uRes.value.x, (tmp.y * 0.5 + 0.5) * post.uRes.value.y)
    }
    post.uAscii.value = asciiAmt

    // render
    if (asciiAmt > 0.001 || held) {
      camera.layers.set(0)
      renderer.setRenderTarget(rtWorld)
      renderer.render(scene, camera)
      post.uHeldOn.value = held ? 1 : 0
      if (held) {
        renderer.shadowMap.autoUpdate = false
        camera.layers.set(1)
        scene.background = null
        renderer.setRenderTarget(rtHeld)
        renderer.setClearColor(0x000000, 0)
        renderer.clear()
        renderer.render(scene, camera)
        scene.background = FOG
        camera.layers.set(0)
        renderer.shadowMap.autoUpdate = true
      }
      renderer.setRenderTarget(null)
      renderer.render(postScene, postCam)
    } else {
      renderer.setRenderTarget(null)
      renderer.render(scene, camera)
    }

    // keep the frame rate: drop internal resolution if frames run long
    qAcc += dt
    if (++qN >= 90) {
      const avg = qAcc / qN
      qAcc = 0
      qN = 0
      if (avg > 0.026 && quality > 0.6) { quality = Math.max(0.6, quality - 0.15); resize() }
    }
  }

  // dev-only handle for profiling from the console
  if (import.meta.env.DEV) Object.assign(window, { __world: { renderer, scene, camera, animals } })

  new ResizeObserver(resize).observe(canvas)
  resize()
  placeCamera()
  streamChunks(Infinity)
  requestAnimationFrame((t) => { last = t; frame(t) })

  return {
    drop,
    seek(species) {
      let best: Animal | null = null
      let bd = Infinity
      for (const a of animals) {
        if (a.species !== species || a === held) continue
        const d = a.position.distanceTo(target)
        if (d < bd) { bd = d; best = a }
      }
      if (!best || bd > 30) {
        // none close by: one wanders in near you
        const ang = Math.random() * Math.PI * 2
        for (let i = 0; i < 8; i++) {
          const x = target.x + Math.cos(ang + i) * 5
          const z = target.z + Math.sin(ang + i) * 5
          if (height(x, z) > WATER + 0.4) {
            best = new Animal(species, x, z, Math.random() * 6, Math.random(), `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`)
            addAnimal(best)
            break
          }
        }
      }
      if (!best) return
      pickUp(best)
      frameHeld(true)
    },
    setMotion(on) { motionOn = on },
    motion: () => motionOn,
  }
}
