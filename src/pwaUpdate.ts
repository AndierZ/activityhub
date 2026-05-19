import { registerSW } from 'virtual:pwa-register'

let refreshing = false

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return
    refreshing = true
    window.location.reload()
  })

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true)
    },
    onRegisteredSW(_swUrl, registration) {
      registration?.update().catch(console.error)
    },
  })
}
