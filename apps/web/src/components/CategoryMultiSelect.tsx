import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

export type DocumentCategoryOption = { id: number; nome: string }

type Props = {
  categories: DocumentCategoryOption[]
  selectedIds: number[]
  onChange: (ids: number[]) => void
}

export function CategoryMultiSelect({ categories, selectedIds, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const selected = useMemo(() => categories.filter((category) => selectedIds.includes(category.id)), [categories, selectedIds])
  const filtered = useMemo(() => categories.filter((category) => category.nome.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))), [categories, search])

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const toggle = (id: number) => onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id])

  return <div className="category-multiselect" ref={root}>
    <div className="category-multiselect-control">
      <div className="category-multiselect-chips">{selected.length ? selected.map((category) => <span className="category-chip" key={category.id}><span>{category.nome}</span><button type="button" aria-label={`Remover ${category.nome}`} onClick={(event) => { event.stopPropagation(); toggle(category.id) }}><X /></button></span>) : <span className="category-multiselect-placeholder">Selecione uma ou mais categorias</span>}</div>
      <button className="category-multiselect-toggle" type="button" aria-label="Selecionar categorias" aria-expanded={open} onClick={() => setOpen((value) => !value)}><ChevronDown /></button>
    </div>
    {open && <div className="category-multiselect-menu"><label className="category-multiselect-search"><Search /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar categorias" /></label><div className="category-multiselect-options">{filtered.length ? filtered.map((category) => <label key={category.id}><input type="checkbox" checked={selectedIds.includes(category.id)} onChange={() => toggle(category.id)} /><span>{category.nome}</span>{selectedIds.includes(category.id) && <Check />}</label>) : <small>Nenhuma categoria encontrada.</small>}</div></div>}
  </div>
}
