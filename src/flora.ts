import {
  BufferGeometry, CatmullRomCurve3, Color, ConeGeometry, CylinderGeometry, DodecahedronGeometry, DoubleSide,
  Float32BufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Scene, SphereGeometry,
  TubeGeometry, Vector3, type IUniform, type MeshToonMaterial,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { hash2, height, jungle, sandy, clearing, WATER } from './noise'
import { CHUNK } from './terrain'
import { toon, inkedInstances } from './toon'

// ------------------------------------------------------------------ geometry kit (smooth, painted per vertex)
function paint(g: BufferGeometry, hex: number): BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g
  n.deleteAttribute('uv')
  const c = new Color(hex)
  const count = n.attributes.position.count
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) arr.set([c.r, c.g, c.b], i * 3)
  n.setAttribute('color', new Float32BufferAttribute(arr, 3))
  return n
}
function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts)!
  g.computeBoundingSphere()
  return g
}
const ball = (r: number, hex: number, x: number, y: number, z: number, sy = 1) =>
  paint(new SphereGeometry(r, r < 0.2 ? 6 : 10, r < 0.2 ? 4 : 7).scale(1, sy, 1).translate(x, y, z), hex)

/** A drooping leaf: a strip folded down its spine and bent towards the ground. */
function frond(len: number, width: number, hex: number, yaw: number, at: Vector3, droop = 1.1): BufferGeometry {
  const g = new PlaneGeometry(width, len, 2, 8)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const t = (p.getY(i) + len / 2) / len // 0 at the stalk, 1 at the tip
    const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) // taper
    p.setXYZ(i, x * w, -Math.abs(x) * 0.35, t * len)
    p.setY(i, p.getY(i) + t * 0.25 - t * t * droop)
  }
  g.computeVertexNormals()
  g.rotateY(yaw)
  g.translate(at.x, at.y, at.z)
  return paint(g, hex)
}

const TRUNK = 0x8a5a2b
const LEAF = 0x3f9e3c

const GEOS = {
  tree: () => merge([
    paint(new CylinderGeometry(0.22, 0.32, 2.3, 8).translate(0, 1.15, 0), TRUNK),
    ball(1.5, LEAF, 0, 3.05, 0, 0.88),
    ball(1.05, 0x4bb245, 0.85, 3.55, 0.35),
    ball(0.95, 0x45a83f, -0.75, 3.45, -0.4),
  ]),
  bush: () => merge([ball(0.7, 0x4bae42, 0, 0.45, 0, 0.82), ball(0.5, 0x58bb4b, 0.52, 0.34, 0.22)]),
  rock: () => merge([paint(new DodecahedronGeometry(0.6, 1).scale(1, 0.62, 0.9).translate(0, 0.18, 0), 0xb9b3a4)]),
  palm(): BufferGeometry {
    const curve = new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0.15, 1.5, 0), new Vector3(0.55, 3.0, 0), new Vector3(1.0, 4.3, 0)])
    const parts = [paint(new TubeGeometry(curve, 12, 0.17, 7), 0xa0703f)]
    const top = new Vector3(1.0, 4.3, 0)
    for (let i = 0; i < 7; i++) parts.push(frond(2.4, 0.7, i % 2 ? 0x46a842 : 0x55b84c, (i / 7) * Math.PI * 2, top))
    parts.push(ball(0.15, 0x7a5230, 1.05, 4.15, 0.15), ball(0.15, 0x7a5230, 0.9, 4.12, -0.12))
    return merge(parts)
  },
  fern(): BufferGeometry {
    const parts: BufferGeometry[] = []
    for (let i = 0; i < 6; i++) parts.push(frond(1.1, 0.4, i % 2 ? 0x3d9438 : 0x4aa443, (i / 6) * Math.PI * 2, new Vector3(0, 0.08, 0), 0.9))
    return merge(parts)
  },
  grass(): BufferGeometry {
    const parts: BufferGeometry[] = []
    for (let i = 0; i < 5; i++) {
      const g = new ConeGeometry(0.06, 0.75 + (i % 3) * 0.15, 5).translate(0, 0.38, 0)
      g.rotateZ((i - 2) * 0.22)
      g.rotateY(i * 1.3)
      parts.push(paint(g, i % 2 ? 0x68c445 : 0x82d257))
    }
    return merge(parts)
  },
  flowerPink: () => flower(0xff7aa2),
  flowerYellow: () => flower(0xffd23f),
  flowerWhite: () => flower(0xfffaf0),
}

function flower(hex: number): BufferGeometry {
  return merge([
    paint(new CylinderGeometry(0.025, 0.025, 0.5, 4).translate(0, 0.25, 0), 0x5fae45),
    ball(0.12, hex, 0, 0.55, 0, 0.7),
    ball(0.055, 0xffa630, 0, 0.62, 0),
  ])
}

