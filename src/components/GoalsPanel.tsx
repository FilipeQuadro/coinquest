import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { Goal, GoalContribution, GoalPriority, GoalStatus } from '../db/types'
import {
  addGoalContribution,
  archiveGoal,
  calculateGoalProgress,
  createGoal,
  restoreGoal,
  updateGoal,
  type GoalProgress,
} from '../finance/goals/goals'
import { detectNewGoalCompletions, snapshotGoalStatuses, type GoalStatusSnapshot } from '../finance/goals/goalCompletionTransitions'
import { localDateTimeToIso, todayDateInputValue, toDateInputValue } from '../finance/month'
import { emitGoalCompleted } from '../game/events'
import { audioEngine } from '../lib/audio'
import { formatBRL, parseMoney } from '../lib/money'

type ContributionMode = 'reserve' | 'withdraw'

interface GoalFormState {
  name: string
  description: string
  targetAmount: string
  targetDate: string
  monthlyPlan: string
  priority: '' | GoalPriority
}

const emptyGoalForm: GoalFormState = {
  name: '',
  description: '',
  targetAmount: '',
  targetDate: '',
  monthlyPlan: '',
  priority: '',
}

const priorityLabels: Record<GoalPriority, string> = {
  low: 'Baixa',
  medium: 'M\u00e9dia',
  high: 'Alta',
}

const statusLabels: Record<GoalStatus, string> = {
  active: 'Ativa',
  completed: 'MISS\u00c3O CONCLU\u00cdDA',
  archived: 'Arquivada',
}

const priorityOrder: Record<GoalPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value) + '%'
}

function formatDate(isoDate: string | undefined) {
  if (!isoDate) return 'Sem prazo'
  const date = new Date(isoDate)
  if (!Number.isFinite(date.getTime())) return 'Data inv\u00e1lida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function formatContributionDate(isoDate: string) {
  return formatDate(isoDate)
}

function sortGoals(goals: Goal[]) {
  return [...goals].sort((a, b) => {
    const priority = (priorityOrder[a.priority ?? 'low'] ?? 2) - (priorityOrder[b.priority ?? 'low'] ?? 2)
    if (priority !== 0) return priority
    return b.createdAt.localeCompare(a.createdAt)
  })
}

function goalFormFromGoal(goal: Goal): GoalFormState {
  return {
    name: goal.name,
    description: goal.description ?? '',
    targetAmount: String(goal.targetAmount).replace('.', ','),
    targetDate: goal.targetDate ? toDateInputValue(goal.targetDate) : '',
    monthlyPlan: goal.monthlyPlan ? String(goal.monthlyPlan).replace('.', ',') : '',
    priority: goal.priority ?? '',
  }
}

function buildGoalDraft(form: GoalFormState) {
  const targetAmount = parseMoney(form.targetAmount)
  const monthlyPlan = form.monthlyPlan.trim() ? parseMoney(form.monthlyPlan) : undefined
  let targetDate: string | undefined

  if (form.targetDate) {
    const parsedTargetDate = localDateTimeToIso(form.targetDate, '12:00')
    if (!parsedTargetDate) throw new Error('Informe um prazo v\u00e1lido.')
    targetDate = parsedTargetDate
  }

  if (targetAmount === null) throw new Error('Informe um valor objetivo v\u00e1lido.')
  if (monthlyPlan === null) throw new Error('Informe um plano mensal v\u00e1lido.')

  return {
    name: form.name,
    description: form.description || undefined,
    targetAmount,
    targetDate,
    monthlyPlan,
    priority: form.priority || undefined,
  }
}

function missionEstimate(progress: GoalProgress, hasMonthlyPlan: boolean) {
  if (progress.estimatedMonthsRemaining !== null) {
    return `Estimativa: ~${progress.estimatedMonthsRemaining} ${progress.estimatedMonthsRemaining === 1 ? 'm\u00eas' : 'meses'}.`
  }

  if (!hasMonthlyPlan) return 'Sem plano mensal definido.'
  if (progress.completed) return 'Objetivo reservado.'
  return 'Estimativa indispon\u00edvel no momento.'
}

