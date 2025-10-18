import { watch } from 'vue'
import { useRoute } from 'vue-router'

export function useRouteLoader(loadFn: (routeParams: any) => Promise<any>) {
  const route = useRoute()

  // Initial load
  loadFn(route.params)

  // Reload whenever params change (back/forward buttons or route changes)
  watch(
    () => route.params,
    (newParams) => {
      loadFn(newParams)
    },
    { deep: true }
  )
}
