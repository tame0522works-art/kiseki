// SGP4 の検証用データと、CelesTrak の GP（軌道要素）を raw/ に取ってくる。
// CelesTrak の GP は約2時間ごとに更新される。それより短い間隔で取り直さないよう、2時間以内のファイルがあれば取らない。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { inflateRawSync } from 'node:zlib'
import { GP_GROUPS, VALLADO_ENTRIES, VALLADO_URL, VALLADO_ZIP, gpRaw, gpUrl } from './source.ts'

const FRESH_MS = 2 * 60 * 60 * 1000

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** zip の中の1ファイルを取り出す。中央ディレクトリを読み、無圧縮か deflate のものだけ扱う */
function unzipEntry(zip: Buffer, name: string): Buffer {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('zip の終端が見つからない')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10)
    const size = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const local = zip.readUInt32LE(p + 42)
    if (zip.toString('latin1', p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
      const body = zip.subarray(start, start + size)
      if (method === 0) return body
      if (method === 8) return inflateRawSync(body)
      throw new Error(`${name}: 対応していない圧縮方式 ${method}`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`${name} が zip の中にない`)
}

mkdirSync('raw', { recursive: true })

if (!existsSync(VALLADO_ZIP)) writeFileSync(VALLADO_ZIP, await download(VALLADO_URL))
const zip = readFileSync(VALLADO_ZIP)
for (const [out, entry] of Object.entries(VALLADO_ENTRIES)) {
  writeFileSync(out, unzipEntry(zip, entry))
  console.log(`${out}: ${entry} から`)
}

for (const group of GP_GROUPS) {
  const out = gpRaw(group)
  if (existsSync(out) && Date.now() - statSync(out).mtimeMs < FRESH_MS) {
    console.log(`${out}: 2時間以内に取ったので取り直さない`)
    continue
  }
  const buf = await download(gpUrl(group))
  const list: unknown = JSON.parse(buf.toString('utf8'))
  if (!Array.isArray(list) || list.length === 0) throw new Error(`${group}: 空か、JSON の配列ではない応答`)
  writeFileSync(out, buf)
  console.log(`${out}: ${list.length} 件`)
}
