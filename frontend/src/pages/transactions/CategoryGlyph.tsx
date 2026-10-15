// Ícone da transação: categoria na cor dela, transferência neutra
import type { CSSProperties, ReactNode } from 'react'
import { Icon } from '../../components/icons'
import { Glyph } from '../../components/glyphs'
import type { Category } from '../../types'
import { categoryColor } from '../../lib/categoryColor'

export function CategoryGlyph({ category, transfer, size = 36 }: { category?: Category; transfer?: boolean; size?: number }) {
  const iconSize = Math.round(size * 0.47)
  let content: ReactNode
  let style: CSSProperties
  if (transfer) {
    content = <Icon name="transfer" size={iconSize} />
    style = { background: 'var(--bg-subtle)', color: 'var(--text-muted)', boxShadow: 'inset 0 0 0 1px var(--border)' }
  } else if (category) {
    content = <Glyph name={category.icon} size={iconSize} />
    // A cor da categoria puxada para o texto: legível nos dois temas
    const color = categoryColor(category)
    style = {
      background: `color-mix(in srgb, ${color} 16%, transparent)`,
      color: `color-mix(in srgb, ${color} 70%, var(--text-primary))`,
    }
  } else {
    // Sem categoria: neutro e tracejado (o âmbar cheio parecia Transporte); a pílula "+ Escolher" já avisa
    content = <Icon name="tag" size={iconSize} />
    style = { background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border-strong)' }
  }
  return <span className="tx-glyph" aria-hidden style={{ width: size, height: size, ...style }}>{content}</span>
}
