import { useRef, useState, type ChangeEvent } from 'react'
import { backupFilename, exportBackup, importBackup, inspectBackup, type BackupInspection } from '../backup/backup'
import {
  decryptBackupPayload,
  encryptBackupPayload,
  isEncryptedBackupJson,
  minimumBackupPasswordLength,
  protectedBackupFilename,
} from '../backup/encryptedBackup'
import { buildBackupPreview, type BackupPreviewFileType } from '../backup/backupPreview'

function formatBackupDate(value: string | null) {
  if (!value) return 'Data nao informada'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function BackupPanel() {
  const [selectedFileName, setSelectedFileName] = useState('')
  const [pendingImport, setPendingImport] = useState('')
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState('')
  const [inspection, setInspection] = useState<BackupInspection | null>(null)
  const [backupFileType, setBackupFileType] = useState<BackupPreviewFileType>('plain')
  const [importOpen, setImportOpen] = useState(false)
  const [passwordExportOpen, setPasswordExportOpen] = useState(false)
  const [encryptedImportOpen, setEncryptedImportOpen] = useState(false)
  const [exportPassword, setExportPassword] = useState('')
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('')
  const [importPassword, setImportPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleExport() {
    setBusy(true)
    setMessage('')
    setError('')

    try {
      const json = await exportBackup()
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = backupFilename()
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage('Backup exportado.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel exportar o backup.')
    } finally {
      setBusy(false)
    }
  }

  async function handleProtectedExport() {
    if (exportPassword.length < minimumBackupPasswordLength) {
      setError(`A senha deve ter pelo menos ${minimumBackupPasswordLength} caracteres.`)
      return
    }
    if (exportPassword !== exportPasswordConfirm) {
      setError('As senhas nao conferem.')
      return
    }

    setBusy(true)
    setMessage('')
    setError('')

    try {
      const json = await exportBackup()
      const encrypted = await encryptBackupPayload(json, exportPassword)
      const blob = new Blob([encrypted], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = protectedBackupFilename()
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setMessage('Backup protegido exportado.')
      setExportPassword('')
      setExportPasswordConfirm('')
      setPasswordExportOpen(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel exportar o backup protegido.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setMessage('')
    setError('')
    setPendingImport('')
    setPendingEncryptedImport('')
    setInspection(null)
    setBackupFileType('plain')
    setImportOpen(false)
    setEncryptedImportOpen(false)
    setImportPassword('')

    if (!file) {
      setSelectedFileName('')
      return
    }

    setSelectedFileName(file.name)

    try {
      const text = await file.text()

      if (isEncryptedBackupJson(text)) {
        setBackupFileType('encrypted')
        setPendingEncryptedImport(text)
        setEncryptedImportOpen(true)
        return
      }

      const nextInspection = await inspectBackup(text)
      setInspection(nextInspection)
      setBackupFileType('plain')

      if (!nextInspection.valid) {
        setError(`${nextInspection.error ?? 'Arquivo de backup invalido.'} Nenhum dado foi restaurado.`)
        return
      }

      setPendingImport(text)
      setImportOpen(true)
    } catch {
      setError('Nao foi possivel ler o arquivo selecionado.')
    }
  }

  async function unlockEncryptedImport() {
    if (!pendingEncryptedImport || busy) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      const decrypted = await decryptBackupPayload(pendingEncryptedImport, importPassword)
      const nextInspection = await inspectBackup(decrypted)
      setInspection(nextInspection)
      setBackupFileType('encrypted')

      if (!nextInspection.valid) {
        setError(`${nextInspection.error ?? 'Arquivo de backup invalido.'} Nenhum dado foi restaurado.`)
        return
      }

      setPendingImport(decrypted)
      setPendingEncryptedImport('')
      setImportPassword('')
      setEncryptedImportOpen(false)
      setImportOpen(true)
    } catch {
      setError('Nao foi possivel abrir o backup. Verifique a senha ou a integridade do arquivo. Nenhum dado foi restaurado.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    if (!pendingImport || busy) return

    setBusy(true)
    setMessage('')
    setError('')

    try {
      await importBackup(pendingImport)
      setMessage('Backup restaurado com sucesso.')
      setPendingImport('')
      setPendingEncryptedImport('')
      setSelectedFileName('')
      setInspection(null)
      setBackupFileType('plain')
      setImportOpen(false)
      setEncryptedImportOpen(false)
      setImportPassword('')
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (caught) {
      setError(`${caught instanceof Error ? caught.message : 'Nao foi possivel restaurar o backup.'} Nenhum dado foi restaurado.`)
    } finally {
      setBusy(false)
    }
  }

  function cancelImport() {
    setPendingImport('')
    setPendingEncryptedImport('')
    setSelectedFileName('')
    setInspection(null)
    setBackupFileType('plain')
    setImportOpen(false)
    setEncryptedImportOpen(false)
    setImportPassword('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const backupPreview = inspection ? buildBackupPreview(inspection, { fileType: backupFileType }) : null

  return (
    <section className="panel backup-panel" data-testid="backup-panel" aria-labelledby="backup-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">DADOS LOCAIS</span>
          <h2 id="backup-title">Backup dos dados</h2>
          <p className="muted">Seus dados ficam armazenados neste dispositivo. Faca backups periodicos para evitar perda.</p>
        </div>
      </div>

      <div className="backup-actions">
        <button className="button primary" type="button" data-testid="backup-export" onClick={handleExport} disabled={busy}>
          Exportar backup
        </button>

        <button
          className="button ghost"
          type="button"
          data-testid="backup-protected-toggle"
          onClick={() => {
            setPasswordExportOpen((current) => !current)
            setMessage('')
            setError('')
          }}
          disabled={busy}
        >
          Exportar backup protegido por senha
        </button>

        <label className="button ghost backup-file-button">
          Restaurar backup
          <input
            ref={fileInputRef}
            data-testid="backup-file-input"
            type="file"
            accept="application/json,.json"
            onChange={handleFileChange}
            disabled={busy}
          />
        </label>
      </div>

      {passwordExportOpen && (
        <div className="backup-password-box" data-testid="backup-protected-export-box">
          <strong>Backup protegido por senha</strong>
          <p>Essa senha sera necessaria para restaurar o backup. O CoinQuest nao consegue recupera-la se voce esquecer.</p>
          <label>
            Senha
            <input
              data-testid="backup-export-password"
              type="password"
              value={exportPassword}
              onChange={(event) => setExportPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <label>
            Confirmar senha
            <input
              data-testid="backup-export-password-confirm"
              type="password"
              value={exportPasswordConfirm}
              onChange={(event) => setExportPasswordConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </label>
          <div className="goal-form-actions">
            <button className="button ghost" type="button" onClick={() => setPasswordExportOpen(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="button primary" type="button" data-testid="backup-protected-export" onClick={handleProtectedExport} disabled={busy}>
              {busy ? 'Protegendo...' : 'Exportar protegido'}
            </button>
          </div>
        </div>
      )}

      {encryptedImportOpen && (
        <div className="backup-password-box" data-testid="backup-encrypted-import-box">
          <strong>Backup protegido por senha</strong>
          <p>Este backup e protegido por senha. Informe a senha para abrir o arquivo e validar o conteudo antes da restauracao.</p>
          <label>
            Senha
            <input
              data-testid="backup-import-password"
              type="password"
              value={importPassword}
              onChange={(event) => setImportPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <div className="goal-form-actions">
            <button className="button ghost" type="button" onClick={cancelImport} disabled={busy}>
              Cancelar
            </button>
            <button className="button primary" type="button" data-testid="backup-unlock-encrypted" onClick={unlockEncryptedImport} disabled={busy}>
              {busy ? 'Abrindo...' : 'Abrir backup'}
            </button>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="backup-confirm" data-testid="backup-confirm">
          <strong>Restaurar backup local</strong>
          <span>Arquivo selecionado: {selectedFileName}</span>
          {backupPreview && (
            <div className="backup-preview" data-testid="backup-preview">
              <div className="backup-preview-summary">
                <span>Tipo <strong>{backupPreview.fileTypeLabel}</strong></span>
                <span>Versao <strong>{backupPreview.versionLabel}</strong></span>
                <span>Exportado em <strong>{formatBackupDate(inspection?.exportedAt ?? null)}</strong></span>
                <span>Validacao <strong>{backupPreview.validationLabel}</strong></span>
                <span>Total <strong>{backupPreview.totalRecords}</strong></span>
              </div>
              {backupPreview.warnings.map((warning) => <small key={warning}>{warning}</small>)}
              <div className="backup-counts">
                {backupPreview.countGroups.map((group) => (
                  <span key={group.id}>
                    <strong>{group.value}</strong>
                    {group.label}
                    <small>{group.description}</small>
                  </span>
                ))}
              </div>
            </div>
          )}
          {backupPreview && (
            <div className="backup-restore-note">
              <p>{backupPreview.replacementMessage}</p>
              <p>{backupPreview.localOnlyMessage}</p>
            </div>
          )}
          <div className="goal-form-actions">
            <button className="button ghost" type="button" onClick={cancelImport} disabled={busy}>
              Cancelar
            </button>
            <button className="button primary" type="button" data-testid="backup-import-confirm" onClick={confirmImport} disabled={busy}>
              {busy ? 'Restaurando...' : 'Confirmar restauracao'}
            </button>
          </div>
        </div>
      )}

      {message && <p className="success-text" data-testid="backup-success">{message}</p>}
      {error && <p className="form-error" role="alert" data-testid="backup-error">{error}</p>}
    </section>
  )
}
