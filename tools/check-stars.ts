// 恒星の位置の計算を確かめる。
// 1. 歳差: Meeus『Astronomical Algorithms』第2版 例 21.b（ペルセウス座θ星、2028年11月13.19日）と比べる。
// 2. 地平座標: 北極星の高度は観測地の緯度にほぼ等しい（北極星は天の北極から 0.7° ほど離れているので、その分の幅で見る）。
// 3. 同梱した星（src/ui/stars.json）: 名前付きの星の数と、等級の並び。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { type Star, equatorialToLook, precess } from '../src/sat/stars.ts'

// 例 21.b: J2000.0 の位置（固有運動を適用済み）α0 = 41.054063°、δ0 = 49.227750°、JD 2462088.69 → α = 41.547214°、δ = 49.348483°
const [ra, dec] = precess(41.054063, 49.22775, 2462088.69)
assert.ok(Math.abs(ra - 41.547214) < 1e-5, `歳差の赤経 ${ra}`)
assert.ok(Math.abs(dec - 49.348483) < 1e-5, `歳差の赤緯 ${dec}`)

const stars: Star[] = JSON.parse(readFileSync(new URL('../src/ui/stars.json', import.meta.url), 'utf8'))
const polaris = stars.find((s) => s.name === '北極星')!
let worst = 0
for (const lat of [26.21, 35.69, 43.06]) {
  for (let h = 0; h < 24; h += 3) {
    const date = new Date(Date.UTC(2026, 10, 1, h))
    const [r, d] = precess(polaris.ra, polaris.dec, date.getTime() / 86400000 + 2440587.5)
    const look = equatorialToLook(r, d, { lat, lon: 139.69, heightKm: 0 }, date)
    worst = Math.max(worst, Math.abs(look.elevation - lat))
    assert.ok(Math.abs(look.elevation - lat) < 0.8, `緯度 ${lat}° で北極星の高度が ${look.elevation.toFixed(2)}°`)
    assert.ok(look.azimuth < 1.5 || look.azimuth > 358.5, `北極星の方位が ${look.azimuth.toFixed(2)}°`)
  }
}

assert.equal(stars.filter((s) => s.name).length, 17)
assert.ok(stars.every((s, i) => i === 0 || stars[i - 1].mag <= s.mag), '等級の明るい順に並んでいない')
assert.equal(stars[0].name, 'シリウス')

console.log(`check:stars ok（歳差は Meeus 例 21.b と 1e-5° 以内、北極星の高度と緯度の差は最大 ${worst.toFixed(2)}°、同梱 ${stars.length} 星）`)
