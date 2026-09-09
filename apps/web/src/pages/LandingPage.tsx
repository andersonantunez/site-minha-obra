import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  FileText,
  FolderKanban,
  Menu,
  ReceiptText,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { useState } from 'react'

const painPoints = [
  'Planilhas em versões diferentes',
  'Comprovantes espalhados',
  'Links perdidos nas conversas',
  'Custos sem consolidação',
]

const outcomes = [
  'Uma visão financeira confiável',
  'Etapas e documentos organizados',
  'Pagamentos vinculados à obra',
  'Histórico claro para todos',
]

const benefits = [
  {
    icon: FolderKanban,
    eyebrow: 'Planejamento',
    title: 'Cada etapa no lugar certo',
    text: 'Cronograma, responsáveis, valores previstos e execução física acompanhados em uma única linha do tempo.',
  },
  {
    icon: ReceiptText,
    eyebrow: 'Financeiro',
    title: 'Saiba quanto a obra está custando',
    text: 'Fluxo de Caixa, compromissos e pagamentos consolidados sem depender de fórmulas dispersas.',
  },
  {
    icon: FileText,
    eyebrow: 'Acervo',
    title: 'Documentos sempre acessíveis',
    text: 'Plantas, renders, contratos e comprovantes ligados ao contexto em que realmente são utilizados.',
  },
  {
    icon: Users,
    eyebrow: 'Colaboração',
    title: 'Proprietário e engenharia juntos',
    text: 'Convide participantes e controle com precisão quem pode visualizar ou alterar cada parte da obra.',
  },
]

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="landing-page">
      <header className="public-header">
        <a className="brand" href="#inicio" aria-label="MinhaObra, início">
          <span className="brand-mark">M</span>
          <span>MinhaObra</span>
        </a>
        <nav className={menuOpen ? 'public-nav is-open' : 'public-nav'} aria-label="Navegação principal">
          <a href="#plataforma" onClick={() => setMenuOpen(false)}>Plataforma</a>
          <a href="#beneficios" onClick={() => setMenuOpen(false)}>Benefícios</a>
          <a href="#controle" onClick={() => setMenuOpen(false)}>Controle financeiro</a>
          <a className="nav-login" href="/login">Entrar</a>
        </nav>
        <button className="menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Alternar menu">
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <span className="kicker"><i /> Gestão residencial, do projeto à entrega</span>
            <h1>Sua obra inteira,<br /><em>em um único lugar.</em></h1>
            <p>Acompanhe o que foi feito, quanto custou e o que vem pela frente — com uma visão clara para quem constrói e para quem paga.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="/login">Começar gratuitamente <ArrowRight size={18} /></a>
              <a className="button button-ghost" href="#plataforma">Conhecer a plataforma</a>
            </div>
            <div className="hero-proof">
              <span><ShieldCheck size={17} /> Acesso por permissões</span>
              <span><Clock3 size={17} /> Informações em tempo real</span>
            </div>
          </div>

          <div className="product-stage" aria-label="Prévia do dashboard MinhaObra">
            <div className="stage-architecture" />
            <div className="dashboard-preview">
              <div className="preview-topbar">
                <div><small>PROJETO RESIDENCIAL</small><strong>Casa 189</strong></div>
                <span>Agosto · 2026</span>
              </div>
              <div className="preview-render">
                <img src="/images/residencia-contemporanea-hero.png" alt="Residência contemporânea de alto padrão ao entardecer" />
                <div className="progress-floating"><small>Andamento geral</small><strong>68%</strong><div><i /></div></div>
              </div>
              <div className="preview-metrics">
                <div><small>Fluxo de Caixa</small><strong>R$ 1,84 mi</strong><span>Previsto</span></div>
                <div><small>Realizado</small><strong>R$ 1,12 mi</strong><span className="positive">61% do total</span></div>
                <div><small>Próxima etapa</small><strong>Interiores</strong><span>12 de setembro</span></div>
              </div>
              <div className="preview-chart">
                <div><small>Evolução financeira</small><strong>Previsto × realizado</strong></div>
                <svg viewBox="0 0 560 120" role="img" aria-label="Gráfico ilustrativo de evolução financeira">
                  <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9a8060" stopOpacity=".28"/><stop offset="1" stopColor="#9a8060" stopOpacity="0"/></linearGradient></defs>
                  <path d="M0 100 C70 88,100 62,160 70 S250 38,315 50 S420 18,560 12 L560 120 L0 120Z" fill="url(#area)" />
                  <path d="M0 100 C70 88,100 62,160 70 S250 38,315 50 S420 18,560 12" fill="none" stroke="#876b4c" strokeWidth="3" />
                  <path d="M0 108 C80 98,120 82,180 86 S300 65,360 70 S465 48,560 43" fill="none" stroke="#323936" strokeWidth="2" strokeDasharray="6 6" />
                </svg>
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="Principais recursos">
          <span>ETAPAS</span><i /> <span>FLUXO DE CAIXA</span><i /> <span>PAGAMENTOS</span><i /> <span>DOCUMENTOS</span><i /> <span>INDICADORES</span>
        </section>

        <section className="section benefits-section" id="plataforma">
          <div className="section-heading">
            <span className="kicker"><i /> Uma única fonte de verdade</span>
            <h2>Menos planilhas. Menos mensagens perdidas. <em>Mais controle.</em></h2>
            <p>O MinhaObra reúne a informação certa no contexto certo para que decisões não dependam de buscas em conversas, pastas e arquivos desconectados.</p>
          </div>
          <div className="benefits-grid" id="beneficios">
            {benefits.map(({ icon: Icon, eyebrow, title, text }, index) => (
              <article className="benefit" key={title}>
                <span className="benefit-index">0{index + 1}</span>
                <Icon aria-hidden="true" />
                <small>{eyebrow}</small>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="comparison-section" id="controle">
          <div className="comparison-copy">
            <span className="kicker light"><i /> Antes e depois</span>
            <h2>Troque a sensação de incerteza por uma visão clara da obra.</h2>
            <p>Do primeiro lançamento ao último pagamento, todos acompanham a mesma informação — atualizada, organizada e rastreável.</p>
          </div>
          <div className="comparison-panels">
            <article className="before-panel">
              <small>ANTES DO MINHAOBRA</small>
              <h3>Informação fragmentada</h3>
              <ul>{painPoints.map((item) => <li key={item}><X size={16} /> {item}</li>)}</ul>
            </article>
            <article className="after-panel">
              <small>COM O MINHAOBRA</small>
              <h3>Decisões com contexto</h3>
              <ul>{outcomes.map((item) => <li key={item}><Check size={16} /> {item}</li>)}</ul>
            </article>
          </div>
        </section>

        <section className="section insight-section">
          <div className="insight-visual">
            <div className="mini-dashboard">
              <span className="mini-icon"><BarChart3 /></span>
              <div><small>CUSTO ACUMULADO</small><strong>R$ 1.124.680</strong><span>Dentro do fluxo previsto</span></div>
              <div className="mini-bars">{[38, 52, 46, 68, 72, 84, 78, 92].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div>
            </div>
          </div>
          <div className="insight-copy">
            <span className="kicker"><i /> Indicadores que ajudam a decidir</span>
            <h2>Entenda para onde o dinheiro está indo.</h2>
            <p>Compare o fluxo previsto e realizado, acompanhe a evolução mensal e identifique as etapas, fornecedores e compromissos que mais impactam o projeto.</p>
            <ul>
              <li><Check size={17} /> Gastos por mês e por etapa</li>
              <li><Check size={17} /> Pagamentos futuros e realizados</li>
              <li><Check size={17} /> Evolução física e financeira</li>
            </ul>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span className="kicker light"><i /> Sua obra, com clareza</span>
            <h2>Do projeto ao último pagamento. Tudo organizado.</h2>
          </div>
          <a className="button button-light" href="/login">Criar minha primeira obra <ArrowRight size={18} /></a>
        </section>
      </main>

      <footer className="public-footer">
        <a className="brand" href="#inicio"><span className="brand-mark">M</span><span>MinhaObra</span></a>
        <p>Gestão transparente para obras bem conduzidas.</p>
        <small>© 2026 MinhaObra</small>
      </footer>
    </div>
  )
}
