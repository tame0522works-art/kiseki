import { useEffect, useRef, useState } from 'react'
import { type Scene, drawSky } from './sky.ts'

/** 全天図。幅は親に合わせ、正方形にする。高解像度の画面でもにじまないよう、canvas の画素は devicePixelRatio 倍にする */
export default function Dome({ scene, label }: { scene: Scene; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState(0)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ro = new ResizeObserver(([entry]) => setSize(entry.contentRect.width))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  // 画面の明暗が切り替わったら、CSS の色で描き直す
  const [, setScheme] = useState(0)
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setScheme((n) => n + 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || size === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size * dpr)
    canvas.height = Math.round(size * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawSky(ctx, size, scene)
  })

  return <canvas ref={ref} className="dome" role="img" aria-label={label} />
}
