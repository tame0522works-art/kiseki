// 画面操作のテスト。公開と同じ設定でビルドしたもの（CSP 入り）をローカルで配信し、画面なしの Chrome に本物のクリックを送って、
// 通過の一覧・選んだ通過の軌跡と再生・観測地の切り替えと保存・現在地・スマホの配置・通信の制限を確かめる。
// 軌道要素は毎日入れ替わるので、特定の通過には頼らない（東京で 24 時間に最大仰角 30° 以上の通過が1件も無いことは、まず起きない）。
// `npm run e2e` で実行する（先に dist-e2e へビルドしてから、このスクリプトが配信とブラウザを立ち上げる）。
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Browser, sleep, type Page, type Viewport } from './cdp.ts'

const PORT = 4207
const BASE = `http://127.0.0.1:${PORT}/`
const DESKTOP: Viewport = { width: 1280, height: 860 }
const PHONE: Viewport = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, touch: true }
const FAILURES = 'e2e-failures'

/** 「17:29:44」を、その日の 0 時からの秒に */
const seconds = (clock: string) => {
  const [h, m, s] = clock.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

class Ui {
  readonly page: Page
  constructor(page: Page) {
    this.page = page
  }

  async open() {
    await this.page.goto(BASE)
    await this.waitForList()
  }

  /** 通過の探索（Web Worker）が終わり、一覧が出るまで待つ */
  waitForList() {
    return this.page.waitFor(`document.querySelectorAll('.passes li button').length > 0`, '通過の一覧', 30_000)
  }

  text(selector: string) {
    return this.page.run<string>(`return (document.querySelector(${JSON.stringify(selector)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`)
  }

  count() {
    return this.page.run<number>(`return document.querySelectorAll('.passes li button').length`)
  }

  time() {
    return this.text('.now .time')
  }

  /** 要素の中心を本物のマウスでクリックする（見えるところまでスクロールしてから） */
  async click(selector: string, index = 0) {
    const c = await this.page.run<{ x: number; y: number } | null>(`
      const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
      if (!el) return null;
      el.scrollIntoView({ block: 'nearest' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    `)
    assert.ok(c, `${selector} がない`)
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.page.send('Input.dispatchMouseEvent', { type, ...c, button: type === 'mouseMoved' ? 'none' : 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 })
    }
    await sleep(150)
  }

  /** React が見ている value を変えて change を起こす（select・range を、利用者の操作と同じ経路で動かす） */
  setValue(selector: string, value: string) {
    return this.page.run(`
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    `)
  }

  /** 全天図で、軌跡の色（--track の #ffd166）に近い画素の数 */
  trackPixels() {
    return this.page.run<number>(`
      const c = document.querySelector('canvas.dome');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 255) < 30 && Math.abs(d[i + 1] - 209) < 30 && Math.abs(d[i + 2] - 102) < 40) n++;
      return n;
    `)
  }
}

type Scenario = { name: string; viewport?: Viewport; run: (ui: Ui) => Promise<void> }

