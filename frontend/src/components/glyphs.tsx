// ── Glifos de categoria e de meta ─────────────────────────
// O banco guarda nomes no padrão lucide (category.icon, goal.icon). Os desenhos ficam aqui, no mesmo
// traço do icons.tsx; o que já existe em icons.tsx é só apontado. Nome desconhecido cai na etiqueta.
import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from './icons'

const DRAWN: Record<string, ReactNode> = {
  utensils: <><path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3" /><path d="M18 21V3c-2.2 1.2-3.5 3.8-3.5 7.5V14H18" /></>,
  car: <><path d="M4 16.5V12l2-5.5h12L20 12v4.5" /><path d="M3 12h18M4 16.5h16M6 16.5V19M18 16.5V19" /><path d="M7.5 14h.01M16.5 14h.01" /></>,
  home: <><path d="m3 11 9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  book: <><path d="M5 19.5V5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" /></>,
  music: <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  shirt: <path d="M9 3.5 4 6l1.5 4.5L8 9.8V20.5h8V9.8l2.5.7L20 6l-5-2.5a3 3 0 0 1-6 0Z" />,
  'dollar-sign': <path d="M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />,
  'paw-print': <><circle cx="5.5" cy="10.5" r="1.75" /><circle cx="9.5" cy="6" r="1.75" /><circle cx="14.5" cy="6" r="1.75" /><circle cx="18.5" cy="10.5" r="1.75" /><path d="M12 12c-2.6 0-5 3-5 5.4 0 1.5 1.1 2.3 2.5 2.3.9 0 1.7-.4 2.5-.4s1.6.4 2.5.4c1.4 0 2.5-.8 2.5-2.3 0-2.4-2.4-5.4-5-5.4Z" /></>,
  gift: <><rect x="3.5" y="8" width="17" height="4" rx="1" /><path d="M5 12v8.5h14V12M12 8v12.5" /><path d="M12 8C10.5 4.5 7 4 7 6.2 7 7.4 8.5 8 12 8Zm0 0c1.5-3.5 5-4 5-1.8C17 7.4 15.5 8 12 8Z" /></>,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3.5 12.5h17" /></>,
  coffee: <><path d="M4 9h12v5.5A5.5 5.5 0 0 1 10.5 20h-1A5.5 5.5 0 0 1 4 14.5V9Z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5V6M12 3.5V6" /></>,
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11" />,
  smartphone: <><rect x="6.5" y="2.5" width="11" height="19" rx="2" /><path d="M11 18h2" /></>,
  'shopping-bag': <><path d="M5 7.5h14l-1 13H6l-1-13Z" /><path d="M9 10V6.5a3 3 0 0 1 6 0V10" /></>,
  plane: <><path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" /><path d="m10 13 4.5-4.5" /></>,
}

const SHARED: Record<string, IconName> = {
  repeat: 'repeat',
  'trending-up': 'trendUp',
  'arrow-right': 'transfer',
  'more-horizontal': 'layers',
  'piggy-bank': 'piggy',
  target: 'target',
  shield: 'shield',
  tag: 'tag',
}

// Glifos oferecidos ao criar categoria ou meta (os das categorias padrão vêm primeiro)
const GLYPH_CHOICES = [
  'tag', 'home', 'utensils', 'car', 'heart', 'book', 'music', 'shirt', 'repeat', 'trending-up',
  'paw-print', 'gift', 'briefcase', 'coffee', 'dumbbell', 'smartphone', 'shopping-bag', 'plane', 'piggy-bank', 'target', 'shield',
] as const

export function Glyph({ name, size = 16 }: { name?: string | null; size?: number }) {
  const drawn = name ? DRAWN[name] : undefined
  if (drawn) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        {drawn}
      </svg>
    )
  }
  return <Icon name={(name && SHARED[name]) || 'tag'} size={size} />
}

/** Grade de glifos (um grupo de rádio): setas mudam a escolha, como nas abas. color tinge o escolhido. */
export function GlyphPicker({ value, onChange, color = 'var(--accent-text)', label }: { value?: string | null; onChange: (name: string) => void; color?: string; label?: string }) {
  const { t } = useTranslation()
  const list = useRef<HTMLDivElement>(null)
  const current = GLYPH_CHOICES.includes(value as typeof GLYPH_CHOICES[number]) ? value : 'tag'
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = GLYPH_CHOICES.indexOf(current as typeof GLYPH_CHOICES[number])
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (idx + step + GLYPH_CHOICES.length) % GLYPH_CHOICES.length
    onChange(GLYPH_CHOICES[next])
    requestAnimationFrame(() => list.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus())
  }
  return (
    <div ref={list} role="radiogroup" aria-label={label ?? t('common.glyph.label')} className="ft-glyphs" style={{ '--glyph-color': color } as React.CSSProperties} onKeyDown={onKeyDown}>
      {GLYPH_CHOICES.map(name => {
        const on = name === current
        return (
          <button key={name} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} className="ft-glyph-opt"
            aria-label={t(`common.glyph.names.${name}`)} title={t(`common.glyph.names.${name}`)} onClick={() => onChange(name)}>
            <Glyph name={name} size={18} />
          </button>
        )
      })}
    </div>
  )
}
