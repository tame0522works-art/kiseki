// 全天図を canvas に描く。真上が中心、地平線が外周で、星座早見と同じく見上げた向き（北が上・東が左）にする。
// 中心からの距離は天頂角に比例させる（正距方位図法）。仰角 30° と 60° の線が等間隔になり、高さを読み取りやすい。
import type { Look } from '../sat/frames.ts'

export type Dot = { look: Look; label: string; station: boolean }
export type TrackPoint = { look: Look; visible: boolean }
export type StarDot = { look: Look; mag: number; name?: string }

export type Scene = {
  /** 観測地の太陽高度（度）。空の色を決める */
  sunAltitude: number
  /** 地平線より上の恒星（方角の目印） */
  stars: StarDot[]
  /** 日が当たっていて、地平線より上にある衛星 */
  dots: Dot[]
  /** 選んだ通過の軌跡（地平線より上の部分） */
  track: TrackPoint[] | null
  /** 選んだ衛星の、いまの時刻の位置 */
  marker: (Dot & { sunlit: boolean }) | null
}

const DEG = Math.PI / 180
const LABEL_PAD = 26

const DIRECTIONS: [number, string][] = [
  [0, '北'],
  [90, '東'],
  [180, '南'],
  [270, '西'],
]

function color(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function project(look: Look, cx: number, cy: number, radius: number): [number, number] {
  const r = ((90 - look.elevation) / 90) * radius
  // 見上げているので東が左（星座早見と同じ）
  return [cx - r * Math.sin(look.azimuth * DEG), cy - r * Math.cos(look.azimuth * DEG)]
}

/** 空の色。太陽が地平線より上は昼、−6° までは薄明、それより下は夜 */
function skyColor(sunAltitude: number): string {
  if (sunAltitude > 0) return color('--sky-day')
  if (sunAltitude > -6) return color('--sky-twilight')
  return color('--sky-night')
}

export function drawSky(ctx: CanvasRenderingContext2D, size: number, scene: Scene) {
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - LABEL_PAD
  const at = (look: Look) => project(look, cx, cy, radius)
  const dark = scene.sunAltitude <= -6

  ctx.clearRect(0, 0, size, size)

  ctx.fillStyle = skyColor(scene.sunAltitude)
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
  ctx.fill()

  // 仰角 30°・60° の円と、8方位の線
  ctx.strokeStyle = color('--sky-line')
  ctx.lineWidth = 1
  for (const el of [30, 60]) {
    ctx.beginPath()
    ctx.arc(cx, cy, ((90 - el) / 90) * radius, 0, 2 * Math.PI)
    ctx.stroke()
  }
  for (let az = 0; az < 360; az += 45) {
    const [x, y] = at({ azimuth: az, elevation: 0, range: 0 })
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  ctx.strokeStyle = color('--sky-edge')
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI)
  ctx.stroke()

  ctx.fillStyle = color('--fg')
  ctx.font = `600 ${Math.round(size / 28)}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [az, name] of DIRECTIONS) {
    const [x, y] = project({ azimuth: az, elevation: 0, range: 0 }, cx, cy, radius + LABEL_PAD / 2)
    ctx.fillText(name, x, y)
  }

  drawStars(ctx, scene, at, size)

  // 衛星（日が当たっているもの）。空が明るいうちは肉眼では見えないので薄く
  ctx.globalAlpha = dark ? 1 : 0.35
  ctx.fillStyle = color('--sat')
  for (const d of scene.dots) {
    const [x, y] = at(d.look)
    ctx.beginPath()
    ctx.arc(x, y, d.station ? 4 : 2.2, 0, 2 * Math.PI)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  if (scene.track) drawTrack(ctx, scene.track, at)

  if (scene.marker) {
    const [x, y] = at(scene.marker.look)
    ctx.lineWidth = 2.5
    ctx.strokeStyle = color('--marker')
    ctx.fillStyle = scene.marker.sunlit ? color('--marker') : color('--sky-night')
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, 2 * Math.PI)
    ctx.fill()
    ctx.stroke()
  }
}

/**
 * 恒星。等級が小さい（明るい）ほど大きな点にする。夜はすべて、薄明のうちは 1 等より明るい星だけを薄く描き、昼は描かない。
 * 名前は空が暗いときだけ、明るい星に添える（衛星の点と見分けがつくよう、星は少し黄みのある色にする）。
 */
function drawStars(ctx: CanvasRenderingContext2D, scene: Scene, at: (l: Look) => [number, number], size: number) {
  if (scene.sunAltitude > 0) return
  const dark = scene.sunAltitude <= -6
  const shown = dark ? scene.stars : scene.stars.filter((s) => s.mag < 1)
  ctx.globalAlpha = dark ? 1 : 0.5
  ctx.fillStyle = color('--star')
  for (const s of shown) {
    const [x, y] = at(s.look)
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.7, 2.4 - 0.5 * s.mag), 0, 2 * Math.PI)
    ctx.fill()
  }
  if (dark) {
    ctx.fillStyle = color('--star-label')
    ctx.font = `${Math.round(size / 42)}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (const s of shown) {
      if (!s.name || s.look.elevation < 5) continue
      const [x, y] = at(s.look)
      ctx.fillText(s.name, x + 5, y)
    }
  }
  ctx.globalAlpha = 1
}

/** 軌跡。見える区間は太い実線、影の中や低い区間は細い破線。最後に進む向きの矢印を付ける */
function drawTrack(ctx: CanvasRenderingContext2D, track: TrackPoint[], at: (l: Look) => [number, number]) {
  ctx.lineCap = 'round'
  // 見える・見えないが続く区間ごとに1本の線にする（点ごとに描くと、破線の模様が毎回始まり直して実線に見える）
  let i = 0
  while (i < track.length - 1) {
    const visible = track[i].visible && track[i + 1].visible
    let j = i + 1
    while (j < track.length - 1 && (track[j].visible && track[j + 1].visible) === visible) j++
    ctx.strokeStyle = color(visible ? '--track' : '--track-dim')
    ctx.lineWidth = visible ? 3.5 : 1.5
    ctx.setLineDash(visible ? [] : [4, 5])
    ctx.beginPath()
    ctx.moveTo(...at(track[i].look))
    for (let k = i + 1; k <= j; k++) ctx.lineTo(...at(track[k].look))
    ctx.stroke()
    i = j
  }
  ctx.setLineDash([])

  const shown = track.filter((p) => p.visible)
  if (shown.length < 2) return
  const [x1, y1] = at(shown[shown.length - 2].look)
  const [x2, y2] = at(shown[shown.length - 1].look)
  const angle = Math.atan2(y2 - y1, x2 - x1)
  ctx.fillStyle = color('--track')
  ctx.beginPath()
  ctx.moveTo(x2 + 9 * Math.cos(angle), y2 + 9 * Math.sin(angle))
  ctx.lineTo(x2 + 9 * Math.cos(angle + 2.5), y2 + 9 * Math.sin(angle + 2.5))
  ctx.lineTo(x2 + 9 * Math.cos(angle - 2.5), y2 + 9 * Math.sin(angle - 2.5))
  ctx.fill()
}