export type FloraKind = keyof typeof GEOS
const KINDS = Object.keys(GEOS) as FloraKind[]
const CAPACITY: Record<FloraKind, number> = {
  tree: 1200, bush: 1200, rock: 500, palm: 500, fern: 1600, grass: 4000, flowerPink: 800, flowerYellow: 800, flowerWhite: 800,
}
const SHADOWS = new Set<FloraKind>(['tree', 'bush', 'rock', 'palm'])
const INK = new Map<FloraKind, number>([['tree', 0.06], ['bush', 0.045], ['rock', 0.04]])
const LEAFY = new Set<FloraKind>(['palm', 'fern'])

// ------------------------------------------------------------------ placement
export interface Placement { kind: FloraKind; m: Matrix4 }

const SPACING = 1.5
const q = new Quaternion()
const up = new Vector3(0, 1, 0)
const FLOWERS = ['flowerPink', 'flowerYellow', 'flowerWhite'] as const

/** What grows in one chunk. Deterministic, so a chunk looks the same each time it loads. */
export function placeFlora(cx: number, cz: number): Placement[] {
  const out: Placement[] = []
  const n = CHUNK / SPACING
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const gx = Math.round(cx * n + i)
      const gz = Math.round(cz * n + j)
      const r = hash2(gx * 3 + 11, gz * 5 - 3)
      const x = gx * SPACING + hash2(gx, gz + 31) * SPACING
      const z = gz * SPACING + hash2(gx + 17, gz) * SPACING
      const h = height(x, z)
      if (h < WATER + 0.3) continue
      const jg = jungle(x, z)
      let kind: FloraKind | null = null
      if (clearing(x, z) > 0.25) {
        if (r < 0.08) kind = 'grass'
        else if (r < 0.11) kind = FLOWERS[Math.floor(r * 300) % 3]
      } else if (sandy(x, z) > 0.68) {
        if (r < 0.035) kind = 'palm'
        else if (r < 0.055) kind = 'rock'
      } else if (jg > 0.58) {
        if (r < 0.15) kind = 'tree'
        else if (r < 0.21) kind = 'palm'
        else if (r < 0.34) kind = 'bush'
        else if (r < 0.5) kind = 'fern'
      } else {
        if (r < 0.16) kind = 'grass'
        else if (r < 0.23) kind = FLOWERS[Math.floor(r * 300) % 3]
        else if (r < 0.25) kind = 'bush'
        else if (r < 0.262) kind = 'tree'
        else if (r < 0.272) kind = 'rock'
        else if (r < 0.277) kind = 'palm'
      }
      if (!kind) continue
      const s = 0.75 + hash2(gx - 5, gz + 9) * 0.6
      q.setFromAxisAngle(up, hash2(gx + 2, gz - 8) * Math.PI * 2)
      out.push({ kind, m: new Matrix4().compose(new Vector3(x, h - 0.05, z), q, new Vector3(s, s, s)) })
    }
  }
  return out
}

// ------------------------------------------------------------------ instancing
function windy(m: MeshToonMaterial, uniforms: { uTime: IUniform<number> }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float ph = 0.0;
        #ifdef USE_INSTANCING
          ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
        #endif
        float bend = pow(max(transformed.y, 0.0), 1.3) * 0.03;
        transformed.x += sin(uTime * 1.3 + ph) * bend;
        transformed.z += cos(uTime * 1.1 + ph * 1.7) * bend * 0.6;`,
      )
  }
  return m
}

export class Flora {
  readonly uniforms = { uTime: { value: 0 } } satisfies Record<string, IUniform>
  private meshes = new Map<FloraKind, { mesh: InstancedMesh; shell?: InstancedMesh }>()

  constructor(scene: Scene) {
    const solid = windy(toon({ vertexColors: true }), this.uniforms)
    const leafy = windy(toon({ vertexColors: true }), this.uniforms)
    leafy.side = DoubleSide
    for (const kind of KINDS) {
      const mesh = new InstancedMesh(GEOS[kind](), LEAFY.has(kind) ? leafy : solid, CAPACITY[kind])
      mesh.count = 0
      mesh.castShadow = SHADOWS.has(kind)
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances span many chunks
      scene.add(mesh)
      const thick = INK.get(kind)
      let shell: InstancedMesh | undefined
      if (thick) {
        shell = inkedInstances(mesh, thick)
        shell.count = 0
        scene.add(shell)
      }
      this.meshes.set(kind, { mesh, shell })
    }
  }

  /** Rewrite every instance from the chunks that are loaded now. */
  rebuild(lists: Placement[][]) {
    const counts = new Map<FloraKind, number>()
    for (const list of lists) {
      for (const p of list) {
        const i = counts.get(p.kind) ?? 0
        if (i >= CAPACITY[p.kind]) continue
        this.meshes.get(p.kind)!.mesh.setMatrixAt(i, p.m)
        counts.set(p.kind, i + 1)
      }
    }
    for (const [kind, { mesh, shell }] of this.meshes) {
      mesh.count = counts.get(kind) ?? 0
      mesh.instanceMatrix.needsUpdate = true
      if (shell) shell.count = mesh.count
    }
  }
}
