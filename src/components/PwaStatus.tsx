import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const title = offlineReady ? 'Modo offline preparado.' : 'Atualizacao disponivel.'
  const description = offlineReady ? 'O nucleo do CoinQuest pode abrir sem internet.' : 'Existe uma nova versao do app.'

  return (
    <div className="pwa-toast">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {needRefresh && <button className="button success" onClick={() => updateServiceWorker(true)}>Atualizar</button>}
      <button
        className="icon-button"
        type="button"
        aria-label="Fechar aviso do PWA"
        onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}
      >
        x
      </button>
    </div>
  )
}
