import { createApp, App as VueApp } from 'vue'

export interface Plugin<T = any> {
  install: (app: VueApp, options?: T) => void
}

export const createAppCompat = (component: any, options?: any) => {
  const app = createApp(component, options)
  return app
}
