import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Card, EmptyState, Input, Page, PageHeader, Select, Skeleton, Tabs, Money } from '../components/ui'
import { Icon, type IconName } from '../components/icons'
import { accountsService, categoriesService, projectionsService, transactionsService } from '../services'
import { useToastStore } from '../store'
import { formatCurrency, formatPercent, formatMonth, currentLocale } from '../utils'
import type { Category, ProjectionData, Transaction } from '../types'
import {
  PERIOD_KEYS, periodRange, previousRange, formatRange, fetchRange, summarize, pctChange,
  granularityOf, buildBuckets, fillBuckets, byCategory, topExpenses, toSlices,
  type PeriodKey, type Range, type Bucket, type CategoryRow,
} from './reports/dados'
import { CategoryDonut, Delta, FlowBars, Legend, ProjectionLines, ReportTable, TopList, type Column } from './reports/graficos'
import './reports/reports.css'

type View = 'chart' | 'table'
type ExportKind = 'pdf' | 'xlsx' | 'csv' | 'print'

interface Loaded { range: Range; prevRange: Range; current: Transaction[]; previous: Transaction[] }

const cap = (s: string) => s.charAt(0).toLocaleUpperCase(currentLocale()) + s.slice(1)

// ── Alternar gráfico/tabela ───────────────────────────────
function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  const { t } = useTranslation()
  return (
    <div className="rp-view">
      <Tabs<View> label={t('reports.view.label')} value={value} onChange={onChange} items={[
        { value: 'chart', icon: 'chart', label: <span className="rp-view-label">{t('reports.view.chart')}</span> },
        { value: 'table', icon: 'table', label: <span className="rp-view-label">{t('reports.view.table')}</span> },
      ]} />
    </div>
  )
}

function CardHead({ title, sub, tools }: { title: ReactNode; sub?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="rp-card-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="rp-card-title">{title}</h2>
        {sub && <p className="rp-card-sub">{sub}</p>}
      </div>
      {tools && <div className="rp-card-tools">{tools}</div>}
    </div>
  )
}

