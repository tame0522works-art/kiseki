import { useEffect, useMemo, useState } from 'react'
import catalogJson from './data/satellites.json'
import { END_REASON, START_REASON, clock, day, direction, duration, stamp } from './format.ts'
import { HERE_ID, PLACES, type Place, placeFromPosition } from './places.ts'
import { type Catalog, readCatalog } from './sat/catalog.ts'
import { observerEcef } from './sat/frames.ts'
import { type Pass, MIN_ELEVATION, sampleAt, visible } from './sat/passes.ts'
import { sgp4init } from './sat/sgp4.ts'
import { sunPosition } from './sat/sun.ts'
import type { SearchRequest, SearchResponse } from './search.worker.ts'
import Dome from './ui/Dome.tsx'
import type { Dot, Scene, TrackPoint } from './ui/sky.ts'

const CATALOG = catalogJson as Catalog
const SATELLITES = readCatalog(CATALOG)
const RECS = SATELLITES.map((sat) => ({ sat, rec: sgp4init(sat) }))
const BY_SATNUM = new Map(SATELLITES.map((s) => [s.satnum, s]))

/** これから何時間先までの通過を探すか */
const WINDOW_MS = 24 * 3600e3
/** 最大仰角がこれより低い通過は、初めは一覧に出さない（建物や山に隠れやすく、暗い衛星は見つけにくい） */
const LOW_MAX = 30
/** 再生の速さ。5 分ほどの通過が 30 秒で流れる */
const SPEED = 10
/** 選んだ通過の前後に、地平線の下から上がってくるところ・沈むところも少し見せる */
const MARGIN_MS = 120_000
const TRACK_STEP_MS = 5000
/** 軌道要素がこれより古いと、時刻が数分ずれうるので知らせる */
const STALE_DAYS = 3
const PLACE_KEY = 'kiseki.place'

const passKey = (p: Pass) => `${p.satnum}-${p.start.time.getTime()}`
const fetchedAt = new Date(CATALOG.fetchedAt)

/** 前回選んだ観測地。localStorage が使えない・中身が壊れているときは東京 */
function loadPlace(): Place {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null')
    if (saved && typeof saved === 'object') {
      const s = saved as Partial<Place>
      const preset = PLACES.find((p) => p.id === s.id)
      if (preset) return preset
      if (s.id === HERE_ID && typeof s.lat === 'number' && typeof s.lon === 'number' && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180) {
        return { id: HERE_ID, name: '現在地', lat: s.lat, lon: s.lon, heightKm: 0 }
      }
    }
  } catch {
    // 読めなければ既定の観測地にする
  }
  return PLACES.find((p) => p.id === 'tokyo')!
}

function savePlace(p: Place) {
  try {
    localStorage.setItem(PLACE_KEY, JSON.stringify(p.id === HERE_ID ? p : { id: p.id }))
  } catch {
    // 保存できなくても、この画面では使える
  }
}

