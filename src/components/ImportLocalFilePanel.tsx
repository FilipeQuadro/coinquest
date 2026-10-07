import { useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { PaymentMethod, Transaction } from '../db/types'
import { deriveCsvImportPreview, type ImportCandidate, type ImportPreview } from '../finance/import/importPreview'
import { recordTransaction } from '../finance/transactions'
import { useCategoryOptions } from '../lib/useCategoryOptions'
import { formatBRL } from '../lib/money'

const maxVisibleRejectedRows = 8
const csvImportPaymentMethod: PaymentMethod = 'other'
const csvExampleFileName = 'coinquest-modelo-extrato.csv'
const csvExampleText = [
  'data;descricao;valor;categoria',
  '12/09/2026;Mercado;-123,45;Alimentacao',
  '13/09/2026;Salario;2500,00;Receita',
].join('\n')

function delimiterLabel(delimiter: ImportPreview['delimiter']) {
  if (delimiter === null) return 'Não detectado'
  if (delimiter === '\t') return 'Tab'
  return delimiter
}

function typeLabel(type: ImportCandidate['type']) {
  return type === 'income' ? 'Entrada' : 'Saída'
}

function categoryDatalistId(type: ImportCandidate['type']) {
  return type === 'income' ? 'import-category-options-income' : 'import-category-options-expense'
}

function formatCandidateDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Data inválida'
  return date.toLocaleDateString('pt-BR')
}

function isSupportedCsvFile(file: File) {
  const lowerName = file.name.toLocaleLowerCase('pt-BR')
  return lowerName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain'
}

function needsManualReview(candidate: ImportCandidate) {
  return Boolean(candidate.duplicateWarning) || candidate.warnings.some((warning) => (
    warning.toLocaleLowerCase('pt-BR').includes('cartão/fatura')
  ))
}

