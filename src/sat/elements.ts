// 軌道要素の読み取り。TLE（2行）と CelesTrak の OMM（JSON）のどちらからも、SGP4 が使う同じ形にそろえる。

export type Elements = {
  /** NORAD のカタログ番号 */
  satnum: number
  name: string
  /** 元期のユリウス日（UTC） */
  epochJd: number
  /** 抗力の係数 B*（1/地球半径） */
  bstar: number
  /** 傾斜角・昇交点赤経・近地点引数・平均近点角（ラジアン） */
  inclo: number
  nodeo: number
  argpo: number
  mo: number
  ecco: number
  /** 平均運動（ラジアン/分。TLE の値そのままで、Kozai の平均） */
  noKozai: number
}

const DEG = Math.PI / 180
const REV_PER_DAY = (2 * Math.PI) / 1440

/** 年の1月1日0時のユリウス日（グレゴリオ暦、1900〜2099年で正しい） */
function jdJan1(year: number): number {
  return 367 * year - Math.floor((7 * year) / 4) + 31 + 1721013.5
}

/** 「00179.78495062」のような 年（2桁）＋通日 を、ユリウス日に直す。通日は1月1日0時が 1.0 */
export function epochToJd(year: number, dayOfYear: number): number {
  return jdJan1(year) + dayOfYear - 1
}

/** 「28098-4」→ 0.28098e-4。TLE の仮数の前に小数点を補う書き方 */
function impliedDecimal(field: string): number {
  const s = field.trim()
  if (s === '' || /^[+-]?0+[+-]0$/.test(s)) return 0
  const m = /^([+-]?)(\d+)([+-]\d)$/.exec(s)
  if (!m) throw new Error(`読めない値: "${field}"`)
  return Number(`${m[1]}0.${m[2]}e${m[3]}`)
}

export function parseTle(line1: string, line2: string, name = ''): Elements {
  if (line1[0] !== '1' || line2[0] !== '2') throw new Error('TLE の1行目・2行目ではない')
  const yy = Number(line1.slice(18, 20))
  const year = yy < 57 ? 2000 + yy : 1900 + yy
  return {
    satnum: Number(line1.slice(2, 7)),
    name,
    epochJd: epochToJd(year, Number(line1.slice(20, 32))),
    bstar: impliedDecimal(line1.slice(53, 61)),
    inclo: Number(line2.slice(8, 16)) * DEG,
    nodeo: Number(line2.slice(17, 25)) * DEG,
    ecco: Number(`0.${line2.slice(26, 33).trim()}`),
    argpo: Number(line2.slice(34, 42)) * DEG,
    mo: Number(line2.slice(43, 51)) * DEG,
    noKozai: Number(line2.slice(52, 63)) * REV_PER_DAY,
  }
}

/** CelesTrak の GP を FORMAT=json で取ったときの1件（使う項目だけ） */
export type Omm = {
  OBJECT_NAME: string
  NORAD_CAT_ID: number
  EPOCH: string
  MEAN_MOTION: number
  ECCENTRICITY: number
  INCLINATION: number
  RA_OF_ASC_NODE: number
  ARG_OF_PERICENTER: number
  MEAN_ANOMALY: number
  BSTAR: number
}

export function parseOmm(o: Omm): Elements {
  // EPOCH は「2026-10-29T03:12:45.123456」で、末尾に Z が付かないが UTC
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d(?:\.\d+)?)$/.exec(o.EPOCH)
  if (!m) throw new Error(`読めない元期: ${o.EPOCH}`)
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) + Number(m[6]) * 1000
  return {
    satnum: o.NORAD_CAT_ID,
    name: o.OBJECT_NAME,
    epochJd: ms / 86400000 + 2440587.5,
    bstar: o.BSTAR,
    inclo: o.INCLINATION * DEG,
    nodeo: o.RA_OF_ASC_NODE * DEG,
    argpo: o.ARG_OF_PERICENTER * DEG,
    mo: o.MEAN_ANOMALY * DEG,
    ecco: o.ECCENTRICITY,
    noKozai: o.MEAN_MOTION * REV_PER_DAY,
  }
}
