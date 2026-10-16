import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react'

export function BudgetConsumptionCard({ totalEntrada, totalSaida }: { totalEntrada: number; totalSaida: number }) {
  const consumption = totalEntrada > 0 ? (totalSaida / totalEntrada) * 100 : 0
  const tone = consumption >= 70 ? 'budget-danger' : consumption >= 50 ? 'budget-warning' : 'budget-ok'
  const Icon = consumption >= 70 ? CircleAlert : consumption >= 50 ? AlertTriangle : CheckCircle2

  return <article className={`metric-card ${tone}`}><Icon aria-hidden="true"/><span>Consumo do orçamento</span><strong>{consumption.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</strong><small>{totalEntrada > 0 ? 'Saída em relação à entrada' : 'Sem entrada registrada'}</small></article>
}
