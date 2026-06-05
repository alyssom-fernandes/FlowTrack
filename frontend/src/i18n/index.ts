import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import pt from './locales/pt.json'
import en from './locales/en.json'

const LANG_KEY = 'ft-lang'

export const LANGUAGES = [
  { code: 'pt', label: 'Português' },
  { code: 'en', label: 'English' },
]

export function getSavedLanguage(): string {
  return localStorage.getItem(LANG_KEY) || 'pt'
}

export function saveLanguage(lang: string) {
  localStorage.setItem(LANG_KEY, lang)
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      pt: { translation: pt },
      en: { translation: en },
    },
    lng: getSavedLanguage(),
    fallbackLng: 'pt',
    interpolation: { escapeValue: false },
  })

export default i18n
