// env.d.ts
/// <reference types="vite/client" />

declare module '@iconify-icons/svg-spinners/*';
declare module '*.svg'
declare module 'md5-es'
declare module 'icecast-metadata-stats'

import { API } from '@/shared/api'
declare module '@vue/runtime-core' {
  interface ComponentCustomProperties {
    $api: API
  }
}

declare module 'pinia' {
  export interface PiniaCustomProperties {
    api: API
  }
}

declare global {
  const __BUILD_DATE__: string
  const __BUILD_VERSION__: string
  const __APP_VERSION__: string
}

export {}
