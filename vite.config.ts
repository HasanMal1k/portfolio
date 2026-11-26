import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'
import { VARIANTS, render, type VariantName } from './src/site/content.ts'

// The home page comes in two versions from one template: "ai" (the default) and "swe" (software: backend,
// DevOps and AI). Pick with --mode swe (npm run dev:swe / build:swe) or VARIANT=swe, as the Vercel project does.
function pickVariant(mode: string): VariantName {
  const name = process.env.VARIANT ?? (mode in VARIANTS ? mode : 'ai')
  if (!(name in VARIANTS)) throw new Error(`VARIANT must be one of: ${Object.keys(VARIANTS).join(', ')} (got "${name}")`)
  return name as VariantName
}

function fillVariant(name: VariantName): Plugin {
  return {
    name: 'fill-variant',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => (ctx.filename.endsWith('index.html') ? render(html, VARIANTS[name]) : html), // field.html is shared
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [fillVariant(pickVariant(mode))],
  server: { port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        field: resolve(import.meta.dirname, 'field.html'), // the toy-animal world, kept as its own page
      },
    },
  },
}))
