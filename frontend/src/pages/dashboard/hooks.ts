import { useEffect, useRef, useState } from 'react'

// Largura real do contêiner, para o SVG ser desenhado em pixels (texto sem distorção)
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}

// Ponto ativo de um gráfico: mouse, toque e teclado
export function useActiveIndex(count: number) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // No toque a dica fica até tocar fora do gráfico
  useEffect(() => {
    if (active === null) return
    const away = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setActive(null) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [active])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!count) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setActive(a => (a === null ? count - 1 : Math.max(0, Math.min(count - 1, a + step))))
    } else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(count - 1) }
    else if (e.key === 'Escape') setActive(null)
  }

  return { active, setActive, ref, onKeyDown }
}
