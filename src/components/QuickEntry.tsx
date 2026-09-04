import { useState } from 'react'
import { recordTransaction } from '../finance/transactions'
import { audioEngine } from '../lib/audio'
import { parseQuickEntry } from '../lib/quickParser'
import { formatBRL } from '../lib/money'

export function QuickEntry() {
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof parseQuickEntry>>(null)
  const [error, setError] = useState('')

  function analyze() {
    audioEngine.click()
    const parsed = parseQuickEntry(input)
    if (!parsed) {
      setPreview(null)
      setError('Nao encontrei um valor. Ex.: "gastei 39,90 no mercado no pix".')
      return
    }
    setError('')
    setPreview(parsed)
  }

  async function confirm() {
    if (!preview) return

    const transaction = await recordTransaction(preview)
    transaction.type === 'income' ? audioEngine.income() : audioEngine.expense()
    setInput('')
    setPreview(null)
  }

  return (
    <section className="panel quick-panel">
      <span className="eyebrow">INPUT RAPIDO</span>
      <h2>Conte o que aconteceu</h2>
      <p className="muted">Funciona localmente por regras, sem mandar seus gastos para uma IA.</p>

      <div className="quick-row">
        <input
          data-testid="quick-entry-input"
          autoComplete="off"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setPreview(null)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') analyze()
          }}
          placeholder="Ex.: gastei 39,90 no mercado no pix"
          aria-label="Descreva uma movimentacao financeira"
        />
        <button data-testid="quick-entry-analyze" className="button primary" onClick={analyze}>Analisar</button>
      </div>

      {error && <div className="message error">{error}</div>}

      {preview && (
        <div className="preview-card">
          <div>
            <span className="eyebrow">PREVIA</span>
            <strong>{preview.description}</strong>
            <span>{preview.category} - {preview.paymentMethod.toUpperCase()}</span>
          </div>
          <div className={preview.type === 'income' ? 'money income' : 'money expense'}>
            {preview.type === 'income' ? '+' : '-'} {formatBRL(preview.amount)}
          </div>
          <button data-testid="quick-entry-confirm" className="button success" onClick={confirm}>Confirmar</button>
        </div>
      )}
    </section>
  )
}

