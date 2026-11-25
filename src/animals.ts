import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { animalGeometry } from './sculpt'
import { woodToon, inked } from './toon'
import { hash2, height, jungle, sandy, WATER } from './noise'
import { CHUNK } from './terrain'
import { SPECIES_LIST, type Species } from './config'

// Wooden toys: one carved piece each, so they move like toys do — they hop, tip forward to eat,
// and dangle when you pick them up.

const wood = woodToon()

interface Spec {
  hop: number // hop height
  stride: number // distance per hop
  hopTime: number // seconds per hop
  lift: number // carry height of the grab point above the ground
  grab: number // grab point height on the toy
  top: number // where the hover tag sits
  front: number // z of the front feet: the pivot it tips over to eat
  eat: 'peck' | 'graze' | 'munch'
}
const SPEC: Record<Species, Spec> = {
  chicken: { hop: 0.3, stride: 0.42, hopTime: 0.3, lift: 2.0, grab: 1.0, top: 1.35, front: 0.12, eat: 'peck' },
  horse: { hop: 0.38, stride: 0.75, hopTime: 0.46, lift: 2.9, grab: 1.45, top: 2.25, front: 0.42, eat: 'graze' },
  sheep: { hop: 0.26, stride: 0.5, hopTime: 0.4, lift: 2.1, grab: 1.0, top: 1.4, front: 0.24, eat: 'graze' },
  capybara: { hop: 0.2, stride: 0.38, hopTime: 0.42, lift: 1.9, grab: 0.85, top: 1.3, front: 0.3, eat: 'munch' },
}

export interface Rig {
  root: Group
  swing: Group
  hopper: Group
  lean: Group
  hit: Mesh
  top: number
  lift: number
}

function build(species: Species): Rig {
  const s = SPEC[species]
  const geo = animalGeometry(species)
  const root = new Group()
  const swing = new Group()
  swing.position.y = s.grab
  root.add(swing)
  const hang = new Group()
  hang.position.y = -s.grab
  swing.add(hang)
  const hopper = new Group()
  hang.add(hopper)
  const lean = new Group()
  lean.position.z = s.front
  hopper.add(lean)
  const body = new Mesh(geo, wood)
  body.position.z = -s.front
  body.castShadow = true
  body.receiveShadow = true
  inked(body, species === 'horse' ? 0.035 : 0.025)
  lean.add(body)

  const bb = geo.boundingBox!
  const size = bb.getSize(new Vector3()).addScalar(0.25)
  const hit = new Mesh(new BoxGeometry(size.x, size.y, size.z), new MeshBasicMaterial({ visible: false }))
  bb.getCenter(hit.position)
  root.add(hit)
  return { root, swing, hopper, lean, hit, top: s.top, lift: s.lift }
}

type State = 'eat' | 'hop' | 'held' | 'fall' | 'land'
const tmp = new Vector3()
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

export class Animal {
  readonly rig: Rig
  private spec: Spec
  state: State = 'eat'
  private t = 0
  private nextMove: number
  private goal = new Vector3()
  private hops = 0 // hops left; 0 with a goal = turn in place
  private turnTo = 0
  private hopU = 0
  private vy = 0
  private bounced = false
  readonly hand = new Vector3() // where the grab point wants to be while held
  private pivot = new Vector3()
  private vel = new Vector3()

  constructor(readonly species: Species, x: number, z: number, yaw: number, readonly seed: number, readonly home: string) {
    this.spec = SPEC[species]
    this.rig = build(species)
    this.rig.root.position.set(x, height(x, z), z)
    this.rig.root.rotation.y = yaw
    this.rig.hit.userData.animal = this
    this.nextMove = 3 + seed * 9
  }

  get position() { return this.rig.root.position }

  pickUp() {
    const r = this.rig
    this.state = 'held'
    this.t = 0
    this.pivot.copy(r.root.position).setY(r.root.position.y + this.spec.grab)
    this.hand.copy(this.pivot).setY(this.pivot.y + this.spec.lift - this.spec.grab)
    this.vel.set(0, 4, 0)
    r.hopper.position.y = 0
    r.root.traverse((o) => o.layers.set(1))
  }

