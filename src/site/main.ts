import '@fontsource-variable/geist/index.css'
import '@fontsource/jetbrains-mono/latin-400.css' // only for the glyphs drawn into the canvas
import 'lenis/dist/lenis.css'
import './site.css'
import Lenis from 'lenis'
import { startAscii } from './ascii'
import { playIntro } from './intro'

const $ = <T extends Element>(s: string) => document.querySelector<T>(s)
const $$ = <T extends Element>(s: string) => [...document.querySelectorAll<T>(s)]

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const video = $<HTMLVideoElement>('video.src')!
const canvas = $<HTMLCanvasElement>('canvas.ascii')!

// ------------------------------------------------------------------ smooth scroll
const lenis = reduced ? null : new Lenis({ autoRaf: true, lerp: 0.085 })
for (const a of $$<HTMLAnchorElement>('a[href^="#"]')) {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href')!
    const el = id === '#top' ? null : $<HTMLElement>(id)
    if (id !== '#top' && !el) return
    e.preventDefault()
    if (!entered) enter(null, true) // the skip link goes straight past the gate
    if (lenis) lenis.scrollTo(el ?? 0, { duration: 1.4 })
    else if (el) el.scrollIntoView()
    else scrollTo(0, 0)
  })
}

// ------------------------------------------------------------------ the ASCII skier
const ascii = startAscii(canvas, video)
if (!ascii) document.documentElement.classList.add('no-gl')

// ------------------------------------------------------------------ the way in
// The page opens on a gate over a faint, frozen frame. Pressing it ripples the ASCII out from the
// click, starts the clip, and the intro takes it from there.
const html = document.documentElement
const gate = $<HTMLButtonElement>('.gate')
let entered = false
let introDone = Promise.resolve()
function enter(at: { x: number; y: number } | null, instant = false) {
  if (entered) return
  entered = true
  html.classList.add('entered')
  lenis?.start()
  ascii?.enter(at)
  introDone = playIntro({ ascii, video, reduced, instant })
  if (!instant && !reduced) rise()
}
html.classList.add('armed')
if (!gate || /^#(experience|work|contact)$/.test(location.hash)) {
  enter(null, true) // a link straight to a section skips the show
} else {
  history.scrollRestoration = 'manual'
  scrollTo(0, 0)
  lenis?.stop()
  gate.addEventListener('click', (e) => {
    // a keyboard press has no pointer position: ripple from the middle instead
    const r = gate.querySelector('.gate-hint')!.getBoundingClientRect()
    enter(e.detail ? { x: e.clientX, y: e.clientY } : { x: r.left + r.width / 2, y: r.top + r.height / 2 })
  })
  addEventListener('keydown', (e) => {
    if (entered || (e.key !== 'Enter' && e.key !== ' ')) return
    if (e.target instanceof HTMLAnchorElement) return // the skip link still works
    e.preventDefault()
    gate.click()
  })
}

// ------------------------------------------------------------------ the hero stays put; the sheet rises over it
const hero = $<HTMLElement>('.hero')!
const stage = $<HTMLElement>('.stage')!
const veil = $<HTMLElement>('.veil')!
let heroH = hero.offsetHeight
let lastP = -1
function onScroll() {
  // 0 with the hero in full view, 1 once the sheet has covered it
  const p = Math.min(1, Math.max(0, scrollY / heroH))
  if (p === lastP) return
  lastP = p
  ascii?.setDim(p)
  ascii?.setActive(p < 1) // covered: stop drawing and pause the clip; the skier lives in the hero only
  if (p >= 1) ascii?.retire() // and once he's been covered, he's had his turn: the hero comes back as warping ASCII
  veil.style.opacity = (p * 0.45).toFixed(3)
  if (!reduced) stage.style.transform = `translate3d(0, ${(-p * 8).toFixed(2)}%, 0) scale(${(1 - p * 0.06).toFixed(4)})`
}
addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', () => { heroH = hero.offsetHeight; lastP = -1; onScroll() })
onScroll()

// Once the name is in and the skier has melted into the contour map, the card (experience first) rises over the hero.
const sheet = $<HTMLElement>('.sheet')!
const inOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2)
async function rise() {
  await introDone
  if (ascii) await new Promise<void>((r) => ascii.onSettled(r))
  await sleep(900) // a beat on the finished map
  if (scrollY > 8) return // they've already moved on
  if (lenis) lenis.scrollTo(sheet, { duration: 2.2, easing: inOut })
  else sheet.scrollIntoView({ behavior: 'smooth' })
}

const frameEl = $<HTMLElement>('.frame')
const pad = (n: number) => String(n).padStart(3, '0')
ascii?.onFrame((f, total) => {
  // the film's 125 frames, then the field after it, which runs on and on
  const end = Number.isFinite(total)
  if (frameEl) frameEl.textContent = `Frame ${pad(end ? f % total : f)}/${end ? total : '∞'}`
})

const play = $<HTMLButtonElement>('.play')
function syncPlay() {
  if (!play) return
  const on = ascii?.playing() ?? false
  play.textContent = on ? 'Pause' : 'Play'
  play.dataset.state = on ? 'playing' : 'paused'
  play.setAttribute('aria-label', on ? 'Pause the background' : 'Play the background')
  play.hidden = !ascii
}
play?.addEventListener('click', () => { ascii?.setPlaying(!ascii.playing()); syncPlay() })
video.addEventListener('play', syncPlay)
video.addEventListener('pause', syncPlay)
syncPlay()

// ------------------------------------------------------------------ reveals
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      e.target.classList.add('in')
      io.unobserve(e.target)
    }
  },
  { threshold: 0.15, rootMargin: '0px 0px -8% 0px' },
)
$$<HTMLElement>('.table .row').forEach((el, i) => el.style.setProperty('--i', String(i)))
$$<HTMLElement>('.job').forEach((el, i) => el.style.setProperty('--i', String(i)))
$$<HTMLElement>('.label, .job, .table .row, .blurb, .hello, .mail, .elsewhere').forEach((el) => io.observe(el))
