import { useQuery } from '@tanstack/react-query'
import { CalendarClock, CircleHelp, FileCheck2, MapPin, Ruler } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorNotice, PageHeader } from '../components/Ui'
import { api } from '../lib/api'
import { dashboardRankColors } from '../lib/chartPalette'
import { formatDate, formatMoney, formatMonth } from '../lib/format'
import { ScheduleGantt } from '../components/ScheduleGantt'

type Project = {
  nome: string
  data_inicio: string | null
  previsao_termino: string | null
  area_construida: string | null
  area_com_laje: string | null
  area_sem_laje: string | null
  cidade: string | null
  estado: string | null
  bairro: string | null
  logradouro: string | null
  numero: string | null
  latitude: string | null
  longitude: string | null
  processo_aprovacao: string | null
  pasta_digital: string | null
  planta_numero: string | null
  alvara: string | null
  art: string | null
  cno_obra: string | null
  matricula_terreno: string | null
  orcamento_mao_obra: string | null
  orcamento_materiais: string | null
  imagem_apresentacao_id: number | null
  imagem_apresentacao_url: string | null
}

type Dashboard = {
  projeto: Project
  indicadores: {
    orcamento_atual: string
    orcamento_com_provisao: string
    total_provisionado: string
    total_pagamentos: string
    orcamento_mao_obra: string
    orcamento_materiais: string
    orcamento_inicial_total: string
    gasto_mao_obra: string
    gasto_materiais_e_demais_categorias: string
    subetapas_concluidas: number
    subetapas_em_andamento: number
    percentual_andamento: string
  }
  evolucaoFinanceira: { mes: string; previsto: string; realizado: string }[]
  distribuicaoEtapas: { etapa: string; total: string }[]
  distribuicaoCategorias: { categoria: 'MAO_DE_OBRA' | 'MATERIAL_CONSTRUCAO' | 'DOCUMENTACAO' | 'FRETE' | 'OUTROS'; total: string }[]
  fornecedores: { fornecedor: string; total: string }[]
}

type DonutItem = { name: string; value: number; color: string }

function rankChartRows<T>(rows: T[], value: (row: T) => number, keepOrder = true): (T & { color: string })[] {
  const ranked = rows.map((row, index) => ({ row, index })).sort((left, right) => value(right.row) - value(left.row) || left.index - right.index)
  const colors = new Map(ranked.map(({ index }, rank) => [index, dashboardRankColors[Math.min(rank, dashboardRankColors.length - 1)]!]))
  const colored = rows.map((row, index) => ({ ...row, color: colors.get(index)! }))
  return keepOrder ? colored : ranked.map(({ index }) => colored[index]!)
}

function DashboardHelp({ id, text, inverse = false }: { id: string; text: string; inverse?: boolean }) {
  return <span className={`dashboard-help${inverse ? ' inverse' : ''}`}>
    <button type="button" aria-label="Como este indicador é calculado" aria-describedby={id}><CircleHelp /></button>
    <span id={id} role="tooltip">{text}</span>
  </span>
}

function DashboardPanelHeader({ eyebrow, title, help, helpId }: { eyebrow: string; title: string; help: string; helpId: string }) {
  return <header className="overview-panel-header">
    <div><span>{eyebrow}</span><h2>{title}</h2></div>
    <DashboardHelp id={helpId} text={help} />
  </header>
}

function DonutLegend({ items, totalValue }: { items: DonutItem[]; totalValue?: number }) {
  const total = totalValue ?? items.reduce((sum, item) => sum + item.value, 0)
  return <div className="overview-chart-legend">
    {items.map((item) => <div key={item.name}>
      <i style={{ backgroundColor: item.color }} />
      <span>{item.name}</span>
      <strong>{formatMoney(item.value)}</strong>
      <small>{total ? `${((item.value / total) * 100).toFixed(1).replace('.', ',')}%` : '0%'}</small>
    </div>)}
  </div>
}

