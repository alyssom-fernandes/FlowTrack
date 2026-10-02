import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

const LANG_KEY = 'ft-lang'

export const LANGUAGES = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
]

// Um arquivo por área (locales/<idioma>/<área>.json), juntados aqui
const files = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', { eager: true, import: 'default' })
const resources: Record<string, { translation: Record<string, unknown> }> = {}
for (const [path, content] of Object.entries(files)) {
  const lang = path.split('/')[2]
  resources[lang] ??= { translation: {} }
  Object.assign(resources[lang].translation, content)
}

export function getSavedLanguage(): string {
  try { return localStorage.getItem(LANG_KEY) || 'pt' } catch { return 'pt' }
}

// Troca o idioma da interface e lembra a escolha
export function setLanguage(lang: string) {
  saveLanguage(lang)
  i18n.changeLanguage(lang)
}

export function saveLanguage(lang: string) {
  try { localStorage.setItem(LANG_KEY, lang) } catch { /* ignora */ }
  document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getSavedLanguage(),
    fallbackLng: 'pt',
    interpolation: { escapeValue: false },
    // Chave sem texto em nenhum idioma vira erro em errosRegistrados()
    saveMissing: true,
    missingKeyHandler: (_lngs, _ns, key) => {
      (window as unknown as { __anotarErro?: (tipo: string, msg: string) => void }).__anotarErro?.('traducao', `chave sem texto: ${key}`)
    },
  })

document.documentElement.lang = getSavedLanguage() === 'en' ? 'en' : 'pt-BR'

export default i18n
