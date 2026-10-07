import { useEffect, useLayoutEffect, useState } from 'react'
import { BackupPanel } from './components/BackupPanel'
import { BudgetPlanner } from './components/BudgetPlanner'
import { CategorySettingsPanel } from './components/CategorySettingsPanel'
import { CreditCardsPanel } from './components/CreditCardsPanel'
import { GameWorld } from './components/GameWorld'
import { GoalsPanel } from './components/GoalsPanel'
import { History } from './components/History'
import { ImportLocalFilePanel } from './components/ImportLocalFilePanel'
import { LocalDataCenterPanel } from './components/LocalDataCenterPanel'
import { ManualTransaction } from './components/ManualTransaction'
import { MonthNavigator } from './components/MonthNavigator'
import { MonthlyOverviewPanel } from './components/MonthlyOverviewPanel'
import { ProjectionPanel } from './components/ProjectionPanel'
import { PwaStatus } from './components/PwaStatus'
import { PurchaseSimulatorPanel } from './components/PurchaseSimulatorPanel'
import { QuickEntry } from './components/QuickEntry'
import { RecurringPanel } from './components/RecurringPanel'
import { SyncLifecycle } from './components/SyncLifecycle'
import { SyncPanel } from './components/SyncPanel'
import { monthFromDate, validateSelectedMonth, type SelectedMonth } from './finance/month'
import { normalizeProductSectionHash, productAreaForSection, productNavItems } from './navigation/productNavigation'

const selectedMonthStorageKey = 'coinquest:selected-month'

const areaHeadings = {
  inicio: { title: 'Início', description: '' },
  registrar: { title: 'Registro e histórico', description: 'Movimentos reais, mês a mês.' },
  planejamento: { title: 'Planejamento', description: 'Limites planejados, compromissos e estimativas.' },
  cartoes: { title: 'Cartões', description: 'Compras, parcelas e faturas.' },
  missoes: { title: 'Metas', description: 'Seus objetivos e valores reservados.' },
  backup: { title: 'Dados', description: 'Seus dados locais, sob seu controle.' },
  mundo: { title: 'Mundo', description: 'Sua base no CoinQuest.' },
}

function loadSelectedMonth(): SelectedMonth {
  try {
    const stored = window.localStorage.getItem(selectedMonthStorageKey)
    if (!stored) return monthFromDate()
    const parsed = JSON.parse(stored) as SelectedMonth
    return validateSelectedMonth(parsed) ? monthFromDate() : parsed
  } catch {
    return monthFromDate()
  }
}

