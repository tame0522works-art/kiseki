// SGP4（近地球のみ）。Vallado ほか "Revisiting Spacetrack Report #3"（AIAA 2006-6753）の改良版（opsmode 'i'）に沿う。
// 周期 225 分以上の深宇宙（SDP4）は扱わない。肉眼で見える衛星はほぼすべて低軌道なので、この作品では要らない。
// 出力は TEME（真赤道・平均春分点）座標の km と km/s。
import type { Elements } from './elements.ts'

// WGS-72。TLE はこの定数で作られているので、WGS-84 にすると合わなくなる
const MU = 398600.8
export const RE = 6378.135
const XKE = 60 / Math.sqrt((RE * RE * RE) / MU)
const J2 = 0.001082616
const J3 = -0.00000253881
const J4 = -0.00000165597
const J3OJ2 = J3 / J2
const X2O3 = 2 / 3
const TWO_PI = 2 * Math.PI
const VKMPERSEC = (RE * XKE) / 60

export type Satrec = Elements & {
  isimp: boolean
  noUnkozai: number
  con41: number
  x1mth2: number
  x7thm1: number
  cc1: number
  cc4: number
  cc5: number
  d2: number
  d3: number
  d4: number
  delmo: number
  eta: number
  argpdot: number
  omgcof: number
  sinmao: number
  t2cof: number
  t3cof: number
  t4cof: number
  t5cof: number
  xlcof: number
  aycof: number
  mdot: number
  nodedot: number
  nodecf: number
  xmcof: number
}

