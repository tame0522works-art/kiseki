// BSC5（イェール輝星星表 第5版）から 3.5 等より明るい星を選び、全天図に同梱する src/ui/stars.json を作る。
// 星表は変わらないので、作ったファイルはコミットする（CI では作り直さない）。raw/ に星表が無ければ取ってくる。
// 書式は配布元の ReadMe の固定桁（1 から数えた桁）: HR 1-4、Bayer 名 5-14、J2000 の赤経 76-83・赤緯 84-90、V 等級 103-107。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { Star } from '../src/sat/stars.ts'
import { BSC5_GZ, BSC5_URL } from './source.ts'

const LIMIT = 3.5

/** 名前を出す星（HR 番号 → 日本での呼び名）。HR 番号の取り違えがないよう、星表の Bayer 名とも照らす */
const NAMED: Record<number, [string, string]> = {
  2491: ['シリウス', 'Alp CMa'],
  2326: ['カノープス', 'Alp Car'],
  5340: ['アークトゥルス', 'Alp Boo'],
  7001: ['ベガ', 'Alp Lyr'],
  1708: ['カペラ', 'Alp Aur'],
  1713: ['リゲル', 'Bet Ori'],
  2943: ['プロキオン', 'Alp CMi'],
  2061: ['ベテルギウス', 'Alp Ori'],
  7557: ['アルタイル', 'Alp Aql'],
  1457: ['アルデバラン', 'Alp Tau'],
  6134: ['アンタレス', 'Alp Sco'],
  5056: ['スピカ', 'Alp Vir'],
  2990: ['ポルックス', 'Bet Gem'],
  8728: ['フォーマルハウト', 'Alp PsA'],
  7924: ['デネブ', 'Alp Cyg'],
  3982: ['レグルス', 'Alp Leo'],
  424: ['北極星', 'Alp UMi'],
}

if (!existsSync(BSC5_GZ)) {
  const res = await fetch(BSC5_URL)
  if (!res.ok) throw new Error(`${BSC5_URL}: ${res.status}`)
  mkdirSync('raw', { recursive: true })
  writeFileSync(BSC5_GZ, Buffer.from(await res.arrayBuffer()))
}

const col = (line: string, from: number, to: number) => line.slice(from - 1, to).trim()

const stars: Star[] = []
const found = new Set<number>()
for (const line of gunzipSync(readFileSync(BSC5_GZ)).toString('latin1').split('\n')) {
  const hr = Number(col(line, 1, 4))
  const vmag = col(line, 103, 107)
  // 星表には新星や銀河など、座標や等級の無い行がある
  if (!vmag || !col(line, 76, 77)) continue
  const mag = Number(vmag)
  if (mag >= LIMIT) continue
  const ra = (Number(col(line, 76, 77)) + Number(col(line, 78, 79)) / 60 + Number(col(line, 80, 83)) / 3600) * 15
  const sign = col(line, 84, 84) === '-' ? -1 : 1
  const dec = sign * (Number(col(line, 85, 86)) + Number(col(line, 87, 88)) / 60 + Number(col(line, 89, 90)) / 3600)
  const star: Star = { ra: Math.round(ra * 1e4) / 1e4, dec: Math.round(dec * 1e4) / 1e4, mag }
  const named = NAMED[hr]
  if (named) {
    const bayer = col(line, 8, 14).replace(/\s+/g, ' ')
    if (bayer !== named[1]) throw new Error(`HR ${hr}: Bayer 名が ${bayer}（${named[1]} のはず）`)
    star.name = named[0]
    found.add(hr)
  }
  stars.push(star)
}
const missing = Object.keys(NAMED).filter((hr) => !found.has(Number(hr)))
if (missing.length > 0) throw new Error(`名前を付ける星が見つからない: HR ${missing.join(', ')}`)

stars.sort((a, b) => a.mag - b.mag)
writeFileSync('src/ui/stars.json', JSON.stringify(stars))
console.log(`src/ui/stars.json: ${LIMIT} 等より明るい ${stars.length} 星（名前付き ${found.size}）`)
