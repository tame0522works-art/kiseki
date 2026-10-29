// 「見える通過」を探す。見える条件は3つ:
// 観測地の空が暗い（太陽高度 −6° 以下、市民薄明の終わり）、衛星に日が当たっている、衛星の仰角が 10° 以上。
// 1分刻みで条件の変わり目を探し、変わり目は二分法で1秒まで詰める。
import type { Elements } from './elements.ts'
import { type Look, type Observer, inEarthShadow, lookAngles, observerEcef, temeToEcef } from './frames.ts'
import { type Satrec, Sgp4Error, sgp4, sgp4init } from './sgp4.ts'
import { sunPosition, sunVector } from './sun.ts'

export const MIN_ELEVATION = 10
export const DARK_SUN_ALTITUDE = -6
const STEP_MS = 60_000
const REFINE_MS = 1000

export type PassPoint = Look & { time: Date }

export type Pass = {
  satnum: number
  name: string
  start: PassPoint
  max: PassPoint
  end: PassPoint
  /** 見え始め・見え終わりの理由。low は仰角 10°、shadow は地球の影、twilight は空の明るさ、window は探す範囲の端 */
  startReason: Reason
  endReason: Reason
}

export type Reason = 'low' | 'shadow' | 'twilight' | 'window'

type Sample = { time: Date; look: Look; sunlit: boolean; dark: boolean }

/** 1つの衛星を、ある時刻に観測地から見た様子。軌道の計算が破綻したら（落下など）null */
function sampleAt(rec: Satrec, o: Observer, site: ReturnType<typeof observerEcef>, time: Date): Sample | null {
  let r
  try {
    r = sgp4(rec, (time.getTime() / 86400000 + 2440587.5 - rec.epochJd) * 1440).r
  } catch (e) {
    if (e instanceof Sgp4Error) return null
    throw e
  }
  return {
    time,
    look: lookAngles(o, site, temeToEcef(r, time)),
    sunlit: !inEarthShadow(r, sunVector(time)),
    dark: sunPosition(time, o.lat, o.lon, false).altitude <= DARK_SUN_ALTITUDE,
  }
}

const visible = (s: Sample) => s.dark && s.sunlit && s.look.elevation >= MIN_ELEVATION

/** a は見えない・b は見える（またはその逆）とき、変わり目を1秒まで詰めて、見える側の標本を返す */
function refine(at: (t: Date) => Sample | null, a: Sample, b: Sample): Sample {
  let lo = a
  let hi = b
  while (hi.time.getTime() - lo.time.getTime() > REFINE_MS) {
    const mid = at(new Date((lo.time.getTime() + hi.time.getTime()) / 2))
    if (!mid) break
    if (visible(mid) === visible(lo)) lo = mid
    else hi = mid
  }
  return visible(lo) ? lo : hi
}

/** 見えなくなった（見え始めた）理由。見えない側の標本で、どの条件が欠けたか */
function reason(s: Sample): Reason {
  if (!s.dark) return 'twilight'
  if (!s.sunlit) return 'shadow'
  return 'low'
}

const toPoint = (s: Sample): PassPoint => ({ ...s.look, time: s.time })

/** 仰角が最大になる時刻を、黄金分割探索で1秒まで詰める */
function maxElevation(at: (t: Date) => Sample | null, from: Sample, to: Sample): Sample {
  const g = (Math.sqrt(5) - 1) / 2
  let a = from.time.getTime()
  let b = to.time.getTime()
  const el = (t: number) => at(new Date(t))?.look.elevation ?? -90
  while (b - a > REFINE_MS) {
    const c = b - g * (b - a)
    const d = a + g * (b - a)
    if (el(c) > el(d)) b = d
    else a = c
  }
  const mid = at(new Date((a + b) / 2))
  // 見えている区間の端が最大のこともある（影に入って消える、など）
  return [from, to, mid].filter((s): s is Sample => s !== null).reduce((x, y) => (y.look.elevation > x.look.elevation ? y : x))
}

/** from から to までに、観測地 o から見える el の通過をすべて返す */
export function findPasses(el: Elements, o: Observer, from: Date, to: Date): Pass[] {
  const rec = sgp4init(el)
  const site = observerEcef(o)
  const at = (t: Date) => sampleAt(rec, o, site, t)
  const passes: Pass[] = []
  let prev = at(from)
  let start: Sample | null = prev && visible(prev) ? prev : null
  let startReason: Reason = 'window'
  for (let t = from.getTime() + STEP_MS; prev; t += STEP_MS) {
    const cur = at(new Date(Math.min(t, to.getTime())))
    if (!cur) break
    const v = visible(cur)
    if (v && !start) {
      start = refine(at, prev, cur)
      startReason = reason(prev)
    } else if (!v && start) {
      const end = refine(at, prev, cur)
      passes.push(makePass(el, at, start, end, startReason, reason(cur)))
      start = null
    }
    if (cur.time.getTime() >= to.getTime()) {
      if (start) passes.push(makePass(el, at, start, cur, startReason, 'window'))
      break
    }
    prev = cur
  }
  return passes
}

function makePass(el: Elements, at: (t: Date) => Sample | null, start: Sample, end: Sample, startReason: Reason, endReason: Reason): Pass {
  return {
    satnum: el.satnum,
    name: el.name,
    start: toPoint(start),
    max: toPoint(maxElevation(at, start, end)),
    end: toPoint(end),
    startReason,
    endReason,
  }
}
