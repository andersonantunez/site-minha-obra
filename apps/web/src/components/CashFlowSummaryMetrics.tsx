import { formatMoney } from '../lib/format'
import { MetricCard } from './Ui'
import { BudgetConsumptionCard } from './BudgetConsumptionCard'

export function CashFlowSummaryMetrics({ totalEntrada, totalSaida, saldo }: { totalEntrada: number; totalSaida: number; saldo: number }) {
  return <section className="metrics-row cash-flow-metrics"><MetricCard label="Entrada" value={formatMoney(totalEntrada)} tone="cash-in"/><MetricCard label="Saída" value={formatMoney(totalSaida)} tone="cash-out"/><MetricCard label="Saldo" value={formatMoney(saldo)}/><BudgetConsumptionCard totalEntrada={totalEntrada} totalSaida={totalSaida}/></section>
}
