import { useEffect } from 'react'

// Título da aba: "Transações — FlowTrack" (antes era "FlowTrack" em todas as telas)
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — FlowTrack` : 'FlowTrack'
  }, [title])
}
