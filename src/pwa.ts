import { registerSW } from 'virtual:pwa-register'

export const PWA_UPDATE_READY_EVENT = 'sultankoy:pwa-update-ready'

if ('serviceWorker' in navigator) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      window.sultankoyPwaUpdateReady = true
      window.sultankoyApplyPwaUpdate = () => updateSW(true)
      window.dispatchEvent(new CustomEvent(PWA_UPDATE_READY_EVENT))
    },
  })
}
