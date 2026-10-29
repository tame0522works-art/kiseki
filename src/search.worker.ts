// 全衛星の見える通過を探す（150 機ほど・24 時間で、パソコンで 0.3 秒、スマホではその数倍かかるので、画面を止めないよう別のスレッドで）。
import type { Elements } from './sat/elements.ts'
import type { Observer } from './sat/frames.ts'
import { type Pass, findPasses } from './sat/passes.ts'

export type SearchRequest = { id: number; satellites: Elements[]; observer: Observer; from: number; to: number }
export type SearchResponse = { id: number; passes: Pass[] }

// tsconfig は DOM の型なので、self を Worker として扱う（Window.postMessage は送り先の origin を要求する）
const scope = self as unknown as Worker

scope.onmessage = (e: MessageEvent<SearchRequest>) => {
  const { id, satellites, observer, from, to } = e.data
  const passes = satellites.flatMap((s) => findPasses(s, observer, new Date(from), new Date(to)))
  passes.sort((a, b) => a.start.time.getTime() - b.start.time.getTime())
  scope.postMessage({ id, passes } satisfies SearchResponse)
}
