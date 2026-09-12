import { useEffect, useState } from 'react'
import { BackupPanel } from './components/BackupPanel'
import { BudgetPlanner } from './components/BudgetPlanner'
import { CreditCardsPanel } from './components/CreditCardsPanel'
import { GameWorld } from './components/GameWorld'
import { GoalsPanel } from './components/GoalsPanel'
import { History } from './components/History'
import { ManualTransaction } from './components/ManualTransaction'
import { MonthNavigator } from './components/MonthNavigator'
import { ProjectionPanel } from './components/ProjectionPanel'
import { PwaStatus } from './components/PwaStatus'
import { PurchaseSimulatorPanel } from './components/PurchaseSimulatorPanel'
import { QuickEntry } from './components/QuickEntry'
import { RecurringPanel } from './components/RecurringPanel'
import { Stats } from './components/Stats'
import { SyncLifecycle } from './components/SyncLifecycle'
import { SyncPanel } from './components/SyncPanel'
import { monthFromDate, validateSelectedMonth, type SelectedMonth } from './finance/month'
import { normalizeProductSectionHash, productNavItems, type ProductSectionId } from './navigation/productNavigation'

const selectedMonthStorageKey = 'coinquest:selected-month'

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
  const [activeSection, setActiveSection] = useState<ProductSectionId>(() => normalizeProductSectionHash(window.location.hash) ?? 'mundo')
  const [isNavOpen, setIsNavOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(selectedMonthStorageKey, JSON.stringify(selectedMonth))
  }, [selectedMonth])

  useEffect(() => {
    const syncActiveSectionFromHash = () => {
      const nextSection = normalizeProductSectionHash(window.location.hash)
      if (!nextSection) return

      setActiveSection(nextSection)
      window.requestAnimationFrame(() => {
        document.getElementById(nextSection)?.scrollIntoView({ block: 'start' })
      })
    }

    syncActiveSectionFromHash()
    window.addEventListener('hashchange', syncActiveSectionFromHash)
    return () => window.removeEventListener('hashchange', syncActiveSectionFromHash)
  }, [])

  return (
    <>
      <header className="topbar">
        <div className="brand-mark">CQ</div>
        <div className="brand-copy">
          <strong>CoinQuest <span className="release-badge">RC.1</span></strong>
          <span>RPG financeiro local-first</span>
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
          aria-label="Navegacao principal"
        >
          {productNavItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
              onClick={() => {
                setActiveSection(item.id)
                setIsNavOpen(false)
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="app-shell">
        <section className="world-intro">
          <div>
            <h1>Seu dinheiro virou um mundo.</h1>
            <p>Registre, acompanhe e veja sua base reagir. Tudo local-first, direto no aparelho.</p>
          </div>
          <span className="world-chip">offline first</span>
        </section>

        <MonthNavigator selectedMonth={selectedMonth} onChange={setSelectedMonth} />

        <div id="mundo" className="section-anchor"><GameWorld selectedMonth={selectedMonth} /></div>

        <div className="finance-grid" id="registrar">
          <div className="quick-slot"><QuickEntry /></div>
          <div className="manual-slot"><ManualTransaction selectedMonth={selectedMonth} /></div>
          <div className="stats-slot section-anchor" id="planejamento"><Stats selectedMonth={selectedMonth} /></div>
          <div className="budget-slot" id="orcamento"><BudgetPlanner selectedMonth={selectedMonth} /></div>
          <div className="recurring-slot" id="previsoes"><RecurringPanel selectedMonth={selectedMonth} /></div>
          <div className="projection-slot" id="projecao"><ProjectionPanel selectedMonth={selectedMonth} /></div>
          <div className="simulator-slot" id="simulador"><PurchaseSimulatorPanel selectedMonth={selectedMonth} /></div>
          <div className="cards-slot" id="cartoes"><CreditCardsPanel selectedMonth={selectedMonth} /></div>
          <div className="goals-slot" id="missoes"><GoalsPanel /></div>
          <div className="sync-slot" id="sync"><SyncPanel /></div>
          <div className="backup-slot" id="backup"><BackupPanel /></div>
        </div>

        <div id="historico"><History selectedMonth={selectedMonth} /></div>

        <footer>
          CoinQuest - local-first - offline-first - sincronizacao opcional entre dispositivos.
        </footer>
      </main>
      <PwaStatus />
      <SyncLifecycle />
    </>
  )
}
