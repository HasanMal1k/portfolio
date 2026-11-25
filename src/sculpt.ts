import { BufferGeometry, Color, Float32BufferAttribute, MeshBasicMaterial } from 'three'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Species } from './config'

// Each animal is carved as a signed distance field (smooth-blended capsules and blobs, like a
// whittled wooden toy), painted per region, then meshed once with marching cubes.

const len = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

function sph(px: number, py: number, pz: number, cx: number, cy: number, cz: number, r: number) {
  return len(px - cx, py - cy, pz - cz) - r
}
function ell(px: number, py: number, pz: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) {
  const x = (px - cx) / rx
  const y = (py - cy) / ry
  const z = (pz - cz) / rz
  const k0 = len(x, y, z)
  const k1 = len(x / rx, y / ry, z / rz)
  return (k0 * (k0 - 1)) / (k1 || 1e-6)
}
/** Capsule from a to b whose radius tapers from r1 to r2. */
function cap(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r1: number, r2 = r1) {
  const pax = px - ax, pay = py - ay, paz = pz - az
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const h = clamp01((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz))
  return len(pax - bax * h, pay - bay * h, paz - baz * h) - (r1 + (r2 - r1) * h)
}
function rbox(px: number, py: number, pz: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(px - cx) - bx + r
  const qy = Math.abs(py - cy) - by + r
  const qz = Math.abs(pz - cz) - bz + r
  return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r
}

class Carve {
  d = 1e9
  c = 0
  /** union; k > 0 blends the joint smoothly, like sanded wood */
  add(dist: number, colour: number, k = 0) {
    if (dist < this.d) this.c = colour
    if (k > 0) {
      const h = clamp01(0.5 + (0.5 * (this.d - dist)) / k)
      this.d = this.d + (dist - this.d) * h - k * h * (1 - h)
    } else this.d = Math.min(this.d, dist)
  }
  /** paint a region without changing the shape */
  paint(dist: number, colour: number) {
    if (dist < 0) this.c = colour
  }
}

// paint pots
const P = {
  white: 0xf7f2e6, cream: 0xeadfc6, red: 0xe2463a, orange: 0xf59a2c, black: 0x2a211c,
  brown: 0xb56a3a, dark: 0x4a2f22, light: 0xe6bd92, wool: 0xf6efdd, face: 0x4b3c35,
  tan: 0xc08a58, tan2: 0xa8723f, darktan: 0x6b4a30, green: 0x5bb64a, citrus: 0xff9a2e,
}

type Model = { min: [number, number, number]; max: [number, number, number]; carve(s: Carve, x: number, y: number, z: number): void }

