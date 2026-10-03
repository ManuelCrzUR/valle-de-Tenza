// Genera src/styles/tokens.css desde scripts/tokens.json (sistema de marca Valle Directo).
import { readFileSync, writeFileSync } from 'node:fs'
const t = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'))
const val = (v, theme) => {
  const x = typeof v === 'string' ? v : (v[theme] ?? v.light)
  return x.replace(/^\{(.+)\}$/, 'var(--$1)')
}
const block = (theme) => {
  const L = []
  for (const c of t.color.tokens) L.push(`  --${c.name}: ${val(c.value, theme)};`)
  if (theme === 'light') {
    L.push(`  --font-display: ${t.type.families.display};`)
    L.push(`  --font-sans: ${t.type.families.sans};`)
    for (const g of ['spacing', 'radius', 'size'])
      for (const s of t[g].tokens) L.push(`  --${s.name}: ${s.value};`)
  }
  for (const s of t.shadow.tokens) L.push(`  --${s.name}: ${val(s.value, theme)};`)
  return L.join('\n')
}
const faces = t.type.fonts.map((f) =>
  `@font-face {\n  font-family: "${f.family}";\n  font-weight: ${f.weight};\n  font-style: normal;\n  font-display: swap;\n  src: url("/${f.file}") format("woff2");\n}`
).join('\n')
const css = `/* GENERADO por scripts/gen-tokens.mjs — no editar a mano. */
${faces}

:root {
${block('light')}
  color-scheme: light;
}
:root[data-theme="dark"] { /* oscuro solo si se activa a mano; por defecto la app es clara */
${block('dark')}
  color-scheme: dark;
}
`
writeFileSync(new URL('../src/styles/tokens.css', import.meta.url), css)
console.log('tokens.css listo')
