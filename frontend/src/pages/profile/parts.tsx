import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, EmptyState, Skeleton } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { readableOn, sameColor } from './helpers'

// ── Linha de configuração: título e explicação à esquerda, controle à direita ──
export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="prf-setting">
      <div className="prf-setting__text">
        <div className="prf-setting__title">{title}</div>
        {description && <div className="prf-setting__desc">{description}</div>}
      </div>
      <div className="prf-setting__control">{children}</div>
    </div>
  )
}

// ── Controle segmentado (grupo de opções exclusivas) ──
// Tema em prévias: um mini app desenhado com as cores de cada tema (não com as do tema atual),
// para a escolha ser visual. Mesmo teclado do controle segmentado (setas trocam).
export function ThemePicker<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string
  options: { value: T; label: string }[]
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => {
    const next = (i + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="prf-themes">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button key={o.value} ref={el => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            className={`prf-theme prf-theme--${o.value}`} onClick={() => onChange(o.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
            }}>
            <span className="prf-theme__shot" aria-hidden>
              <span className="prf-theme__side"><i /><i /><i /></span>
              <span className="prf-theme__main">
                <span className="prf-theme__card"><b /><em /><span className="prf-theme__bar"><s /></span></span>
                <span className="prf-theme__card prf-theme__card--sm"><b /><em /></span>
              </span>
            </span>
            <span className="prf-theme__label">
              <span className="prf-theme__radio" aria-hidden>{on && <Icon name="check" size={11} strokeWidth={3} />}</span>
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; label: string
  options: { value: T; label: ReactNode; icon?: IconName }[]
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => {
    const next = (i + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="prf-seg">
      {options.map((o, i) => {
        const on = o.value === value
        return (
          <button key={o.value} ref={el => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            className="prf-seg__opt" onClick={() => onChange(o.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
            }}>
            {o.icon && <Icon name={o.icon} size={15} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Paleta de cores ──
// used: cores já usadas por outra categoria (um ponto no canto avisa; o nome vai na dica)
export function ColorPicker({ value, onChange, colors, label, names, used }: {
  value: string; onChange: (c: string) => void; colors: string[]; label: string; names?: Record<string, string>; used?: Set<string>
}) {
  const { t } = useTranslation()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.max(0, colors.findIndex(c => sameColor(c, value)))
  const move = (i: number) => {
    const next = (i + colors.length) % colors.length
    onChange(colors[next])
    refs.current[next]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="prf-swatches">
      {colors.map((c, i) => {
        const on = sameColor(c, value)
        const name = names?.[c.toLowerCase()] ?? t('profile.colors.pick', { color: c.toUpperCase() })
        return (
          <button key={c} ref={el => { refs.current[i] = el }} type="button" role="radio" aria-checked={on} aria-label={name} title={name}
            tabIndex={i === current ? 0 : -1} className="prf-swatch" style={{ background: c }} onClick={() => onChange(c)}
            onKeyDown={e => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i + 1) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i - 1) }
            }}>
            {on && <Icon name="check" size={15} strokeWidth={2.5} style={{ color: readableOn(c) }} />}
            {used?.has(c.toLowerCase()) && <span className="prf-swatch__used" aria-hidden />}
          </button>
        )
      })}
    </div>
  )
}

// ── Marca do banco: quadrado com a cor e a inicial ──
export function BankMark({ color, label, size = 'md' }: { color: string; label: string; size?: 'md' | 'sm' }) {
  return (
    // Quadrado em tom suave da cor do banco, letra na própria cor (como o tile das categorias):
    // cores de banco saturadas (roxo, laranja, verde puro) brigavam com o vinho e com o verde de estado
    <span className={`prf-mark prf-mark--${size}`} aria-hidden style={{ '--c': color } as CSSProperties}>
      {(label.trim()[0] || '?').toUpperCase()}
    </span>
  )
}

// ── Esqueleto de lista ──
export function ListSkeleton({ rows = 3, mark = true }: { rows?: number; mark?: boolean }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy="true" aria-label={t('common.loading')}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="prf-skel-row" aria-hidden>
          {mark && <Skeleton width={36} height={36} radius="var(--radius-md)" />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton width={`${46 - i * 6}%`} height={13} />
            <Skeleton width={`${28 - i * 3}%`} height={11} />
          </div>
          <Skeleton width={84} height={14} />
        </div>
      ))}
    </div>
  )
}

// ── Falha ao carregar, com nova tentativa ──
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <EmptyState compact tone="error" title={message}
      action={<Button variant="secondary" size="sm" icon="refresh" onClick={onRetry}>{t('profile.retry')}</Button>} />
  )
}
