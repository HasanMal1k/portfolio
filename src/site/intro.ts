// The opening: the skier plays on his own for a moment, then the name arrives.
// Each type voice enters its own way: serif letters rise out of masks (SplitText), the script
// initials ink in, the pixel word boots up through the same ASCII ramp the skier is drawn with
// (ScrambleText), and the pixel sprites pop in steps.

import { gsap } from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { fillPixelIcons } from './pixel'

gsap.registerPlugin(SplitText, ScrambleTextPlugin)

const RAMP = '.:-=+*o#%@01'
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function fontsReady() {
  const faces = ['400 64px "Instrument Serif"', 'italic 400 64px "Instrument Serif"', '400 64px "Pinyon Script"', '400 64px "Pixelify Sans"']
  // never wait on a slow font for more than a couple of seconds
  return Promise.race([Promise.all(faces.map((f) => document.fonts.load(f))), sleep(2500)])
}

// resolves once the clip has been playing for `ms` (or a little later if it never starts: autoplay blocked, slow network)
function headStart(video: HTMLVideoElement | null, ms: number) {
  if (!video) return sleep(300)
  return new Promise<void>((done) => {
    const fallback = setTimeout(done, ms + 1800)
    const go = () => { clearTimeout(fallback); setTimeout(done, ms) }
    if (!video.paused && video.readyState >= 3) go()
    else video.addEventListener('playing', go, { once: true })
  })
}

export async function playIntro(video: HTMLVideoElement | null, reduced: boolean) {
  const head = document.querySelector<HTMLElement>('.headline')
  if (!head) return
  fillPixelIcons(head)
  const art = head.querySelector<HTMLElement>('.art')!
  const q = <T extends Element = HTMLElement>(s: string) => [...head.querySelectorAll<T>(s)]
  const corners = gsap.utils.toArray<HTMLElement>('.side, .scroll-cue')

  if (reduced) {
    document.documentElement.classList.add('intro')
    gsap.set([art, ...corners], { autoAlpha: 1 })
    return
  }

  await Promise.all([fontsReady(), headStart(video, 2000)])
  document.documentElement.classList.add('intro')

  const split = SplitText.create(q('.sf'), { type: 'chars', tag: 'span', charsClass: 'ch', mask: 'chars', aria: 'none' })
  const px = head.querySelector<HTMLElement>('.px')!
  const word = px.textContent ?? ''
  const em = parseFloat(getComputedStyle(head).fontSize)
  // hold the pixel word's final width while it scrambles, so the snowflakes beside it stay put
  const lock = () => { px.style.width = ''; px.style.width = `${px.getBoundingClientRect().width}px`; px.style.textAlign = 'left' }
  const unlock = () => { px.style.width = ''; px.style.textAlign = '' }
  lock()
  px.textContent = ''

  gsap.set(art, { autoAlpha: 1 })
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: unlock })

  // line 1: the serif letters rise; the script initials ink in, a beat apart
  tl.from(q('.l1 .ch'), { yPercent: 115, duration: 1.15, stagger: 0.05 }, 0)
    .from(q('.l1 .sc'), {
      opacity: 0, y: em * 0.22, rotate: -9, scale: 1.25, filter: 'blur(10px)',
      duration: 1.3, stagger: 0.22, ease: 'power3.out', clearProps: 'filter',
    }, 0.1)

  // line 2: the snowflakes pop in pixel steps; the word boots up through the ASCII ramp
  tl.fromTo(q('.l2 .pxi'), { scale: 0 }, { scale: 1, duration: 0.42, ease: 'steps(4)', stagger: 0.14 }, 0.35)
    .to(px, { duration: 1.3, ease: 'none', scrambleText: { text: word, chars: RAMP, revealDelay: 0.35, speed: 0.55 } }, 0.42)

  // line 3: the letters rise, then the robot hops up and the sparkles catch
  tl.from(q('.l3 .ch'), { yPercent: 115, duration: 1.1, stagger: 0.035 }, 0.6)
    .fromTo(q('.l3 .pxi-bot'), { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.5, ease: 'steps(5)' }, 1.05)
    .fromTo(q('.l3 .pxi-spark'), { scale: 0 }, { scale: 1, duration: 0.36, ease: 'steps(3)' }, 1.35)

  // and last, the small print in the corners
  tl.fromTo(corners, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power2.out', stagger: 0.08 }, 1.3)

  // hovering the pixel word boots it up again
  px.addEventListener('pointerenter', () => {
    if (tl.isActive() || gsap.isTweening(px)) return
    lock()
    gsap.to(px, { duration: 0.8, ease: 'none', scrambleText: { text: word, chars: RAMP, speed: 0.7 }, onComplete: unlock })
  })

  if (import.meta.env.DEV) Object.assign(window, { __intro: { tl, split } })
}
