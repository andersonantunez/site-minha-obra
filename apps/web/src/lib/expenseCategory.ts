export const EXPENSE_CATEGORIES = [
  { value: 'MAO_DE_OBRA', label: 'Mão de obra' },
  { value: 'MATERIAL_CONSTRUCAO', label: 'Material de construção' },
  { value: 'DOCUMENTACAO', label: 'Documentação' },
  { value: 'FRETE', label: 'Frete' },
  { value: 'OUTROS', label: 'Outros' },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['value']

export const expenseCategoryLabel = (category: ExpenseCategory | null | undefined) =>
  EXPENSE_CATEGORIES.find((option) => option.value === category)?.label || 'Sem categoria'

export const expenseCategoryClass = (category: ExpenseCategory | null | undefined) =>
  category === 'MAO_DE_OBRA' ? 'labor'
    : category === 'MATERIAL_CONSTRUCAO' ? 'materials'
      : category === 'DOCUMENTACAO' ? 'documentation'
        : category === 'FRETE' ? 'freight'
          : category === 'OUTROS' ? 'other'
            : 'unclassified'
