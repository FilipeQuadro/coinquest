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
import { SyncPanel } from './components/SyncPanel'
import { monthFromDate, validateSelectedMonth, type SelectedMonth } from './finance/month'

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

  useEffect(() => {
    window.localStorage.setItem(selectedMonthStorageKey, JSON.stringify(selectedMonth))
  }, [selectedMonth])

  return (
    <>
      <header className="topbar">
        <div className="brand-mark">CQ</div>
        <div>
          <strong>CoinQuest</strong>
          <span>RPG financeiro local-first</span>
        </div>
        <nav>
          <a href="#mundo">Mundo</a>
          <a href="#registrar">Registrar</a>
          <a href="#orcamento">Orcamento</a>
          <a href="#missoes">Missoes</a>
          <a href="#simulador">Simulador</a>
          <a href="#previsoes">Previsoes</a>
          <a href="#projecao">Projecao</a>
          <a href="#cartoes">Cartoes</a>
          <a href="#backup">Backup</a>
          <a href="#sync">Sync</a>
          <a href="#historico">Historico</a>
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

        <div id="mundo"><GameWorld selectedMonth={selectedMonth} /></div>

        <div className="finance-grid" id="registrar">
          <div className="quick-slot"><QuickEntry /></div>
          <div className="manual-slot"><ManualTransaction selectedMonth={selectedMonth} /></div>
          <div className="stats-slot"><Stats selectedMonth={selectedMonth} /></div>
          <div className="budget-slot" id="orcamento"><BudgetPlanner selectedMonth={selectedMonth} /></div>
          <div className="goals-slot" id="missoes"><GoalsPanel /></div>
          <div className="simulator-slot" id="simulador"><PurchaseSimulatorPanel selectedMonth={selectedMonth} /></div>
          <div className="recurring-slot" id="previsoes"><RecurringPanel selectedMonth={selectedMonth} /></div>
          <div className="cards-slot" id="cartoes"><CreditCardsPanel selectedMonth={selectedMonth} /></div>
          <div className="projection-slot" id="projecao"><ProjectionPanel selectedMonth={selectedMonth} /></div>
          <div className="backup-slot" id="backup"><BackupPanel /></div>
          <div className="sync-slot" id="sync"><SyncPanel /></div>
        </div>

        <div id="historico"><History selectedMonth={selectedMonth} /></div>

        <footer>
          CoinQuest v0.1 - dados locais no IndexedDB - sincronizacao entre aparelhos entra em uma proxima fase.
        </footer>
      </main>
      <PwaStatus />
    </>
  )
}
