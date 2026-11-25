import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/pinyon-script/latin-400.css'
import '@fontsource/pixelify-sans/latin-400.css'
import 'lenis/dist/lenis.css'
import './site.css'
import Lenis from 'lenis'
import { startAscii } from './ascii'
import { playIntro } from './intro'

const $ = <T extends Element>(s: string) => document.querySelector<T>(s)
const $$ = <T extends Element>(s: string) => [...document.querySelectorAll<T>(s)]

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
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
    if (lenis) lenis.scrollTo(el ?? 0, { duration: 1.4 })
    else if (el) el.scrollIntoView()
    else scrollTo(0, 0)
  })
}

// ------------------------------------------------------------------ the ASCII skier
const ascii = startAscii(canvas, video)
if (!ascii) document.documentElement.classList.add('no-gl')
// the skier gets a head start, then the name comes up
playIntro(ascii ? video : null, reduced)

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
  veil.style.opacity = (p * 0.7).toFixed(3)
  if (!reduced) stage.style.transform = `translate3d(0, ${(-p * 8).toFixed(2)}%, 0) scale(${(1 - p * 0.06).toFixed(4)})`
}
addEventListener('scroll', onScroll, { passive: true })
addEventListener('resize', () => { heroH = hero.offsetHeight; lastP = -1; onScroll() })
onScroll()

const frameEl = $<HTMLElement>('.frame')
const pad = (n: number) => String(n).padStart(3, '0')
ascii?.onFrame((f, total) => {
  if (frameEl) frameEl.textContent = `Frame ${pad(f % total)}/${total}`
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
play?.addEventListener('click', () => ascii?.setPlaying(!ascii.playing()))
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
$$<HTMLElement>('.label, .table .row, .blurb, .hello, .mail').forEach((el) => io.observe(el))