const scenarios: Scenario[] = [
  {
    name: '一覧の通過を選ぶと、軌跡・時刻のつまみ・見え始めから見え終わりまでが出る',
    async run(ui) {
      await ui.open()
      assert.match(await ui.text('.passes h2'), /^東京で、これから24時間に見える通過\d+件$/)
      assert.ok(!(await ui.page.run(`return !!document.querySelector('.player')`)), '選ぶ前からつまみが出ている')
      assert.equal(await ui.trackPixels(), 0)

      await ui.click('.passes li button')
      assert.equal(await ui.page.run(`return document.querySelector('.passes li button').getAttribute('aria-pressed')`), 'true')
      const item = await ui.text('.passes li button .t')
      // 選んだ直後は見え始めの時刻を指している
      assert.equal(await ui.time(), item)
      const detail = await ui.text('.detail')
      assert.match(detail, /^見え始め\d\d:\d\d:\d\d.+仰角 \d+°.*いちばん高い\d\d:\d\d:\d\d.+仰角 \d+°見え終わり\d\d:\d\d:\d\d.+仰角 \d+°/)
      assert.match(await ui.page.run<string>(`return document.querySelector('canvas.dome').getAttribute('aria-label')`), /の軌跡。/)
      assert.ok((await ui.trackPixels()) > 200, '軌跡が描かれていない')

      // もう一度押すと選ぶのをやめ、いまの空に戻る
      await ui.click('.passes li button')
      assert.equal(await ui.page.run(`return document.querySelector('.passes li button').getAttribute('aria-pressed')`), 'false')
      assert.match(await ui.text('.now'), /いまの空/)
    },
  },
  {
    name: '再生すると時刻が10倍速で進み、最後まで行くと止まる。つまみを動かすと時刻が変わる',
    async run(ui) {
      await ui.open()
      await ui.click('.passes li button')
      const t0 = seconds(await ui.time())
      await ui.click('.player .primary')
      assert.equal(await ui.text('.player .primary'), '一時停止')
      await sleep(1500)
      await ui.click('.player .primary')
      const elapsed = seconds(await ui.time()) - t0
      // 1.5 秒の 10 倍で 15 秒。クリックにかかる時間の分だけ幅を見る
      assert.ok(elapsed >= 12 && elapsed <= 25, `再生で ${elapsed} 秒進んだ`)

      const max = Number(await ui.page.run(`return document.querySelector('.player input').max`))
      await ui.setValue('.player input', String(max - 2000))
      const nearEnd = seconds(await ui.time())
      assert.ok(nearEnd > t0 + 60, 'つまみで時刻が動かない')
      await ui.click('.player .primary')
      await ui.page.waitFor(`document.querySelector('.player .primary').textContent.startsWith('再生')`, '最後で止まる', 5000)
    },
  },
  {
    name: '観測地を変えると探し直し、次に開いたときも同じ観測地になる',
    async run(ui) {
      await ui.open()
      await ui.setValue('.place select', 'naha')
      await ui.page.waitFor(`document.querySelector('.passes h2').textContent.startsWith('那覇で')`, '那覇の一覧')
      await ui.waitForList()
      await ui.page.goto(BASE)
      await ui.waitForList()
      assert.equal(await ui.page.run(`return document.querySelector('.place select').value`), 'naha')
    },
  },
  {
    name: '保存された観測地が壊れていても、東京で開く',
    async run(ui) {
      await ui.page.goto(BASE)
      await ui.page.run(`localStorage.setItem('kiseki.place', '{"id":"here","lat":"north"}')`)
      await ui.open()
      assert.equal(await ui.page.run(`return document.querySelector('.place select').value`), 'tokyo')
    },
  },
  {
    name: '初めは最大仰角 30° 未満の通過を隠し（宇宙ステーションは除く）、低い通過も出すと件数が増える',
    async run(ui) {
      await ui.open()
      // 一覧の各行の最大仰角と、宇宙ステーションかどうか
      const rows = () =>
        ui.page.run<{ max: number; station: boolean }[]>(`
          return [...document.querySelectorAll('.passes li button')].map(b => ({ max: Number(b.querySelector('.path').textContent.match(/最大 (\\d+)°/)[1]), station: b.classList.contains('station') }))`)
      const before = await rows()
      assert.deepEqual(before.filter((r) => !r.station && r.max < 30), [], '隠すはずの低い通過が出ている')
      const hidden = Number((await ui.text('.toggle')).match(/（(\d+)件）/)![1])
      await ui.click('.toggle input')
      const after = await rows()
      assert.equal(after.length, before.length + hidden)
      assert.equal(after.filter((r) => !r.station && r.max < 30).length, hidden)
      await ui.click('.toggle input')
      assert.equal(await ui.count(), before.length)
    },
  },
  {
    name: '現在地を使うと、約1kmに丸めた位置で探す。許可されなければ、そう知らせる',
    async run(ui) {
      await ui.page.goto(BASE)
      const { targetInfo } = await ui.page.send('Target.getTargetInfo')
      await ui.page.send('Browser.grantPermissions', { origin: BASE.slice(0, -1), permissions: ['geolocation'], browserContextId: targetInfo.browserContextId })
      await ui.page.send('Emulation.setGeolocationOverride', { latitude: 35.360556, longitude: 138.727778, accuracy: 10 })
      await ui.open()
      await ui.click('.place button')
      await ui.page.waitFor(`document.querySelector('.place select').value === 'here'`, '現在地の選択')
      assert.match(await ui.text('.place select option:checked'), /^現在地（35\.36, 138\.73）$/)
      await ui.page.waitFor(`document.querySelector('.passes h2').textContent.startsWith('現在地で')`, '現在地の一覧')
      assert.equal(await ui.page.run(`return localStorage.getItem('kiseki.place')`), '{"id":"here","name":"現在地","lat":35.36,"lon":138.73,"heightKm":0}')

      await ui.page.send('Browser.resetPermissions', { browserContextId: targetInfo.browserContextId })
      await ui.page.send('Browser.setPermission', { origin: BASE.slice(0, -1), permission: { name: 'geolocation' }, setting: 'denied', browserContextId: targetInfo.browserContextId })
      await ui.click('.place button')
      await ui.page.waitFor(`document.querySelector('.note[role=alert]')`, '許可されなかったことの知らせ')
      assert.match(await ui.text('.note[role=alert]'), /許可されませんでした/)
    },
  },
  {
    name: 'スマホ: 時刻のつまみは1行を使い、一覧から選ぶと全天図まで戻る',
    viewport: PHONE,
    async run(ui) {
      await ui.open()
      const last = (await ui.count()) - 1
      await ui.click('.passes li button', last)
      await sleep(800)
      const top = await ui.page.run<number>(`return document.querySelector('canvas.dome').getBoundingClientRect().top`)
      assert.ok(Math.abs(top) < 20, `全天図の上端が ${top}px`)
      const width = await ui.page.run<number>(`return document.querySelector('.player input').getBoundingClientRect().width`)
      assert.ok(width > 330, `つまみの幅が ${width}px`)
      const overflow = await ui.page.run<number>(`return document.documentElement.scrollWidth - innerWidth`)
      assert.equal(overflow, 0, '横にはみ出している')
    },
  },
  {
    name: '公開版の CSP: 通信は拒否し、計算の Worker は同じ場所の JS から読む',
    async run(ui) {
      await ui.open()
      const csp = await ui.page.run<string>(`return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content ?? ''`)
      assert.match(csp, /connect-src 'none'/)
      const files = await ui.page.run<string[]>(`return performance.getEntriesByType('resource').map(e => e.name)`)
      assert.ok(files.every((f) => f.startsWith(BASE)), `別の場所から読んでいる: ${files.join(', ')}`)
      const blocked = await ui.page.run<boolean>(`try { await fetch('${BASE}'); return false } catch { return true }`)
      assert.ok(blocked, 'fetch が通ってしまう')
      assert.deepEqual(await ui.page.run(`return window.__csp`), [`connect-src ${BASE}`])
    },
  },
]

