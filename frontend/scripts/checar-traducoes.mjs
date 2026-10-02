// Compara as chaves de pt e en, arquivo por arquivo: node scripts/checar-traducoes.mjs [área]
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales')
const so = process.argv[2]
const chaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? chaves(v, p + k + '.') : [p + k]))
const sem = s => s.replace(/_(one|other|zero|few|many)$/, '')
let falhas = 0
for (const arq of readdirSync(join(base, 'pt'))) {
  if (so && !arq.startsWith(so)) continue
  const pt = new Set(chaves(JSON.parse(readFileSync(join(base, 'pt', arq), 'utf8'))).map(sem))
  const en = new Set(chaves(JSON.parse(readFileSync(join(base, 'en', arq), 'utf8'))).map(sem))
  const soPt = [...pt].filter(k => !en.has(k)), soEn = [...en].filter(k => !pt.has(k))
  if (soPt.length || soEn.length) { falhas++; console.log(`${arq}:`); soPt.forEach(k => console.log(`  falta em en: ${k}`)); soEn.forEach(k => console.log(`  falta em pt: ${k}`)) }
}
console.log(falhas ? `${falhas} arquivo(s) com diferenças` : 'pt e en com as mesmas chaves')
process.exit(falhas ? 1 : 0)
