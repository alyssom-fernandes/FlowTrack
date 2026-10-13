import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontes servidas pelo próprio site (sem Google Fonts: privacidade e nada de CSS de terceiros bloqueando)
import '@fontsource-variable/outfit'
import '@fontsource-variable/jetbrains-mono'
import './tokens.css'
import './i18n'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
