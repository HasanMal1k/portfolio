// The opening, once the visitor presses Enter: the ripple wakes the skier, he has his moment,
// then he sinks back and the name comes up slowly, one word at a time.

import { gsap } from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import type { Ascii } from './ascii'
import { fillPixelIcons } from './pixel'

gsap.registerPlugin(ScrambleTextPlugin)

const RAMP = '.:-=+*o#%@01'
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function fontsReady() {
  const faces = ['500 64px "Geist Variable"']
  // never wait on a slow font for more than a couple of seconds
  return Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), sleep(2500)])
}

// resolves once the clip has been playing for `ms` (or a little later if it never starts: autoplay blocked, slow network)
function headStart(video: HTMLVideoElement, ms: number) {
  return new Promise<void>((done) => {
    const fallback = setTimeout(done, ms + 1800)
    const go = () => { clearTimeout(fallback); setTimeout(done, ms) }
    if (!video.paused && video.readyState >= 3) go()
    else video.addEventListener('playing', go, { once: true })
  })
}

// hovering the pixel words boots them up again through the ASCII ramp
function armHover(px: HTMLElement | null) {
  if (!px) return
  const words = [...px.querySelectorAll<HTMLElement>('.w')]
  px.addEventListener('pointerenter', () => {
    for (const w of words) {
      if (gsap.isTweening(w)) continue
      const text = (w.dataset.text ??= w.textContent ?? '')
      // hold the word's width while it scrambles, so the snowflakes beside it stay put
      w.style.width = `${w.getBoundingClientRect().width}px`
      w.style.textAlign = 'left'
      gsap.to(w, {
        duration: 0.8, ease: 'none', scrambleText: { text, chars: RAMP, speed: 0.7 },
        onComplete: () => { w.style.width = ''; w.style.textAlign = '' },
      })
    }
  })
}

/** Plays the opening; resolves once the name is in (the small print finishes on its own). */
export async function playIntro(o: { ascii: Ascii | null; video: HTMLVideoElement; reduced: boolean; instant: boolean }) {
  const head = document.querySelector<HTMLElement>('.headline')
  if (!head) return
  fillPixelIcons(head)
  const art = head.querySelector<HTMLElement>('.art')!
  const q = (s: string) => [...head.querySelectorAll<HTMLElement>(s)]
  const words = q('.w')
  const corners = gsap.utils.toArray<HTMLElement>('.top, .side, .scroll-cue')
  const html = document.documentElement

  if (o.reduced || o.instant) {
    o.ascii?.setFade(1)
    html.classList.add('intro')
    gsap.set([art, ...corners], { autoAlpha: 1 })
    armHover(head.querySelector('.px'))
    return
  }

  await Promise.all([fontsReady(), o.ascii ? headStart(o.video, 2000) : sleep(600)])
  html.classList.add('intro')
  gsap.set(art, { autoAlpha: 1 })
  const em = parseFloat(getComputedStyle(head).fontSize)
  const tl = gsap.timeline({ onComplete: () => armHover(head.querySelector('.px')) })

  // the skier sinks back to a ghost of himself (he keeps skiing)...
  const fade = { v: 0 }
  if (o.ascii) tl.to(fade, { v: 1, duration: 2.4, ease: 'power2.inOut', onUpdate: () => o.ascii!.setFade(fade.v) }, 0)

  // ...and the name surfaces through it, a word at a time
  const t0 = o.ascii ? 0.8 : 0
  const gap = 0.5
  tl.from(words, {
    autoAlpha: 0, y: em * 0.3, filter: 'blur(12px)',
    duration: 1.6, ease: 'power3.out', stagger: gap, clearProps: 'filter',
  }, t0)

  // the snowflakes pop in pixel steps as the last word lands, then the small print
  const last = t0 + (words.length - 1) * gap
  tl.fromTo(q('.l2 .pxi'), { scale: 0 }, { scale: 1, duration: 0.42, ease: 'steps(4)', stagger: 0.16 }, last + 0.5)
    .fromTo(corners, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 1, ease: 'power2.out', stagger: 0.08, clearProps: 'transform' }, last + 0.9)

  if (import.meta.env.DEV) Object.assign(window, { __intro: { tl } })
  await new Promise<void>((r) => { tl.call(r, undefined, last + 1.2) })
}
