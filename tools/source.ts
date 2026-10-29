// 元データの出どころ。取得（fetch.ts）・照合（check-*.ts）・変換で同じ値を使う。

/** Vallado ほか（AIAA 2006-6753）の付録。SGP4 の検証用 TLE と、各衛星の期待値（Fortran 版の出力） */
export const VALLADO_URL = 'https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.zip'
export const VALLADO_ZIP = 'raw/vallado.zip'
export const VALLADO_TLE = 'raw/SGP4-VER.TLE'
export const VALLADO_OUT = 'raw/tforverf.out'
export const VALLADO_ENTRIES = { [VALLADO_TLE]: 'sgp4/cpp/testsgp4/SGP4-VER.TLE', [VALLADO_OUT]: 'sgp4/for/tforverf.out' }

/** CelesTrak の GP。visual は明るい衛星の一覧、stations は ISS・天宮など */
export const GP_GROUPS = ['visual', 'stations'] as const
export const gpUrl = (group: string) => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`
export const gpRaw = (group: string) => `raw/gp-${group}.json`

export const ATTRIBUTION = '軌道要素: CelesTrak（https://celestrak.org/）'
