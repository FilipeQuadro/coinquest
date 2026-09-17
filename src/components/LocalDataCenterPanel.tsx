import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { deriveLocalDataHealth, type LocalDataHealthCounts } from '../localData/localDataHealth'

interface CountCard {
  label: string
  value: number
  detail: string
}

function statusLabel(status: 'empty' | 'ok' | 'attention') {
  switch (status) {
    case 'empty':
      return 'Sem dados'
    case 'ok':
      return 'Tudo certo'
    case 'attention':
      return 'Atencao'
    default: {
      const exhaustive: never = status
      return exhaustive
    }
  }
}

function mainCountCards(counts: LocalDataHealthCounts): CountCard[] {
  return [
    {
      label: 'Movimentacoes',
      value: counts.transactions,
      detail: 'Transacoes reais registradas neste dispositivo.',
    },
    {
      label: 'Planejamento',
      value: counts.monthlyBudgets + counts.categoryBudgets + counts.recurringRules,
      detail: 'Orcamentos e recorrencias locais.',
    },
    {
      label: 'Cartoes',
      value: counts.creditCards + counts.cardPurchases + counts.cardInvoicePayments,
      detail: 'Cartoes, compras e pagamentos de fatura.',
    },
    {
      label: 'Metas',
      value: counts.goals + counts.goalContributions,
      detail: 'Missoes e alocacoes registradas.',
    },
    {
      label: 'Preferencias',
      value: counts.settings,
      detail: 'Configuracoes locais do app.',
    },
    {
      label: 'Sync opcional',
      value: counts.syncConflicts,
      detail: 'Conflitos pendentes, quando existirem.',
    },
  ]
}

export function LocalDataCenterPanel() {
  const localData = useLiveQuery(async () => {
    const [
      transactions,
      goals,
      goalContributions,
      settings,
      monthlyBudgets,
      categoryBudgets,
      recurringRules,
      recurringOccurrenceOverrides,
      creditCards,
      cardPurchases,
      cardInvoicePayments,
      syncConflicts,
    ] = await Promise.all([
      db.transactions.toArray(),
      db.goals.toArray(),
      db.goalContributions.toArray(),
      db.settings.toArray(),
      db.monthlyBudgets.toArray(),
      db.categoryBudgets.toArray(),
      db.recurringRules.toArray(),
      db.recurringOccurrenceOverrides.toArray(),
      db.creditCards.toArray(),
      db.cardPurchases.toArray(),
      db.cardInvoicePayments.toArray(),
      db.syncConflicts.where('status').equals('pending').toArray(),
    ])

    return {
      transactions,
      goals,
      goalContributions,
      settings,
      monthlyBudgets,
      categoryBudgets,
      recurringRules,
      recurringOccurrenceOverrides,
      creditCards,
      cardPurchases,
      cardInvoicePayments,
      syncConflicts,
    }
  }, [])

  const report = useMemo(() => localData ? deriveLocalDataHealth(localData) : null, [localData])
  const countCards = report ? mainCountCards(report.counts) : []

  return (
    <section className="panel local-data-panel" data-testid="local-data-panel" aria-labelledby="local-data-title" aria-busy={!report}>
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">DADOS LOCAIS</span>
          <h2 id="local-data-title">Central de Dados Locais</h2>
          <p className="muted">Seus dados ficam neste dispositivo. Esta central apenas mostra sinais locais; ela nao corrige dados automaticamente.</p>
        </div>
        {report && <span className={`local-data-status status-${report.status}`}>{statusLabel(report.status)}</span>}
      </div>

      {!report ? (
        <p className="local-data-loading">Carregando dados locais...</p>
      ) : (
        <>
          <div className={`local-data-summary status-${report.status}`} data-testid="local-data-summary">
            <strong>{report.summaryMessage}</strong>
            <span>O uso local continua disponivel.</span>
          </div>

          <div className="local-data-counts" aria-label="Contagens locais principais">
            {countCards.map((item) => (
              <article className="local-data-count-card" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <div className="local-data-warnings" data-testid="local-data-warnings">
            <div className="section-heading">
              <strong>Sinais locais</strong>
              <span>{report.warnings.length}</span>
            </div>
            {report.warnings.length === 0 ? (
              <p className="local-data-empty-warning">Nenhum sinal local pendente para revisar.</p>
            ) : (
              <div className="local-data-warning-list">
                {report.warnings.map((warning) => (
                  <article className={`local-data-warning severity-${warning.severity}`} key={warning.id}>
                    <div>
                      <strong>{warning.title}</strong>
                      <p>{warning.message}</p>
                    </div>
                    <span>{warning.count}</span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  )
}
