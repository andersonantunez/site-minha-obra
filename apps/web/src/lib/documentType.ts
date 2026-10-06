const normalized = (name: string | null | undefined) => (name || '').trim().toLocaleLowerCase('pt-BR')

export function documentTypeBadgeClass(name: string | null | undefined) {
  switch (normalized(name)) {
    case 'comprovante': return 'document-type-receipt'
    case 'nota fiscal': return 'document-type-invoice'
    case 'orçamento': return 'document-type-budget'
    case 'documento técnico': return 'document-type-technical'
    case 'contrato': return 'document-type-contract'
    case 'outros': return 'document-type-other'
    default: return 'document-type-other'
  }
}
