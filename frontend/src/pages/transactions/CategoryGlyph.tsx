// Ícone da transação: categoria na cor dela, transferência neutra
import type { CSSProperties, ReactNode } from 'react'
import { Icon, type IconName } from '../../components/icons'
import type { Category } from '../../types'

// Os nomes vêm do banco (padrão lucide); os que faltam em icons.tsx ficam aqui
const LOCAL: Record<string, ReactNode> = {
  utensils: <><path d="M7 3v7.5a2 2 0 0 0 2 2V21" /><path d="M11 3v7.5a2 2 0 0 1-2 2M9 3v5" /><path d="M17 21V3c-1.8 1.1-3 3.4-3 6.5V14h3" /></>,
  car: <><path d="M3.5 16.5V12l2-5a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 7l2 5v4.5" /><path d="M3.5 12h17M10 16.5h4" /><circle cx="7" cy="16.5" r="2" /><circle cx="17" cy="16.5" r="2" /></>,
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5Z" />,
  heart: <path d="M12 19.5s-7.5-4.4-7.5-9.8A4.3 4.3 0 0 1 12 7.1a4.3 4.3 0 0 1 7.5 2.6c0 5.4-7.5 9.8-7.5 9.8Z" />,
  book: <><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14H7.5A2.5 2.5 0 0 0 5 19.5v-14Z" /><path d="M5 19.5A2.5 2.5 0 0 0 7.5 22H19v-5" /></>,
  music: <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  shirt: <path d="M8.5 3 3.5 5.5 5 10h2.5v11h9V10H19l1.5-4.5-5-2.5a3.5 3.5 0 0 1-7 0Z" />,
  'dollar-sign': <path d="M12 3v18M16 7.5h-5.5a2.75 2.75 0 0 0 0 5.5h3a2.75 2.75 0 0 1 0 5.5H7.5" />,
}

const SHARED: Record<string, IconName> = {
  repeat: 'repeat',
  'trending-up': 'trendUp',
  'arrow-right': 'transfer',
  'more-horizontal': 'layers',
  tag: 'tag',
}

export function CategoryGlyph({ category, transfer, size = 36 }: { category?: Category; transfer?: boolean; size?: number }) {
  const iconSize = Math.round(size * 0.47)
  let content: ReactNode
  let style: CSSProperties
  if (transfer) {
    content = <Icon name="transfer" size={iconSize} />
    style = { background: 'var(--bg-subtle)', color: 'var(--text-muted)', boxShadow: 'inset 0 0 0 1px var(--border)' }
  } else if (category) {
    const local = category.icon ? LOCAL[category.icon] : undefined
    content = local
      ? <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{local}</svg>
      : <Icon name={SHARED[category.icon || ''] ?? 'tag'} size={iconSize} />
    // A cor da categoria puxada para o texto: legível nos dois temas
    style = {
      background: `color-mix(in srgb, ${category.color} 15%, transparent)`,
      color: `color-mix(in srgb, ${category.color} 66%, var(--text-primary))`,
    }
  } else {
    content = <Icon name="tag" size={iconSize} />
    style = { background: 'var(--amber-soft)', color: 'var(--amber)' }
  }
  return <span className="tx-glyph" aria-hidden style={{ width: size, height: size, ...style }}>{content}</span>
}
