// SGP4 を Vallado の検証用 TLE で動かし、付録の期待値（Fortran 版の出力）と位置・速度を比べる。
// 深宇宙（周期 225 分以上）の衛星は扱わないので飛ばす。期待値が途中で切れている衛星（落下など）は、その時刻で誤りになることを確かめる。
import { readFileSync } from 'node:fs'
import { parseTle } from '../src/sat/elements.ts'
import { Sgp4Error, isDeepSpace, sgp4, sgp4init } from '../src/sat/sgp4.ts'
import { VALLADO_OUT, VALLADO_TLE } from './source.ts'

const MAX_POS_KM = 1e-3
const MAX_VEL_KMS = 1e-6

type Row = { t: number; r: number[]; v: number[] }

// 期待値: 「  5  xx」で衛星が始まり、各行は 分 x y z vx vy vz ...
const expected = new Map<number, Row[]>()
let current: Row[] | undefined
for (const line of readFileSync(VALLADO_OUT, 'utf8').split(/\r?\n/)) {
  const head = /^\s*(\d+)\s+xx\s*$/.exec(line)
  if (head) {
    const satnum = Number(head[1])
    // 20413 は2回出てくる（2回目は別の時間範囲）。最初の方だけ使う
    current = expected.has(satnum) ? undefined : []
    if (current) expected.set(satnum, current)
    continue
  }
  const n = line.trim().split(/\s+/).map(Number)
  if (current && n.length >= 7 && n.slice(0, 7).every(Number.isFinite)) current.push({ t: n[0], r: n.slice(1, 4), v: n.slice(4, 7) })
}

const lines = readFileSync(VALLADO_TLE, 'utf8')
  .split(/\r?\n/)
  .filter((l) => l.startsWith('1 ') || l.startsWith('2 '))

let checked = 0
let skipped = 0
let decayed = 0
let worstPos = 0
let worstVel = 0
const failures: string[] = []

for (let i = 0; i + 1 < lines.length; i += 2) {
  const el = parseTle(lines[i], lines[i + 1].slice(0, 69))
  if (isDeepSpace(el)) {
    skipped++
    continue
  }
  const rows = expected.get(el.satnum)
  if (!rows) throw new Error(`${el.satnum}: 期待値がない`)
  // 2行目の 69 桁より後ろに、出力する時間の範囲（開始・終了・刻み、分）が書いてある
  const [start, stop, step] = lines[i + 1].slice(69).trim().split(/\s+/).map(Number)
  const rec = sgp4init(el)
  const times = new Set(rows.map((r) => r.t))
  for (const row of rows) {
    const sv = sgp4(rec, row.t)
    const dp = Math.hypot(sv.r[0] - row.r[0], sv.r[1] - row.r[1], sv.r[2] - row.r[2])
    const dv = Math.hypot(sv.v[0] - row.v[0], sv.v[1] - row.v[1], sv.v[2] - row.v[2])
    worstPos = Math.max(worstPos, dp)
    worstVel = Math.max(worstVel, dv)
    if (dp > MAX_POS_KM || dv > MAX_VEL_KMS) failures.push(`${el.satnum} t=${row.t}: 位置 ${(dp * 1000).toFixed(3)} m・速度 ${(dv * 1e6).toFixed(3)} mm/s ずれ`)
    checked++
  }
  // 期待値が終わった後の、本来出力するはずだった最初の時刻では誤りになるはず（落下した衛星）
  const last = rows[rows.length - 1].t
  const next = [...Array(Math.floor((stop - start) / step) + 2).keys()].map((k) => Math.min(start + k * step, stop)).find((t) => t > last)
  if (next !== undefined && !times.has(next)) {
    try {
      sgp4(rec, next)
      failures.push(`${el.satnum} t=${next}: 期待値では止まっているのに計算できた`)
    } catch (e) {
      if (!(e instanceof Sgp4Error)) throw e
      decayed++
    }
  }
}

console.log(`SGP4: ${checked} 時刻・止まる時刻で誤りになる ${decayed} 機（深宇宙 ${skipped} 機は対象外）、最大のずれ 位置 ${(worstPos * 1000).toFixed(4)} m・速度 ${(worstVel * 1e6).toFixed(4)} mm/s`)
if (failures.length > 0) {
  console.error(failures.slice(0, 20).join('\n'))
  process.exit(1)
}
