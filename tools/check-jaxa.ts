// ISS の見える通過を、JAXA「#きぼうを見よう」の東京の予報（tools/jaxa-reference.json）と比べる。
// JAXA は見え始めを 30 秒単位で切り上げているので、こちらの見え始めが JAXA の 30 秒前〜同時刻に入れば一致とする（境目の丸めに 5 秒の余裕）。
// JAXA の予報はすべてこちらでも見つかること。逆に、こちらにだけある通過は失敗にしない（JAXA は短い通過や薄明の通過を載せない）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { type Omm, parseOmm } from '../src/sat/elements.ts'
import { findPasses } from '../src/sat/passes.ts'

type JaxaReference = {
  observer: { lat: number; lon: number; heightKm: number }
  window: { from: string; to: string }
  starts: number[]
  omm: Omm
}

const ref: JaxaReference = JSON.parse(readFileSync(new URL('./jaxa-reference.json', import.meta.url), 'utf8'))
const passes = findPasses(parseOmm(ref.omm), ref.observer, new Date(ref.window.from), new Date(ref.window.to))
const jst = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(5, 19).replace('T', ' ')

let worst = 0
const matched = new Set<number>()
for (const j of ref.starts) {
  const p = passes.find((p) => Math.abs(p.start.time.getTime() - j) < 5 * 60e3)
  assert.ok(p, `JAXA の ${jst(j)} の通過が見つからない`)
  const d = (p.start.time.getTime() - j) / 1000
  assert.ok(d >= -35 && d <= 5, `${jst(j)}: 見え始めが ${d.toFixed(0)} 秒ずれた（JAXA は 30 秒単位で切り上げ）`)
  worst = Math.max(worst, Math.abs(d))
  matched.add(p.start.time.getTime())
}
const extra = passes.filter((p) => !matched.has(p.start.time.getTime()))

console.log(
  `check:jaxa ok（JAXA の ${ref.starts.length} 通過すべて一致、見え始めの差は最大 ${worst.toFixed(0)} 秒。` +
    `こちらにだけある通過 ${extra.length} 件: ${extra.map((p) => `${jst(p.start.time.getTime())} ${((p.end.time.getTime() - p.start.time.getTime()) / 1000).toFixed(0)}秒`).join('、')}）`,
)
