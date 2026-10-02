// Importar extrato em etapas: arquivo → revisão → concluído
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, EmptyState, Money, Modal, Select, Spinner, Tabs } from '../../components/ui'
import { Icon, type IconName } from '../../components/icons'
import { transactionsService } from '../../services'
import { formatCurrency, formatDateShort } from '../../utils'
import type { Account, ParsedTransaction } from '../../types'
import { guessMapping, interpret, parseCsv, type CsvMapping, type CsvTable } from './csv'
import { amountToInput, parseAmount, useIsMobile } from './shared'

type Step = 'choose' | 'reading' | 'review' | 'csv' | 'importing' | 'done'
type Source = { kind: 'pdf' | 'ofx' | 'csv'; bank?: string; files: string[] }

interface PreviewRow { key: string; selected: boolean; date: string; description: string; amountStr: string }
interface Result { imported: number; skipped: number; account: string }

const STEP_INDEX: Record<Step, number> = { choose: 0, reading: 0, review: 1, csv: 1, importing: 1, done: 2 }
const SOURCE_ICON: Record<Source['kind'], IconName> = { pdf: 'fileText', ofx: 'file', csv: 'table' }

// Extratos brasileiros antigos costumam vir em Windows-1252
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf) } catch { return new TextDecoder('windows-1252').decode(buf) }
}

function toRows(list: ParsedTransaction[]): PreviewRow[] {
  return list.map((tx, i) => ({
    key: `${i}-${tx.transaction_date}-${tx.amount}`, selected: true, date: tx.transaction_date,
    description: tx.description, amountStr: (tx.amount < 0 ? '-' : '') + amountToInput(tx.amount),
  }))
}

function Steps({ current }: { current: number }) {
  const { t } = useTranslation()
  const labels = [t('transactions.import.steps.file'), t('transactions.import.steps.review'), t('transactions.import.steps.done')]
  return (
    <ol className="tx-steps" aria-label={t('transactions.import.steps.label')}>
      {labels.map((label, i) => (
        <li key={label} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="tx-steps__n">{i < current ? <Icon name="check" size={12} strokeWidth={2.25} /> : i + 1}</span>
          <span className="tx-steps__label">{label}</span>
        </li>
      ))}
    </ol>
  )
}