// ── Menu de exportação ────────────────────────────────────
function ExportMenu({ disabled, busy, onPick }: { disabled: boolean; busy: ExportKind | null; onPick: (k: ExportKind) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); wrap.current?.querySelector<HTMLElement>('button')?.focus() }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true }))
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Tab') setOpen(false)
  }

  const items: { key: ExportKind; icon: IconName; label: string; hint: string }[] = [
    { key: 'pdf', icon: 'fileText', label: t('reports.export.pdf'), hint: t('reports.export.pdfHint') },
    { key: 'xlsx', icon: 'table', label: t('reports.export.xlsx'), hint: t('reports.export.xlsxHint') },
    { key: 'csv', icon: 'file', label: t('reports.export.csv'), hint: t('reports.export.csvHint') },
    { key: 'print', icon: 'printer', label: t('reports.export.print'), hint: t('reports.export.printHint') },
  ]

  return (
    <div className="rp-menu-wrap" ref={wrap}>
      <Button variant="secondary" icon="download" iconRight="chevronDown" aria-haspopup="menu" aria-expanded={open} loading={busy !== null}
        disabled={disabled} title={disabled ? t('reports.export.empty') : undefined} onClick={() => setOpen(o => !o)}>
        {t('reports.export.button')}
      </Button>
      {open && (
        <div className="rp-menu" role="menu" aria-label={t('reports.export.button')} ref={menu} onKeyDown={onMenuKey}>
          {items.map((it, i) => (
            <div key={it.key}>
              {i === 3 && <div className="rp-menu__sep" role="separator" />}
              <button type="button" role="menuitem" className="rp-menu__item" onClick={() => { setOpen(false); onPick(it.key) }}>
                <span className="rp-menu__icon"><Icon name={it.icon} size={16} /></span>
                <span className="rp-menu__text">
                  <span className="rp-menu__label">{it.label}</span>
                  <span className="rp-menu__hint">{it.hint}</span>
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LoadingState() {
  return (
    <div className="rp-body" aria-busy="true">
      <div className="rp-kpis">
        {[0, 1, 2, 3].map(i => (
          <Card key={i} className="rp-skel-kpi"><Skeleton width="45%" height={12} /><Skeleton width="70%" height={26} /><Skeleton width="55%" height={12} /></Card>
        ))}
      </div>
      <Card><Skeleton width="30%" height={16} /><Skeleton width="20%" height={12} style={{ marginTop: 8 }} /><Skeleton height={220} style={{ marginTop: 20 }} radius="var(--radius-md)" /></Card>
      <div className="rp-grid">
        <Card><Skeleton width="40%" height={16} /><Skeleton height={176} style={{ marginTop: 20 }} radius="var(--radius-md)" /></Card>
        <Card><Skeleton width="40%" height={16} /><Skeleton height={176} style={{ marginTop: 20 }} radius="var(--radius-md)" /></Card>
      </div>
    </div>
  )
}

// ── Tela ──────────────────────────────────────────────────
export function Reports() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { toast } = useToastStore()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('6m')
  const [custom, setCustom] = useState<Range>(() => periodRange('6m', { start: '', end: '' }))
  const [compare, setCompare] = useState(false)
  const [views, setViews] = useState<Record<'flow' | 'cat' | 'proj', View>>({ flow: 'chart', cat: 'chart', proj: 'chart' })
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [projection, setProjection] = useState<ProjectionData | null>(null)
  const [totalEver, setTotalEver] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [exporting, setExporting] = useState<ExportKind | null>(null)

  const customError = periodKey !== 'custom' ? null
    : !custom.start || !custom.end ? t('reports.period.missing')
    : custom.start > custom.end ? t('reports.period.invalid') : null
  const range = periodRange(periodKey, custom)
  const prevRange = previousRange(periodKey, range)

  // Categorias, projeção e se a conta já tem algum lançamento
  useEffect(() => {
    let alive = true
    Promise.all([categoriesService.list(), projectionsService.get().catch(() => null), transactionsService.list({ page_size: 1 })])
      .then(([c, p, any]) => { if (!alive) return; setCategories(c.categories ?? []); setProjection(p); setTotalEver(any.total ?? 0) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [attempt])

  // Lançamentos do período e do período anterior
  useEffect(() => {
    if (customError) return
    let alive = true
    const r = { start: range.start, end: range.end }, pr = { start: prevRange.start, end: prevRange.end }
    setLoading(true)
    Promise.all([fetchRange(r), fetchRange(pr)])
      .then(([current, previous]) => { if (!alive) return; setData({ range: r, prevRange: pr, current, previous }); setFailed(false) })
      .catch(() => { if (alive) setFailed(true) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [range.start, range.end, prevRange.start, prevRange.end, customError, attempt])

  const lang = i18n.language
  const report = useMemo(() => {
    if (!data) return null
    void lang
    const g = granularityOf(data.range)
    const noCat = t('common.noCategory')
    const summary = summarize(data.current), prevSummary = summarize(data.previous)
    const categoriesRows = byCategory(data.current, data.previous, categories, noCat)
    return {
      g,
      summary, prevSummary,
      hasPrev: prevSummary.count > 0,
      buckets: fillBuckets(buildBuckets(data.range, g), data.current),
      prevBuckets: fillBuckets(buildBuckets(data.prevRange, g), data.previous),
      categories: categoriesRows,
      slices: toSlices(categoriesRows, n => t('reports.categories.others', { count: n })),
      top: topExpenses(data.current, categories, noCat, 5),
      rangeText: formatRange(data.range),
      prevRangeText: formatRange(data.prevRange),
    }
  }, [data, categories, lang, t])

  const periodLabel = t(`reports.period.${periodKey}`)
  const pickPeriod = (k: PeriodKey) => {
    if (k === 'custom' && periodKey !== 'custom') setCustom(range)
    setPeriodKey(k)
  }

  const runExport = async (kind: ExportKind) => {
    if (!report || !data) return
    if (kind === 'print') { window.print(); return }
    setExporting(kind)
    try {
      const mod = await import('./reports/exportar')
      const model = {
        periodLabel, compare: compare && report.hasPrev, range: data.range, prevRange: data.prevRange, rangeText: report.rangeText, prevRangeText: report.prevRangeText,
        summary: report.summary, prevSummary: report.prevSummary, hasPrev: report.hasPrev, granularity: report.g,
        buckets: report.buckets, prevBuckets: report.prevBuckets, categories: report.categories, top: report.top, transactions: data.current,
      }
      if (kind === 'pdf') await mod.exportPdf(model)
      else {
        const accounts = (await accountsService.list()).accounts ?? []
        if (kind === 'xlsx') mod.exportXlsx(model, categories, accounts)
        else mod.exportCsv(model, categories, accounts)
      }
      toast({ message: t(`reports.export.done_${kind}`), variant: 'success' })
    } catch {
      toast({ message: t('reports.export.fail'), variant: 'error' })
    } finally {
      setExporting(null)
    }
  }

  const retry = () => { setFailed(false); setAttempt(a => a + 1) }
  const emptyAccount = totalEver === 0
  const firstLoad = !data && !failed
  const periodEmpty = !!report && report.summary.count === 0

  // ── Filtros ─────────────────────────────────────────────
  const compareSwitch = (
    <button type="button" role="switch" aria-checked={compare} className="rp-switch" onClick={() => setCompare(c => !c)}>
      <span className="rp-switch__track" aria-hidden><span className="rp-switch__thumb" /></span>
      {t('reports.compare.toggle')}
    </button>
  )
  const filters = (
    <>
      <div className="rp-filters">
        <div className="rp-filters__desktop">
          <Tabs<PeriodKey> label={t('reports.period.label')} value={periodKey} onChange={pickPeriod}
            items={PERIOD_KEYS.map(k => ({ value: k, label: t(`reports.period.${k}`), icon: k === 'custom' ? 'calendar' as const : undefined }))} />
        </div>
        <div className="rp-filters__mobile">
          <Select label={t('reports.period.label')} value={periodKey} onChange={e => pickPeriod(e.target.value as PeriodKey)}>
            {PERIOD_KEYS.map(k => <option key={k} value={k}>{t(`reports.period.${k}`)}</option>)}
          </Select>
        </div>
        {compareSwitch}
      </div>
      {periodKey === 'custom' && (
        <div className="rp-custom">
          <Input type="date" label={t('reports.period.from')} value={custom.start} max={custom.end || undefined} onChange={e => setCustom(c => ({ ...c, start: e.target.value }))} />
          <Input type="date" label={t('reports.period.to')} value={custom.end} min={custom.start || undefined} error={customError ?? undefined} onChange={e => setCustom(c => ({ ...c, end: e.target.value }))} />
        </div>
      )}
      {compare && report && !customError && (
        <p className="rp-compare-note"><Icon name={report.hasPrev ? 'transfer' : 'info'} size={14} />
          {t(report.hasPrev ? 'reports.compare.with' : 'reports.compare.noData', { range: report.prevRangeText })}</p>
      )}
    </>
  )

  // ── Conteúdo ────────────────────────────────────────────
  let body: ReactNode
  if (failed) {
    body = (
      <Card>
        <EmptyState icon="alertCircle" title={t('reports.error.title')} description={t('reports.error.text')}
          action={<Button variant="secondary" icon="refresh" onClick={retry}>{t('reports.error.retry')}</Button>} />
      </Card>
    )
  } else if (firstLoad || !report) {
    body = <LoadingState />
  } else if (periodEmpty) {
    body = (
      <div className="rp-body" aria-busy={loading || undefined}>
        <Card>
          <EmptyState icon="calendar" title={t('reports.noPeriod.title')} description={t('reports.noPeriod.text', { range: report.rangeText })}
            action={periodKey !== '12m' ? <Button variant="secondary" onClick={() => pickPeriod('12m')}>{t('reports.noPeriod.action')}</Button> : undefined} />
        </Card>
        <ProjectionCard projection={projection} view={views.proj} onView={v => setViews(s => ({ ...s, proj: v }))} />
      </div>
    )
  } else {
    const { summary: s, prevSummary: p, hasPrev } = report
    const showPrev = compare && hasPrev
    const foot = (value: number | null, goodWhenUp: boolean, kind: 'percent' | 'pp' = 'percent') =>
      !hasPrev ? <span>{t('reports.kpi.noPrev')}</span>
        : value === null ? <span>{t('reports.kpi.noBase')}</span>
        : <><Delta value={value} goodWhenUp={goodWhenUp} kind={kind} /><span>{t('reports.kpi.vsPrevShort')}</span></>
    const unit = report.g === 'week' ? t('reports.table.week') : t('reports.table.month')
    const flowCols: Column<Bucket & { prevIncome: number; prevExpense: number }>[] = [
      { key: 'label', header: unit, title: true, render: b => b.longLabel },
      { key: 'inc', header: t('reports.table.income'), align: 'right', render: b => formatCurrency(b.income) },
      { key: 'exp', header: t('reports.table.expense'), align: 'right', render: b => formatCurrency(b.expense) },
      { key: 'bal', header: t('reports.table.balance'), align: 'right', primary: true, render: b => <span className={b.income - b.expense < 0 ? 'rp-neg' : undefined}>{formatCurrency(b.income - b.expense)}</span> },
      { key: 'sav', header: t('reports.table.savings'), align: 'right', render: b => (b.income > 0 ? formatPercent(((b.income - b.expense) / b.income) * 100, 1, false) : <span className="rp-muted">—</span>) },
      ...(showPrev ? [
        { key: 'pinc', header: t('reports.table.prevIncome'), align: 'right' as const, render: (b: Bucket & { prevIncome: number }) => formatCurrency(b.prevIncome) },
        { key: 'pexp', header: t('reports.table.prevExpense'), align: 'right' as const, render: (b: Bucket & { prevExpense: number }) => formatCurrency(b.prevExpense) },
      ] : []),
    ]
    const flowRows = report.buckets.map((b, i) => ({ ...b, prevIncome: report.prevBuckets[i]?.income ?? 0, prevExpense: report.prevBuckets[i]?.expense ?? 0 }))
    const flowTotals = [t('reports.table.total'), formatCurrency(s.income), formatCurrency(s.expense),
      <span className={s.balance < 0 ? 'rp-neg' : undefined}>{formatCurrency(s.balance)}</span>,
      s.savingsRate === null ? '—' : formatPercent(s.savingsRate, 1, false),
      ...(showPrev ? [formatCurrency(p.income), formatCurrency(p.expense)] : [])]
    const flowTable = (
      <ReportTable caption={t(report.g === 'week' ? 'reports.flow.titleWeek' : 'reports.flow.titleMonth')} columns={flowCols} rows={flowRows} rowKey={b => b.key} totals={flowTotals} listBelow={showPrev ? 720 : 540} />
    )

    const colorOf = (i: number) => report.categories.length <= 6 || i < 5 ? report.categories[i]?.color : 'var(--cat-other)'
    const catCols: Column<CategoryRow & { i: number }>[] = [
      { key: 'name', header: t('reports.table.category'), title: true, render: c => <span className="rp-cell-cat"><i style={{ background: colorOf(c.i) }} aria-hidden />{c.name}</span> },
      { key: 'count', header: t('reports.table.count'), align: 'right', hideMobile: true, render: c => c.count },
      { key: 'value', header: t('reports.table.value'), align: 'right', primary: true, render: c => formatCurrency(c.value) },
      { key: 'share', header: t('reports.table.share'), align: 'right', render: c => formatPercent(c.share, 1, false) },
      ...(showPrev ? [
        { key: 'prev', header: t('reports.table.previous'), align: 'right' as const, hideMobile: true, render: (c: CategoryRow) => (c.prev ? formatCurrency(c.prev) : <span className="rp-muted">—</span>) },
        { key: 'chg', header: t('reports.table.change'), align: 'right' as const, render: (c: CategoryRow) => (c.prev ? <Delta value={c.change} goodWhenUp={false} compact /> : <span className="rp-muted">{t('reports.categories.new')}</span>) },
      ] : []),
    ]
    const catTotals = [t('reports.table.total'), report.categories.reduce((a, c) => a + c.count, 0), formatCurrency(s.expense), formatPercent(100, 0, false),
      ...(showPrev ? [formatCurrency(p.expense), <Delta value={pctChange(s.expense, p.expense)} goodWhenUp={false} compact />] : [])]

    const donutLabel = t('reports.aria.categories', { list: report.slices.map(sl => `${sl.name} ${formatPercent(sl.share, 0, false)}`).join(', ') })
    const flowLabel = t('reports.aria.flow', { range: report.rangeText, income: formatCurrency(s.income), expense: formatCurrency(s.expense) })

    body = (
      <div className="rp-body" aria-busy={loading || undefined}>
        <section className="rp-kpis rp-kpis--strip ft-card ft-card--hero" aria-label={t('reports.kpi.label')}>
          <div className="rp-kpis__main">
            <span className="rp-kpi__label">{s.balance >= 0 ? t('reports.kpi.left') : t('reports.kpi.balance')}</span>
            <Money value={s.balance} size="hero" className="rp-kpis__value" style={s.balance < 0 ? { color: 'var(--red)' } : undefined} />
            <span className="rp-kpis__sub">
              {s.savingsRate !== null && s.savingsRate >= 0 && <span>{t('reports.kpi.ofIncome', { pct: formatPercent(s.savingsRate, 0, false) })}</span>}
              {foot(pctChange(s.balance, p.balance), true)}
            </span>
          </div>
          <div className="rp-kpis__side">
            <div className="rp-kpi">
              <div className="rp-kpi__label"><span className="rp-kpi__dot" style={{ background: 'var(--chart-income)' }} aria-hidden />{t('reports.kpi.income')}</div>
              <Money value={s.income} size="kpi" />
              <div className="rp-kpi__foot">{foot(pctChange(s.income, p.income), true)}</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi__label"><span className="rp-kpi__dot" style={{ background: 'var(--chart-spend)' }} aria-hidden />{t('reports.kpi.expense')}</div>
              <Money value={s.expense} size="kpi" />
              <div className="rp-kpi__foot">{foot(pctChange(s.expense, p.expense), false)}</div>
            </div>
            <div className="rp-kpi">
              <div className="rp-kpi__label">{t('reports.kpi.savings')}</div>
              <span className="ft-money ft-num">{s.savingsRate === null ? '—' : formatPercent(s.savingsRate, 1, false)}</span>
              <div className="rp-kpi__foot">{s.savingsRate === null ? <span>{t('reports.kpi.noIncome')}</span> : foot(p.savingsRate === null ? null : s.savingsRate - p.savingsRate, true, 'pp')}</div>
            </div>
          </div>
        </section>
        <p className="rp-note"><Icon name="info" size={14} />{t('reports.kpi.transfersNote')}</p>

        <Card>
          <CardHead title={t(report.g === 'week' ? 'reports.flow.titleWeek' : 'reports.flow.titleMonth')}
            sub={showPrev ? t('reports.flow.compareSub', { range: report.prevRangeText }) : t('reports.flow.sub', { count: s.count })}
            tools={<ViewToggle value={views.flow} onChange={v => setViews(o => ({ ...o, flow: v }))} />} />
          {views.flow === 'chart' ? (
            <>
              <Legend items={[
                { label: t('reports.legend.income'), color: 'var(--chart-income)' },
                { label: t('reports.legend.expense'), color: 'var(--chart-spend)' },
                ...(showPrev ? [{ label: t('reports.legend.previousFaded'), color: 'var(--chart-neutral)', faded: true }] : []),
              ]} />
              <FlowBars buckets={report.buckets} prev={showPrev ? report.prevBuckets : undefined} ariaLabel={flowLabel} />
              <div className="rp-print-only rp-print-table" style={{ marginTop: 12 }}>{flowTable}</div>
            </>
          ) : flowTable}
        </Card>

        <div className="rp-grid">
          <Card className="rp-card-fill">
            <CardHead title={t('reports.categories.title')} sub={t('reports.categories.summary', { count: report.categories.length, total: formatCurrency(s.expense) })}
              tools={report.categories.length ? <ViewToggle value={views.cat} onChange={v => setViews(o => ({ ...o, cat: v }))} /> : undefined} />
            {!report.categories.length ? (
              <EmptyState compact icon="pie" title={t('reports.categories.emptyTitle')} description={t('reports.categories.emptyText')} />
            ) : views.cat === 'chart' ? (
              <CategoryDonut slices={report.slices} total={s.expense} compare={showPrev} ariaLabel={donutLabel} />
            ) : (
              <ReportTable caption={t('reports.categories.title')} columns={catCols} rows={report.categories.map((c, i) => ({ ...c, i }))} rowKey={c => c.id} totals={catTotals} listBelow={showPrev ? 600 : 440} />
            )}
          </Card>
          <Card>
            <CardHead title={t('reports.top.title')} sub={t('reports.top.subtitle')} />
            {report.top.length
              ? <TopList rows={report.top} />
              : <EmptyState compact icon="inbox" title={t('reports.categories.emptyTitle')} description={t('reports.categories.emptyText')} />}
          </Card>
        </div>

        <ProjectionCard projection={projection} view={views.proj} onView={v => setViews(o => ({ ...o, proj: v }))} />
      </div>
    )
  }

  return (
    <Page className="rp-root">
      <PageHeader title={t('reports.title')}
        subtitle={emptyAccount ? undefined : customError ? periodLabel : formatRange(range)}
        actions={!emptyAccount && !failed ? <ExportMenu disabled={!report || periodEmpty || !!customError} busy={exporting} onPick={runExport} /> : undefined} />

      {report && (
        <div className="rp-print-only rp-print-head">
          <div>
            <img src="/logo-claro.png" alt="FlowTrack" />
            <div className="rp-print-head__title">{t('reports.print.title')} · {periodLabel}</div>
            <div className="rp-print-head__range">{report.rangeText}{compare && report.hasPrev ? ` · ${t('reports.compare.with', { range: report.prevRangeText })}` : ''}</div>
          </div>
          <div className="rp-print-head__meta">
            {t('reports.print.generated', { date: new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()) })}
          </div>
        </div>
      )}

      {emptyAccount ? (
        <Card>
          <EmptyState icon="pie" title={t('reports.empty.title')} description={t('reports.empty.text')}
            action={<Button icon="plus" onClick={() => navigate('/transactions')}>{t('reports.empty.action')}</Button>} />
        </Card>
      ) : (
        <>
          {filters}
          {customError ? (
            <Card><EmptyState compact icon="calendar" title={t('reports.period.chooseTitle')} description={t('reports.period.chooseText')} /></Card>
          ) : body}
        </>
      )}
    </Page>
  )
}

// ── Projeção ──────────────────────────────────────────────
function ProjectionCard({ projection, view, onView }: { projection: ProjectionData | null; view: View; onView: (v: View) => void }) {
  const { t } = useTranslation()
  if (!projection || projection.months_available === 0) return null
  const n = projection.months_available
  const level = n >= 6 ? 'high' : n >= 3 ? 'medium' : 'low'
  const tone = level === 'high' ? 'green' : level === 'medium' ? 'amber' : 'red'
  const projected = projection.projections.reduce((s, p) => s + p.income - p.expense, 0)
  const avg = projection.projections.length ? projection.projections.reduce((s, p) => s + p.expense, 0) / projection.projections.length : 0
  const avgInc = projection.projections.length ? projection.projections.reduce((s, p) => s + p.income, 0) / projection.projections.length : 0
  const rows = [...projection.history, ...projection.projections]
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'm', header: t('reports.table.month'), title: true, render: r => cap(formatMonth(r.month, 'long')) },
    { key: 'k', header: t('reports.table.kind'), render: r => (r.is_projection ? t('reports.projection.projected') : t('reports.projection.history')) },
    { key: 'i', header: t('reports.table.income'), align: 'right', render: r => formatCurrency(r.income) },
    { key: 'e', header: t('reports.table.expense'), align: 'right', render: r => formatCurrency(r.expense) },
    { key: 'b', header: t('reports.table.balance'), align: 'right', primary: true, render: r => <span className={r.income - r.expense < 0 ? 'rp-neg' : undefined}>{formatCurrency(r.income - r.expense)}</span> },
  ]
  return (
    <Card>
      <CardHead title={t('reports.projection.title')} sub={t('reports.projection.subtitle', { count: n })}
        tools={<><Badge variant={tone} dot>{t(`reports.projection.confidence.${level}`)}</Badge><ViewToggle value={view} onChange={onView} /></>} />
      {view === 'chart' ? (
        <>
          <Legend items={[
            { label: t('reports.legend.income'), color: 'var(--chart-income)', line: 'solid' },
            { label: t('reports.legend.expense'), color: 'var(--chart-spend)', line: 'solid' },
            { label: t('reports.projection.dashed'), color: 'var(--text-muted)', line: 'dashed' },
            { label: t('reports.projection.range'), color: 'var(--text-muted)', line: 'band' },
          ]} />
          <ProjectionLines data={projection} ariaLabel={t('reports.aria.projection', { income: formatCurrency(avgInc), expense: formatCurrency(avg) })} />
        </>
      ) : (
        <ReportTable caption={t('reports.projection.title')} columns={cols} rows={rows} rowKey={r => r.month} />
      )}
      <div className="rp-proj-explain">
        <Icon name="info" size={16} />
        <span>{t(`reports.projection.explain.${level}`, { count: n })}</span>
      </div>
      <div className="rp-proj-foot">
        <div className="rp-proj-stat"><span className="rp-proj-stat__label">{t('reports.projection.avgIncome')}</span><span className="rp-proj-stat__value">{formatCurrency(projection.avg_income)}</span></div>
        <div className="rp-proj-stat"><span className="rp-proj-stat__label">{t('reports.projection.avgExpense')}</span><span className="rp-proj-stat__value">{formatCurrency(projection.avg_expense)}</span></div>
        <div className="rp-proj-stat"><span className="rp-proj-stat__label">{t('reports.projection.projectedBalance')}</span><span className="rp-proj-stat__value" style={{ color: projected < 0 ? 'var(--red)' : undefined }}>{formatCurrency(projected)}</span></div>
      </div>
    </Card>
  )
}
