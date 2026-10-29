// 恒星の地平座標。星表（BSC5）の J2000.0 の赤経・赤緯を、歳差でその日の座標に直し、観測地の方位・高度にする。
// 歳差は J. Meeus『Astronomical Algorithms』第2版 21 章の厳密な式（tools/check-stars.ts で同章の例と照合）。
// 固有運動は入れない。いちばん速いアークトゥルスでも 2000 年から 30 年で 0.02° ほどで、全天図では見分けられない。
// 章動・光行差（0.01° 未満）、大気差も入れない（衛星も幾何学的な仰角で描いているので、それとそろえる）。
import { type Look, type Observer, gstime, julianDay } from './frames.ts'

/** 同梱する星（src/ui/stars.json、tools/stars.ts が作る）。赤経・赤緯は J2000.0 の度 */
export type Star = { ra: number; dec: number; mag: number; name?: string }

const DEG = Math.PI / 180
const ARCSEC = DEG / 3600

/** J2000.0 の赤経・赤緯（度）を、ユリウス日 jd の平均春分点・赤道の座標（度）に直す */
export function precess(ra0: number, dec0: number, jd: number): [number, number] {
  const T = (jd - 2451545) / 36525
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * ARCSEC
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * ARCSEC
  const theta = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * ARCSEC
  const a0 = ra0 * DEG
  const d0 = dec0 * DEG
  const A = Math.cos(d0) * Math.sin(a0 + zeta)
  const B = Math.cos(theta) * Math.cos(d0) * Math.cos(a0 + zeta) - Math.sin(theta) * Math.sin(d0)
  const C = Math.sin(theta) * Math.cos(d0) * Math.cos(a0 + zeta) + Math.cos(theta) * Math.sin(d0)
  const ra = (Math.atan2(A, B) + z) / DEG
  return [((ra % 360) + 360) % 360, Math.asin(C) / DEG]
}

/** 赤経・赤緯（度、その日の座標）の天体を、時刻 date に観測地 o から見た方位・高度。距離は使わないので 0 */
export function equatorialToLook(ra: number, dec: number, o: Observer, date: Date): Look {
  const h = gstime(julianDay(date)) + o.lon * DEG - ra * DEG
  const lat = o.lat * DEG
  const d = dec * DEG
  const sinAlt = Math.sin(lat) * Math.sin(d) + Math.cos(lat) * Math.cos(d) * Math.cos(h)
  const az = Math.atan2(-Math.cos(d) * Math.sin(h), Math.cos(lat) * Math.sin(d) - Math.sin(lat) * Math.cos(d) * Math.cos(h)) / DEG
  return { azimuth: az < 0 ? az + 360 : az, elevation: Math.asin(sinAlt) / DEG, range: 0 }
}
