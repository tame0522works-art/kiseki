// README に載せる画面の画像を撮る。公開と同じ設定のビルドを配信した状態（npm run build → npm run preview）で
// `npm run screenshots` を実行する。Edge（なければ Chrome）を画面なしで起動し、Chrome DevTools Protocol で操作する。
// 通過は軌道要素と撮る日時で変わるので、撮るたびに一覧から選ぶ（ISS があれば ISS、なければ最初の通過）。
// 時刻のつまみは、いちばん高くなる時刻に合わせる。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Browser, sleep, type Page } from './cdp.ts'

const BASE = process.argv[2] ?? 'http://localhost:5208/'
const OUT = 'docs/images'

async function shoot(cdp: Page, name: string) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, name), Buffer.from(data, 'base64'))
  console.log(`  ${OUT}/${name}`)
}

async function open(cdp: Page) {
  await cdp.goto(BASE)
  // 同じポートで別の作品が動いていると、その画面を撮ってしまうので、kiseki であることを先に確かめる
  const title = await cdp.run<string>(`return document.title`)
  if (title !== 'kiseki') throw new Error(`${BASE} で動いているのは kiseki ではありません（ページの題名: ${title || 'なし'}）`)
  await cdp.waitFor(`document.querySelectorAll('.passes li button').length > 0`, '通過の一覧', 30_000)
}

/** ISS の通過（なければ最初の通過）を選び、つまみをいちばん高い時刻に合わせる。選んだ通過の文を返す */
async function pickAndPeak(cdp: Page): Promise<string> {
  return cdp.run<string>(`
    const buttons = [...document.querySelectorAll('.passes li button')];
    const b = buttons.find(x => x.textContent.includes('ISS')) ?? buttons[0];
    b.click();
    await new Promise(r => setTimeout(r, 300));
    const toSec = (t) => t.split(':').reduce((a, v) => a * 60 + Number(v), 0);
    const [start, peak] = [...document.querySelectorAll('.detail dd')].map(d => toSec(d.textContent.match(/\\d\\d:\\d\\d:\\d\\d/)[0]));
    const input = document.querySelector('.player input');
    // つまみの 0 は見え始めの 2 分前
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String((peak - start + 120) * 1000));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    window.scrollTo(0, 0);
    return b.textContent.replace(/\\s+/g, ' ');
  `)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  // このブラウザ専用の一時プロファイルを使うので、普段のデータには触れない
  const browser = await Browser.launch()
  try {
    const cdp = await browser.newPage({ width: 1100, height: 900 })
    console.log('撮影:')

    await open(cdp)
    console.log(`  選んだ通過: ${await pickAndPeak(cdp)}`)
    await shoot(cdp, 'pass.png')

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await open(cdp)
    await pickAndPeak(cdp)
    await sleep(200)
    await shoot(cdp, 'mobile.png')
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