let server: ChildProcess | null = null

async function startServer() {
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    if (await fetch(BASE).then((r) => r.ok, () => false)) return
    await sleep(100)
  }
  await stopServer()
  throw new Error('テスト用のサーバーが起動しませんでした')
}

async function stopServer() {
  if (!server) return
  const s = server
  server = null
  const exited = new Promise((r) => s.once('exit', r))
  s.kill()
  await exited
}

async function main() {
  const only = process.argv[2]
  await startServer()
  const browser = await Browser.launch(9349)
  let failed = 0
  try {
    for (const s of scenarios.filter((s) => !only || s.name.includes(only))) {
      const page = await browser.newPage(s.viewport ?? DESKTOP)
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `window.__csp = []; window.__errors = [];
          document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
          addEventListener('error', e => window.__errors.push(String(e.message)));`,
      })
      const ui = new Ui(page)
      const t0 = Date.now()
      try {
        await s.run(ui)
        if (!s.name.startsWith('公開版の CSP')) assert.deepEqual(await page.run(`return window.__csp`), [], 'CSP 違反が起きた')
        assert.deepEqual(await page.run(`return window.__errors`), [], 'ページでエラーが起きた')
        console.log(`  ✓ ${s.name}（${((Date.now() - t0) / 1000).toFixed(1)}秒）`)
      } catch (e) {
        failed++
        console.log(`  ✗ ${s.name}\n      ${e instanceof Error ? e.message : String(e)}`)
        mkdirSync(FAILURES, { recursive: true })
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' }).catch(() => ({ data: '' }))
        if (data) writeFileSync(join(FAILURES, `${scenarios.indexOf(s) + 1}.png`), Buffer.from(data, 'base64'))
      } finally {
        await page.send('Page.close').catch(() => {})
      }
    }
  } finally {
    await browser.close()
    await stopServer()
  }
  if (failed > 0) {
    console.log(`\n${failed} 件失敗しました（失敗時の画面: ${FAILURES}/）`)
    process.exit(1)
  }
  console.log('\ne2e OK')
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