export function ImportLocalFilePanel() {
  const existingTransactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const incomeCategoryOptions = useCategoryOptions('transaction-income')
  const expenseCategoryOptions = useCategoryOptions('transaction-expense')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [editedCategoriesByCandidateId, setEditedCategoriesByCandidateId] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [createdTransactions, setCreatedTransactions] = useState<Transaction[]>([])
  const [exampleFeedback, setExampleFeedback] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  function resetPreview() {
    setSelectedFileName('')
    setPreview(null)
    setSelectedCandidateIds([])
    setEditedCategoriesByCandidateId({})
    setConfirmOpen(false)
    setError('')
    setSuccessMessage('')
    setCreatedTransactions([])
    setExampleFeedback('')
    setIsReading(false)
    setIsImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function selectSafeCandidates(nextPreview: ImportPreview) {
    setConfirmOpen(false)
    setSuccessMessage('')
    setCreatedTransactions([])
    setSelectedCandidateIds(nextPreview.candidates.filter((candidate) => !needsManualReview(candidate)).map((candidate) => candidate.id))
  }

  function toggleCandidate(candidateId: string) {
    setConfirmOpen(false)
    setSuccessMessage('')
    setCreatedTransactions([])
    setSelectedCandidateIds((current) => (
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    ))
  }

  function defaultCategoryForCandidate(candidate: ImportCandidate) {
    return candidate.category?.trim() || 'Outros'
  }

  function effectiveCategoryForCandidate(candidate: ImportCandidate) {
    return editedCategoriesByCandidateId[candidate.id]?.trim() || defaultCategoryForCandidate(candidate)
  }

  function updateCandidateCategory(candidateId: string, value: string) {
    setConfirmOpen(false)
    setSuccessMessage('')
    setCreatedTransactions([])
    setEditedCategoriesByCandidateId((current) => ({ ...current, [candidateId]: value }))
  }

  function normalizeCandidateCategory(candidate: ImportCandidate) {
    const currentValue = editedCategoriesByCandidateId[candidate.id]
    if (currentValue === undefined) return

    const trimmed = currentValue.trim()
    const defaultCategory = defaultCategoryForCandidate(candidate)
    setEditedCategoriesByCandidateId((current) => {
      const next = { ...current }
      if (!trimmed || trimmed === defaultCategory) delete next[candidate.id]
      else next[candidate.id] = trimmed
      return next
    })
  }

  function resetCandidateCategory(candidateId: string) {
    setConfirmOpen(false)
    setSuccessMessage('')
    setCreatedTransactions([])
    setEditedCategoriesByCandidateId((current) => {
      const next = { ...current }
      delete next[candidateId]
      return next
    })
  }

  async function copyCsvExample() {
    setExampleFeedback('')

    if (!navigator.clipboard?.writeText) {
      setExampleFeedback('Copia automática indisponivel neste navegador.')
      return
    }

    try {
      await navigator.clipboard.writeText(csvExampleText)
      setExampleFeedback('Exemplo copiado.')
    } catch {
      setExampleFeedback('Não foi possível copiar o exemplo automaticamente.')
    }
  }

  function downloadCsvExample() {
    const blob = new Blob([csvExampleText], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = csvExampleFileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setExampleFeedback('Modelo CSV gerado neste dispositivo.')
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreview(null)
    setSelectedCandidateIds([])
    setEditedCategoriesByCandidateId({})
    setConfirmOpen(false)
    setError('')
    setSuccessMessage('')
    setCreatedTransactions([])

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)

    if (!isSupportedCsvFile(file)) {
      setError('Selecione um arquivo CSV ou texto simples para gerar a prévia.')
      return
    }

    setIsReading(true)

    try {
      const text = await file.text()
      const nextPreview = deriveCsvImportPreview({
        text,
        existingTransactions,
        sourceKind: 'bank-statement',
      })
      setPreview(nextPreview)
      selectSafeCandidates(nextPreview)
    } catch {
      setError('Não foi possível ler o arquivo selecionado. Nenhuma movimentação real foi criada.')
    } finally {
      setIsReading(false)
    }
  }

  async function confirmSelectedImport() {
    if (!preview || selectedCandidateIds.length === 0 || isImporting) return

    const selectedIds = new Set(selectedCandidateIds)
    const selectedCandidates = preview.candidates.filter((candidate) => selectedIds.has(candidate.id))
    const createdDuringImport: Transaction[] = []
    let createdCount = 0

    setIsImporting(true)
    setError('')
    setSuccessMessage('')
    setCreatedTransactions([])

    try {
      for (const candidate of selectedCandidates) {
        const createdTransaction = await recordTransaction({
          type: candidate.type,
          amount: candidate.amount,
          description: candidate.description,
          category: effectiveCategoryForCandidate(candidate),
          paymentMethod: csvImportPaymentMethod,
          occurredAt: candidate.occurredAt,
        })
        createdDuringImport.push(createdTransaction)
        createdCount += 1
      }

      setCreatedTransactions(createdDuringImport)
      setSuccessMessage(`${createdCount} ${createdCount === 1 ? 'movimentação real criada' : 'movimentações reais criadas'}.`)
      setSelectedCandidateIds([])
      setConfirmOpen(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Não foi possível concluir a importação selecionada.'
      setCreatedTransactions(createdDuringImport)
      setError(createdCount > 0
        ? `${createdCount} ${createdCount === 1 ? 'movimentação real foi criada' : 'movimentações reais foram criadas'} antes do erro. ${message}`
        : `${message} Nenhuma movimentação real foi criada.`)
    } finally {
      setIsImporting(false)
    }
  }

  const visibleCandidates = preview?.candidates ?? []
  const visibleRejectedRows = preview?.rejectedRows.slice(0, maxVisibleRejectedRows) ?? []
  const hiddenRejectedCount = preview ? Math.max(0, preview.rejectedCount - visibleRejectedRows.length) : 0
  const selectedCount = selectedCandidateIds.length
  const selectedCandidates = preview
    ? preview.candidates
      .filter((candidate) => selectedCandidateIds.includes(candidate.id))
    : []
  const selectedIncomeAmount = selectedCandidates
    .filter((candidate) => candidate.type === 'income')
    .reduce((sum, candidate) => sum + candidate.amount, 0)
  const selectedExpenseAmount = selectedCandidates
    .filter((candidate) => candidate.type === 'expense')
    .reduce((sum, candidate) => sum + candidate.amount, 0)

  return (
    <section className="panel import-panel" data-testid="import-local-file-panel" aria-labelledby="import-local-file-title" aria-busy={isReading || isImporting}>
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">IMPORTAÇÃO LOCAL</span>
          <h2 id="import-local-file-title">Importar extrato CSV</h2>
          <p className="muted">Leia um arquivo CSV localmente e veja uma prévia antes de criar qualquer movimentação.</p>
        </div>
      </div>

      <div className="import-local-note">
        <strong>Nenhum dado e enviado.</strong>
        <span>O arquivo é lido apenas neste dispositivo. Movimentações reais só são criadas depois da confirmação manual.</span>
      </div>

      <div className="import-example-card" aria-labelledby="import-example-title">
        <div>
          <strong id="import-example-title">Exemplo básico</strong>
          <p>Use como referência para montar um CSV simples. O arquivo real pode variar conforme o banco; a prévia vai mostrar candidatos, avisos e linhas ignoradas antes de qualquer confirmação.</p>
        </div>
        <pre aria-label="Exemplo de CSV aceito"><code>{csvExampleText}</code></pre>
        <div className="import-example-actions">
          <button className="button compact ghost" type="button" onClick={copyCsvExample}>
            Copiar exemplo
          </button>
          <button className="button compact ghost" type="button" onClick={downloadCsvExample}>
            Baixar modelo CSV
          </button>
        </div>
        {exampleFeedback && <span className="import-example-feedback" role="status">{exampleFeedback}</span>}
      </div>

      <div className="import-file-row">
        <label className="button ghost import-file-button">
          Selecionar CSV
          <input
            ref={fileInputRef}
            data-testid="import-csv-input"
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={handleFileChange}
            disabled={isReading || isImporting}
          />
        </label>
        {selectedFileName ? <span className="import-selected-file">Arquivo: {selectedFileName}</span> : <span className="import-selected-file">Nenhum arquivo selecionado.</span>}
        {(selectedFileName || preview || error) && (
          <button className="button compact ghost" type="button" onClick={resetPreview} disabled={isReading || isImporting}>
            Limpar prévia
          </button>
        )}
      </div>

      {isReading && <p className="import-status">Lendo arquivo local...</p>}
      {error && <p className="form-error" role="alert" data-testid="import-csv-error">{error}</p>}
      {successMessage && <p className="success-text" data-testid="import-csv-success">{successMessage}</p>}

      {!preview && !error && !isReading && (
        <p className="import-empty-state">Escolha um CSV de extrato bancário para ver candidatos, avisos e linhas ignoradas na prévia.</p>
      )}

      {preview && (
        <div className="import-preview" data-testid="import-csv-preview">
          <div className="import-preview-summary" aria-label="Resumo da prévia de importação CSV">
            <span>Delimitador <strong>{delimiterLabel(preview.delimiter)}</strong></span>
            <span>Linhas lidas <strong>{preview.totalRows}</strong></span>
            <span>Candidatos <strong>{preview.candidateCount}</strong></span>
            <span>Ignoradas <strong>{preview.rejectedCount}</strong></span>
            <span>Possíveis duplicatas <strong>{preview.duplicateWarningCount}</strong></span>
          </div>

          {preview.warnings.length > 0 && (
            <div className="import-warning-box" data-testid="import-csv-warnings">
              {preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}

          {visibleCandidates.length > 0 ? (
            <div className="import-candidate-section">
              <div className="section-heading">
                <strong>Candidatos na prévia</strong>
                <span>{preview.candidateCount}</span>
              </div>
              <div className="import-selection-summary" data-testid="import-selection-summary">
                <strong>{selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'} para confirmação</strong>
                <div className="import-selection-totals" aria-label="Totais separados dos candidatos selecionados">
                  <span>Entradas selecionadas <strong className="income">{formatBRL(selectedIncomeAmount)}</strong></span>
                  <span>Saídas selecionadas <strong className="expense">{formatBRL(selectedExpenseAmount)}</strong></span>
                </div>
                <span>Arquivos CSV de extrato não informam forma de pagamento com segurança. Movimentações criadas aqui serão registradas como Outro e podem ser revisadas depois no Histórico.</span>
                <span>Revise as categorias antes de confirmar; as categorias escolhidas aqui serão usadas nas movimentações reais criadas.</span>
                <span>Possíveis duplicatas e cartão/fatura ficam desmarcados por padrão.</span>
                <div>
                  <button className="button compact ghost" type="button" onClick={() => selectSafeCandidates(preview)} disabled={isImporting}>
                    Selecionar candidatos sem aviso
                  </button>
                  <button className="button compact ghost" type="button" onClick={() => {
                    setSelectedCandidateIds([])
                    setConfirmOpen(false)
                    setCreatedTransactions([])
                  }} disabled={isImporting || selectedCount === 0}>
                    Desmarcar todos
                  </button>
                </div>
              </div>
              <div className="import-candidate-list">
                {visibleCandidates.map((candidate) => (
                  <article className="import-candidate-card" key={candidate.id}>
                    <label className="import-candidate-select">
                      <input
                        data-testid="import-candidate-checkbox"
                        type="checkbox"
                        checked={selectedCandidateIds.includes(candidate.id)}
                        onChange={() => toggleCandidate(candidate.id)}
                        disabled={isImporting}
                      />
                      <span>{selectedCandidateIds.includes(candidate.id) ? 'Selecionado' : 'Não selecionado'}</span>
                    </label>
                    <div className="import-candidate-main">
                      <span>Linha {candidate.rowNumber} - {formatCandidateDate(candidate.occurredAt)}</span>
                      <strong>{candidate.description}</strong>
                      <div className="import-candidate-category">
                        <label>
                          Categoria para importar
                          <input
                            data-testid="import-candidate-category-input"
                            list={categoryDatalistId(candidate.type)}
                            value={editedCategoriesByCandidateId[candidate.id] ?? defaultCategoryForCandidate(candidate)}
                            onChange={(event) => updateCandidateCategory(candidate.id, event.target.value)}
                            onBlur={() => normalizeCandidateCategory(candidate)}
                            disabled={isImporting}
                            autoComplete="off"
                          />
                        </label>
                        {editedCategoriesByCandidateId[candidate.id] !== undefined && (
                          <button className="button compact ghost" type="button" onClick={() => resetCandidateCategory(candidate.id)} disabled={isImporting}>
                            Restaurar
                          </button>
                        )}
                        <small>{candidate.category ? `Categoria do arquivo: ${candidate.category}` : 'Sem categoria no arquivo; fallback Outros.'}</small>
                      </div>
                    </div>
                    <div className="import-candidate-value">
                      <span className={`import-type-chip type-${candidate.type}`}>{typeLabel(candidate.type)}</span>
                      <strong className={candidate.type === 'income' ? 'income' : 'expense'}>
                        {candidate.type === 'income' ? '+' : '-'} {formatBRL(candidate.amount)}
                      </strong>
                    </div>
                    {candidate.warnings.length > 0 && (
                      <ul className="import-candidate-warnings" aria-label={`Avisos da linha ${candidate.rowNumber}`}>
                        {candidate.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
              <div className="import-confirm-actions">
                <button
                  className="button primary"
                  type="button"
                  data-testid="import-review-confirmation"
                  onClick={() => setConfirmOpen(true)}
                  disabled={selectedCount === 0 || isImporting}
                >
                  Revisar confirmação selecionada
                </button>
              </div>
            </div>
          ) : (
            <p className="import-empty-state">Nenhum candidato válido foi encontrado neste arquivo.</p>
          )}

          {confirmOpen && preview && selectedCount > 0 && (
            <div className="import-confirm-box" data-testid="import-confirm-box">
              <strong>Confirmação manual de importação</strong>
              <p>Somente {selectedCount} {selectedCount === 1 ? 'candidato selecionado será criado' : 'candidatos selecionados serão criados'} como movimentações reais no Histórico.</p>
              <p>Candidatos desmarcados e linhas ignoradas não serão importados.</p>
              <p>A forma de pagamento será registrada como Outro porque o CSV de extrato não informa esse campo com segurança.</p>
              <p>As categorias revisadas na prévia serão usadas nas movimentações reais criadas.</p>
              <p>Revise possíveis duplicatas e descrições de cartão/fatura antes de confirmar.</p>
              <div className="goal-form-actions">
                <button className="button ghost" type="button" onClick={() => setConfirmOpen(false)} disabled={isImporting}>
                  Voltar para prévia
                </button>
                <button className="button primary" type="button" data-testid="import-confirm-selected" onClick={confirmSelectedImport} disabled={isImporting}>
                  {isImporting ? 'Criando...' : 'Confirmar importação selecionada'}
                </button>
              </div>
            </div>
          )}

          {createdTransactions.length > 0 && (
            <section className="import-created-records" data-testid="import-created-records" aria-labelledby="import-created-records-title">
              <div className="import-created-records-header">
                <div>
                  <strong id="import-created-records-title">Movimentações criadas</strong>
                  <p>As movimentações abaixo já foram criadas como registros reais. Revise no Histórico para ajustar descrição, categoria, forma de pagamento, data, tipo ou valor.</p>
                  <p>Se alguma data estiver em outro mês, ajuste o mês no topo do app para localizar o registro no Histórico.</p>
                </div>
                <a className="button primary compact" data-testid="import-review-history" href="#historico">Revisar no Histórico</a>
              </div>
              <div className="import-created-list">
                {createdTransactions.map((transaction) => (
                  <article className="import-created-record" data-testid="import-created-record" key={transaction.id}>
                    <div>
                      <span>{formatCandidateDate(transaction.occurredAt)} - {typeLabel(transaction.type)}</span>
                      <strong>{transaction.description}</strong>
                      <small>{transaction.category} - Outro</small>
                    </div>
                    <strong className={transaction.type === 'income' ? 'income' : 'expense'}>
                      {transaction.type === 'income' ? '+' : '-'} {formatBRL(transaction.amount)}
                    </strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          {visibleRejectedRows.length > 0 && (
            <div className="import-rejected-section">
              <div className="section-heading">
                <strong>Linhas ignoradas na prévia</strong>
                <span>{preview.rejectedCount}</span>
              </div>
              <p>Essas linhas não serão consideradas sem correção do arquivo.</p>
              <div className="import-rejected-list">
                {visibleRejectedRows.map((row) => (
                  <article className="import-rejected-row" key={`${row.rowNumber}-${row.reason}`}>
                    <strong>Linha {row.rowNumber}</strong>
                    <span>{row.reason}</span>
                  </article>
                ))}
              </div>
              {hiddenRejectedCount > 0 && <p className="import-list-note">Mostrando {visibleRejectedRows.length} de {preview.rejectedCount} linhas ignoradas.</p>}
            </div>
          )}

          <p className="import-next-step">Apenas candidatos selecionados e confirmados viram movimentações reais. Linhas ignoradas não são importadas.</p>
          <datalist id="import-category-options-income">
            {incomeCategoryOptions.map((category) => <option key={category} value={category} />)}
          </datalist>
          <datalist id="import-category-options-expense">
            {expenseCategoryOptions.map((category) => <option key={category} value={category} />)}
          </datalist>
        </div>
      )}
    </section>
  )
}
