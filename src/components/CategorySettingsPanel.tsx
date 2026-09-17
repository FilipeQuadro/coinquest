import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  addCustomCategoryPreference,
  categoryComparisonKey,
  DEFAULT_CATEGORIES,
  deduplicateCategories,
  emptyCategoryPreferences,
  getCategoryOptions,
  hideCategoryPreference,
  showCategoryPreference,
  type CategoryContext,
  type CategoryPreferencesV1,
} from '../lib/categories'
import { readCategoryPreferences, saveCategoryPreferences } from '../lib/categoryPreferences'

const categoryContexts: CategoryContext[] = [
  'transaction-income',
  'transaction-expense',
  'budget',
  'card-purchase',
  'recurring',
  'simulator',
]

function isHidden(preferences: CategoryPreferencesV1, category: string) {
  const key = categoryComparisonKey(category)
  return preferences.hiddenCategoryKeys.some((item) => categoryComparisonKey(item) === key)
}

function hiddenCategoryLabels(preferences: CategoryPreferencesV1) {
  const knownCategories = deduplicateCategories([
    ...Object.values(DEFAULT_CATEGORIES),
    ...preferences.customCategories,
  ])

  return preferences.hiddenCategoryKeys.map((key) => (
    knownCategories.find((category) => categoryComparisonKey(category) === categoryComparisonKey(key)) ?? key
  ))
}

export function CategorySettingsPanel() {
  const preferences = useLiveQuery(readCategoryPreferences, [], emptyCategoryPreferences())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const defaultCategories = Object.values(DEFAULT_CATEGORIES)
  const hiddenCategories = hiddenCategoryLabels(preferences)

  async function persist(nextPreferences: CategoryPreferencesV1, successMessage: string) {
    setBusy(true)
    setMessage('')
    setError('')

    try {
      await saveCategoryPreferences(nextPreferences)
      setMessage(successMessage)
      return true
    } catch {
      setError('Nao foi possivel salvar as categorias.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function addCategory(event: FormEvent) {
    event.preventDefault()

    try {
      const nextPreferences = addCustomCategoryPreference(preferences, name)
      if (await persist(nextPreferences, 'Categoria personalizada salva.')) setName('')
    } catch (caught) {
      setMessage('')
      setError(caught instanceof Error ? caught.message : 'Nao foi possivel adicionar a categoria.')
    }
  }

  async function hideCategory(category: string) {
    const nextPreferences = hideCategoryPreference(preferences, category)
    if (categoryContexts.some((context) => getCategoryOptions(context, nextPreferences).length === 0)) {
      setMessage('')
      setError('Mantenha pelo menos uma categoria visivel em cada fluxo.')
      return
    }
    await persist(nextPreferences, 'Categoria ocultada das novas selecoes.')
  }

  async function showCategory(category: string) {
    await persist(showCategoryPreference(preferences, category), 'Categoria reexibida nas selecoes.')
  }

  return (
    <section className="panel category-settings-panel" data-testid="category-settings-panel" aria-labelledby="category-settings-title">
      <div className="panel-title-row">
        <div>
          <span className="eyebrow">PERSONALIZACAO</span>
          <h2 id="category-settings-title">Categorias</h2>
          <p className="muted">
            Ocultar uma categoria so remove ela das novas selecoes. Transacoes, orcamentos, cartoes e recorrencias antigas continuam preservados.
          </p>
        </div>
      </div>

      <form className="category-settings-form" data-testid="category-settings-form" onSubmit={addCategory}>
        <label>
          Nova categoria
          <input
            data-testid="category-settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Pets"
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <button className="button primary" data-testid="category-settings-add" type="submit" disabled={busy}>
          Adicionar categoria
        </button>
      </form>

      <div className="category-settings-grid">
        <div className="category-settings-box">
          <div className="section-heading">
            <strong>Categorias padrao</strong>
            <span>{defaultCategories.length}</span>
          </div>
          <div className="category-chip-list">
            {defaultCategories.map((category) => (
              <article className={isHidden(preferences, category) ? 'category-chip hidden' : 'category-chip'} key={category}>
                <div>
                  <strong>{category}</strong>
                  <span>{isHidden(preferences, category) ? 'Oculta' : 'Visivel'}</span>
                </div>
                {isHidden(preferences, category) ? (
                  <button className="button ghost compact" type="button" onClick={() => showCategory(category)} disabled={busy}>
                    Reexibir
                  </button>
                ) : (
                  <button className="button ghost compact" type="button" onClick={() => hideCategory(category)} disabled={busy}>
                    Ocultar
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="category-settings-box">
          <div className="section-heading">
            <strong>Personalizadas</strong>
            <span>{preferences.customCategories.length}</span>
          </div>
          {preferences.customCategories.length === 0 ? (
            <p className="category-settings-empty">Nenhuma categoria personalizada ainda.</p>
          ) : (
            <div className="category-chip-list">
              {preferences.customCategories.map((category) => (
                <article className={isHidden(preferences, category) ? 'category-chip hidden' : 'category-chip'} key={category}>
                  <div>
                    <strong>{category}</strong>
                    <span>{isHidden(preferences, category) ? 'Oculta' : 'Visivel'}</span>
                  </div>
                  {isHidden(preferences, category) ? (
                    <button className="button ghost compact" type="button" onClick={() => showCategory(category)} disabled={busy}>
                      Reexibir
                    </button>
                  ) : (
                    <button className="button ghost compact" type="button" onClick={() => hideCategory(category)} disabled={busy}>
                      Ocultar
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="category-settings-hidden" data-testid="category-settings-hidden">
        <strong>Categorias ocultas</strong>
        {hiddenCategories.length === 0 ? (
          <span>Nenhuma categoria oculta.</span>
        ) : (
          <div className="category-hidden-list">
            {hiddenCategories.map((category) => (
              <button className="button ghost compact" type="button" key={category} onClick={() => showCategory(category)} disabled={busy}>
                Reexibir {category}
              </button>
            ))}
          </div>
        )}
      </div>

      {message && <p className="success-text" data-testid="category-settings-message">{message}</p>}
      {error && <p className="form-error" role="alert" data-testid="category-settings-error">{error}</p>}
    </section>
  )
}
