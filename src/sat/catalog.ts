// 画面に同梱する衛星の一覧（tools/convert.ts が作る src/data/satellites.json の形）と、表示用の名前。
import { type Elements, type Omm, parseOmm } from './elements.ts'

export type Catalog = {
  /** CelesTrak から取った時刻（ISO 8601） */
  fetchedAt: string
  satellites: Omm[]
}

export type Satellite = Elements & {
  /** 画面に出す名前 */
  label: string
  /** 宇宙ステーション（ISS・天宮）。いちばん明るく、一覧で目立たせる */
  station: boolean
}

/** ISS と天宮（CSS の中心モジュール 天和）のカタログ番号 */
export const STATIONS: ReadonlySet<number> = new Set([25544, 48274])

/** よく知られた衛星だけ日本語の名前にする。それ以外は CelesTrak の名前のまま */
const KNOWN: Record<number, string> = {
  25544: '国際宇宙ステーション（ISS）',
  48274: '中国宇宙ステーション 天宮',
  20580: 'ハッブル宇宙望遠鏡',
}

export function label(satnum: number, name: string): string {
  const known = KNOWN[satnum]
  if (known) return known
  // R/B はロケットの上段（Rocket Body）。衛星を軌道に入れた後、そのまま回り続けている
  return name.replace(/ R\/B(\(\d\))?$/, ' ロケット上段')
}

export function readCatalog(c: Catalog): Satellite[] {
  return c.satellites.map((omm) => {
    const el = parseOmm(omm)
    return { ...el, label: label(el.satnum, el.name), station: STATIONS.has(el.satnum) }
  })
}
