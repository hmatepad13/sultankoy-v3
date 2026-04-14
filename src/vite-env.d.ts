/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface Window {
  sultankoyPwaUpdateReady?: boolean
  sultankoyApplyPwaUpdate?: () => Promise<void>
}
