// Exportar: menu no computador. No celular, um "⋯" ao lado do título abre uma folha com Importar e Exportar
// (o "Nova" fica como o único botão cheio da tela).
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Modal } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useIsMobile } from './shared'
import type { ExportFormat } from './exportFile'

export function ExportMenu({ busy, onExport, onImport, scope }: { busy: ExportFormat | null; onExport: (f: ExportFormat) => void; onImport: () => void; scope: string }) {
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
  const importNow = () => { setOpen(false); onImport() }

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

  if (mobile) {
    return (
      <div className="tx-export">
        <Button variant="secondary" icon="more" className="tx-export__btn tx-more" loading={!!busy} aria-label={t('transactions.actions.more')}
          aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(v => !v)} />
        <Modal open={open} onClose={() => setOpen(false)} title={t('transactions.actions.more')}>
          <div className="tx-export__sheet">
            {/* O nome acessível é só "Importar extrato" (a dica entra como descrição) */}
            <button type="button" className="tx-export__item" onClick={importNow} aria-label={t('transactions.import.title')} aria-describedby="tx-import-hint">
              <span className="tx-export__icon"><Icon name="upload" size={18} /></span>
              <span style={{ minWidth: 0 }}>
                <span className="tx-export__title">{t('transactions.import.title')}</span>
                <span className="tx-export__hint" id="tx-import-hint">{t('transactions.actions.importHint')}</span>
              </span>
            </button>
            <p className="tx-export__scope tx-export__scope--sheet">{t('transactions.actions.exportTitle')} · {scope}</p>
            {options}
          </div>
        </Modal>
      </div>
    )
  }

  return (
    <div className="tx-export" ref={wrap}>
      <Button variant="secondary" icon="download" iconRight="chevronDown" className="tx-export__btn" loading={!!busy}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(v => !v)}>
        {t('transactions.actions.export')}
      </Button>
      {open && (
        <div className="tx-export__menu" role="menu" aria-label={t('transactions.actions.exportTitle')}>
          <p className="tx-export__scope">{scope}</p>
          {options}
        </div>
      )}
    </div>
  )
}
