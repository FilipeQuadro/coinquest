import { useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import type { PaymentMethod } from '../db/types'
import { deriveCsvImportPreview, type ImportCandidate, type ImportPreview } from '../finance/import/importPreview'
import { recordTransaction } from '../finance/transactions'
import { formatBRL } from '../lib/money'

const maxVisibleRejectedRows = 8
const csvImportPaymentMethod: PaymentMethod = 'other'

function delimiterLabel(delimiter: ImportPreview['delimiter']) {
  if (delimiter === null) return 'Nao detectado'
  if (delimiter === '\t') return 'Tab'
  return delimiter
}

function typeLabel(type: ImportCandidate['type']) {
  return type === 'income' ? 'Entrada' : 'Saida'
}

function formatCandidateDate(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'Data invalida'
  return date.toLocaleDateString('pt-BR')
}

function isSupportedCsvFile(file: File) {
  const lowerName = file.name.toLocaleLowerCase('pt-BR')
  return lowerName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'text/plain'
}

function needsManualReview(candidate: ImportCandidate) {
  return Boolean(candidate.duplicateWarning) || candidate.warnings.some((warning) => (
    warning.toLocaleLowerCase('pt-BR').includes('cartao/fatura')
  ))
}

export function ImportLocalFilePanel() {
  const existingTransactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  function resetPreview() {
    setSelectedFileName('')
    setPreview(null)
    setSelectedCandidateIds([])
    setConfirmOpen(false)
    setError('')
    setSuccessMessage('')
    setIsReading(false)
    setIsImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function selectSafeCandidates(nextPreview: ImportPreview) {
    setSelectedCandidateIds(nextPreview.candidates.filter((candidate) => !needsManualReview(candidate)).map((candidate) => candidate.id))
  }

  function toggleCandidate(candidateId: string) {
    setConfirmOpen(false)
    setSuccessMessage('')
    setSelectedCandidateIds((current) => (
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId]
    ))
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreview(null)
    setSelectedCandidateIds([])
    setConfirmOpen(false)
    setError('')
    setSuccessMessage('')

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)

    if (!isSupportedCsvFile(file)) {
      setError('Selecione um arquivo CSV ou texto simples para gerar a previa.')
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
      setError('Nao foi possivel ler o arquivo selecionado. Nenhuma movimentacao real foi criada.')
    } finally {
      setIsReading(false)
    }
  }

  async function confirmSelectedImport() {
    if (!preview || selectedCandidateIds.length === 0 || isImporting) return

    const selectedIds = new Set(selectedCandidateIds)
    const selectedCandidates = preview.candidates.filter((candidate) => selectedIds.has(candidate.id))
    let createdCount = 0

    setIsImporting(true)
    setError('')
    setSuccessMessage('')

    try {
      for (const candidate of selectedCandidates) {
        await recordTransaction({
          type: candidate.type,
          amount: candidate.amount,
          description: candidate.description,
          category: candidate.category ?? 'Outros',
          paymentMethod: csvImportPaymentMethod,
          occurredAt: candidate.occurredAt,
        })
        createdCount += 1
      }

      setSuccessMessage(`${createdCount} ${createdCount === 1 ? 'movimentacao real criada' : 'movimentacoes reais criadas'}.`)
      setSelectedCandidateIds([])
      setConfirmOpen(false)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Nao foi possivel concluir a importacao selecionada.'
      setError(createdCount > 0
        ? `${createdCount} ${createdCount === 1 ? 'movimentacao real foi criada' : 'movimentacoes reais foram criadas'} antes do erro. ${message}`
        : `${message} Nenhuma movimentacao real foi criada.`)
    } finally {
      setIsImporting(false)
    }
  }

  const visibleCandidates = preview?.candidates ?? []
  const visibleRejectedRows = preview?.rejectedRows.slice(0, maxVisibleRejectedRows) ?? []
  const hiddenRejectedCount = preview ? Math.max(0, preview.rejectedCount - visibleRejectedRows.length) : 0
  const selectedCount = selectedCandidateIds.length
  const selectedAmount = preview
    ? preview.candidates
      .filter((candidate) => selectedCandidateIds.includes(candidate.id))
      .reduce((sum, candidate) => sum + candidate.amount, 0)
    : 0

  return (
    <section className="panel import-panel" data-testid="import-local-file-panel" aria-labelledby="import-local-file-title" aria-busy={isReading || isImporting}>
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">IMPORTACAO LOCAL</span>
          <h2 id="import-local-file-title">Importar extrato CSV</h2>
          <p className="muted">Leia um arquivo CSV localmente e veja uma previa antes de criar qualquer movimentacao.</p>
        </div>
      </div>

      <div className="import-local-note">
        <strong>Nenhum dado e enviado.</strong>
        <span>O arquivo e lido apenas neste dispositivo. Movimentacoes reais so sao criadas depois da confirmacao manual.</span>
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
            Limpar previa
          </button>
        )}
      </div>

      {isReading && <p className="import-status">Lendo arquivo local...</p>}
      {error && <p className="form-error" role="alert" data-testid="import-csv-error">{error}</p>}
      {successMessage && <p className="success-text" data-testid="import-csv-success">{successMessage}</p>}

      {!preview && !error && !isReading && (
        <p className="import-empty-state">Escolha um CSV de extrato bancario para ver candidatos, avisos e linhas ignoradas na previa.</p>
      )}

      {preview && (
        <div className="import-preview" data-testid="import-csv-preview">
          <div className="import-preview-summary" aria-label="Resumo da previa de importacao CSV">
            <span>Delimitador <strong>{delimiterLabel(preview.delimiter)}</strong></span>
            <span>Linhas lidas <strong>{preview.totalRows}</strong></span>
            <span>Candidatos <strong>{preview.candidateCount}</strong></span>
            <span>Ignoradas <strong>{preview.rejectedCount}</strong></span>
            <span>Possiveis duplicatas <strong>{preview.duplicateWarningCount}</strong></span>
          </div>

          {preview.warnings.length > 0 && (
            <div className="import-warning-box" data-testid="import-csv-warnings">
              {preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}

          {visibleCandidates.length > 0 ? (
            <div className="import-candidate-section">
              <div className="section-heading">
                <strong>Candidatos na previa</strong>
                <span>{preview.candidateCount}</span>
              </div>
              <div className="import-selection-summary" data-testid="import-selection-summary">
                <strong>{selectedCount} {selectedCount === 1 ? 'selecionado' : 'selecionados'} para confirmacao</strong>
                <span>Total dos selecionados: {formatBRL(selectedAmount)}. Possiveis duplicatas e cartao/fatura ficam desmarcados por padrao.</span>
                <div>
                  <button className="button compact ghost" type="button" onClick={() => selectSafeCandidates(preview)} disabled={isImporting}>
                    Selecionar candidatos sem aviso
                  </button>
                  <button className="button compact ghost" type="button" onClick={() => {
                    setSelectedCandidateIds([])
                    setConfirmOpen(false)
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
                      <span>{selectedCandidateIds.includes(candidate.id) ? 'Selecionado' : 'Nao selecionado'}</span>
                    </label>
                    <div className="import-candidate-main">
                      <span>Linha {candidate.rowNumber} - {formatCandidateDate(candidate.occurredAt)}</span>
                      <strong>{candidate.description}</strong>
                      <small>{candidate.category ? `Categoria: ${candidate.category}` : 'Sem categoria no arquivo'}</small>
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
                  Revisar confirmacao selecionada
                </button>
              </div>
            </div>
          ) : (
            <p className="import-empty-state">Nenhum candidato valido foi encontrado neste arquivo.</p>
          )}

          {confirmOpen && preview && selectedCount > 0 && (
            <div className="import-confirm-box" data-testid="import-confirm-box">
              <strong>Confirmacao manual de importacao</strong>
              <p>{selectedCount} {selectedCount === 1 ? 'candidato selecionado criara' : 'candidatos selecionados criarao'} movimentacoes reais no Historico.</p>
              <p>A forma de pagamento sera registrada como Outro porque o CSV de extrato nao informa esse campo com seguranca.</p>
              <p>Revise possiveis duplicatas e descricoes de cartao/fatura antes de confirmar.</p>
              <div className="goal-form-actions">
                <button className="button ghost" type="button" onClick={() => setConfirmOpen(false)} disabled={isImporting}>
                  Voltar para previa
                </button>
                <button className="button primary" type="button" data-testid="import-confirm-selected" onClick={confirmSelectedImport} disabled={isImporting}>
                  {isImporting ? 'Criando...' : 'Confirmar importacao selecionada'}
                </button>
              </div>
            </div>
          )}

          {visibleRejectedRows.length > 0 && (
            <div className="import-rejected-section">
              <div className="section-heading">
                <strong>Linhas ignoradas na previa</strong>
                <span>{preview.rejectedCount}</span>
              </div>
              <p>Essas linhas nao serao consideradas sem correcao do arquivo.</p>
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

          <p className="import-next-step">Apenas candidatos selecionados e confirmados viram movimentacoes reais. Linhas ignoradas nao sao importadas.</p>
        </div>
      )}
    </section>
  )
}
