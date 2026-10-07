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
    <section className="month-nav panel" aria-label="Navegação mensal">
      <button
        className="icon-button"
        type="button"
        data-testid="month-prev"
        aria-label="Mês anterior"
        onClick={() => onChange(previousMonth(selectedMonth))}
      >
        &#8249;
      </button>
      <div>
        <span className="eyebrow">M&Ecirc;S EM AN&Aacute;LISE</span>
        <strong data-testid="selected-month-label">{formatMonthYear(selectedMonth)}</strong>
      </div>
      <button
        className="icon-button"
        type="button"
        data-testid="month-next"
        aria-label="Próximo mês"
        onClick={() => onChange(nextMonth(selectedMonth))}
      >
        &#8250;
      </button>
      <button
        className="button ghost"
        type="button"
        data-testid="month-today"
        disabled={isCurrentMonth}
        aria-label="Voltar ao mês atual"
        onClick={() => onChange(currentMonth)}
      >
        Hoje
      </button>
    </section>
  )
}
