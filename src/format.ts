// 画面に出す言葉。方角・時刻・見え始め/見え終わりの理由。
import type { Reason } from './sat/passes.ts'

const DIRECTIONS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西']

/** 方位（度）を16方位の言葉に */
export function direction(azimuth: number): string {
  return DIRECTIONS[Math.round(azimuth / 22.5) % 16]
}

/** 日本時間で表示する。観測地がどこでも日本時間にそろえる（候補は国内だけで、現在地も国内を想定） */
const TZ = 'Asia/Tokyo'
const timeFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', weekday: 'short' })
const shortFmt = new Intl.DateTimeFormat('ja-JP', { timeZone: TZ, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export const clock = (d: Date) => timeFmt.format(d)
export const day = (d: Date) => dayFmt.format(d)
export const stamp = (d: Date) => shortFmt.format(d)

export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}秒` : `${Math.floor(s / 60)}分${s % 60 ? `${s % 60}秒` : ''}`
}

export const START_REASON: Record<Reason, string> = {
  low: '地平線の近くから',
  shadow: '地球の影から出て、空の途中で現れる',
  twilight: '空が暗くなって見え始める',
  window: '',
}

export const END_REASON: Record<Reason, string> = {
  low: '地平線の近くへ',
  shadow: '地球の影に入り、空の途中で消える',
  twilight: '空が明るくなって見えなくなる',
  window: '',
}