function FinancialScenario({ title, eyebrow, budgetLabel, budget, totalPaid, help, helpId, provisioned = false }: {
  title: string
  eyebrow: string
  budgetLabel: string
  budget: number
  totalPaid: number
  help: string
  helpId: string
  provisioned?: boolean
}) {
  const balance = budget - totalPaid
  const donutItems = rankChartRows([
    { name: 'Pagamentos', value: Math.max(totalPaid, 0) },
    { name: 'Saldo disponível', value: Math.max(balance, 0) },
  ], item => item.value, false)
  const hasChart = donutItems.some((item) => item.value > 0)

  return <article className="overview-financial-scenario">
    <DashboardPanelHeader eyebrow={eyebrow} title={title} help={help} helpId={helpId} />
    <div className="overview-financial-content">
      <div className="overview-financial-values">
        <div><span>{budgetLabel}</span><strong>{formatMoney(budget)}</strong><small>{provisioned ? 'Entradas atuais e futuras' : 'Entradas disponíveis até hoje'}</small></div>
        <div><span>{provisioned ? 'Saldo atual + provisionado' : 'Saldo atual'}</span><strong className={balance < 0 ? 'negative' : ''}>{formatMoney(balance)}</strong><small>{balance < 0 ? 'Pagamentos excedem o orçamento deste cenário' : 'Disponível após os pagamentos'}</small></div>
      </div>
      <div className="overview-donut-block">
        {hasChart ? <ResponsiveContainer width="100%" height={210}>
          <PieChart>
            <Pie data={donutItems} dataKey="value" nameKey="name" innerRadius={58} outerRadius={82} paddingAngle={2} stroke="none">
              {donutItems.map((item) => <Cell key={item.name} fill={item.color} />)}
            </Pie>
            <RechartsTooltip formatter={(value) => formatMoney(Number(value))} />
          </PieChart>
        </ResponsiveContainer> : <EmptyState title="Sem movimentação" description="Ainda não há entradas ou pagamentos para este cenário." />}
        <DonutLegend items={donutItems} />
      </div>
    </div>
  </article>
}

function InitialBudgetCard({ title, description, budget, spent, tone }: { title: string; description: string; budget: number; spent: number; tone: 'total' | 'labor' | 'materials' }) {
  const difference = budget - spent
  const percentage = budget > 0 ? (spent / budget) * 100 : 0
  const trackPercentage = Math.min(100, Math.max(0, percentage))
  return <article className={`initial-budget-card tone-${tone}${percentage > 100 ? ' over-budget' : ''}`}>
    <header><span>{title}</span><strong>{budget > 0 ? `${percentage.toFixed(1).replace('.', ',')}%` : '—'}</strong></header>
    <p>{description}</p>
    <div className="initial-budget-track"><i style={{ width: `${trackPercentage}%` }} /></div>
    <dl>
      <div><dt>Valor orçado</dt><dd>{formatMoney(budget)}</dd></div>
      <div className="initial-budget-realized"><dt>Valor realizado</dt><dd>{formatMoney(spent)}</dd></div>
      <div><dt>Diferença</dt><dd className={difference < 0 ? 'negative' : ''}>{formatMoney(difference)}</dd></div>
    </dl>
  </article>
}

function buildMonthlyPayments(rows: Dashboard['evolucaoFinanceira']) {
  const totals = new Map<string, number>()
  rows.forEach((row) => {
    const key = row.mes?.slice(0, 7)
    const value = Number(row.realizado)
    if (key && value > 0) totals.set(key, (totals.get(key) || 0) + value)
  })
  const keys = [...totals.keys()].sort()
  if (!keys.length) return []
  const [startYear, startMonth] = keys[0]!.split('-').map(Number) as [number, number]
  const [endYear, endMonth] = keys[keys.length - 1]!.split('-').map(Number) as [number, number]
  const cursor = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1))
  const result: { mes: string; label: string; total: number }[] = []
  while (cursor <= end) {
    const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
    result.push({ mes: key, label: formatMonth(`${key}-01`), total: totals.get(key) || 0 })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }
  return result
}