interface GoalCardProps {
  goal: Goal
  contributions: GoalContribution[]
  onDetails: (goalId: string) => void
  onEdit: (goal: Goal) => void
  onContribution: (goalId: string, mode: ContributionMode) => void
  onArchive: (goalId: string) => void
  onRestore: (goalId: string) => void
  archiveConfirmId: string
  setArchiveConfirmId: (goalId: string) => void
}

function GoalCard({
  goal,
  contributions,
  onDetails,
  onEdit,
  onContribution,
  onArchive,
  onRestore,
  archiveConfirmId,
  setArchiveConfirmId,
}: GoalCardProps) {
  const progress = calculateGoalProgress(goal, contributions)
  const barWidth = progress.percentageDisplay
  const statusClass = goal.status === 'completed' ? 'completed' : goal.status === 'archived' ? 'archived' : 'active'

  return (
    <article className={`goal-card ${statusClass}`} data-testid="goal-card">
      <div className="goal-card-head">
        <div>
          <span className="eyebrow">{goal.status === 'completed' ? 'MISS\u00c3O' : 'OBJETIVO'}</span>
          <h3 data-testid="goal-name">{goal.name}</h3>
        </div>
        <span className={`goal-status-chip ${statusClass}`} data-testid="goal-status">{statusLabels[goal.status]}</span>
      </div>

      {goal.description && <p className="goal-description">{goal.description}</p>}

      <div className="goal-progress-row">
        <strong data-testid="goal-allocated">{formatBRL(progress.allocatedAmount)}</strong>
        <span>/</span>
        <strong data-testid="goal-target">{formatBRL(progress.targetAmount)}</strong>
      </div>
      <div className="goal-progress" aria-label={`Progresso da missao: ${formatPercent(progress.percentageDisplay)}`}>
        <span style={{ width: `${barWidth}%` }} />
      </div>
      <div className="goal-meta-grid">
        <span data-testid="goal-progress-text">{formatPercent(progress.percentageDisplay)}</span>
        <span data-testid="goal-remaining">Faltam {formatBRL(progress.remainingAmount)}</span>
        {progress.percentageRaw > 100 && <span>Excedente preservado: {formatBRL(progress.allocatedAmount - progress.targetAmount)}</span>}
        <span>Prazo: {formatDate(goal.targetDate)}</span>
        <span>Plano mensal: {goal.monthlyPlan ? `${formatBRL(goal.monthlyPlan)}/m\u00eas` : 'Sem plano'}</span>
        {goal.priority && <span className={`priority-chip priority-${goal.priority}`}>Prioridade {priorityLabels[goal.priority]}</span>}
      </div>

      {progress.targetDatePassed && !progress.completed && (
        <p className="goal-note">Prazo definido já passou.</p>
      )}
      <p className="goal-note">{missionEstimate(progress, Boolean(goal.monthlyPlan))}</p>
      {progress.requiredMonthlyAllocation !== null && (
        <p className="goal-note">Para atingir o objetivo até o prazo: aproximadamente {formatBRL(progress.requiredMonthlyAllocation)}/mês.</p>
      )}

      <div className="goal-actions">
        <button className="button ghost" type="button" data-testid="open-goal-details" onClick={() => onDetails(goal.id)}>
          Detalhes
        </button>
        {goal.status !== 'archived' && (
          <>
            <button className="button primary" type="button" data-testid="reserve-goal" onClick={() => onContribution(goal.id, 'reserve')}>
              Reservar
            </button>
            <button className="button ghost" type="button" data-testid="withdraw-goal" onClick={() => onContribution(goal.id, 'withdraw')}>
              Retirar
            </button>
            <button className="button ghost" type="button" data-testid="edit-goal" onClick={() => onEdit(goal)}>
              Editar
            </button>
            {archiveConfirmId === goal.id ? (
              <button className="button ghost danger" type="button" data-testid="confirm-archive-goal" onClick={() => onArchive(goal.id)}>
                Confirmar arquivo
              </button>
            ) : (
              <button className="button ghost danger" type="button" data-testid="archive-goal" onClick={() => setArchiveConfirmId(goal.id)}>
                Arquivar
              </button>
            )}
          </>
        )}
        {goal.status === 'archived' && (
          <button className="button primary" type="button" data-testid="restore-goal" onClick={() => onRestore(goal.id)}>
            Restaurar
          </button>
        )}
      </div>
    </article>
  )
}

