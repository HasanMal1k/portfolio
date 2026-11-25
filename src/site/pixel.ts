// Small pixel-art icons for the headline, drawn as crisp SVG. Each icon is one or more layers of
// '#'-pixels; extra layers (a twinkle frame, a blink) are switched on and off by CSS in steps.

type Art = { w: number; h: number; layers: Record<string, string[]> }

const ART: Record<string, Art> = {
  // a snowflake that twinkles to a smaller one now and then
  snow: {
    w: 9, h: 9,
    layers: {
      a: [
        '....#....',
        '.#..#..#.',
        '..#.#.#..',
        '...###...',
        '#########',
        '...###...',
        '..#.#.#..',
        '.#..#..#.',
        '....#....',
      ],
      b: [
        '.........',
        '....#....',
        '..#.#.#..',
        '...###...',
        '.#######.',
        '...###...',
        '..#.#.#..',
        '....#....',
        '.........',
      ],
    },
  },
  // the agent: a little robot whose eyes blink and whose antenna light flashes
  bot: {
    w: 11, h: 10,
    layers: {
      body: [
        '...........',
        '.....#.....',
        '.#########.',
        '.#########.',
        '##..###..##',
        '##..###..##',
        '.#########.',
        '.###...###.',
        '.#########.',
        '..##...##..',
      ],
      lid: [
        '...........',
        '...........',
        '...........',
        '...........',
        '..##...##..',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
      ],
      tip: [
        '.....#.....',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
        '...........',
      ],
    },
  },
  // two sparkles that trade places in size
  spark: {
    w: 9, h: 9,
    layers: {
      a: [
        '......#..',
        '......#..',
        '....##.##',
        '......#..',
        '......#..',
        '.#.......',
        '#.#......',
        '.#.......',
        '.........',
      ],
      b: [
        '.........',
        '......#..',
        '.....#.#.',
        '......#..',
        '..#......',
        '..#......',
        '##.##....',
        '..#......',
        '..#......',
      ],
    },
  },
}

// one path per layer, one rectangle per horizontal run of pixels
function path(rows: string[]): string {
  let d = ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; ) {
      if (row[x] !== '#') { x++; continue }
      let n = 0
      while (row[x + n] === '#') n++
      d += `M${x} ${y}h${n}v1h${-n}z`
      x += n
    }
  })
  return d
}

export function pixelSvg(name: string): string {
  const art = ART[name]
  if (!art) return ''
  const paths = Object.entries(art.layers).map(([k, rows]) => `<path class="px-${k}" d="${path(rows)}"/>`).join('')
  return `<svg class="pxi pxi-${name}" viewBox="0 0 ${art.w} ${art.h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${paths}</svg>`
}

/** Fill every <i data-px="name"></i> placeholder with its icon. */
export function fillPixelIcons(root: ParentNode = document) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-px]')) el.innerHTML = pixelSvg(el.dataset.px!)
}
