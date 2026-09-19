import { useRef, useState, type ChangeEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/database'
import { deriveCsvImportPreview, type ImportCandidate, type ImportPreview } from '../finance/import/importPreview'
import { formatBRL } from '../lib/money'

const maxVisibleCandidates = 10
const maxVisibleRejectedRows = 8

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

export function ImportLocalFilePanel() {
  const existingTransactions = useLiveQuery(() => db.transactions.toArray(), [], [])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [error, setError] = useState('')
  const [isReading, setIsReading] = useState(false)

  function resetPreview() {
    setSelectedFileName('')
    setPreview(null)
    setError('')
    setIsReading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreview(null)
    setError('')

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
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado. Nenhuma movimentacao real foi criada.')
    } finally {
      setIsReading(false)
    }
  }

  const visibleCandidates = preview?.candidates.slice(0, maxVisibleCandidates) ?? []
  const hiddenCandidateCount = preview ? Math.max(0, preview.candidateCount - visibleCandidates.length) : 0
  const visibleRejectedRows = preview?.rejectedRows.slice(0, maxVisibleRejectedRows) ?? []
  const hiddenRejectedCount = preview ? Math.max(0, preview.rejectedCount - visibleRejectedRows.length) : 0

  return (
    <section className="panel import-panel" data-testid="import-local-file-panel" aria-labelledby="import-local-file-title" aria-busy={isReading}>
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">IMPORTACAO LOCAL</span>
          <h2 id="import-local-file-title">Importar extrato CSV</h2>
          <p className="muted">Leia um arquivo CSV localmente e veja uma previa antes de criar qualquer movimentacao.</p>
        </div>
      </div>

      <div className="import-local-note">
        <strong>Nenhum dado e enviado.</strong>
        <span>O arquivo e lido apenas neste dispositivo. Nesta etapa, a importacao ainda e previa; nenhuma movimentacao real sera criada.</span>
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
            disabled={isReading}
          />
        </label>
        {selectedFileName ? <span className="import-selected-file">Arquivo: {selectedFileName}</span> : <span className="import-selected-file">Nenhum arquivo selecionado.</span>}
        {(selectedFileName || preview || error) && (
          <button className="button compact ghost" type="button" onClick={resetPreview} disabled={isReading}>
            Limpar previa
          </button>
        )}
      </div>

      {isReading && <p className="import-status">Lendo arquivo local...</p>}
      {error && <p className="form-error" role="alert" data-testid="import-csv-error">{error}</p>}

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
              <div className="import-candidate-list">
                {visibleCandidates.map((candidate) => (
                  <article className="import-candidate-card" key={candidate.id}>
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
              {hiddenCandidateCount > 0 && <p className="import-list-note">Mostrando {visibleCandidates.length} de {preview.candidateCount} candidatos.</p>}
            </div>
          ) : (
            <p className="import-empty-state">Nenhum candidato valido foi encontrado neste arquivo.</p>
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

          <p className="import-next-step">Confirmacao de importacao entrara na proxima etapa. Nenhuma movimentacao real foi criada.</p>
        </div>
      )}
    </section>
  )
}
