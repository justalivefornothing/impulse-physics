import { useEffect, useRef } from 'react'
import { Sandbox } from '../app/sandbox'
import { useSandboxStore } from '../app/store'

/**
 * Hosts the <canvas>, creates the Sandbox controller on mount and keeps the
 * backing store sized to the element (ResizeObserver + devicePixelRatio).
 */
export function SandboxCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sandboxRef = useRef<Sandbox | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const sandbox = new Sandbox(canvas)
    sandboxRef.current = sandbox

    const fit = () => {
      const rect = canvas.getBoundingClientRect()
      sandbox.resize(rect.width, rect.height)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(canvas)
    window.addEventListener('resize', fit)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
      sandbox.destroy()
      sandboxRef.current = null
    }
  }, [])

  const tool = useSandboxStore((s) => s.tool)

  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-label={`Physics sandbox. Click empty space to spawn a ${tool}, drag a body to fling it.`}
      className="absolute inset-0 h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 focus-visible:ring-inset"
    />
  )
}
