// raw/ の GP を1つにまとめ、画面に同梱する src/data/satellites.json を作る。
// 載せるのは visual（CelesTrak の明るい衛星の一覧）と、stations のうち ISS・天宮の2つ。
// stations の残りは暗い小型衛星か、ステーションにドッキング中のモジュール・宇宙船（ISS と同じ光の点）なので載せない。
// 深宇宙（周期 225 分以上）は SGP4 で扱わないので外す。軌道要素は毎日変わるので、このファイルはコミットせず CI で作り直す。
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { type Omm, parseOmm } from '../src/sat/elements.ts'
import { STATIONS, type Catalog } from '../src/sat/catalog.ts'
import { isDeepSpace } from '../src/sat/sgp4.ts'
import { gpRaw } from './source.ts'

const KEYS = ['OBJECT_NAME', 'NORAD_CAT_ID', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'BSTAR'] as const

const read = (group: string): Omm[] => JSON.parse(readFileSync(gpRaw(group), 'utf8'))
const stations = read('stations').filter((o) => STATIONS.has(o.NORAD_CAT_ID))
if (stations.length !== STATIONS.size) throw new Error(`stations に ISS・天宮が揃っていない（${stations.length} 件）`)

const bySatnum = new Map<number, Omm>()
let deep = 0
for (const o of [...stations, ...read('visual')]) {
  if (bySatnum.has(o.NORAD_CAT_ID)) continue
  if (isDeepSpace(parseOmm(o))) {
    deep++
    continue
  }
  bySatnum.set(o.NORAD_CAT_ID, Object.fromEntries(KEYS.map((k) => [k, o[k]])) as Omm)
}

const catalog: Catalog = {
  fetchedAt: new Date(Math.max(statSync(gpRaw('visual')).mtimeMs, statSync(gpRaw('stations')).mtimeMs)).toISOString(),
  satellites: [...bySatnum.values()].sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID),
}
mkdirSync('src/data', { recursive: true })
writeFileSync('src/data/satellites.json', JSON.stringify(catalog))
console.log(`src/data/satellites.json: ${catalog.satellites.length} 機（深宇宙で外した ${deep}）`)