const MODELS: Record<Species, Model> = {
  chicken: {
    min: [-0.42, 0, -0.5], max: [0.42, 1.14, 0.6],
    carve(s, x, y, z) {
      const ax = Math.abs(x)
      s.add(ell(x, y, z, 0, 0.48, 0, 0.3, 0.27, 0.36), P.white)
      s.add(sph(x, y, z, 0, 0.5, 0.17, 0.22), P.white, 0.1)
      s.add(ell(x, y, z, 0, 0.68, -0.3, 0.11, 0.2, 0.13), P.white, 0.08)
      s.add(cap(x, y, z, 0, 0.6, 0.18, 0, 0.84, 0.26, 0.15, 0.13), P.white, 0.1)
      s.add(sph(x, y, z, 0, 0.88, 0.27, 0.16), P.white, 0.06)
      s.add(ell(ax, y, z, 0.27, 0.5, -0.02, 0.07, 0.17, 0.24), P.cream, 0.03)
      s.add(cap(x, y, z, 0, 0.87, 0.39, 0, 0.84, 0.52, 0.05, 0.012), P.orange, 0.02)
      s.add(sph(x, y, z, 0, 1.03, 0.25, 0.06), P.red, 0.03)
      s.add(sph(x, y, z, 0, 1.03, 0.18, 0.052), P.red, 0.03)
      s.add(sph(x, y, z, 0, 1.0, 0.31, 0.048), P.red, 0.03)
      s.add(ell(x, y, z, 0, 0.77, 0.37, 0.035, 0.06, 0.035), P.red, 0.02)
      s.add(cap(ax, y, z, 0.1, 0.32, 0.03, 0.1, 0.05, 0.05, 0.035), P.orange, 0.03)
      s.add(ell(ax, y, z, 0.1, 0.03, 0.1, 0.07, 0.03, 0.09), P.orange, 0.02)
      s.paint(sph(ax, y, z, 0.125, 0.92, 0.355, 0.032), P.black)
    },
  },
  horse: {
    min: [-0.42, 0, -1.02], max: [0.42, 1.92, 1.2],
    carve(s, x, y, z) {
      const ax = Math.abs(x)
      s.add(cap(x, y, z, 0, 1.0, -0.42, 0, 1.03, 0.4, 0.31), P.brown)
      for (const lz of [0.4, -0.42]) {
        s.add(cap(ax, y, z, 0.16, 0.95, lz, 0.16, 0.12, lz, 0.11, 0.075), P.brown, 0.08)
        s.add(cap(ax, y, z, 0.16, 0.13, lz, 0.16, 0.03, lz, 0.085), P.dark)
      }
      s.add(cap(x, y, z, 0, 1.12, 0.42, 0, 1.55, 0.72, 0.2, 0.14), P.brown, 0.1)
      s.add(cap(x, y, z, 0, 1.6, 0.72, 0, 1.42, 1.02, 0.15, 0.12), P.brown, 0.06)
      s.add(cap(ax, y, z, 0.07, 1.7, 0.69, 0.08, 1.86, 0.65, 0.045, 0.015), P.brown, 0.02)
      s.add(cap(x, y, z, 0, 1.74, 0.64, 0, 1.2, 0.36, 0.06, 0.075), P.dark, 0.03)
      s.add(cap(x, y, z, 0, 1.12, -0.72, 0, 0.62, -0.92, 0.08, 0.05), P.dark, 0.05)
      s.paint(sph(x, y, z, 0, 1.4, 1.07, 0.15), P.light)
      s.paint(sph(ax, y, z, 0.125, 1.59, 0.85, 0.032), P.black)
    },
  },
  sheep: {
    min: [-0.56, 0, -0.62], max: [0.56, 1.12, 0.78],
    carve(s, x, y, z) {
      const ax = Math.abs(x)
      const fluff = 0.018 * Math.sin(x * 26) * Math.sin(y * 26 + 1) * Math.sin(z * 26 + 2)
      const puffs: [number, number, number, number][] = [
        [0, 0.62, 0, 0.36], [0.2, 0.7, 0.2, 0.24], [-0.2, 0.72, 0.18, 0.24], [0.22, 0.68, -0.22, 0.25],
        [-0.22, 0.66, -0.2, 0.25], [0, 0.86, 0.05, 0.24], [0, 0.82, -0.2, 0.24], [0, 0.6, 0.3, 0.24],
      ]
      for (const [cx, cy, cz, r] of puffs) s.add(sph(x, y, z, cx, cy, cz, r) + fluff, P.wool, 0.06)
      s.add(cap(ax, y, z, 0.15, 0.45, 0.22, 0.15, 0.03, 0.22, 0.06), P.face, 0.04)
      s.add(cap(ax, y, z, 0.15, 0.45, -0.22, 0.15, 0.03, -0.22, 0.06), P.face, 0.04)
      s.add(ell(x, y, z, 0, 0.78, 0.5, 0.14, 0.16, 0.2), P.face, 0.03)
      s.add(ell(ax, y, z, 0.17, 0.82, 0.43, 0.1, 0.035, 0.05), P.face, 0.02)
      s.add(sph(x, y, z, 0, 0.93, 0.43, 0.09) + fluff, P.wool, 0.04)
      s.paint(sph(ax, y, z, 0.09, 0.83, 0.64, 0.026), P.cream)
    },
  },
  capybara: {
    min: [-0.46, 0, -0.62], max: [0.46, 1.04, 0.8],
    carve(s, x, y, z) {
      const ax = Math.abs(x)
      s.add(ell(x, y, z, 0, 0.45, -0.02, 0.32, 0.3, 0.48), P.tan)
      s.add(rbox(x, y, z, 0, 0.62, 0.44, 0.15, 0.15, 0.2, 0.1), P.tan, 0.1)
      s.add(rbox(x, y, z, 0, 0.58, 0.62, 0.14, 0.12, 0.06, 0.06), P.tan2, 0.05)
      s.add(sph(ax, y, z, 0.12, 0.79, 0.36, 0.045), P.darktan, 0.02)
      s.add(cap(ax, y, z, 0.17, 0.3, 0.28, 0.17, 0.03, 0.28, 0.07), P.tan2, 0.05)
      s.add(cap(ax, y, z, 0.17, 0.3, -0.28, 0.17, 0.03, -0.28, 0.07), P.tan2, 0.05)
      s.add(sph(x, y, z, 0, 0.86, 0.42, 0.1), P.citrus)
      s.add(ell(x, y, z, 0.05, 0.97, 0.42, 0.05, 0.015, 0.03), P.green)
      s.paint(sph(ax, y, z, 0.15, 0.7, 0.56, 0.026), P.black)
    },
  },
}