  drop() {
    if (this.state !== 'held') return
    this.state = 'fall'
    this.t = 0
    this.vy = this.vel.y * 0.3
    this.bounced = false
    this.rig.root.traverse((o) => o.layers.set(0))
  }

  update(dt: number, time: number, wander: boolean, faceYaw: number) {
    const r = this.rig
    const s = this.spec
    const p = r.root.position
    const k = (rate: number) => 1 - Math.exp(-rate * dt)
    this.t += dt
    let lean = 0
    let sy = 1

    switch (this.state) {
      case 'eat': {
        p.y = height(p.x, p.z)
        lean = this.eatLean(time + this.seed * 31)
        if (wander && this.t > this.nextMove) this.planMove()
        break
      }
      case 'hop': {
        this.hopU += dt / s.hopTime
        if (this.hops > 0) {
          tmp.subVectors(this.goal, p).setY(0)
          const want = Math.atan2(tmp.x, tmp.z)
          r.root.rotation.y += wrap(want - r.root.rotation.y) * k(10)
          const step = Math.min(tmp.length(), (s.stride * dt) / s.hopTime)
          p.x += Math.sin(r.root.rotation.y) * step
          p.z += Math.cos(r.root.rotation.y) * step
        } else {
          r.root.rotation.y += wrap(this.turnTo - r.root.rotation.y) * k(12)
        }
        p.y = height(p.x, p.z)
        const u = Math.min(1, this.hopU)
        r.hopper.position.y = 4 * s.hop * u * (1 - u)
        sy = u < 0.15 ? 0.82 + 0.18 * (u / 0.15) : u > 0.85 ? 1 - 0.18 * ((u - 0.85) / 0.15) : 1.06
        lean = (u - 0.5) * 0.35
        if (this.hopU >= 1.15) {
          this.hopU = 0
          r.hopper.position.y = 0
          if (this.hops > 0) this.hops--
          const arrived = tmp.subVectors(this.goal, p).setY(0).length() < s.stride * 0.6
          if (this.hops <= 0 || arrived) this.rest()
        }
        break
      }
      case 'held': {
        this.vel.addScaledVector(tmp.subVectors(this.hand, this.pivot), dt * 70).multiplyScalar(Math.exp(-dt * 10))
        this.pivot.addScaledVector(this.vel, dt)
        p.copy(this.pivot).setY(this.pivot.y - s.grab)
        // dangle: lag behind the hand like a toy on a string
        const lx = Math.max(-0.9, Math.min(0.9, -this.vel.z * 0.09))
        const lz = Math.max(-0.9, Math.min(0.9, this.vel.x * 0.09))
        r.swing.rotation.x += (lx + Math.sin(time * 2.1) * 0.08 - r.swing.rotation.x) * k(6)
        r.swing.rotation.z += (lz + Math.sin(time * 1.7) * 0.08 - r.swing.rotation.z) * k(6)
        r.root.rotation.y += wrap(faceYaw + Math.sin(time * 0.8) * 0.5 - r.root.rotation.y) * k(2)
        sy = 1 + Math.sin(time * 9) * 0.05 // a little wriggle
        lean = Math.sin(time * 3.3) * 0.12
        break
      }
      case 'fall': {
        this.vy -= 26 * dt
        p.y += this.vy * dt
        this.vel.multiplyScalar(Math.exp(-dt * 5))
        p.x += this.vel.x * dt
        p.z += this.vel.z * dt
        r.swing.rotation.x += -r.swing.rotation.x * k(9)
        r.swing.rotation.z += -r.swing.rotation.z * k(9)
        const g = height(p.x, p.z)
        if (p.y <= g) {
          p.y = g
          if (!this.bounced && this.vy < -4) {
            this.vy = -this.vy * 0.32 // wooden clack
            this.bounced = true
            this.t = 0
          } else {
            this.state = 'land'
            this.t = 0
          }
        }
        sy = this.t < 0.12 && this.bounced ? 0.8 : 1
        break
      }
      case 'land': {
        p.y = height(p.x, p.z)
        const t = this.t
        sy = 1 - Math.exp(-t * 8) * Math.cos(t * 22) * 0.24
        if (t > 0.7) {
          // a happy hop, then back to eating
          this.hops = 0
          this.turnTo = r.root.rotation.y + (Math.random() - 0.5) * 1.5
          this.goal.copy(p)
          this.state = 'hop'
          this.hopU = 0
          this.t = 0
        }
        break
      }
    }

    r.lean.rotation.x += (lean - r.lean.rotation.x) * k(this.spec.eat === 'peck' ? 26 : 7)
    const sq = r.hopper.scale
    sq.y += (sy - sq.y) * k(30)
    sq.x = sq.z = 1 / Math.sqrt(sq.y)
    if (this.state !== 'held' && this.state !== 'fall') {
      r.swing.rotation.x += -r.swing.rotation.x * k(8)
      r.swing.rotation.z += -r.swing.rotation.z * k(8)
    }
  }

