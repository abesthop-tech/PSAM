import { useCallback, useRef } from 'react'

interface Props {
  onDelta: (deltaX: number) => void
}

export default function Resizer({ onDelta }: Props) {
  const lastX = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      lastX.current = e.clientX
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - lastX.current
        lastX.current = ev.clientX
        onDelta(delta)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        document.body.style.cursor = ''
      }
      document.body.style.cursor = 'col-resize'
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [onDelta],
  )

  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 bg-border-dark hover:bg-accent cursor-col-resize shrink-0 transition-colors z-20"
    />
  )
}
