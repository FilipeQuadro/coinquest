import type { SelectedMonth } from '../finance/month'
import { formatMonthYear, isSameMonth, monthFromDate, nextMonth, previousMonth } from '../finance/month'

interface MonthNavigatorProps {
  selectedMonth: SelectedMonth
  onChange: (month: SelectedMonth) => void
}

export function MonthNavigator({ selectedMonth, onChange }: MonthNavigatorProps) {
  const currentMonth = monthFromDate()
  const isCurrentMonth = isSameMonth(selectedMonth, currentMonth)

  return (
    <section className="month-nav panel" aria-label="Navegacao mensal">
      <button
        className="icon-button"
        type="button"
        data-testid="month-prev"
        aria-label="Mes anterior"
        onClick={() => onChange(previousMonth(selectedMonth))}
      >
        &lt;
      </button>
      <div>
        <span className="eyebrow">MES EM ANALISE</span>
        <strong data-testid="selected-month-label">{formatMonthYear(selectedMonth)}</strong>
      </div>
      <button
        className="icon-button"
        type="button"
        data-testid="month-next"
        aria-label="Proximo mes"
        onClick={() => onChange(nextMonth(selectedMonth))}
      >
        &gt;
      </button>
      <button
        className="button ghost"
        type="button"
        data-testid="month-today"
        disabled={isCurrentMonth}
        aria-label="Voltar ao mes atual"
        onClick={() => onChange(currentMonth)}
      >
        Hoje
      </button>
    </section>
  )
}
