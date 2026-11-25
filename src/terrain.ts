import { BufferGeometry, Float32BufferAttribute, Color } from 'three'
import { height, jungle, sandy, vnoise, WATER } from './noise'

export const CHUNK = 24
const N = 24 // cells per side
const STEP = CHUNK / N

const C = {
  grass: new Color(0x6cc644),
  grassLight: new Color(0x8ad85a),
  grassDark: new Color(0x58b53c),
  jungle: new Color(0x45a33a),
  sand: new Color(0xffe39a),
  shore: new Color(0xf6d88c),
  bed: new Color(0xe2c47c),
}
const tmp = new Color()
const mixC = new Color()

function groundColour(x: number, z: number, h: number, out: Color): Color {
  if (h < WATER + 0.06) return out.copy(C.bed)
  const shore = Math.min(1, Math.max(0, (h - (WATER + 0.12)) / 0.35))
  // big painterly blotches of lighter and darker grass
  const blotch = vnoise(x * 0.09 + 3, z * 0.09 - 7)
  out.copy(C.grass).lerp(blotch > 0.5 ? C.grassLight : C.grassDark, Math.abs(blotch - 0.5) * 1.4)
  out.lerp(C.jungle, Math.min(1, Math.max(0, (jungle(x, z) - 0.5) * 6)))
  out.lerp(C.sand, Math.min(1, Math.max(0, (sandy(x, z) - 0.64) * 12)))
  return out.lerp(mixC.copy(C.shore), 1 - shore)
}

/** One square of the endless field, smooth-shaded. Normals come from the height field, so chunks meet without seams. */
export function chunkGeometry(cx: number, cz: number): BufferGeometry {
  const V = N + 1
  const pos = new Float32Array(V * V * 3)
  const nor = new Float32Array(V * V * 3)
  const col = new Float32Array(V * V * 3)
  const e = 0.25
  for (let j = 0; j < V; j++) {
    for (let i = 0; i < V; i++) {
      const x = (cx * N + i) * STEP
      const z = (cz * N + j) * STEP
      const h = height(x, z)
      const o = (j * V + i) * 3
      pos[o] = x
      pos[o + 1] = h
      pos[o + 2] = z
      const nx = height(x - e, z) - height(x + e, z)
      const nz = height(x, z - e) - height(x, z + e)
      const ny = 2 * e
      const l = Math.hypot(nx, ny, nz)
      nor[o] = nx / l
      nor[o + 1] = ny / l
      nor[o + 2] = nz / l
      groundColour(x, z, h, tmp)
      col[o] = tmp.r
      col[o + 1] = tmp.g
      col[o + 2] = tmp.b
    }
  }
  const idx: number[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * V + i
      const b = a + 1
      const c = a + V
      const d = c + 1
      idx.push(a, c, b, b, c, d)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}
