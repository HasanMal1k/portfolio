import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource-variable/fraunces/index.css'
import './style.css'
import { createWorld } from './world'
import { SPECIES, SPECIES_LIST, type Species } from './config'

const $ = <T extends Element>(s: string) => document.querySelector<T>(s)
const $$ = <T extends Element>(s: string) => [...document.querySelectorAll<T>(s)]

const canvas = $<HTMLCanvasElement>('canvas.world')!
const panel = $<HTMLElement>('#panel')!
const holding = $<HTMLElement>('.holding')!
const tag = $<HTMLElement>('.tag')!
const hint = $<HTMLElement>('.hint')
const motionBtn = $<HTMLButtonElement>('.motion')

let opener: HTMLElement | null = null
let open = false

function showPanel(species: Species) {
  const s = SPECIES[species]
  holding.textContent = `You're holding a ${s.name.toLowerCase()} · ${s.page}`
  for (const a of $$<HTMLElement>('#panel article')) a.hidden = a.dataset.id !== s.section
  panel.hidden = false
  requestAnimationFrame(() => panel.classList.add('is-open'))
  document.documentElement.classList.add('is-holding')
  hint?.classList.add('is-gone')
  open = true
  history.replaceState(null, '', `#${s.section}`)
}

function hidePanel() {
  if (!open) return
  open = false
  panel.classList.remove('is-open')
  document.documentElement.classList.remove('is-holding')
  history.replaceState(null, '', location.pathname + location.search)
  setTimeout(() => { if (!open) panel.hidden = true }, 450)
  opener?.focus({ preventScroll: true })
  opener = null
}

const world = createWorld(canvas, {
  onHover(a) {
    tag.classList.toggle('is-on', !!a)
    if (a) tag.textContent = `${SPECIES[a.species].name} · ${SPECIES[a.species].page}`
  },
  onTag(x, y) {
    tag.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
  },
  onPick(a) {
    tag.classList.remove('is-on')
    showPanel(a.species)
  },
  onDrop: hidePanel,
  onMove() { hint?.classList.add('is-gone') },
})

if (!world) document.documentElement.classList.add('no-gl')

// keyboard and fallback path: the legend picks up the nearest animal of that kind
for (const b of $$<HTMLButtonElement>('[data-seek]')) {
  b.addEventListener('click', () => {
    const sp = b.dataset.seek as Species
    opener = b
    if (world) world.seek(sp)
    else showPanel(sp)
  })
}
$('.put-down')?.addEventListener('click', () => (world ? world.drop() : hidePanel()))
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open) world ? world.drop() : hidePanel()
})

function syncMotion() {
  if (!motionBtn) return
  const on = world?.motion() ?? false
  motionBtn.setAttribute('aria-pressed', String(!on))
  motionBtn.setAttribute('aria-label', on ? 'Pause the animals' : 'Let the animals move')
  motionBtn.querySelector('.motion-text')!.textContent = on ? 'Pause' : 'Play'
  motionBtn.dataset.state = on ? 'playing' : 'paused'
  motionBtn.hidden = !world
}
motionBtn?.addEventListener('click', () => {
  world?.setMotion(!world.motion())
  syncMotion()
})
syncMotion()

// deep link: /#sizer arrives holding the horse
const fromHash = SPECIES_LIST.find((k) => SPECIES[k].section === location.hash.slice(1))
if (fromHash) setTimeout(() => (world ? world.seek(fromHash) : showPanel(fromHash)), 700)
