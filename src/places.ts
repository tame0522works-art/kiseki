// 観測地の候補。都道府県庁のおおよその位置（0.01° ≒ 1km の違いは、見える時刻・方角にほとんど効かない）。
import type { Observer } from './sat/frames.ts'

export type Place = Observer & { id: string; name: string }

export const PLACES: Place[] = [
  { id: 'sapporo', name: '札幌', lat: 43.06, lon: 141.35, heightKm: 0 },
  { id: 'sendai', name: '仙台', lat: 38.27, lon: 140.87, heightKm: 0 },
  { id: 'tokyo', name: '東京', lat: 35.69, lon: 139.69, heightKm: 0 },
  { id: 'kanazawa', name: '金沢', lat: 36.59, lon: 136.63, heightKm: 0 },
  { id: 'nagoya', name: '名古屋', lat: 35.18, lon: 136.91, heightKm: 0 },
  { id: 'osaka', name: '大阪', lat: 34.69, lon: 135.52, heightKm: 0 },
  { id: 'hiroshima', name: '広島', lat: 34.4, lon: 132.46, heightKm: 0 },
  { id: 'fukuoka', name: '福岡', lat: 33.61, lon: 130.42, heightKm: 0 },
  { id: 'kumamoto', name: '熊本', lat: 32.79, lon: 130.74, heightKm: 0 },
  { id: 'naha', name: '那覇', lat: 26.21, lon: 127.68, heightKm: 0 },
]

export const HERE_ID = 'here'

/**
 * 端末の位置情報から観測地を作る。小数第2位（約1km）に丸めて、この端末の中だけで使う（どこにも送らない）。
 * 1km の違いは衛星の見える時刻・方角にほとんど効かないので、細かい位置は持たない。
 */
export function placeFromPosition(p: GeolocationPosition): Place {
  const round = (v: number) => Math.round(v * 100) / 100
  return { id: HERE_ID, name: '現在地', lat: round(p.coords.latitude), lon: round(p.coords.longitude), heightKm: 0 }
}
