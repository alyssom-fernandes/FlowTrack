import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, CardHeader, ConfirmDialog, IconButton, Input, Modal } from '../../components/ui'
import { Icon } from '../../components/icons'
import { useToastStore } from '../../store'
import { categoriesService } from '../../services'
import { categoryLabel, currentLocale } from '../../utils'
import { categoryColor } from '../../lib/categoryColor'
import { CategoryIcon } from '../dashboard/CategoryIcon'
import { GlyphPicker } from '../../components/glyphs'
import type { Category } from '../../types'
import { DEFAULT_COLOR, PALETTE, focusInvalid, uniqueColors } from './helpers'
import { ColorPicker, ListSkeleton, LoadError } from './parts'

export function CategoriesTab() {
  const { t } = useTranslation()
  const { toast } = useToastStore()
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [modal, setModal] = useState<{ category: Category | null } | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setFailed(false)
    try {
      const res = await categoriesService.list()
      setCategories(res.categories || [])
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const locale = currentLocale()
  const byLabel = (a: Category, b: Category) => categoryLabel(a).localeCompare(categoryLabel(b), locale)
  const custom = (categories || []).filter(c => !c.is_default).sort(byLabel)
  const defaults = (categories || []).filter(c => c.is_default).sort(byLabel)
  const loading = categories === null && !failed

  const openNew = () => setModal({ category: null })
  const openEdit = (c: Category) => setModal({ category: c })

  const saved = (wasEdit: boolean) => {
    setModal(null)
    toast({ message: wasEdit ? t('profile.categories.updated') : t('profile.categories.created') })
    load()
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await categoriesService.remove(toDelete.id)
      setCategories(prev => prev?.filter(c => c.id !== toDelete.id) ?? prev)
      toast({ message: t('profile.categories.deleted') })
      setToDelete(null)
    } catch {
      toast({ message: t('profile.categories.deleteError'), variant: 'error' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader title={t('profile.categories.customTitle')}
          subtitle={!loading && !failed && custom.length === 0 ? t('profile.categories.emptyText') : t('profile.categories.customSubtitle')}
          action={custom.length > 0 ? <Button size="sm" icon="plus" onClick={openNew}>{t('profile.categories.new')}</Button> : undefined} />
        {failed ? (
          <LoadError message={t('profile.categories.loadError')} onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={2} />
        ) : custom.length === 0 ? (
          // Vazio numa linha: não vale empurrar as categorias padrão para baixo para dizer "nenhuma"
          <div className="prf-empty-line">
            <span className="prf-empty-line__text">{t('profile.categories.emptyLine')}</span>
            <Button size="sm" icon="plus" onClick={openNew}>{t('profile.categories.new')}</Button>
          </div>
        ) : (
          <ul className="prf-list">
            {custom.map(c => (
              <li key={c.id} className="prf-item">
                <button type="button" className="prf-item__main prf-item__main--compact" onClick={() => openEdit(c)}>
                  <span className="ft-catpill prf-item__pill" style={{ '--c': categoryColor(c) } as React.CSSProperties}>
                    <CategoryIcon name={c.icon} size={14} /><span className="prf-truncate">{c.name}</span>
                  </span>
                  <span className="prf-item__text" />
                  <Icon name="chevronRight" size={16} className="prf-item__chevron" />
                </button>
                <span className="prf-item__actions">
                  <IconButton icon="edit" label={t('profile.categories.edit', { name: c.name })} onClick={() => openEdit(c)} />
                  <IconButton icon="trash" label={t('profile.categories.delete', { name: c.name })} onClick={() => setToDelete(c)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!failed && (
        <Card>
          <CardHeader icon="lock" title={t('profile.categories.defaultTitle')} subtitle={t('profile.categories.defaultSubtitle')} />
          {loading ? (
            <ListSkeleton rows={2} mark={false} />
          ) : (
            <ul className="prf-pills">
              {defaults.map(c => (
                <li key={c.id} className="ft-catpill" style={{ '--c': categoryColor(c) } as React.CSSProperties}>
                  <CategoryIcon name={c.icon} size={14} />{categoryLabel(c)}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {modal && (
        <CategoryModal category={modal.category} existing={categories || []}
          onClose={() => setModal(null)} onSaved={saved} onDelete={c => { setModal(null); setToDelete(c) }} />
      )}

      <ConfirmDialog open={!!toDelete} onClose={() => !deleting && setToDelete(null)} onConfirm={confirmDelete} loading={deleting}
        title={t('profile.categories.deleteTitle')} message={t('profile.categories.deleteText', { name: toDelete?.name ?? '' })}
        confirmLabel={t('profile.categories.deleteAction')} />
    </>
  )
}

// ── Nova categoria / editar categoria ──
function CategoryModal({ category, existing, onClose, onSaved, onDelete }: {
  category: Category | null; existing: Category[]; onClose: () => void; onSaved: (wasEdit: boolean) => void; onDelete: (c: Category) => void
}) {
  const { t } = useTranslation()
  const isEdit = !!category
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? DEFAULT_COLOR)
  const [icon, setIcon] = useState(category?.icon ?? 'tag')
  const [errors, setErrors] = useState<{ name?: string; form?: string }>({})
  const [saving, setSaving] = useState(false)

  const colors = uniqueColors([...PALETTE, category?.color])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const clean = name.trim()
    const key = clean.toLocaleLowerCase()
    const taken = existing.some(c => c.id !== category?.id && (c.name.toLocaleLowerCase() === key || categoryLabel(c).toLocaleLowerCase() === key))
    const next = !clean ? t('profile.categories.nameRequired') : taken ? t('profile.categories.nameTaken') : undefined
    setErrors({ name: next })
    if (next) { focusInvalid(e.currentTarget); return }
    setSaving(true)
    try {
      if (category) await categoriesService.update(category.id, { name: clean, color, icon })
      else await categoriesService.create({ name: clean, color, icon })
      onSaved(isEdit)
    } catch {
      setErrors({ form: t('profile.categories.saveError') })
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isEdit ? t('profile.categories.editTitle') : t('profile.categories.newTitle')} width="30rem"
      footer={<>
        {category && <Button variant="danger" icon="trash" onClick={() => onDelete(category)} disabled={saving} className="prf-footer-start">{t('profile.categories.deleteAction')}</Button>}
        <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
        <Button type="submit" form="prf-category-form" loading={saving}>{isEdit ? t('profile.categories.save') : t('profile.categories.create')}</Button>
      </>}>
      <form id="prf-category-form" onSubmit={submit} className="prf-form" noValidate>
        {/* Nome com a prévia ao vivo da pílula real (cor e glifo), como ela vai aparecer nas transações */}
        <div className="prf-catname">
          <Input label={t('profile.categories.name')} value={name} onChange={e => setName(e.target.value)} placeholder={t('profile.categories.namePlaceholder')}
            error={errors.name} maxLength={40} autoComplete="off" />
          <div className="prf-catname__preview">
            <span className="ft-field__label" id="prf-catname-preview">{t('profile.categories.preview')}</span>
            <span className={`ft-catpill prf-catname__pill${name.trim() ? '' : ' prf-catname__pill--empty'}`} style={{ '--c': color } as React.CSSProperties}
              role="img" aria-label={`${t('profile.categories.preview')}: ${name.trim() || t('profile.categories.namePlaceholder')}`}>
              <CategoryIcon name={icon} size={15} /><span className="prf-truncate">{name.trim() || t('profile.categories.previewEmpty')}</span>
            </span>
          </div>
        </div>
        <div className="ft-field">
          <span className="ft-field__label">{t('profile.categories.color')}</span>
          <ColorPicker label={t('profile.categories.color')} value={color} onChange={setColor} colors={colors} />
        </div>
        <div className="ft-field">
          <span className="ft-field__label">{t('profile.categories.icon')}</span>
          <GlyphPicker label={t('profile.categories.icon')} value={icon} onChange={setIcon} color={color} />
        </div>
        {errors.form && <p className="prf-form-error" role="alert">{errors.form}</p>}
      </form>
    </Modal>
  )
}
