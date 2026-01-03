import { ref } from 'vue'
export const reloadToken = ref(0)
export function pushReload() {
  reloadToken.value++
}