export function ImportModal({ open, onClose, accounts, defaultAccountId, onImported }: {
  open: boolean
  onClose: () => void
  accounts: Account[]
  defaultAccountId?: string
  onImported: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('choose')
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [source, setSource] = useState<Source | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [table, setTable] = useState<CsvTable | null>(null)
  const [mapping, setMapping] = useState<CsvMapping>({ date: '', desc: '', amount: '', credit: '', debit: '', split: false })
  const [result, setResult] = useState<Result | null>(null)
  const [importingCount, setImportingCount] = useState(0)

  const reset = () => {
    setStep('choose'); setError(''); setDragging(false); setSource(null); setRows([]); setTable(null); setResult(null)
  }

  // Reinicia só quando o modal abre (a lista recarrega as contas no fim da importação)
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setStep('choose'); setError(''); setDragging(false); setSource(null); setRows([]); setTable(null); setResult(null)
      setAccountId((defaultAccountId && accounts.some(a => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id) || '')
    }
  }
  // Contas chegaram depois de abrir
  useEffect(() => {
    if (open && !accountId && accounts.length) setAccountId(accounts[0].id)
  }, [open, accountId, accounts])

  const handleFiles = async (list: File[]) => {
    if (!list.length) return
    setError('')
    const ofx = list.filter(f => /\.(ofx|qfx)$/i.test(f.name))
    const pdfs = list.filter(f => /\.pdf$/i.test(f.name))
    const csv = list.find(f => /\.(csv|txt)$/i.test(f.name))
    if (!ofx.length && !pdfs.length && !csv) { setError(t('transactions.import.unsupported')); return }

    setStep('reading')
    if (ofx.length) {
      const file = ofx[0]
      setSource({ kind: 'ofx', files: [file.name] })
      try {
        const res = await transactionsService.parseOfx(file)
        if (!res.transactions.length) throw new Error('empty')
        setRows(toRows(res.transactions)); setStep('review')
      } catch {
        setError(t('transactions.import.readError', { name: file.name })); setStep('choose')
      }
      return
    }
    if (pdfs.length) {
      setSource({ kind: 'pdf', files: pdfs.map(f => f.name) })
      const all: ParsedTransaction[] = []
      const banks = new Set<string>()
      const failed: string[] = []
      for (const file of pdfs) {
        try {
          const res = await transactionsService.parsePdf(file)
          if (res.bank) banks.add(res.bank)
          all.push(...res.transactions)
        } catch { failed.push(file.name) }
      }
      if (!all.length) {
        setError(failed.length ? t('transactions.import.readError', { name: failed.join(', ') }) : t('transactions.import.nothingFound', { name: pdfs.map(f => f.name).join(', ') }))
        setStep('choose'); return
      }
      if (failed.length) setError(t('transactions.import.readError', { name: failed.join(', ') }))
      setSource({ kind: 'pdf', bank: [...banks].join(' · ') || undefined, files: pdfs.map(f => f.name) })
      setRows(toRows(all.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date)))); setStep('review')
      return
    }
    if (csv) {
      setSource({ kind: 'csv', files: [csv.name] })
      try {
        const parsed = parseCsv(await readText(csv))
        if (!parsed.headers.length || !parsed.rows.length) throw new Error('empty')
        setTable(parsed); setMapping(guessMapping(parsed.headers)); setStep('csv')
      } catch {
        setError(t('transactions.import.readError', { name: csv.name })); setStep('choose')
      }
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault(); setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files || []))
  }

  // ── Revisão (PDF e OFX) ──
  const parsedRows = useMemo(() => rows.map(r => ({ ...r, amount: parseAmount(r.amountStr) })), [rows])
  const chosen = parsedRows.filter(r => r.selected)
  const badRows = chosen.filter(r => !Number.isFinite(r.amount) || r.amount === 0 || !r.date || !r.description.trim())
  const reviewTotals = chosen.reduce((acc, r) => {
    if (Number.isFinite(r.amount)) { if (r.amount > 0) acc.income += r.amount; else acc.expense -= r.amount }
    return acc
  }, { income: 0, expense: 0 })
  const update = (key: string, patch: Partial<PreviewRow>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)))
  const allSelected = rows.length > 0 && rows.every(r => r.selected)
  const someSelected = rows.some(r => r.selected)

  // ── CSV ──
  const interpreted = useMemo(() => (table ? interpret(table, mapping) : []), [table, mapping])
  const csvValid = interpreted.filter(r => r.tx).map(r => r.tx!)
  const mapReady = !!mapping.date && !!mapping.desc && (mapping.split ? !!(mapping.credit || mapping.debit) : !!mapping.amount)

  const runImport = async (list: ParsedTransaction[]) => {
    if (!list.length || !accountId) return
    setImportingCount(list.length); setStep('importing'); setError('')
    const prev: Step = source?.kind === 'csv' ? 'csv' : 'review'
    try {
      const res = await transactionsService.bulkCreate(accountId, list)
      setResult({ imported: res.imported, skipped: res.skipped, account: accounts.find(a => a.id === accountId)?.name || '' })
      setStep('done')
      if (res.imported > 0) onImported()
    } catch {
      setError(t('transactions.import.importError')); setStep(prev)
    }
  }

  const importReview = () => runImport(chosen.map(r => ({
    description: r.description.trim(), amount: Math.round(r.amount * 100) / 100, transaction_date: r.date, type: r.amount > 0 ? 'credit' : 'debit',
  })))

  const accountSelect = (
    <Select label={t('transactions.import.account')} value={accountId} onChange={e => setAccountId(e.target.value)}>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </Select>
  )

  const sourceChip = source && (
    <div className="tx-source">
      <span className="tx-source__icon"><Icon name={SOURCE_ICON[source.kind]} size={16} /></span>
      <span style={{ minWidth: 0 }}>
        <span className="tx-source__title">
          {source.kind === 'pdf' ? (source.bank ? t('transactions.import.source.pdf', { bank: source.bank }) : t('transactions.import.source.pdfGeneric')) : t(`transactions.import.source.${source.kind}`)}
        </span>
        <span className="tx-source__file">{source.files.join(', ')}</span>
      </span>
    </div>
  )

  const errorBox = error && <p className="tx-error" role="alert"><Icon name="alertCircle" size={16} />{error}</p>

  let body: ReactNode = null
  let footer: ReactNode = undefined
  const back = <Button variant="secondary" onClick={reset}>{t('transactions.import.back')}</Button>

  if (!accounts.length) {
    body = <EmptyState compact icon="wallet" title={t('transactions.list.noAccountTitle')} description={t('transactions.list.noAccountText')}
      action={<Button icon="plus" onClick={() => navigate('/profile')}>{t('transactions.list.goToProfile')}</Button>} />
  } else if (step === 'choose') {
    body = (
      <div className="tx-import">
        <div className={`tx-drop${dragging ? ' is-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
          <span className="tx-drop__icon"><Icon name="upload" size={22} /></span>
          <span className="tx-drop__title">{mobile ? t('transactions.import.chooseTitle') : dragging ? t('transactions.import.dropActive') : t('transactions.import.dropTitle')}</span>
          <span className="tx-drop__hint">{t('transactions.import.dropHint')}</span>
          <Button variant="secondary" icon="file" onClick={() => inputRef.current?.click()} data-autofocus>{t('transactions.import.choose')}</Button>
          <input ref={inputRef} type="file" accept=".csv,.txt,.ofx,.qfx,.pdf" multiple hidden
            onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; handleFiles(files) }} />
        </div>
        {errorBox}
        <ul className="tx-formats">
          {(['pdf', 'ofx', 'csv'] as const).map(k => (
            <li key={k}><span className="tx-formats__ext">{k.toUpperCase()}</span><span>{t(`transactions.import.formats.${k}`)}</span></li>
          ))}
        </ul>
      </div>
    )
  } else if (step === 'reading' || step === 'importing') {
    const label = step === 'importing' ? t('transactions.import.importing', { count: importingCount })
      : source && source.files.length > 1 ? t('transactions.import.readingMany', { count: source.files.length })
      : t('transactions.import.reading', { name: source?.files[0] ?? '' })
    body = <div className="tx-wait"><Spinner size={28} /><p>{label}</p></div>
  } else if (step === 'review') {
    body = (
      <div className="tx-import">
        <div className="tx-review__top">{accountSelect}{sourceChip}</div>
        {errorBox}
        <div className="tx-review__bar">
          <label className="tx-check">
            <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={e => setRows(prev => prev.map(r => ({ ...r, selected: e.target.checked })))} />
            {t('transactions.import.selectAll')}
          </label>
          <span className="tx-review__count ft-num">
            {t('transactions.import.selected', { selected: chosen.length, total: rows.length })}
            <span className="tx-review__totals"> · {t('transactions.import.selectedTotals', { expense: formatCurrency(reviewTotals.expense), income: formatCurrency(reviewTotals.income) })}</span>
          </span>
        </div>
        <ul className="tx-rlist">
          {parsedRows.map((r, i) => {
            const bad = r.selected && (!Number.isFinite(r.amount) || r.amount === 0)
            return (
              <li key={r.key} className={`tx-rrow${r.selected ? '' : ' is-off'}`}>
                <input type="checkbox" className="tx-rrow__check" checked={r.selected} aria-label={t('transactions.import.rowSelect', { n: i + 1 })} onChange={() => update(r.key, { selected: !r.selected })} />
                <input type="date" className="tx-cell tx-rrow__date" value={r.date} aria-label={t('transactions.import.rowDate', { n: i + 1 })} onChange={e => update(r.key, { date: e.target.value })} />
                <input className="tx-cell tx-rrow__desc" value={r.description} aria-label={t('transactions.import.rowDescription', { n: i + 1 })} onChange={e => update(r.key, { description: e.target.value })} />
                <input className={`tx-cell tx-rrow__amt ft-num${bad ? ' is-bad' : r.amount > 0 ? ' is-in' : ' is-out'}`} inputMode="decimal" value={r.amountStr} aria-invalid={bad || undefined}
                  aria-label={t('transactions.import.rowAmount', { n: i + 1 })} onChange={e => update(r.key, { amountStr: e.target.value })} />
              </li>
            )
          })}
        </ul>
        {badRows.length > 0 && <p className="tx-hint tx-hint--warn"><Icon name="alert" size={14} />{t('transactions.import.fixRows')}</p>}
      </div>
    )
    footer = <>{back}<Button icon="upload" disabled={!chosen.length || badRows.length > 0 || !accountId} onClick={importReview}>{t('transactions.import.importN', { count: chosen.length })}</Button></>
  } else if (step === 'csv' && table) {
    const pick = (field: keyof CsvMapping, label: string, hint?: string) => (
      <Select label={label} hint={hint} value={mapping[field] as string} onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}>
        <option value="">{t('transactions.import.csv.pick')}</option>
        {table.headers.map(h => <option key={h} value={h}>{h}</option>)}
      </Select>
    )
    const shown = interpreted.slice(0, 6)
    body = (
      <div className="tx-import">
        <div className="tx-review__top">{accountSelect}{sourceChip}</div>
        {errorBox}
        <fieldset className="tx-map">
          <legend className="tx-map__legend">{t('transactions.import.csv.columns')}</legend>
          <div className="tx-form__row">
            {pick('date', t('transactions.import.csv.date'))}
            {pick('desc', t('transactions.import.csv.description'))}
          </div>
          <Tabs block label={t('transactions.import.csv.modeLabel')} value={mapping.split ? 'split' : 'single'} onChange={v => setMapping(m => ({ ...m, split: v === 'split' }))}
            items={[{ value: 'single', label: t('transactions.import.csv.single') }, { value: 'split', label: t('transactions.import.csv.split') }]} />
          {mapping.split
            ? <div className="tx-form__row">{pick('credit', t('transactions.import.csv.credit'))}{pick('debit', t('transactions.import.csv.debit'))}</div>
            : pick('amount', t('transactions.import.csv.amount'), t('transactions.import.csv.amountHint'))}
        </fieldset>
        <div className="tx-csvprev">
          <div className="tx-csvprev__head">
            <span>{t('transactions.import.csv.preview')}</span>
            <span className="ft-num">{mapReady ? t('transactions.import.csv.ready', { valid: csvValid.length, total: interpreted.length }) : t('transactions.import.csv.mapRequired')}</span>
          </div>
          {mapReady && (
            <ul className="tx-plist">
              {shown.map((r, i) => r.tx ? (
                <li key={i} className="tx-prow">
                  <span className="tx-prow__date ft-num">{formatDateShort(r.tx.transaction_date)}</span>
                  <span className="tx-prow__desc">{r.tx.description}</span>
                  <Money value={r.tx.amount} signed tone="auto" className="tx-prow__amt" />
                </li>
              ) : (
                <li key={i} className="tx-prow is-skip">
                  <span className="tx-prow__date ft-num">—</span>
                  <span className="tx-prow__desc">{r.raw.filter(Boolean).join(' · ')}</span>
                  <Badge variant="amber">{t('transactions.import.csv.skip', { reason: t(`transactions.import.csv.reason.${r.issue}`) })}</Badge>
                </li>
              ))}
              {interpreted.length > shown.length && <li className="tx-plist__more">{t('transactions.import.csv.more', { count: interpreted.length - shown.length })}</li>}
            </ul>
          )}
        </div>
      </div>
    )
    footer = <>{back}<Button icon="upload" disabled={!mapReady || !csvValid.length || !accountId} onClick={() => runImport(csvValid)}>{t('transactions.import.importN', { count: csvValid.length })}</Button></>
  } else if (step === 'done' && result) {
    const none = result.imported === 0
    body = (
      <div className="tx-done" role="status">
        <span className={`tx-done__icon${none ? ' is-none' : ''}`}><Icon name={none ? 'info' : 'checkCircle'} size={24} /></span>
        <h3 className="tx-done__title">{none ? t('transactions.import.done.noneTitle') : t('transactions.import.done.title', { count: result.imported })}</h3>
        <p className="tx-done__text">
          {none ? t('transactions.import.done.noneText') : t('transactions.import.done.into', { account: result.account })}
          {!none && result.skipped > 0 && <><br />{t('transactions.import.done.skipped', { count: result.skipped })}</>}
        </p>
      </div>
    )
    footer = <><Button variant="secondary" icon="upload" onClick={reset}>{t('transactions.import.done.again')}</Button><Button onClick={onClose}>{t('transactions.import.done.view')}</Button></>
  }

  return (
    <Modal open={open} onClose={onClose} title={t('transactions.import.title')} width="40rem" footer={footer}>
      {accounts.length > 0 && <Steps current={STEP_INDEX[step]} />}
      {body}
    </Modal>
  )
}
