// Botão Exportar: menu no computador, folha de baixo no celular
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useIsMobile } from './shared'
import type { ExportFormat } from './exportFile'

export function ExportMenu({ busy, onExport }: { busy: ExportFormat | null; onExport: (f: ExportFormat) => void }) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || mobile) return
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector<HTMLButtonElement>('.tx-export__btn')?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...(wrap.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
        e.preventDefault()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus())
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, mobile])

  const choose = (f: ExportFormat) => { setOpen(false); onExport(f) }

  const options = (
    <>
      {(['xlsx', 'csv'] as const).map(f => (
        <button key={f} type="button" role={mobile ? undefined : 'menuitem'} className="tx-export__item" onClick={() => choose(f)}>
          <span className="tx-export__icon"><Icon name={f === 'xlsx' ? 'table' : 'fileText'} size={18} /></span>
          <span style={{ minWidth: 0 }}>
            <span className="tx-export__title">{t(`transactions.actions.${f}`)} <span className="tx-export__ext">.{f}</span></span>
            <span className="tx-export__hint">{t(`transactions.actions.${f}Hint`)}</span>
          </span>
        </button>
      ))}
    </>
  )

  return (
    <div className="tx-export" ref={wrap}>
      <Button variant="secondary" icon="download" iconRight={mobile ? undefined : 'chevronDown'} className="tx-export__btn" loading={!!busy}
        aria-haspopup={mobile ? 'dialog' : 'menu'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {t('transactions.actions.export')}
      </Button>
      {mobile ? (
        <Modal open={open} onClose={() => setOpen(false)} title={t('transactions.actions.exportTitle')} description={t('transactions.actions.exportScope')}>
          <div className="tx-export__sheet">{options}</div>
        </Modal>
      ) : open && (
        <div className="tx-export__menu" role="menu" aria-label={t('transactions.actions.exportTitle')}>
          <p className="tx-export__scope">{t('transactions.actions.exportScope')}</p>
          {options}
        </div>
      )}
    </div>
  )
}