export function App() {
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>(() => loadSelectedMonth())
  const [activeHash, setActiveHash] = useState(() => window.location.hash)
  const activeAnchor = normalizeProductSectionHash(activeHash) ?? 'inicio'
  const activeSection = productAreaForSection(activeAnchor)
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(selectedMonthStorageKey, JSON.stringify(selectedMonth))
  }, [selectedMonth])

  useEffect(() => {
    const syncActiveSectionFromHash = () => {
      setActiveHash(window.location.hash)
      setIsNavOpen(false)
    }

    syncActiveSectionFromHash()
    window.addEventListener('hashchange', syncActiveSectionFromHash)
    return () => window.removeEventListener('hashchange', syncActiveSectionFromHash)
  }, [])

  useLayoutEffect(() => {
    const settleOnTarget = () => {
      if (!activeHash) {
        window.scrollTo({ top: 0, behavior: 'instant' })
        return
      }
      const target = document.getElementById(activeAnchor === activeSection && activeSection !== 'inicio' ? 'focused-heading' : activeAnchor)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'start', behavior: 'instant' })
    }
    settleOnTarget()
    // The browser's own fragment scroll runs on the next frame, once the hidden area is shown; settle on ours after it.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(settleOnTarget)
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeHash, activeAnchor, activeSection])

  return (
    <>
      <header className="topbar">
        <div className="brand-mark">CQ</div>
        <div className="brand-copy">
          <strong>CoinQuest</strong>
          <span>Finan&ccedil;as no seu ritmo</span>
        </div>
        <button
          className="nav-toggle"
          type="button"
          aria-controls="product-navigation"
          aria-expanded={isNavOpen}
          onClick={() => setIsNavOpen((current) => !current)}
        >
          Menu
        </button>
        <nav
          id="product-navigation"
          className={isNavOpen ? 'product-nav is-open' : 'product-nav'}
          aria-label="Navegação principal"
        >
          {productNavItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => {
                setIsNavOpen(false)
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app-shell">
        <section id="inicio" className="world-intro home-hero" aria-labelledby="home-title" hidden={activeSection !== 'inicio'} tabIndex={-1}>
          <div className="home-hero-copy">
            <span className="home-eyebrow">CLAREZA PARA O SEU DIA A DIA</span>
            <h1 id="home-title">Seu m&ecirc;s, em foco.</h1>
            <p>Acompanhe o m&ecirc;s e escolha seu pr&oacute;ximo passo.</p>
          </div>
          <nav className="world-intro-actions" aria-label="Ações principais">
            <a className="button primary compact" href="#registrar">Registrar movimento</a>
            <a className="button ghost compact" href="#historico">Ver hist&oacute;rico</a>
          </nav>
        </section>

        {activeSection !== 'inicio' && (
          <header id="focused-heading" className="focused-heading" tabIndex={-1}>
            <a href="#inicio" className="focused-back">&#8592; In&iacute;cio</a>
            <h1 id="focused-title">{areaHeadings[activeSection].title}</h1>
            <p>{areaHeadings[activeSection].description}</p>
            {activeSection === 'registrar' && (
              <nav aria-label="Registro e hist&oacute;rico" className="focused-links">
                <a href="#registrar">Registrar movimento</a>
                <a href="#historico">Ver hist&oacute;rico</a>
              </nav>
            )}
            {activeSection === 'planejamento' && (
              <nav aria-label="Planejamento" className="focused-links">
                <a href="#orcamento">Or&ccedil;amento</a>
                <a href="#previsoes">Recorr&ecirc;ncias</a>
                <a href="#projecao">Proje&ccedil;&atilde;o</a>
                <a href="#simulador">Simulador</a>
              </nav>
            )}
          </header>
        )}

        {activeSection !== 'backup' && <MonthNavigator selectedMonth={selectedMonth} onChange={setSelectedMonth} />}

        <div data-area="inicio" hidden={activeSection !== 'inicio'}>
        <MonthlyOverviewPanel selectedMonth={selectedMonth} />

        <section className="home-areas" aria-labelledby="home-areas-title">
          <div className="home-section-heading">
            <div>
              <span className="home-eyebrow">SUAS &Aacute;REAS</span>
              <h2 id="home-areas-title">Por onde seguir?</h2>
            </div>
            <p>Atalhos para cada parte da sua vida financeira.</p>
          </div>
          <nav className="home-area-grid" aria-label="Áreas principais">
            <article className="home-area-card home-area-records">
              <span className="home-area-kicker">MOVIMENTOS</span>
              <h3>Registro e hist&oacute;rico</h3>
              <p>Movimentos reais e o hist&oacute;rico do seu m&ecirc;s.</p>
              <div className="home-area-actions">
                <a className="home-area-primary" href="#registrar">Registrar movimento</a>
                <a href="#historico">Ver hist&oacute;rico <span aria-hidden="true">&#8599;</span></a>
              </div>
            </article>
            <a className="home-area-card home-area-link" href="#planejamento">
              <span className="home-area-kicker">ORGANIZE</span>
              <h3>Planejamento</h3>
              <p>Or&ccedil;amento, recorr&ecirc;ncias e estimativas.</p>
              <span className="home-area-open">Explorar <span aria-hidden="true">&#8599;</span></span>
            </a>
            <a className="home-area-card home-area-link" href="#cartoes">
              <span className="home-area-kicker">COMPROMISSOS</span>
              <h3>Cart&otilde;es</h3>
              <p>Compras, parcelas e faturas com contexto.</p>
              <span className="home-area-open">Explorar <span aria-hidden="true">&#8599;</span></span>
            </a>
            <a className="home-area-card home-area-link" href="#missoes">
              <span className="home-area-kicker">OBJETIVOS</span>
              <h3>Metas</h3>
              <p>Acompanhe valores alocados aos seus objetivos.</p>
              <span className="home-area-open">Explorar <span aria-hidden="true">&#8599;</span></span>
            </a>
            <a className="home-area-card home-area-link" href="#backup">
              <span className="home-area-kicker">DADOS LOCAIS</span>
              <h3>Dados</h3>
              <p>Importe, exporte e proteja seus dados neste dispositivo.</p>
              <span className="home-area-open">Explorar <span aria-hidden="true">&#8599;</span></span>
            </a>
            <a className="home-area-card home-area-link home-area-world" href="#mundo">
              <span className="home-area-kicker">MUNDO 2D</span>
              <h3>Mundo</h3>
              <p>Uma pausa visual no universo CoinQuest.</p>
              <img className="home-world-art" src="/assets/tech/digital-vault-shell.png" width="114" height="97" alt="" />
              <span className="home-area-open">Abrir Mundo <span aria-hidden="true">&#8594;</span></span>
            </a>
          </nav>
        </section>
        </div>

        {/* Keep drafts and previews while switching areas; hidden also removes them from keyboard navigation. */}
        <section id="registrar" className="focused-section" data-area="registrar" hidden={activeSection !== 'registrar'} tabIndex={-1} aria-label="Registro e hist&oacute;rico">
          <div className="focused-record-grid">
            <div className="quick-slot"><QuickEntry /></div>
            <div className="manual-slot"><ManualTransaction selectedMonth={selectedMonth} /></div>
          </div>
          <div id="historico" tabIndex={-1}><History selectedMonth={selectedMonth} /></div>
          <div className="category-slot"><CategorySettingsPanel /></div>
        </section>

        <section id="planejamento" className="focused-section" data-area="planejamento" hidden={activeSection !== 'planejamento'} tabIndex={-1} aria-label="Planejamento">
          <div id="orcamento" tabIndex={-1}><BudgetPlanner selectedMonth={selectedMonth} /></div>
          <div id="previsoes" tabIndex={-1}><RecurringPanel selectedMonth={selectedMonth} /></div>
          <div id="projecao" tabIndex={-1}><ProjectionPanel selectedMonth={selectedMonth} /></div>
          <div id="simulador" tabIndex={-1}><PurchaseSimulatorPanel selectedMonth={selectedMonth} /></div>
        </section>

        <section id="cartoes" className="focused-section" data-area="cartoes" hidden={activeSection !== 'cartoes'} tabIndex={-1} aria-label="Cart&otilde;es">
          <CreditCardsPanel selectedMonth={selectedMonth} />
        </section>

        <section id="missoes" className="focused-section" data-area="missoes" hidden={activeSection !== 'missoes'} tabIndex={-1} aria-label="Metas">
          <GoalsPanel />
        </section>

        <section id="backup" className="focused-section" data-area="backup" hidden={activeSection !== 'backup'} tabIndex={-1} aria-label="Dados">
          <LocalDataCenterPanel />
          <ImportLocalFilePanel />
          <BackupPanel />
          <div id="sync" tabIndex={-1}><SyncPanel /></div>
        </section>

        <section id="mundo" className="section-anchor world-section" data-area="mundo" hidden={activeSection !== 'mundo'} tabIndex={-1} aria-label="Mundo">
          <GameWorld selectedMonth={selectedMonth} active={activeSection === 'mundo'} />
        </section>

        <footer>
          CoinQuest - local-first - offline-first - sincronização opcional entre dispositivos.
        </footer>
      </main>
      <PwaStatus />
      <SyncLifecycle />
    </>
  )
}