export function GoalsPanel() {
  const previousGoalStatusesRef = useRef<GoalStatusSnapshot | null>(null)
  const goals = useLiveQuery(() => db.goals.toArray(), [], [])
  const contributions = useLiveQuery(() => db.goalContributions.toArray(), [], [])
  const [formOpen, setFormOpen] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState('')
  const [goalForm, setGoalForm] = useState<GoalFormState>(emptyGoalForm)
  const [goalError, setGoalError] = useState('')
  const [selectedGoalId, setSelectedGoalId] = useState('')
  const [contributionMode, setContributionMode] = useState<ContributionMode>('reserve')
  const [contributionAmount, setContributionAmount] = useState('')
  const [contributionDate, setContributionDate] = useState(todayDateInputValue())
  const [contributionNote, setContributionNote] = useState('')
  const [contributionError, setContributionError] = useState('')
  const [archiveConfirmId, setArchiveConfirmId] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  const loaded = goals && contributions
  const allGoals = goals ?? []
  const allContributions = contributions ?? []
  const selectedGoal = allGoals.find((goal) => goal.id === selectedGoalId) ?? null
  const selectedContributions = selectedGoal
    ? [...allContributions].filter((contribution) => contribution.goalId === selectedGoal.id).sort((a, b) => b.date.localeCompare(a.date))
    : []

  const sections = useMemo(() => ({
    active: sortGoals(allGoals.filter((goal) => goal.status === 'active')),
    completed: sortGoals(allGoals.filter((goal) => goal.status === 'completed')),
    archived: sortGoals(allGoals.filter((goal) => goal.status === 'archived')),
  }), [allGoals])

  useEffect(() => {
    if (!goals) return

    if (!previousGoalStatusesRef.current) {
      previousGoalStatusesRef.current = snapshotGoalStatuses(goals)
      return
    }

    const completedGoals = detectNewGoalCompletions(previousGoalStatusesRef.current, goals)
    previousGoalStatusesRef.current = snapshotGoalStatuses(goals)

    completedGoals.forEach((goal) => {
      emitGoalCompleted({ goalId: goal.id, name: goal.name })
      audioEngine.mission()
    })
  }, [goals])

  function openCreateForm() {
    setEditingGoalId('')
    setGoalForm(emptyGoalForm)
    setGoalError('')
    setFormOpen(true)
  }

  function openEditForm(goal: Goal) {
    setEditingGoalId(goal.id)
    setGoalForm(goalFormFromGoal(goal))
    setGoalError('')
    setFormOpen(true)
  }

  async function submitGoal(event: FormEvent) {
    event.preventDefault()
    try {
      const draft = buildGoalDraft(goalForm)
      if (editingGoalId) {
        await updateGoal(editingGoalId, draft)
      } else {
        const created = await createGoal(draft)
        setSelectedGoalId(created.id)
      }
      setFormOpen(false)
      setEditingGoalId('')
      setGoalForm(emptyGoalForm)
      setGoalError('')
    } catch (error) {
      setGoalError(error instanceof Error ? error.message : 'N\u00e3o foi poss\u00edvel salvar a miss\u00e3o.')
    }
  }

  function openContribution(goalId: string, mode: ContributionMode) {
    setSelectedGoalId(goalId)
    setContributionMode(mode)
    setContributionAmount('')
    setContributionDate(todayDateInputValue())
    setContributionNote('')
    setContributionError('')
  }

  async function submitContribution(event: FormEvent) {
    event.preventDefault()
    if (!selectedGoal) return

    const parsedAmount = parseMoney(contributionAmount)
    const contributionIso = localDateTimeToIso(contributionDate, '12:00')
    if (parsedAmount === null) {
      setContributionError('Informe um valor v\u00e1lido.')
      return
    }
    if (!contributionIso) {
      setContributionError('Informe uma data v\u00e1lida.')
      return
    }

    try {
      await addGoalContribution(selectedGoal.id, {
        amount: contributionMode === 'withdraw' ? -parsedAmount : parsedAmount,
        date: contributionIso,
        note: contributionNote || undefined,
      })
      setContributionAmount('')
      setContributionNote('')
      setContributionError('')
    } catch (error) {
      setContributionError(error instanceof Error ? error.message : 'N\u00e3o foi poss\u00edvel registrar o ajuste.')
    }
  }

  async function confirmArchive(goalId: string) {
    await archiveGoal(goalId)
    if (selectedGoalId === goalId) setSelectedGoalId('')
    setArchiveConfirmId('')
  }

  async function restore(goalId: string) {
    await restoreGoal(goalId)
    setArchiveConfirmId('')
  }

  return (
    <section className="panel goals-panel" data-testid="goals-panel" aria-labelledby="goals-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">MISSÕES</span>
          <h2 id="goals-title">Quadro de missões</h2>
          <p className="muted">Reserve valores para objetivos sem transformar isso em despesa.</p>
        </div>
        <button className="button primary" type="button" data-testid="toggle-goal-form" onClick={openCreateForm}>
          Nova missão
        </button>
      </div>

      {formOpen && (
        <form className="goal-form" data-testid="goal-form" onSubmit={submitGoal}>
          <label>
            Nome
            <input
              data-testid="goal-name-input"
              value={goalForm.name}
              onChange={(event) => setGoalForm({ ...goalForm, name: event.target.value })}
              placeholder="Novo PC"
              autoComplete="off"
            />
          </label>
          <label>
            Descrição opcional
            <input
              data-testid="goal-description-input"
              value={goalForm.description}
              onChange={(event) => setGoalForm({ ...goalForm, description: event.target.value })}
              placeholder="Setup para trabalho e estudos"
              autoComplete="off"
            />
          </label>
          <label>
            Valor objetivo
            <input
              data-testid="goal-target-input"
              value={goalForm.targetAmount}
              onChange={(event) => setGoalForm({ ...goalForm, targetAmount: event.target.value })}
              inputMode="decimal"
              placeholder="R$ 5.000,00"
              autoComplete="off"
            />
          </label>
          <label>
            Prazo opcional
            <input
              data-testid="goal-target-date-input"
              value={goalForm.targetDate}
              onChange={(event) => setGoalForm({ ...goalForm, targetDate: event.target.value })}
              type="date"
            />
          </label>
          <label>
            Plano mensal opcional
            <input
              data-testid="goal-monthly-plan-input"
              value={goalForm.monthlyPlan}
              onChange={(event) => setGoalForm({ ...goalForm, monthlyPlan: event.target.value })}
              inputMode="decimal"
              placeholder="R$ 500,00"
              autoComplete="off"
            />
          </label>
          <label>
            Prioridade opcional
            <select
              data-testid="goal-priority-select"
              value={goalForm.priority}
              onChange={(event) => setGoalForm({ ...goalForm, priority: event.target.value as GoalFormState['priority'] })}
            >
              <option value="">Sem prioridade</option>
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
            </select>
          </label>
          {goalError && <p className="form-error" role="alert">{goalError}</p>}
          <div className="goal-form-actions">
            <button className="button primary" type="submit" data-testid="save-goal">
              {editingGoalId ? 'Salvar missão' : 'Criar missão'}
            </button>
            <button className="button ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {!loaded && <p className="empty-state">Carregando missões...</p>}
      {loaded && allGoals.length === 0 && (
        <div className="empty-state empty-state-guide">
          <strong>Nenhuma missao cadastrada ainda.</strong>
          <span>Crie uma missao para acompanhar uma reserva ou objetivo. Alocacoes de meta nao viram transacao automaticamente.</span>
        </div>
      )}

      {loaded && (
        <div className="goals-board">
          <div className="goals-section">
            <div className="section-heading">
              <strong>Ativas</strong>
              <span>{sections.active.length}</span>
            </div>
            <div className="goal-list">
              {sections.active.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  contributions={allContributions}
                  onDetails={setSelectedGoalId}
                  onEdit={openEditForm}
                  onContribution={openContribution}
                  onArchive={confirmArchive}
                  onRestore={restore}
                  archiveConfirmId={archiveConfirmId}
                  setArchiveConfirmId={setArchiveConfirmId}
                />
              ))}
            </div>
          </div>

          {sections.completed.length > 0 && (
            <div className="goals-section">
              <div className="section-heading">
                <strong>Concluídas</strong>
                <span>{sections.completed.length}</span>
              </div>
              <div className="goal-list">
                {sections.completed.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    contributions={allContributions}
                    onDetails={setSelectedGoalId}
                    onEdit={openEditForm}
                    onContribution={openContribution}
                    onArchive={confirmArchive}
                    onRestore={restore}
                    archiveConfirmId={archiveConfirmId}
                    setArchiveConfirmId={setArchiveConfirmId}
                  />
                ))}
              </div>
            </div>
          )}

          {sections.archived.length > 0 && (
            <div className="goals-section">
              <button className="button ghost archive-toggle" type="button" onClick={() => setShowArchived(!showArchived)}>
                Missões arquivadas ({sections.archived.length})
              </button>
              {showArchived && (
                <div className="goal-list archived-list">
                  {sections.archived.map((goal) => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      contributions={allContributions}
                      onDetails={setSelectedGoalId}
                      onEdit={openEditForm}
                      onContribution={openContribution}
                      onArchive={confirmArchive}
                      onRestore={restore}
                      archiveConfirmId={archiveConfirmId}
                      setArchiveConfirmId={setArchiveConfirmId}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {selectedGoal && (
        <aside className="goal-details" data-testid="mission-details" aria-label={`Detalhes da missao ${selectedGoal.name}`}>
          <div className="panel-title-row">
            <div>
              <span className="eyebrow">HISTÓRICO DA MISSÃO</span>
              <h3>{selectedGoal.name}</h3>
            </div>
            <button className="button ghost" type="button" onClick={() => setSelectedGoalId('')}>
              Fechar
            </button>
          </div>

          <form className="goal-contribution-form" data-testid="goal-contribution-form" onSubmit={submitContribution}>
            <p className="goal-allocation-notice" data-testid="goal-allocation-notice">
              Este valor será considerado reservado para a missão. Isso não cria uma despesa.
            </p>
            <label>
              {contributionMode === 'withdraw' ? 'Valor a retirar' : 'Valor a reservar'}
              <input
                data-testid="goal-contribution-amount"
                value={contributionAmount}
                onChange={(event) => setContributionAmount(event.target.value)}
                inputMode="decimal"
                placeholder="R$ 500,00"
                autoComplete="off"
              />
            </label>
            <label>
              Data
              <input
                data-testid="goal-contribution-date"
                value={contributionDate}
                onChange={(event) => setContributionDate(event.target.value)}
                type="date"
              />
            </label>
            <label>
              Nota opcional
              <input
                data-testid="goal-contribution-note"
                value={contributionNote}
                onChange={(event) => setContributionNote(event.target.value)}
                placeholder={contributionMode === 'withdraw' ? 'Ajuste da reserva' : 'Reserva inicial'}
                autoComplete="off"
              />
            </label>
            {contributionError && <p className="form-error" role="alert">{contributionError}</p>}
            <div className="goal-form-actions">
              <button className="button primary" type="submit" data-testid="save-goal-contribution">
                {contributionMode === 'withdraw' ? 'Registrar retirada' : 'Registrar reserva'}
              </button>
              <button
                className="button ghost"
                type="button"
                onClick={() => setContributionMode(contributionMode === 'reserve' ? 'withdraw' : 'reserve')}
              >
                {contributionMode === 'reserve' ? 'Mudar para retirada' : 'Mudar para reserva'}
              </button>
            </div>
          </form>

          <div className="goal-history">
            {selectedContributions.length === 0 && (
              <p className="empty-state">Nenhuma reserva registrada para esta missão.</p>
            )}
            {selectedContributions.map((contribution) => (
              <div className="goal-contribution-item" data-testid="goal-contribution-item" key={contribution.id}>
                <div>
                  <strong>{formatContributionDate(contribution.date)}</strong>
                  <span>{contribution.note ?? (contribution.amount < 0 ? 'Ajuste de retirada' : 'Reserva')}</span>
                </div>
                <strong className={contribution.amount < 0 ? 'expense' : 'income'}>{formatBRL(contribution.amount)}</strong>
              </div>
            ))}
          </div>
        </aside>
      )}
    </section>
  )
}
