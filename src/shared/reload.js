// reload.js
import { ref } from 'vue'

/** Token incremented whenever views should reload their data. */
export var reloadToken = ref(0)

/** Ask listeners to reload. */
export function pushReload() {
  reloadToken.value++
}
