// The words on the home page, in two versions: one for AI engineering roles, one for software roles
// (backend, DevOps and AI). Build-time only: vite.config.ts fills index.html's {{fields}} from one of these,
// so the shipped page is plain HTML and nothing here reaches the browser as script.
//
//   npm run dev / npm run build           → ai
//   npm run dev:swe / npm run build:swe   → swe   (or set VARIANT=swe, as the Vercel project does)

export interface Job { when: string; role: string; org: string; what: string }
export interface Project { name: string; href: string; kind: string; stack: string; year: string }
export interface Variant {
  /** shown under the name, word by word */
  title: string
  /** the same title as a screen reader should hear it, after the name */
  spoken: string
  description: string
  ogDescription: string
  bio: string
  jobs: Job[]
  work: Project[]
}

const zixel = (what: string): Job => ({ when: '2026 — Now', role: 'Forward Deployed Engineer', org: 'Zixel', what })
const tripleSeven = (what: string): Job => ({ when: '2025', role: 'Fullstack Developer', org: 'Triple Seven Motorsports', what })
const comsats = (what: string): Job => ({ when: '2022 — 2026', role: 'BS Data Science', org: 'COMSATS University · Islamabad', what })

const repo = (name: string) => `https://github.com/HasanMal1k/${name}`
const sizer: Project = { name: 'Sizer', href: 'https://sizer-five.vercel.app', kind: 'Web app', stack: 'Next.js · TypeScript', year: '2026' }
const field: Project = { name: 'The Field', href: '/field.html', kind: 'Interactive 3D', stack: 'three.js · WebGL', year: '2026' }

export const VARIANTS = {
  ai: {
    title: 'AI Engineer',
    spoken: 'AI engineer',
    description: 'Hasan Malik is an AI engineer building LLM systems: multi-agent coding workflows, retrieval-augmented generation, tool calling and local inference.',
    ogDescription: 'AI engineer building LLM systems.',
    bio: "I'm an AI engineer. I build LLM systems: multi-agent coding workflows, retrieval and RAG, tool calling, structured outputs and local inference, and the Python and Go backends that serve them.",
    jobs: [
      zixel('C++ modeling features for a cloud CAD platform, including sheet-metal tools like Custom Forming and Bridge Stamping. Co-leading a team of five on a feature redesign.'),
      tripleSeven('Rebuilt their 3D steering wheel configurator in Next.js and Three.js, wired to Shopify for products, inventory and configurable options.'),
      comsats('Final-year project: MLOPT, an AutoML platform that takes a dataset from upload and cleaning through model comparison to an Azure ML deployment.'),
    ],
    work: [
      { name: 'Coder', href: repo('coder'), kind: 'Multi-agent dev platform', stack: 'Go · Next.js · Docker · MCP', year: '2026' },
      { name: 'Pakistan Law Assistant', href: repo('legalai'), kind: 'Legal RAG', stack: 'Python · FastAPI · Qdrant · Ollama', year: '2026' },
      { name: 'MLOPT', href: repo('MLOPT'), kind: 'AutoML platform', stack: 'Next.js · FastAPI · Azure ML', year: '2026' },
      { name: 'Steering Wheel Configurator', href: repo('Steering-Wheel'), kind: '3D configurator', stack: 'Next.js · Three.js · Shopify', year: '2025' },
      sizer,
      field,
    ],
  },
  swe: {
    title: 'Software Engineer',
    spoken: 'software engineer',
    description: 'Hasan Malik is a software engineer working across backend, DevOps and AI: Go and Python services, PostgreSQL, Docker and CI/CD, and LLM systems.',
    ogDescription: 'Software engineer across backend, DevOps and AI.',
    bio: "I'm a software engineer working across backend, DevOps and AI: Go and Python services, gRPC and REST APIs, PostgreSQL, Docker and CI/CD, with LLM systems on top. As a forward deployed engineer, I write C++ for a cloud CAD platform.",
    jobs: [
      zixel('C++ modeling features for a cloud CAD platform, including sheet-metal tools, and work on the accuracy and performance of existing ones. Co-leading a team of five engineers on a feature redesign.'),
      tripleSeven("Rebuilt their 3D steering wheel configurator in Next.js and Three.js and integrated Shopify's APIs for products, inventory and configurable options."),
      comsats('Final-year project: MLOPT, with a modular FastAPI backend, live training progress over Server-Sent Events, Docker, and an MLflow-to-Azure ML deployment workflow.'),
    ],
    work: [
      { name: 'Coder', href: repo('coder'), kind: 'Platform backend & infra', stack: 'Go · gRPC · Docker · PostgreSQL', year: '2026' },
      { name: 'MLOPT', href: repo('MLOPT'), kind: 'ML platform', stack: 'FastAPI · Docker · Azure ML · GitHub Actions', year: '2026' },
      { name: 'Pakistan Law Assistant', href: repo('legalai'), kind: 'RAG service', stack: 'Python · FastAPI · Qdrant', year: '2026' },
      { name: 'Steering Wheel Configurator', href: repo('Steering-Wheel'), kind: '3D configurator', stack: 'Next.js · Three.js · Shopify', year: '2025' },
      sizer,
      field,
    ],
  },
} satisfies Record<string, Variant>

export type VariantName = keyof typeof VARIANTS

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const job = (j: Job) => `            <li class="job">
              <span class="when">${esc(j.when)}</span>
              <h3 class="role">${esc(j.role)}</h3>
              <span class="org">${esc(j.org)}</span>
              <p class="what">${esc(j.what)}</p>
            </li>`

const row = (p: Project) => {
  const away = /^https?:/.test(p.href) ? ' target="_blank" rel="noopener"' : ''
  return `            <a class="row" role="row" href="${esc(p.href)}"${away}>
              <span role="cell">${esc(p.name)}</span>
              <span role="cell">${esc(p.kind)}</span>
              <span role="cell">${esc(p.stack)}</span>
              <span role="cell">${esc(p.year)}</span>
            </a>`
}

/** Fill a page's {{fields}} from one version; an unknown field is an error rather than a gap on the page. */
export function render(html: string, v: Variant): string {
  const fields: Record<string, string> = {
    pageTitle: esc(`Hasan Malik — ${v.title}`),
    description: esc(v.description),
    ogDescription: esc(v.ogDescription),
    spoken: esc(`Hasan Malik, ${v.spoken}`),
    titleWords: v.title.split(' ').map((w) => `<span class="w">${esc(w)}</span>`).join(' '),
    jobs: v.jobs.map(job).join('\n'),
    work: v.work.map(row).join('\n'),
    bio: esc(v.bio),
  }
  return html.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    if (!(k in fields)) throw new Error(`index.html asks for {{${k}}}, which content.ts doesn't provide`)
    return fields[k]
  })
}
