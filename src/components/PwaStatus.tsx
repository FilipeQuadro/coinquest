import { useRegisterSW } from 'virtual:pwa-register/react'

export function PwaStatus() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="pwa-toast">
      <div>
        <strong>{offlineReady ? 'Modo offline preparado.' : 'Atualização disponível.'}</strong>
        <span>{offlineReady ? 'O núcleo do CoinQuest pode abrir sem internet.' : 'Existe uma nova versão do app.'}</span>
      </div>
      {needRefresh && <button className="button success" onClick={() => updateServiceWorker(true)}>Atualizar</button>}
      <button className="icon-button" onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}>×</button>
    </div>
  )
}