export class Sgp4Error extends Error {
  /** Vallado の誤りの番号。1: 離心率が範囲外、2: 平均運動が負、4: 半直弦が負、6: 落下した */
  readonly code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

export function isDeepSpace(el: Elements): boolean {
  return TWO_PI / el.noKozai >= 225
}

export function sgp4init(el: Elements): Satrec {
  if (isDeepSpace(el)) throw new Error(`${el.satnum}: 周期 225 分以上の深宇宙の軌道は扱わない`)
  const { ecco, inclo, argpo, mo, bstar, noKozai } = el

  // initl: Kozai の平均運動を Brouwer の平均運動に直す
  const eccsq = ecco * ecco
  const omeosq = 1 - eccsq
  const rteosq = Math.sqrt(omeosq)
  const cosio = Math.cos(inclo)
  const cosio2 = cosio * cosio
  const ak = Math.pow(XKE / noKozai, X2O3)
  const d1 = (0.75 * J2 * (3 * cosio2 - 1)) / (rteosq * omeosq)
  let del = d1 / (ak * ak)
  const adel = ak * (1 - del * del - del * (1 / 3 + (134 * del * del) / 81))
  del = d1 / (adel * adel)
  const noUnkozai = noKozai / (1 + del)
  const ao = Math.pow(XKE / noUnkozai, X2O3)
  const sinio = Math.sin(inclo)
  const po = ao * omeosq
  const con42 = 1 - 5 * cosio2
  const con41 = -con42 - cosio2 - cosio2
  const posq = po * po
  const rp = ao * (1 - ecco)

  // 近地点が低いほど、大気の密度の関数の基準高度 s を下げる
  const ss = 78 / RE + 1
  const qzms2t = Math.pow((120 - 78) / RE, 4)
  const isimp = rp < 220 / RE + 1
  let sfour = ss
  let qzms24 = qzms2t
  const perige = (rp - 1) * RE
  if (perige < 156) {
    sfour = perige < 98 ? 20 : perige - 78
    qzms24 = Math.pow((120 - sfour) / RE, 4)
    sfour = sfour / RE + 1
  }
  const pinvsq = 1 / posq
  const tsi = 1 / (ao - sfour)
  const eta = ao * ecco * tsi
  const etasq = eta * eta
  const eeta = ecco * eta
  const psisq = Math.abs(1 - etasq)
  const coef = qzms24 * Math.pow(tsi, 4)
  const coef1 = coef / Math.pow(psisq, 3.5)
  const cc2 =
    coef1 * noUnkozai * (ao * (1 + 1.5 * etasq + eeta * (4 + etasq)) + ((0.375 * J2 * tsi) / psisq) * con41 * (8 + 3 * etasq * (8 + etasq)))
  const cc1 = bstar * cc2
  const cc3 = ecco > 1e-4 ? (-2 * coef * tsi * J3OJ2 * noUnkozai * sinio) / ecco : 0
  const x1mth2 = 1 - cosio2
  const cc4 =
    2 *
    noUnkozai *
    coef1 *
    ao *
    omeosq *
    (eta * (2 + 0.5 * etasq) +
      ecco * (0.5 + 2 * etasq) -
      ((J2 * tsi) / (ao * psisq)) *
        (-3 * con41 * (1 - 2 * eeta + etasq * (1.5 - 0.5 * eeta)) + 0.75 * x1mth2 * (2 * etasq - eeta * (1 + etasq)) * Math.cos(2 * argpo)))
  const cc5 = 2 * coef1 * ao * omeosq * (1 + 2.75 * (etasq + eeta) + eeta * etasq)
  const cosio4 = cosio2 * cosio2
  const temp1 = 1.5 * J2 * pinvsq * noUnkozai
  const temp2 = 0.5 * temp1 * J2 * pinvsq
  const temp3 = -0.46875 * J4 * pinvsq * pinvsq * noUnkozai
  const mdot = noUnkozai + 0.5 * temp1 * rteosq * con41 + 0.0625 * temp2 * rteosq * (13 - 78 * cosio2 + 137 * cosio4)
  const argpdot = -0.5 * temp1 * con42 + 0.0625 * temp2 * (7 - 114 * cosio2 + 395 * cosio4) + temp3 * (3 - 36 * cosio2 + 49 * cosio4)
  const xhdot1 = -temp1 * cosio
  const nodedot = xhdot1 + (0.5 * temp2 * (4 - 19 * cosio2) + 2 * temp3 * (3 - 7 * cosio2)) * cosio
  const omgcof = bstar * cc3 * Math.cos(argpo)
  const xmcof = ecco > 1e-4 ? (-X2O3 * coef * bstar) / eeta : 0
  const nodecf = 3.5 * omeosq * xhdot1 * cc1
  const t2cof = 1.5 * cc1
  // 傾斜角 180° ちょうどで 0 除算にならないよう、分母を小さな値で置き換える
  const xlcof = (-0.25 * J3OJ2 * sinio * (3 + 5 * cosio)) / (Math.abs(cosio + 1) > 1.5e-12 ? 1 + cosio : 1.5e-12)
  const aycof = -0.5 * J3OJ2 * sinio
  const delmo = Math.pow(1 + eta * Math.cos(mo), 3)

  let d2 = 0
  let d3 = 0
  let d4 = 0
  let t3cof = 0
  let t4cof = 0
  let t5cof = 0
  if (!isimp) {
    const cc1sq = cc1 * cc1
    d2 = 4 * ao * tsi * cc1sq
    const temp = (d2 * tsi * cc1) / 3
    d3 = (17 * ao + sfour) * temp
    d4 = 0.5 * temp * ao * tsi * (221 * ao + 31 * sfour) * cc1
    t3cof = d2 + 2 * cc1sq
    t4cof = 0.25 * (3 * d3 + cc1 * (12 * d2 + 10 * cc1sq))
    t5cof = 0.2 * (3 * d4 + 12 * cc1 * d3 + 6 * d2 * d2 + 15 * cc1sq * (2 * d2 + cc1sq))
  }

  return {
    ...el,
    isimp,
    noUnkozai,
    con41,
    x1mth2,
    x7thm1: 7 * cosio2 - 1,
    cc1,
    cc4,
    cc5,
    d2,
    d3,
    d4,
    delmo,
    eta,
    argpdot,
    omgcof,
    sinmao: Math.sin(mo),
    t2cof,
    t3cof,
    t4cof,
    t5cof,
    xlcof,
    aycof,
    mdot,
    nodedot,
    nodecf,
    xmcof,
  }
}

export type StateVector = {
  /** TEME の位置（km） */
  r: [number, number, number]
  /** TEME の速度（km/s） */
  v: [number, number, number]
}

/** 元期から tsince 分後の位置と速度 */
export function sgp4(s: Satrec, tsince: number): StateVector {
  const t = tsince
  const xmdf = s.mo + s.mdot * t
  const argpdf = s.argpo + s.argpdot * t
  const nodedf = s.nodeo + s.nodedot * t
  let argpm = argpdf
  let mm = xmdf
  const t2 = t * t
  let nodem = nodedf + s.nodecf * t2
  let tempa = 1 - s.cc1 * t
  let tempe = s.bstar * s.cc4 * t
  let templ = s.t2cof * t2

  if (!s.isimp) {
    const delomg = s.omgcof * t
    const delm = s.xmcof * (Math.pow(1 + s.eta * Math.cos(xmdf), 3) - s.delmo)
    const temp = delomg + delm
    mm = xmdf + temp
    argpm = argpdf - temp
    const t3 = t2 * t
    const t4 = t3 * t
    tempa = tempa - s.d2 * t2 - s.d3 * t3 - s.d4 * t4
    tempe = tempe + s.bstar * s.cc5 * (Math.sin(mm) - s.sinmao)
    templ = templ + s.t3cof * t3 + t4 * (s.t4cof + t * s.t5cof)
  }

  let nm = s.noUnkozai
  if (nm <= 0) throw new Sgp4Error(2, `${s.satnum}: 平均運動が 0 以下`)
  const am = Math.pow(XKE / nm, X2O3) * tempa * tempa
  nm = XKE / Math.pow(am, 1.5)
  let em = s.ecco - tempe
  if (em >= 1 || em < -0.001) throw new Sgp4Error(1, `${s.satnum}: 離心率が範囲外（${em}）`)
  if (em < 1e-6) em = 1e-6
  mm = mm + s.noUnkozai * templ
  let xlm = mm + argpm + nodem
  nodem = nodem % TWO_PI
  argpm = argpm % TWO_PI
  xlm = xlm % TWO_PI
  mm = (xlm - argpm - nodem) % TWO_PI

  const sinip = Math.sin(s.inclo)
  const cosip = Math.cos(s.inclo)

  // 長周期の摂動
  const axnl = em * Math.cos(argpm)
  let temp = 1 / (am * (1 - em * em))
  const aynl = em * Math.sin(argpm) + temp * s.aycof
  const xl = mm + argpm + nodem + temp * s.xlcof * axnl

  // ケプラー方程式（近点離角の代わりに u = E + ω を解く）
  const u = (xl - nodem) % TWO_PI
  let eo1 = u
  let tem5 = 9999.9
  let sineo1 = 0
  let coseo1 = 0
  for (let ktr = 1; Math.abs(tem5) >= 1e-12 && ktr <= 10; ktr++) {
    sineo1 = Math.sin(eo1)
    coseo1 = Math.cos(eo1)
    tem5 = 1 - coseo1 * axnl - sineo1 * aynl
    tem5 = (u - aynl * coseo1 + axnl * sineo1 - eo1) / tem5
    if (Math.abs(tem5) >= 0.95) tem5 = tem5 > 0 ? 0.95 : -0.95
    eo1 += tem5
  }

  // 短周期の摂動
  const ecose = axnl * coseo1 + aynl * sineo1
  const esine = axnl * sineo1 - aynl * coseo1
  const el2 = axnl * axnl + aynl * aynl
  const pl = am * (1 - el2)
  if (pl < 0) throw new Sgp4Error(4, `${s.satnum}: 半直弦が負`)
  const rl = am * (1 - ecose)
  const rdotl = (Math.sqrt(am) * esine) / rl
  const rvdotl = Math.sqrt(pl) / rl
  const betal = Math.sqrt(1 - el2)
  temp = esine / (1 + betal)
  const sinu = (am / rl) * (sineo1 - aynl - axnl * temp)
  const cosu = (am / rl) * (coseo1 - axnl + aynl * temp)
  let su = Math.atan2(sinu, cosu)
  const sin2u = (cosu + cosu) * sinu
  const cos2u = 1 - 2 * sinu * sinu
  temp = 1 / pl
  const temp1 = 0.5 * J2 * temp
  const temp2 = temp1 * temp

  const mrt = rl * (1 - 1.5 * temp2 * betal * s.con41) + 0.5 * temp1 * s.x1mth2 * cos2u
  su = su - 0.25 * temp2 * s.x7thm1 * sin2u
  const xnode = nodem + 1.5 * temp2 * cosip * sin2u
  const xinc = s.inclo + 1.5 * temp2 * cosip * sinip * cos2u
  const mvt = rdotl - (nm * temp1 * s.x1mth2 * sin2u) / XKE
  const rvdot = rvdotl + (nm * temp1 * (s.x1mth2 * cos2u + 1.5 * s.con41)) / XKE

  // 軌道面の単位ベクトルから位置と速度へ
  const sinsu = Math.sin(su)
  const cossu = Math.cos(su)
  const snod = Math.sin(xnode)
  const cnod = Math.cos(xnode)
  const sini = Math.sin(xinc)
  const cosi = Math.cos(xinc)
  const xmx = -snod * cosi
  const xmy = cnod * cosi
  const ux = xmx * sinsu + cnod * cossu
  const uy = xmy * sinsu + snod * cossu
  const uz = sini * sinsu
  const vx = xmx * cossu - cnod * sinsu
  const vy = xmy * cossu - snod * sinsu
  const vz = sini * cossu

  if (mrt < 1) throw new Sgp4Error(6, `${s.satnum}: 地表より下（落下）`)
  return {
    r: [mrt * ux * RE, mrt * uy * RE, mrt * uz * RE],
    v: [(mvt * ux + rvdot * vx) * VKMPERSEC, (mvt * uy + rvdot * vy) * VKMPERSEC, (mvt * uz + rvdot * vz) * VKMPERSEC],
  }
}
