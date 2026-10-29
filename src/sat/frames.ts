// 座標の変換。SGP4 の TEME から地球に固定した座標（ECEF）へ、そこから観測地の地平座標（方位・仰角）へ。
// 極運動と UT1−UTC（1秒未満）は無視する。どちらも仰角・方位で 0.01° に届かず、肉眼で見る用途には効かない。

export type Vec3 = [number, number, number]

const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI

export function julianDay(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

/** グリニッジ平均恒星時（ラジアン）。Vallado の gstime と同じ式（IAU 1982） */
export function gstime(jdut1: number): number {
  const tut1 = (jdut1 - 2451545) / 36525
  let temp = -6.2e-6 * tut1 * tut1 * tut1 + 0.093104 * tut1 * tut1 + (876600 * 3600 + 8640184.812866) * tut1 + 67310.54841
  temp = ((temp * DEG) / 240) % TWO_PI
  return temp < 0 ? temp + TWO_PI : temp
}

/** TEME → ECEF（z 軸のまわりに恒星時だけ回す） */
export function temeToEcef(r: Vec3, date: Date): Vec3 {
  const th = gstime(julianDay(date))
  const c = Math.cos(th)
  const s = Math.sin(th)
  return [c * r[0] + s * r[1], -s * r[0] + c * r[1], r[2]]
}

// 観測地は WGS-84 の楕円体の上で表す（衛星の軌道要素の WGS-72 とは別で、地図の緯度経度に合わせる）
const A = 6378.137
const F = 1 / 298.257223563
const E2 = F * (2 - F)

export type Observer = {
  /** 緯度・経度（度、北緯・東経が正） */
  lat: number
  lon: number
  /** 楕円体からの高さ（km） */
  heightKm: number
}

export function observerEcef(o: Observer): Vec3 {
  const sl = Math.sin(o.lat * DEG)
  const cl = Math.cos(o.lat * DEG)
  const n = A / Math.sqrt(1 - E2 * sl * sl)
  return [(n + o.heightKm) * cl * Math.cos(o.lon * DEG), (n + o.heightKm) * cl * Math.sin(o.lon * DEG), (n * (1 - E2) + o.heightKm) * sl]
}

export type Look = {
  /** 方位（度）。北が 0 で東回り */
  azimuth: number
  /** 仰角（度）。地平線が 0 */
  elevation: number
  /** 観測地からの距離（km） */
  range: number
}

/** 観測地から見た、ECEF の点 p の方位・仰角・距離 */
export function lookAngles(o: Observer, site: Vec3, p: Vec3): Look {
  const dx = p[0] - site[0]
  const dy = p[1] - site[1]
  const dz = p[2] - site[2]
  const sl = Math.sin(o.lat * DEG)
  const cl = Math.cos(o.lat * DEG)
  const so = Math.sin(o.lon * DEG)
  const co = Math.cos(o.lon * DEG)
  // 東・北・天頂の成分
  const east = -so * dx + co * dy
  const north = -sl * co * dx - sl * so * dy + cl * dz
  const up = cl * co * dx + cl * so * dy + sl * dz
  const range = Math.hypot(dx, dy, dz)
  const az = Math.atan2(east, north) / DEG
  return { azimuth: az < 0 ? az + 360 : az, elevation: Math.asin(up / range) / DEG, range }
}

/**
 * 衛星が地球の影に入っているか。地球を半径 R の球、影を太陽と反対向きに伸びる円柱とみなす（円柱モデル）。
 * 本影と半影を分けないので、影の境目の時刻は数秒ずれうる（低軌道では影の縁を数秒で横切る）。
 */
export function inEarthShadow(sat: Vec3, sun: Vec3): boolean {
  const sunLen = Math.hypot(...sun)
  const along = (sat[0] * sun[0] + sat[1] * sun[1] + sat[2] * sun[2]) / sunLen
  if (along >= 0) return false
  const perp2 = sat[0] * sat[0] + sat[1] * sat[1] + sat[2] * sat[2] - along * along
  return perp2 < A * A
}