export default function App() {
  const [place, setPlace] = useState(loadPlace)
  const [passes, setPasses] = useState<Pass[] | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [selected, setSelected] = useState<Pass | null>(null)
  const [offset, setOffset] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showLow, setShowLow] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // 観測地が変わったら、今から 24 時間の通過を探し直す
  useEffect(() => {
    setPasses(null)
    setSelected(null)
    const worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
    const from = Date.now()
    const req: SearchRequest = { id: from, satellites: SATELLITES, observer: place, from, to: from + WINDOW_MS }
    worker.onmessage = (e: MessageEvent<SearchResponse>) => setPasses(e.data.passes)
    worker.postMessage(req)
    return () => worker.terminate()
  }, [place])

  const span = selected ? selected.end.time.getTime() - selected.start.time.getTime() + 2 * MARGIN_MS : 0
  const trackFrom = selected ? selected.start.time.getTime() - MARGIN_MS : 0
  const time = selected ? new Date(trackFrom + offset) : now

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = requestAnimationFrame(function step(t) {
      const dt = (t - last) * SPEED
      last = t
      setOffset((o) => Math.min(o + dt, span))
      raf = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing, span])

  useEffect(() => {
    if (playing && offset >= span) setPlaying(false)
  }, [playing, offset, span])

  const site = useMemo(() => observerEcef(place), [place])

  const track = useMemo<TrackPoint[] | null>(() => {
    if (!selected) return null
    const rec = RECS.find((r) => r.sat.satnum === selected.satnum)!.rec
    const points: TrackPoint[] = []
    for (let t = trackFrom; t <= trackFrom + span; t += TRACK_STEP_MS) {
      const s = sampleAt(rec, place, site, new Date(t))
      if (s && s.look.elevation >= 0) points.push({ look: s.look, visible: visible(s) })
    }
    return points
  }, [selected, place, site, trackFrom, span])

  const scene = useMemo<Scene>(() => {
    const dots: Dot[] = []
    let marker: Scene['marker'] = null
    for (const { sat, rec } of RECS) {
      const s = sampleAt(rec, place, site, time)
      if (!s || s.look.elevation < 0) continue
      const dot = { look: s.look, label: sat.label, station: sat.station }
      if (selected?.satnum === sat.satnum) marker = { ...dot, sunlit: s.sunlit }
      else if (s.sunlit) dots.push(dot)
    }
    return { sunAltitude: sunPosition(time, place.lat, place.lon, false).altitude, dots, track, marker }
  }, [place, site, time, selected, track])

  const choosePlace = (p: Place) => {
    savePlace(p)
    setPlace(p)
  }

  const useHere = () => {
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => choosePlace(placeFromPosition(pos)),
      (err) => setGeoError(err.code === err.PERMISSION_DENIED ? '位置情報の利用が許可されませんでした。一覧から近い都市を選んでください。' : '現在地を取得できませんでした。'),
      { maximumAge: 10 * 60e3, timeout: 15e3 },
    )
  }

  const select = (p: Pass) => {
    if (selected && passKey(selected) === passKey(p)) {
      setSelected(null)
      setPlaying(false)
      return
    }
    setSelected(p)
    setOffset(MARGIN_MS)
    setPlaying(false)
    // スマホでは一覧が全天図の下にあるので、全天図が画面から外れていれば戻す
    const dome = document.querySelector('.dome')
    if (dome && dome.getBoundingClientRect().top < 0) dome.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const isLow = (p: Pass) => p.max.elevation < LOW_MAX && !BY_SATNUM.get(p.satnum)?.station
  const lowCount = passes?.filter(isLow).length ?? 0
  const shown = passes?.filter((p) => showLow || !isLow(p)) ?? []
  const days = new Map<string, Pass[]>()
  for (const p of shown) {
    const d = day(p.start.time)
    days.set(d, [...(days.get(d) ?? []), p])
  }
  const staleDays = (now.getTime() - fetchedAt.getTime()) / 86400e3
  const selectedSat = selected ? BY_SATNUM.get(selected.satnum) : undefined
  const markerState = !scene.marker ? '地平線の下' : !scene.marker.sunlit ? '地球の影の中（見えない）' : scene.sunAltitude > -6 ? '空がまだ明るい' : scene.marker.look.elevation < MIN_ELEVATION ? '低い（建物に隠れやすい）' : '見えている'

  const togglePlay = () => {
    if (offset >= span) setOffset(0)
    setPlaying(offset >= span || !playing)
  }

  return (
    <div className="app">
      <header className="bar">
        <h1>kiseki</h1>
        <p className="lead">今夜、自分の空を通る人工衛星を、方角と時刻と軌跡で</p>
      </header>

      <main className="main">
        <section className="sky" aria-label="全天図">
          <div className="place">
            <label>
              観測地
              <select
                value={place.id}
                onChange={(e) => {
                  const p = PLACES.find((x) => x.id === e.target.value)
                  if (p) choosePlace(p)
                }}
              >
                {place.id === HERE_ID && (
                  <option value={HERE_ID}>
                    現在地（{place.lat.toFixed(2)}, {place.lon.toFixed(2)}）
                  </option>
                )}
                {PLACES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {'geolocation' in navigator && (
              <button type="button" onClick={useHere}>
                現在地を使う
              </button>
            )}
          </div>
          {geoError && (
            <p className="note" role="alert">
              {geoError}
            </p>
          )}

          <Dome scene={scene} label={selectedSat ? `${selectedSat.label} の軌跡。${clock(time)}、${markerState}` : `${clock(time)} の空。日の当たっている衛星 ${scene.dots.length} 機`} />
          <p className="legend">見上げた向き（北が上・東が左）。中心が真上、外周が地平線、内側の円は仰角 60°・30°。</p>

          <div className="now" role="status" aria-live="off">
            <span className="time">{clock(time)}</span>
            {selectedSat ? (
              <span>
                {selectedSat.label}
                {scene.marker && `・${direction(scene.marker.look.azimuth)} 仰角 ${Math.round(scene.marker.look.elevation)}°`}・{markerState}
              </span>
            ) : (
              <span>いまの空（日の当たっている衛星 {scene.dots.length} 機）</span>
            )}
          </div>

          {selected && (
            <div className="player">
              <button type="button" className="primary" onClick={togglePlay}>
                {playing ? '一時停止' : `再生（${SPEED}倍速）`}
              </button>
              <input
                type="range"
                aria-label="時刻"
                min={0}
                max={span}
                step={1000}
                value={offset}
                onChange={(e) => {
                  setPlaying(false)
                  setOffset(Number(e.target.value))
                }}
              />
              <button type="button" onClick={() => select(selected)}>
                いまの空に戻る
              </button>
            </div>
          )}

          {selected && selectedSat && (
            <dl className="detail">
              <dt>見え始め</dt>
              <dd>
                {clock(selected.start.time)}　{direction(selected.start.azimuth)}・仰角 {Math.round(selected.start.elevation)}°
                <small>{START_REASON[selected.startReason]}</small>
              </dd>
              <dt>いちばん高い</dt>
              <dd>
                {clock(selected.max.time)}　{direction(selected.max.azimuth)}・仰角 {Math.round(selected.max.elevation)}°
              </dd>
              <dt>見え終わり</dt>
              <dd>
                {clock(selected.end.time)}　{direction(selected.end.azimuth)}・仰角 {Math.round(selected.end.elevation)}°
                <small>{END_REASON[selected.endReason]}</small>
              </dd>
            </dl>
          )}
        </section>

        <section className="passes" aria-label="見える通過の一覧">
          <h2>
            {place.name}で、これから24時間に見える通過
            {passes && <span className="count">{shown.length}件</span>}
          </h2>
          {staleDays > STALE_DAYS && (
            <p className="note warn">軌道要素が {Math.floor(staleDays)} 日前のものです。時刻が数分ずれることがあります。</p>
          )}
          {!passes ? (
            <p className="note">計算中…</p>
          ) : shown.length === 0 ? (
            <p className="note">見やすい通過はありません。</p>
          ) : (
            [...days].map(([d, list]) => (
              <section key={d} className="day">
                <h3>{d}</h3>
                <ol>
                  {list.map((p) => {
                    const sat = BY_SATNUM.get(p.satnum)
                    return (
                      <li key={passKey(p)}>
                        <button type="button" aria-pressed={selected ? passKey(selected) === passKey(p) : false} className={sat?.station ? 'station' : undefined} onClick={() => select(p)}>
                          <span className="t">{clock(p.start.time)}</span>
                          <span className="name">{sat?.label ?? p.name}</span>
                          <span className="path">
                            {direction(p.start.azimuth)} → {direction(p.end.azimuth)}・最大 {Math.round(p.max.elevation)}°・{duration(p.end.time.getTime() - p.start.time.getTime())}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))
          )}
          {lowCount > 0 && (
            <label className="toggle">
              <input type="checkbox" checked={showLow} onChange={(e) => setShowLow(e.target.checked)} />
              低い通過（最大仰角 {LOW_MAX}° 未満）も出す（{lowCount}件）
            </label>
          )}
        </section>
      </main>

      <footer className="foot">
        <p>
          見える条件: 空が暗い（太陽が地平線の 6° 下より低い）・衛星に日が当たっている・仰角 {MIN_ELEVATION}° 以上。位置は SGP4
          で計算しています。衛星の明るさ（等級）はまだ出していないので、暗い衛星は見つけにくいことがあります。
        </p>
        <p>現在地は、この端末の中で約1kmに丸めて使い、どこにも送りません。</p>
        <p>
          軌道要素: <a href="https://celestrak.org/">CelesTrak</a>（{stamp(fetchedAt)} 取得）
        </p>
      </footer>
    </div>
  )
}