const RES = 48
let mc: MarchingCubes | null = null
const cache = new Map<Species, BufferGeometry>()
const colours = new Map<number, Color>()

/** Mesh one animal (cached). Smooth normals and per-vertex paint. */
export function animalGeometry(species: Species): BufferGeometry {
  const hit = cache.get(species)
  if (hit) return hit
  mc ??= new MarchingCubes(RES, new MeshBasicMaterial(), false, true, 120000)
  const m = MODELS[species]
  const pad = 0.06
  const cx = (m.min[0] + m.max[0]) / 2
  const cy = (m.min[1] + m.max[1]) / 2
  const cz = (m.min[2] + m.max[2]) / 2
  const half = Math.max(m.max[0] - m.min[0], m.max[1] - m.min[1], m.max[2] - m.min[2]) / 2 + pad
  const s = new Carve()
  const h = RES / 2
  for (let k = 0; k < RES; k++) {
    const z = cz + ((k - h) / h) * half
    for (let j = 0; j < RES; j++) {
      const y = cy + ((j - h) / h) * half
      for (let i = 0; i < RES; i++) {
        const x = cx + ((i - h) / h) * half
        s.d = 1e9
        s.c = 0
        m.carve(s, x, y, z)
        const q = i + j * RES + k * RES * RES
        mc.field[q] = -s.d
        let col = colours.get(s.c)
        if (!col) colours.set(s.c, (col = new Color(s.c)))
        mc.palette[q * 3] = col.r
        mc.palette[q * 3 + 1] = col.g
        mc.palette[q * 3 + 2] = col.b
      }
    }
  }
  mc.isolation = 0
  mc.update()
  const n = mc.count
  const pos = mc.positionArray.slice(0, n * 3)
  for (let i = 0; i < n; i++) {
    pos[i * 3] = cx + pos[i * 3] * half
    pos[i * 3 + 1] = cy + pos[i * 3 + 1] * half
    pos[i * 3 + 2] = cz + pos[i * 3 + 2] * half
  }
  let g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(mc.normalArray.slice(0, n * 3), 3))
  g.setAttribute('color', new Float32BufferAttribute(mc.colorArray!.slice(0, n * 3), 3))
  g = mergeVertices(g, 1e-4)
  g.normalizeNormals()
  g.computeBoundingSphere()
  g.computeBoundingBox()
  cache.set(species, g)
  return g
}