export function ProjectDashboardPage() {
  const { projetoId } = useParams()
  const [includeFuture, setIncludeFuture] = useState(false)
  const { data, error, isLoading } = useQuery({ queryKey: ['dashboard', projetoId], queryFn: () => api<Dashboard>(`/projetos/${projetoId}/dashboard`) })
  if (isLoading) return <div className="route-loading"><span /><p>Consolidando a obra…</p></div>
  if (error) return <ErrorNotice message={error.message} />
  if (!data) return null

  const { projeto, indicadores } = data
  const currentBudget = Number(indicadores.orcamento_atual)
  const provisionedBudget = Number(indicadores.orcamento_com_provisao)
  const totalPayments = Number(indicadores.total_pagamentos)
  const financialBudget = includeFuture ? provisionedBudget : currentBudget
  const progress = Math.max(0, Math.min(100, Number(indicadores.percentual_andamento)))
  const cityState = [projeto.cidade, projeto.estado].filter(Boolean).join(', ')
  const locationLabel = [cityState, projeto.bairro].filter(Boolean).join(' - ') || 'Localização não informada'
  const mapQuery = projeto.latitude && projeto.longitude
    ? `${projeto.latitude},${projeto.longitude}`
    : [projeto.logradouro, projeto.numero, projeto.bairro, projeto.cidade, projeto.estado].filter(Boolean).join(', ')
  const mapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : ''
  const calculatedArea = Number(projeto.area_com_laje || 0) + Number(projeto.area_sem_laje || 0)
  const totalArea = Number(projeto.area_construida || calculatedArea)
  const documentation = [
    ['Processo de aprovação', projeto.processo_aprovacao],
    ['Pasta digital', projeto.pasta_digital],
    ['Planta', projeto.planta_numero],
    ['Alvará', projeto.alvara],
    ['ART', projeto.art],
    ['CNO da obra', projeto.cno_obra],
    ['Matrícula do terreno', projeto.matricula_terreno],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))
  const distribution = rankChartRows(data.distribuicaoEtapas.map(item => ({ name: item.etapa, value: Number(item.total) })), item => item.value, false)
  const categoryNames={MAO_DE_OBRA:'Mão de obra',MATERIAL_CONSTRUCAO:'Material de construção',DOCUMENTACAO:'Documentação',FRETE:'Frete',OUTROS:'Outros'} as const
  const categoryDistribution=rankChartRows(data.distribuicaoCategorias.map(item=>({name:categoryNames[item.categoria],value:Number(item.total)})),item=>item.value,false)
  const monthlyPayments = buildMonthlyPayments(data.evolucaoFinanceira)
  const supplierPayments = rankChartRows(data.fornecedores.map((item) => ({ ...item, total: Number(item.total) })), item => item.total)
  const monthlyPaymentsWithColors = rankChartRows(monthlyPayments, item => item.total)
  const projectImage = projeto.imagem_apresentacao_url || (projeto.imagem_apresentacao_id ? `/api/projetos/${projetoId}/dashboard/imagem-apresentacao` : '')

  return <div className="dashboard-page overview-dashboard">
    <PageHeader eyebrow="VISÃO GERAL" title={projeto.nome} />

    <section className="overview-primary-level">
      <article className="overview-project-information">
        <header><span>INFORMAÇÕES DA OBRA</span><h2>Dados essenciais do projeto</h2></header>
        <div className="overview-project-facts">
          <div className="overview-fact location"><MapPin /><span><small>LOCALIZAÇÃO DA OBRA</small>{mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer">{locationLabel}</a> : <strong>{locationLabel}</strong>}</span></div>
          <div className="overview-fact"><Ruler /><span><small>ÁREA TOTAL CONSTRUÍDA</small><strong>{totalArea ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(totalArea)} m²` : 'Não informada'}</strong></span></div>
          <div className="overview-fact period"><CalendarClock /><span><small>PERÍODO DA OBRA</small><strong>{formatDate(projeto.data_inicio)} <i>até</i> {formatDate(projeto.previsao_termino)}</strong><em>Início da obra · Previsão de entrega</em></span></div>
        </div>
        <div className="overview-documentation">
          <div><FileCheck2 /><span><small>DOCUMENTAÇÃO TÉCNICA</small><strong>{documentation.length ? `${documentation.length} ${documentation.length === 1 ? 'informação cadastrada' : 'informações cadastradas'}` : 'Não informada'}</strong></span></div>
          {documentation.length > 0 && <dl>{documentation.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        </div>
      </article>

      <article className="project-progress-card overview-progress-card">
        <div className="overview-progress-image">{projectImage && <img src={projectImage} alt="" aria-hidden="true" />}</div>
        <div className="overview-progress-content">
          <DashboardHelp id="help-execution" text="Percentual calculado pelas subetapas concluídas, ponderadas pela duração prevista. Uma subetapa só é concluída quando a data real de fim está registrada." />
          <span>EXECUÇÃO DA OBRA</span>
          <strong>{Math.round(progress)}%</strong>
          <div className="overview-progress-track"><i style={{ width: `${progress}%` }} /></div>
          <p>{indicadores.subetapas_concluidas} subetapas concluídas · {indicadores.subetapas_em_andamento} em andamento</p>
        </div>
      </article>
    </section>

    <section className="overview-level">
      <div className="cash-flow-summary-heading overview-future-toggle"><div><strong>{includeFuture?'Com provisão':'Sem provisão'}</strong><span>{includeFuture?'Inclui valores com data futura.':'Considera somente lançamentos até hoje.'}</span></div><label className="future-toggle" title="Ao ativar, inclui lançamentos com data posterior a hoje: valores previstos para entrar ou sair do caixa da obra."><input type="checkbox" checked={includeFuture} onChange={event=>setIncludeFuture(event.target.checked)}/><span>Mostrar lançamentos futuros?</span></label></div>
      <FinancialScenario eyebrow={includeFuture?'VISÃO COM PROVISÃO':'SITUAÇÃO ATÉ HOJE'} title={includeFuture?'Financeiro atual + provisionado':'Financeiro atual'} budgetLabel={includeFuture?'Orçamento atual + provisionado':'Orçamento atual'} budget={financialBudget} totalPaid={totalPayments} help={includeFuture?'Inclui todas as entradas do Fluxo de Caixa, inclusive lançamentos futuros. O saldo desconta o Total de Pagamentos.':'O Orçamento Atual soma entradas do Fluxo de Caixa com data até hoje. O saldo desconta o Total de Pagamentos.'} helpId="help-financial-scenario" provisioned={includeFuture} />
    </section>

    <section className="overview-level initial-budget-section">
      <div className="overview-section-title"><span>ORÇAMENTO INICIAL</span><h2>Pagamentos versus Orçamento Inicial</h2></div>
      <div className="initial-budget-grid">
        <InitialBudgetCard title="Total da obra" description="Mão de obra, Materiais, Frete, Documentação e Outros" budget={Number(indicadores.orcamento_inicial_total)} spent={totalPayments} tone="total"/>
        <InitialBudgetCard title="Mão de obra" description="Despesas classificadas como Mão de obra" budget={Number(indicadores.orcamento_mao_obra)} spent={Number(indicadores.gasto_mao_obra)} tone="labor"/>
        <InitialBudgetCard title="Materiais" description="Inclui Materiais, Frete, Documentação e Outros" budget={Number(indicadores.orcamento_materiais)} spent={Number(indicadores.gasto_materiais_e_demais_categorias)} tone="materials"/>
      </div>
    </section>

    <section className="overview-level overview-payment-analysis">
      <div className="overview-section-title"><span>ANÁLISE DOS PAGAMENTOS</span><h2>Como os recursos foram utilizados</h2></div>
      <div className="overview-payment-grid">
        <article className="dashboard-panel overview-distribution-panel">
          <DashboardPanelHeader eyebrow="DISTRIBUIÇÃO DOS GASTOS" title="Pagamentos por etapa" help="Agrupa pagamentos efetivos pela etapa-pai do Cronograma vinculada a cada pagamento." helpId="help-distribution" />
          {distribution.length ? <div className="overview-distribution-content">
            <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={84} paddingAngle={2} stroke="none">{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><RechartsTooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer>
            <DonutLegend items={distribution} />
          </div> : <EmptyState title="Sem pagamentos distribuídos" description="Os pagamentos efetivos aparecerão agrupados por etapa." />}
        </article>

        <article className="dashboard-panel overview-distribution-panel overview-category-panel">
          <DashboardPanelHeader eyebrow="DISTRIBUIÇÃO POR CATEGORIA" title="Pagamentos por Categoria" help="Compara os pagamentos efetivos por categoria, incluindo Mão de obra, Material de construção, Documentação, Frete e Outros." helpId="help-category-distribution" />
          {categoryDistribution.length ? <div className="overview-distribution-content">
            <ResponsiveContainer width="100%" height={220}><PieChart><Pie data={categoryDistribution} dataKey="value" nameKey="name" innerRadius={55} outerRadius={84} paddingAngle={2} stroke="none">{categoryDistribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><RechartsTooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer>
            <DonutLegend items={categoryDistribution} totalValue={totalPayments} />
          </div> : <EmptyState title="Sem pagamentos categorizados" description="Classifique as despesas para visualizar a distribuição entre mão de obra e materiais." />}
        </article>

        <article className="dashboard-panel overview-supplier-panel">
          <DashboardPanelHeader eyebrow="CONCENTRAÇÃO DOS PAGAMENTOS" title="Pagamentos por fornecedor" help="Soma os pagamentos efetivos por fornecedor, para identificar quem recebeu os maiores valores." helpId="help-suppliers" />
          {supplierPayments.length ? <ResponsiveContainer width="100%" height={280}>
            <BarChart data={supplierPayments} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 8 }}><CartesianGrid stroke="#e7e4dc" horizontal={false} /><XAxis type="number" tickFormatter={(value) => `${Math.round(Number(value) / 1000)} mil`} tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#8b8f8c' }} /><YAxis type="category" dataKey="fornecedor" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#747975' }} /><RechartsTooltip formatter={(value) => [formatMoney(Number(value)), 'Total pago']} /><Bar dataKey="total" name="Total pago" radius={[0, 3, 3, 0]} maxBarSize={28}>{supplierPayments.map(item=><Cell key={item.fornecedor} fill={item.color}/>)}</Bar></BarChart>
          </ResponsiveContainer> : <EmptyState title="Sem pagamentos por fornecedor" description="Os fornecedores aparecerão quando houver pagamentos efetivos registrados." />}
        </article>

        <article className="dashboard-panel overview-monthly-panel">
          <DashboardPanelHeader eyebrow="EVOLUÇÃO DOS PAGAMENTOS" title="Pagamentos por mês/ano" help="Soma os pagamentos efetivos pela data de pagamento e mantém os meses em sequência cronológica." helpId="help-monthly" />
          {monthlyPayments.length ? <ResponsiveContainer width="100%" height={280}>
            <BarChart data={monthlyPaymentsWithColors} margin={{ top: 16, right: 10, left: 6, bottom: 8 }}><CartesianGrid stroke="#e7e4dc" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#747975' }} interval="preserveStartEnd" /><YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)} mil`} tickLine={false} axisLine={false} tick={{ fontSize: 9, fill: '#8b8f8c' }} width={48} /><RechartsTooltip labelFormatter={(_, payload) => payload?.[0]?.payload?.label || ''} formatter={(value) => [formatMoney(Number(value)), 'Total pago']} /><Bar dataKey="total" name="Total pago" radius={[3, 3, 0, 0]} maxBarSize={42}>{monthlyPaymentsWithColors.map(item=><Cell key={item.mes} fill={item.color}/>)}</Bar></BarChart>
          </ResponsiveContainer> : <EmptyState title="Sem evolução mensal" description="Os pagamentos com data registrada formarão esta linha do tempo." />}
        </article>
      </div>
    </section>
    <ScheduleGantt key={projetoId} projectId={projetoId||''}/>
  </div>
}
