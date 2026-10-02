// Ícones das categorias padrão (o banco guarda nomes no padrão lucide).
// Mesmo traço do icons.tsx; o que não estiver aqui cai no ícone de etiqueta.
import { Icon, type IconName } from '../../components/icons'

const LOCAL: Record<string, React.ReactNode> = {
  utensils: <><path d="M7 3v18M4 3v5a3 3 0 0 0 6 0V3" /><path d="M18 21V3c-2.2 1.2-3.5 3.8-3.5 7.5V14H18" /></>,
  car: <><path d="M4 16.5V12l2-5.5h12L20 12v4.5" /><path d="M3 12h18M4 16.5h16M6 16.5V19M18 16.5V19" /><path d="M7.5 14h.01M16.5 14h.01" /></>,
  home: <><path d="m3 11 9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />,
  book: <><path d="M5 19.5V5a2 2 0 0 1 2-2h12v15H7a2 2 0 0 0-2 2Z" /><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" /></>,
  music: <><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  shirt: <path d="M9 3.5 4 6l1.5 4.5L8 9.8V20.5h8V9.8l2.5.7L20 6l-5-2.5a3 3 0 0 1-6 0Z" />,
  'dollar-sign': <path d="M12 3v18M16.5 7H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />,
}

const SHARED: Record<string, IconName> = {
  repeat: 'repeat',
  'trending-up': 'trendUp',
  'arrow-right': 'transfer',
  'more-horizontal': 'layers',
}

export function CategoryIcon({ name, size = 16 }: { name?: string; size?: number }) {
  const local = name ? LOCAL[name] : undefined
  if (local) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        {local}
      </svg>
    )
  }
  return <Icon name={(name && SHARED[name]) || 'tag'} size={size} />
}
