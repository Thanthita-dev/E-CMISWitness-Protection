/**
 * ตัวสร้าง QR Code ขนาดเล็ก (ไม่เพิ่ม dependency) — โหมด byte, ระดับแก้ไขข้อผิดพลาด M, รุ่น 1–10 (สูงสุด 213 ไบต์)
 * พอสำหรับลิงก์ลงชื่อของ Prototype อ้างอิงขั้นตอนตามมาตรฐาน ISO/IEC 18004 (แนวเดียวกับ qrcodegen ของ Nayuki)
 */

const ECC_CODEWORDS_PER_BLOCK_M = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const NUM_BLOCKS_M = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MAX_VERSION = 10

const numRawDataModules = (ver: number): number => {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

const numDataCodewords = (ver: number): number =>
  Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK_M[ver - 1] * NUM_BLOCKS_M[ver - 1]

/* ---------- Reed–Solomon บน GF(2^8) โพลิโนเมียล 0x11D ---------- */
const gfMul = (x: number, y: number): number => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

const rsDivisor = (degree: number): number[] => {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = gfMul(root, 0x02)
  }
  return result
}

const rsRemainder = (data: number[], divisor: number[]): number[] => {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ (result.shift() as number)
    result.push(0)
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)))
  }
  return result
}

const getBit = (x: number, i: number): boolean => ((x >>> i) & 1) !== 0

/** สร้างเมทริกซ์ QR (true = จุดดำ) จากข้อความ UTF-8 */
export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))

  let ver = 1
  for (; ver <= MAX_VERSION; ver++) {
    const ccBits = ver <= 9 ? 8 : 16
    if (4 + ccBits + bytes.length * 8 <= numDataCodewords(ver) * 8) break
  }
  if (ver > MAX_VERSION) throw new Error('ข้อความยาวเกินกว่าที่ QR Code รุ่น 1–10 รองรับ')

  /* ---------- ข้อมูล: โหมด byte + จำนวนตัวอักษร + ข้อมูล + terminator + pad ---------- */
  const bits: number[] = []
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  push(0b0100, 4)
  push(bytes.length, ver <= 9 ? 8 : 16)
  bytes.forEach((b) => push(b, 8))
  const capacityBits = numDataCodewords(ver) * 8
  push(0, Math.min(4, capacityBits - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8)
  const dataCodewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) dataCodewords.push(parseInt(bits.slice(i, i + 8).join(''), 2))

  /* ---------- แบ่งบล็อก เติม ECC แล้วสลับลำดับ (interleave) ---------- */
  const numBlocks = NUM_BLOCKS_M[ver - 1]
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK_M[ver - 1]
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const divisor = rsDivisor(blockEccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, divisor)
    if (i < numShortBlocks) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i])
    })
  }

  /* ---------- วาดรูปแบบตายตัว ---------- */
  const size = ver * 4 + 17
  const modules: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const isFunction: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const setFunction = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  for (let i = 0; i < size; i++) {
    setFunction(6, i, i % 2 === 0)
    setFunction(i, 6, i % 2 === 0)
  }
  const drawFinder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunction(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  drawFinder(3, 3)
  drawFinder(size - 4, 3)
  drawFinder(3, size - 4)

  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2
    const step = Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2
    const positions = [6]
    for (let pos = size - 7; positions.length < numAlign; pos -= step) positions.splice(1, 0, pos)
    positions.forEach((px, i) =>
      positions.forEach((py, j) => {
        const last = numAlign - 1
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) setFunction(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      })
    )
  }

  const drawFormat = (mask: number) => {
    const data = (0 << 3) | mask // ระดับ M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const fmt = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) setFunction(8, i, getBit(fmt, i))
    setFunction(8, 7, getBit(fmt, 6))
    setFunction(8, 8, getBit(fmt, 7))
    setFunction(7, 8, getBit(fmt, 8))
    for (let i = 9; i < 15; i++) setFunction(14 - i, 8, getBit(fmt, i))
    for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, getBit(fmt, i))
    for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, getBit(fmt, i))
    setFunction(8, size - 8, true)
  }
  drawFormat(0)

  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const vbits = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = getBit(vbits, i)
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunction(a, b, dark)
      setFunction(b, a, dark)
    }
  }

  /* ---------- วางข้อมูลแบบซิกแซก ---------- */
  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = getBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7))
          bitIndex++
        }
      }
    }
  }

  /* ---------- เลือก mask ที่ค่าปรับน้อยที่สุด ---------- */
  const maskFn = (mask: number, x: number, y: number): boolean => {
    switch (mask) {
      case 0: return (x + y) % 2 === 0
      case 1: return y % 2 === 0
      case 2: return x % 3 === 0
      case 3: return (x + y) % 3 === 0
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    }
  }
  const applyMask = (mask: number) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) if (!isFunction[y][x] && maskFn(mask, x, y)) modules[y][x] = !modules[y][x]
    }
  }
  const penalty = (): number => {
    let score = 0
    const runs = (get: (i: number, j: number) => boolean) => {
      for (let i = 0; i < size; i++) {
        let run = 1
        for (let j = 1; j <= size; j++) {
          if (j < size && get(i, j) === get(i, j - 1)) run++
          else {
            if (run >= 5) score += run - 2
            run = 1
          }
        }
      }
    }
    runs((i, j) => modules[i][j])
    runs((i, j) => modules[j][i])
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = modules[y][x]
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) score += 3
      }
    }
    const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
    const total = size * size
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10
    return score
  }

  let bestMask = 0
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask)
    drawFormat(mask)
    const score = penalty()
    if (score < bestScore) {
      bestScore = score
      bestMask = mask
    }
    applyMask(mask) // ย้อนกลับ (XOR ซ้ำ)
  }
  applyMask(bestMask)
  drawFormat(bestMask)
  return modules
}
