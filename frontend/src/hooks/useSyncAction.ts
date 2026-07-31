import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useSyncAction(mutationFn: () => Promise<any>, queryKeys?: string[]) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryKeys?.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }))
    },
  })
}