  private rest() {
    this.state = 'eat'
    this.t = 0
    this.hopU = 0
    this.rig.hopper.position.y = 0
    this.nextMove = 4 + Math.random() * 9
  }

  private planMove() {
    const p = this.position
    if (Math.random() < 0.35) {
      // turn round in a hop or two
      this.hops = 0
      this.turnTo = this.rig.root.rotation.y + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.2)
      this.goal.copy(p)
      this.state = 'hop'
      this.hopU = 0
      return
    }
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2
      const d = 1.5 + Math.random() * 3.5
      const x = p.x + Math.sin(a) * d
      const z = p.z + Math.cos(a) * d
      if (height(x, z) > WATER + 0.35 && jungle(x, z) < 0.62) {
        this.goal.set(x, 0, z)
        this.hops = Math.ceil(d / this.spec.stride) + 1
        this.state = 'hop'
        this.hopU = 0
        this.t = 0
        return
      }
    }
    this.rest()
  }

  /** How far it tips forward while eating. */
  private eatLean(t: number): number {
    switch (this.spec.eat) {
      case 'peck': {
        const u = t % 2.2
        return u < 0.9 ? 0.62 * Math.pow(Math.max(0, Math.sin((u / 0.9) * Math.PI * 3)), 0.6) : Math.sin(u * 3) * 0.04
      }
      case 'graze': {
        const u = t % 9
        return u < 6.8 ? 0.3 + Math.sin(t * 5.5) * 0.03 : 0
      }
      case 'munch': {
        const u = t % 8
        return u < 5.5 ? 0.12 + Math.sin(t * 8) * 0.045 : 0
      }
    }
  }
}

// ------------------------------------------------------------------ who lives where
export interface Spawn { species: Species; x: number; z: number; yaw: number; seed: number }

/** A friendly first screen: one of each, around the clearing you start in. */
const STARTERS: Spawn[] = [
  { species: 'chicken', x: -2.2, z: 3.4, yaw: 0.6, seed: 0.11 },
  { species: 'horse', x: 4.4, z: -1.4, yaw: -0.9, seed: 0.37 },
  { species: 'sheep', x: -4.2, z: -2.4, yaw: 2.2, seed: 0.62 },
  { species: 'capybara', x: 1.8, z: 5.0, yaw: 0.2, seed: 0.83 },
]

export function spawnsFor(cx: number, cz: number): Spawn[] {
  if (cx === 0 && cz === 0) return STARTERS
  const out: Spawn[] = []
  for (let k = 0; k < 3; k++) {
    if (hash2(cx * 13 + k * 7, cz * 7 - k) > 0.45) continue
    const x = (cx + hash2(cx + k * 31, cz - 3)) * CHUNK
    const z = (cz + hash2(cx - 5, cz + k * 19)) * CHUNK
    const h = height(x, z)
    if (h < WATER + 0.45 || jungle(x, z) > 0.6) continue
    const r = hash2(cx * 3 - k, cz * 11 + k)
    let species: Species = SPECIES_LIST[Math.floor(r * SPECIES_LIST.length)]
    if (sandy(x, z) > 0.68) species = 'chicken'
    else if (h < WATER + 1.0 && r < 0.6) species = 'capybara'
    out.push({ species, x, z, yaw: r * Math.PI * 2, seed: hash2(cx + k, cz * 3) })
  }
  return out
}
