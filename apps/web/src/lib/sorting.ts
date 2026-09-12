import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export function compareByOrderedValues<T extends object>(left: T, right: T, orders: { [K in keyof T]?: Record<string, number> }) {
  for (const [key, order] of Object.entries(orders) as [keyof T, Record<string, number>][]) {
    const difference = (order[String(left[key])] ?? Number.MAX_SAFE_INTEGER) - (order[String(right[key])] ?? Number.MAX_SAFE_INTEGER)
    if (difference) return difference
  }
  return 0
}

function comparable(value: unknown): string | number {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return value
  const numeric = Number(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(numeric)) return numeric
  return String(value).toLocaleLowerCase('pt-BR')
}

export function useSortableData<T>(rows: T[], initialKey: keyof T, initialDirection: SortDirection = 'asc', nulls: 'first' | 'last' = 'last', initialComparator?: (left: T, right: T) => number) {
  const [manuallySorted, setManuallySorted] = useState(false)
  const [sort, setSort] = useState<{ key: keyof T; direction: SortDirection }>({ key: initialKey, direction: initialDirection })
  const sorted = useMemo(() => [...rows].sort((left, right) => {
    if (!manuallySorted && initialComparator) return initialComparator(left, right)
    const leftMissing=left[sort.key]===null||left[sort.key]===undefined||left[sort.key]===''
    const rightMissing=right[sort.key]===null||right[sort.key]===undefined||right[sort.key]===''
    if(leftMissing!==rightMissing)return leftMissing?(nulls==='first'?-1:1):(nulls==='first'?1:-1)
    const a = comparable(left[sort.key]); const b = comparable(right[sort.key])
    const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
    return sort.direction === 'asc' ? result : -result
  }), [rows, sort, nulls, manuallySorted, initialComparator])
  const toggle = (key: keyof T) => { setManuallySorted(true); setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' })) }
  return { sorted, sort, toggle }
}
