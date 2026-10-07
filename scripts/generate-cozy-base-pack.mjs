// Generates the V2.2D cozy base pack: guardian character sheet, lantern vault and diorama props.
// Concept: docs/V2_2D_CHARACTER_WORLD_CONCEPT.md. Pure Node, no dependencies; rerun after tweaks.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { deflateSync } from 'node:zlib'

const c = {
  outline: '#0E1424',
  ink: '#05070D',
  skinHi: '#F0B78A',
  skin: '#D79C73',
  skinShadow: '#A86C55',
  blush: '#E08A7A',
  mouth: '#6F3F38',
  hairDark: '#24160F',
  hair: '#3E2820',
  hairHi: '#5E3D2B',
  jacketDark: '#1C4F57',
  jacket: '#2B7A80',
  jacketHi: '#3E9A9C',
  scarfDark: '#B4832F',
  scarf: '#E2B54A',
  scarfHi: '#F6D57E',
  pants: '#2A2D3A',
  pantsHi: '#3A3F52',
  shoe: '#E9DFC8',
  sole: '#42D9F4',
  cyan: '#42D9F4',
  lens: '#9EE7F2',
  white: '#F6F3E8',
  gold: '#F3CF64',
  green: '#69E697',
  navyDark: '#0C1221',
  navy: '#17213A',
  navyHi: '#26345A',
  line: '#536184',
  brassDark: '#7A5E2C',
  brass: '#C9A04A',
  brassHi: '#EBCB7A',
  terracottaDark: '#7E3F2C',
  terracotta: '#B9623F',
  terracottaHi: '#D98A5E',
  leafDark: '#1F5A3E',
  leaf: '#3A8C5C',
  leafHi: '#69C47F',
  woodDark: '#3A2618',
  wood: '#6B4A2F',
  woodHi: '#8C6743',
  cork: '#B98B5A',
  corkDark: '#8E6640',
  paper: '#EFE6CF',
  paperShade: '#CFC3A4',
  ledgerA: '#4F5FA8',
  ledgerB: '#8A4F6B',
  ledgerC: '#3F7D6A',
  ledgerD: '#B08A3E',
  mug: '#E6DCC6',
  mugShade: '#B9AE96',
  tea: '#7A4A2A',
  pinRed: '#FF786F',
  pinBlue: '#5A82FF',
}

function rgba(hex, alpha = 255) {
  const v = hex.replace('#', '')
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), alpha]
}

function makeCanvas(width, height) {
  return { width, height, pixels: new Uint8Array(width * height * 4) }
}

function rect(cv, x, y, w, h, color, alpha = 255) {
  x = Math.round(x)
  y = Math.round(y)
  const [r, g, b, a] = rgba(color, alpha)
  for (let yy = Math.max(0, y); yy < Math.min(cv.height, y + h); yy++) {
    for (let xx = Math.max(0, x); xx < Math.min(cv.width, x + w); xx++) {
      const i = (yy * cv.width + xx) * 4
      cv.pixels[i] = r
      cv.pixels[i + 1] = g
      cv.pixels[i + 2] = b
      cv.pixels[i + 3] = a
    }
  }
}
const px = (cv, x, y, color, alpha = 255) => rect(cv, x, y, 1, 1, color, alpha)

// Filled shape with a 1px outline, corners cut for a rounded pixel look.
function box(cv, x, y, w, h, fill, outline = c.outline, round = true) {
  rect(cv, x, y, w, h, outline)
  rect(cv, x + 1, y + 1, w - 2, h - 2, fill)
  if (round) {
    for (const [cx, cy] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) {
      const i = (cy * cv.width + cx) * 4
      if (cx >= 0 && cy >= 0 && cx < cv.width && cy < cv.height) cv.pixels[i + 3] = 0
    }
  }
}

function disc(cv, cx, cy, r, color, alpha = 255) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cv, cx + x, cy + y, color, alpha)
}

function ring(cv, cx, cy, r, thickness, color) {
  const inner = r - thickness
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = x * x + y * y
      if (d <= r * r + r * 0.6 && d > inner * inner + inner * 0.6) px(cv, cx + x, cy + y, color)
    }
  }
}

// ---------------------------------------------------------------------------
// Character: 48x64 frames, 28 frames in one row (idle 0-3, typing 4-9, income 10-15, expense 16-19, walk 20-27).

function drawGuardianFrame(cv, frame, pose) {
  const ox = frame * 48
  const mode = pose.mode
  const bob = pose.bob ?? 0
  const oy = -bob
  const breathe = pose.breathe ?? 0
  const lean = mode === 'typing' ? 1 : 0
  const hx = ox + (pose.headShift ?? 0)
  const step = pose.step ?? 0
  const at = (x, y, w, h, color, alpha) => rect(cv, ox + x, oy + y, w, h, color, alpha)
  const hat = (x, y, w, h, color, alpha) => rect(cv, hx + x, oy + y + lean, w, h, color, alpha)

  // Contact shadow stays on the ground even when jumping.
  rect(cv, ox + 13, 60, 22, 2, c.ink, 110)
  rect(cv, ox + 11, 61, 26, 1, c.ink, 70)

  // Legs and shoes.
  const legL = 18 - (mode === 'walk' ? step : 0)
  const legR = 25 + (mode === 'walk' ? step : 0)
  const liftL = mode === 'walk' && step > 0 ? 1 : 0
  const liftR = mode === 'walk' && step < 0 ? 1 : 0
  for (const [lx, lift] of [[legL, liftL], [legR, liftR]]) {
    at(lx, 44, 6, 11 - lift, c.outline)
    at(lx + 1, 44, 4, 10 - lift, c.pants)
    at(lx + 1, 46, 1, 6 - lift, c.pantsHi)
    at(lx - 1, 54 - lift, 8, 4, c.outline)
    at(lx, 54 - lift, 6, 2, c.shoe)
    at(lx, 56 - lift, 6, 1, c.sole)
    at(lx + 4, 54 - lift, 2, 1, c.white)
  }

  // Torso: knit tech jacket with rounded shoulders.
  const ty = 29 + lean - breathe
  at(14, ty, 20, 16 + breathe, c.outline)
  at(13, ty + 2, 22, 13 + breathe, c.outline)
  at(15, ty + 1, 18, 14 + breathe, c.jacket)
  at(14, ty + 3, 20, 11 + breathe, c.jacket)
  at(14, ty + 3, 3, 11 + breathe, c.jacketDark)
  at(31, ty + 3, 2, 10, c.jacketHi)
  for (let y = ty + 4; y < ty + 13; y += 2) for (let x = 17 + ((y >> 1) % 2); x < 31; x += 3) at(x, y, 1, 1, c.jacketDark)
  at(15, ty + 13 + breathe, 18, 2, c.jacketDark)
  at(24, ty + 3, 1, 12 + breathe, c.cyan)
  at(28, ty + 5, 2, 2, c.gold)
  at(28, ty + 5, 1, 1, c.scarfHi)

  // Arms per mode.
  const sleeve = (x, y, w, h) => {
    at(x - 1, y - 1, w + 2, h + 2, c.outline)
    at(x, y, w, h, c.jacket)
    at(x, y, 1, h, c.jacketDark)
  }
  const hand = (x, y) => {
    at(x - 1, y - 1, 5, 4, c.outline)
    at(x, y, 3, 2, c.skin)
    at(x, y, 2, 1, c.skinHi)
  }
  if (mode === 'typing') {
    const phase = pose.hands ?? 0
    sleeve(12, ty + 3, 3, 8)
    sleeve(33, ty + 3, 3, 8)
    sleeve(15, ty + 9, 5, 3)
    sleeve(28, ty + 9, 5, 3)
    hand(19, ty + 9 + (phase === 0 ? -1 : 0))
    hand(26, ty + 9 + (phase === 1 ? -1 : 0))
  } else if (mode === 'income') {
    const raise = pose.raise ?? 0
    sleeve(10, ty - 6 - raise, 3, 10 + raise)
    sleeve(35, ty - 6 - raise, 3, 10 + raise)
    hand(10, ty - 9 - raise)
    hand(35, ty - 9 - raise)
  } else if (mode === 'expense') {
    sleeve(12, ty + 3, 3, 10)
    hand(12, ty + 13)
    sleeve(33, ty - 2, 3, 7)
    sleeve(30, ty - 6, 4, 3)
    hand(30, ty - 9)
  } else {
    const swing = mode === 'walk' ? step : 0
    sleeve(12, ty + 3 + Math.max(0, swing), 3, 10)
    sleeve(33, ty + 3 + Math.max(0, -swing), 3, 10)
    hand(12, ty + 13 + Math.max(0, swing))
    hand(33, ty + 13 + Math.max(0, -swing))
  }

  // Scarf: wrap at the neck and a tail falling on the right side.
  const sway = pose.scarfSway ?? 0
  hat(15, 26, 18, 5, c.outline)
  hat(16, 27, 16, 3, c.scarf)
  hat(16, 27, 16, 1, c.scarfHi)
  hat(19, 29, 1, 1, c.scarfDark)
  hat(25, 29, 1, 1, c.scarfDark)
  const tailX = 28 + sway
  at(tailX - 1, ty + 1, 5, 10, c.outline)
  at(tailX, ty + 1, 3, 9, c.scarf)
  at(tailX, ty + 1, 1, 9, c.scarfDark)
  at(tailX, ty + 4, 3, 1, c.scarfDark)
  for (let i = 0; i < 3; i += 2) at(tailX + i, ty + 10, 1, 1, c.scarf)

  // Head.
  hat(17, 12, 14, 15, c.outline)
  hat(16, 14, 16, 11, c.outline)
  hat(18, 13, 12, 13, c.skin)
  hat(17, 15, 14, 9, c.skin)
  hat(18, 13, 4, 2, c.skinHi)
  hat(29, 16, 2, 8, c.skinShadow)
  hat(18, 25, 12, 1, c.skinShadow)
  hat(16, 18, 1, 3, c.skin)

  // Hair with top knot.
  hat(16, 10, 16, 6, c.outline)
  hat(17, 11, 14, 4, c.hair)
  hat(17, 15, 4, 2, c.hair)
  hat(26, 15, 5, 1, c.hair)
  hat(30, 15, 1, 4, c.hairDark)
  hat(19, 11, 6, 1, c.hairHi)
  hat(21, 4, 7, 7, c.outline)
  hat(22, 5, 5, 5, c.hair)
  hat(23, 5, 2, 1, c.hairHi)
  hat(22, 9, 5, 1, c.scarf)

  // Round glasses and eyes.
  const blink = pose.blink ?? false
  const look = pose.look ?? 0
  for (const gx of [18, 24]) {
    hat(gx, 17, 5, 5, c.outline)
    hat(gx + 1, 18, 3, 3, c.lens)
    hat(gx + 1, 18, 3, 3, c.skin)
    hat(gx + 1, 18, 3, 3, c.lens, 90)
    if (blink) hat(gx + 1, 19, 3, 1, c.outline)
    else hat(gx + 2 + look, 19, 1, 2, c.outline)
    hat(gx + 3, 18, 1, 1, c.white)
  }
  hat(23, 19, 1, 1, c.outline)
  hat(18, 22, 2, 1, c.blush)
  hat(28, 22, 2, 1, c.blush)

  // Mouth per mood.
  if (mode === 'income') {
    hat(22, 23, 4, 1, c.mouth)
    hat(21, 22, 1, 1, c.mouth)
    hat(26, 22, 1, 1, c.mouth)
  } else if (mode === 'expense') {
    hat(22, 24, 3, 1, c.mouth)
    hat(25, 23, 1, 1, c.mouth)
  } else {
    hat(22, 23, 3, 1, c.mouth)
  }

  // Headset: thin band over the hair, one ear cup and a short mic.
  hat(17, 10, 14, 1, c.navyHi)
  hat(30, 16, 3, 6, c.outline)
  hat(31, 17, 1, 4, c.cyan)
  hat(28, 23, 3, 1, c.navyHi)
  hat(27, 23, 1, 1, c.green)

  // Mood accents.
  if (mode === 'expense') {
    const drop = pose.drop ?? 0
    hat(33, 9 + drop, 1, 2, c.lens)
    hat(33, 11 + drop, 1, 1, c.cyan)
  }
  if (mode === 'income') {
    for (const [sx, sy] of pose.sparkles ?? []) {
      at(sx, sy, 1, 3, c.gold)
      at(sx - 1, sy + 1, 3, 1, c.gold)
    }
  }
}

function drawGuardian() {
  const cv = makeCanvas(48 * 28, 64)
  const frames = [
    // idle
    { mode: 'idle', breathe: 0 },
    { mode: 'idle', breathe: 0, scarfSway: 1 },
    { mode: 'idle', breathe: 1, scarfSway: 1 },
    { mode: 'idle', breathe: 1, blink: true },
    // typing
    ...[0, 1, 0, 1, 0, 1].map((hands, i) => ({ mode: 'typing', hands, headShift: 1, look: i === 4 ? 1 : 0, blink: i === 5 })),
    // income
    ...[0, 2, 4, 4, 2, 1].map((raise, i) => ({
      mode: 'income',
      raise,
      bob: [0, 1, 2, 2, 1, 0][i],
      sparkles: [[[6, 14], [40, 10]], [[5, 10], [41, 14]], [[7, 6], [39, 8]], [[4, 12], [42, 6]], [[6, 8], [40, 12]], [[8, 12]]][i],
    })),
    // expense
    ...[0, 1, 0, 1].map((drop, i) => ({ mode: 'expense', drop, scarfSway: i % 2 })),
    // walk
    ...[-2, -1, 0, 1, 2, 1, 0, -1].map((step, i) => ({ mode: 'walk', step, bob: i % 4 === 2 ? 1 : 0, scarfSway: step > 0 ? 1 : 0 })),
  ]
  if (frames.length !== 28) throw new Error(`Expected 28 frames, got ${frames.length}`)
  frames.forEach((pose, index) => drawGuardianFrame(cv, index, pose))
  return cv
}

// ---------------------------------------------------------------------------
// Lantern vault: 120x108. Overlay anchors: ring (60,47) r38, core 54x40 at (60,47), display 38x10 at (60,83).

function drawLanternVault() {
  const cv = makeCanvas(120, 108)

  // Body with brass frame.
  box(cv, 8, 8, 104, 91, c.navy)
  rect(cv, 9, 9, 102, 3, c.brass)
  rect(cv, 9, 9, 102, 1, c.brassHi)
  rect(cv, 9, 93, 102, 5, c.brass)
  rect(cv, 9, 97, 102, 1, c.brassDark)
  rect(cv, 9, 12, 3, 81, c.brassDark)
  rect(cv, 108, 12, 3, 81, c.brass)
  rect(cv, 12, 12, 96, 2, c.navyHi)
  rect(cv, 12, 88, 96, 5, c.navyDark)

  // Rivets in the corners.
  for (const [rx, ry] of [[16, 18], [103, 18], [16, 86], [103, 86]]) {
    rect(cv, rx - 1, ry - 1, 3, 3, c.brassDark)
    px(cv, rx, ry, c.brassHi)
  }

  // Hinges on the left side.
  for (const hy of [26, 62]) {
    rect(cv, 4, hy, 8, 10, c.outline)
    rect(cv, 5, hy + 1, 6, 8, c.brass)
    rect(cv, 5, hy + 1, 6, 1, c.brassHi)
    rect(cv, 5, hy + 8, 6, 1, c.brassDark)
  }

  // Round door with brass bezel; the procedural health ring sits on it.
  disc(cv, 60, 47, 42, c.outline)
  disc(cv, 60, 47, 41, c.brassDark)
  disc(cv, 60, 47, 40, c.brass)
  disc(cv, 60, 47, 36, c.outline)
  disc(cv, 60, 47, 35, c.navyDark)
  for (let a = 0; a < 12; a++) {
    const angle = (a / 12) * Math.PI * 2
    px(cv, Math.round(60 + Math.cos(angle) * 38), Math.round(47 + Math.sin(angle) * 38), c.brassHi)
  }

  // Display slot and feet.
  rect(cv, 39, 77, 42, 13, c.outline)
  rect(cv, 40, 78, 40, 11, c.navyDark)
  rect(cv, 40, 78, 40, 1, c.line)
  for (const fx of [16, 90]) {
    rect(cv, fx, 99, 14, 7, c.outline)
    rect(cv, fx + 1, 99, 12, 5, c.brassDark)
    rect(cv, fx + 1, 99, 12, 1, c.brass)
  }

  // Handle on the right of the door.
  rect(cv, 100, 39, 6, 16, c.outline)
  rect(cv, 101, 40, 4, 14, c.brass)
  rect(cv, 101, 40, 1, 14, c.brassHi)

  // Lantern cap on top: a small housing with a bail, where the status light glows above.
  rect(cv, 46, 0, 28, 3, c.outline)
  rect(cv, 47, 1, 26, 1, c.brass)
  rect(cv, 46, 0, 3, 9, c.outline)
  rect(cv, 71, 0, 3, 9, c.outline)
  rect(cv, 47, 1, 1, 7, c.brass)
  rect(cv, 72, 1, 1, 7, c.brass)
  rect(cv, 52, 3, 16, 7, c.outline)
  rect(cv, 53, 4, 14, 5, c.brassDark)
  rect(cv, 54, 5, 12, 3, c.lens, 160)
  rect(cv, 54, 5, 12, 1, c.white, 180)
  return cv
}

// ---------------------------------------------------------------------------
// Diorama props.

function drawPlant() {
  const cv = makeCanvas(32, 44)
  // Leaves.
  const leaf = (x, y, w, h, flip = false) => {
    box(cv, x, y, w, h, c.leaf)
    rect(cv, x + 1, y + 1, w - 2, 1, c.leafHi)
    rect(cv, flip ? x + w - 2 : x + 1, y + 2, 1, h - 3, c.leafDark)
  }
  leaf(3, 10, 11, 7)
  leaf(18, 6, 11, 7, true)
  leaf(9, 1, 9, 10)
  leaf(1, 18, 10, 6)
  leaf(21, 15, 10, 6, true)
  rect(cv, 15, 10, 2, 16, c.leafDark)
  rect(cv, 11, 16, 2, 9, c.leafDark)
  rect(cv, 20, 13, 2, 12, c.leafDark)
  // Pot.
  box(cv, 6, 24, 20, 5, c.terracottaHi)
  box(cv, 8, 28, 16, 15, c.terracotta)
  rect(cv, 9, 29, 3, 13, c.terracottaHi)
  rect(cv, 21, 29, 2, 13, c.terracottaDark)
  rect(cv, 9, 33, 14, 1, c.terracottaDark)
  return cv
}

function drawLedgerShelf() {
  const cv = makeCanvas(96, 52)
  // Shelf board and brackets.
  box(cv, 0, 40, 96, 7, c.wood, c.woodDark, false)
  rect(cv, 1, 41, 94, 1, c.woodHi)
  for (const bx of [8, 82]) {
    rect(cv, bx, 47, 5, 5, c.woodDark)
    rect(cv, bx + 1, 47, 3, 3, c.wood)
  }
  // Ledger binders with spine labels (no numbers).
  const books = [[4, 14, 10, c.ledgerA], [15, 10, 9, c.ledgerB], [25, 16, 10, c.ledgerC], [36, 12, 8, c.ledgerD], [45, 18, 9, c.ledgerA]]
  for (const [x, top, w, color] of books) {
    box(cv, x, top, w, 40 - top, color, c.outline, false)
    rect(cv, x + 1, top + 1, 1, 38 - top, c.white, 60)
    rect(cv, x + 2, top + 5, w - 4, 4, c.paper)
    rect(cv, x + 2, top + 6, w - 5, 1, c.paperShade)
    rect(cv, x + 2, 36, w - 4, 1, c.outline, 120)
  }
  // Leaning ledger.
  for (let i = 0; i < 22; i++) rect(cv, 56 + Math.floor(i / 3), 18 + i, 8, 1, c.ledgerB)
  for (let i = 0; i < 22; i++) px(cv, 56 + Math.floor(i / 3), 18 + i, c.outline)
  // Coin jar.
  box(cv, 72, 20, 16, 20, c.lens, c.outline, true)
  rect(cv, 73, 21, 14, 18, c.lens, 70)
  rect(cv, 71, 18, 18, 3, c.outline)
  rect(cv, 72, 19, 16, 1, c.brass)
  for (const [x, y] of [[74, 33], [78, 34], [82, 33], [76, 30], [80, 31], [84, 30], [78, 27]]) {
    rect(cv, x, y, 3, 2, c.gold)
    px(cv, x, y, c.scarfHi)
  }
  rect(cv, 74, 23, 1, 12, c.white, 150)
  return cv
}

function drawMug() {
  const cv = makeCanvas(14, 16)
  box(cv, 1, 4, 10, 11, c.mug)
  rect(cv, 2, 5, 8, 2, c.tea)
  rect(cv, 8, 7, 2, 7, c.mugShade)
  rect(cv, 10, 6, 4, 6, c.outline)
  rect(cv, 11, 7, 2, 4, c.mug)
  rect(cv, 11, 8, 1, 2, c.outline)
  rect(cv, 3, 10, 4, 1, c.jacket)
  rect(cv, 4, 9, 2, 3, c.jacket)
  return cv
}

function drawMonthBoard() {
  const cv = makeCanvas(64, 48)
  box(cv, 0, 0, 64, 48, c.cork, c.woodDark, false)
  rect(cv, 1, 1, 62, 2, c.woodHi)
  rect(cv, 1, 45, 62, 2, c.wood)
  for (let y = 5; y < 44; y += 4) for (let x = 3 + (y % 8); x < 61; x += 7) px(cv, x, y, c.corkDark)
  // Month grid card (abstract cells, no numbers).
  box(cv, 5, 6, 30, 24, c.paper, c.paperShade, false)
  rect(cv, 6, 7, 28, 4, c.jacket)
  for (let row = 0; row < 3; row++) for (let col = 0; col < 5; col++) rect(cv, 7 + col * 5, 13 + row * 5, 4, 4, c.paperShade)
  rect(cv, 17, 18, 4, 4, c.scarf)
  rect(cv, 27, 23, 4, 4, c.green)
  // Notes.
  box(cv, 39, 8, 18, 15, '#F7E08A', c.scarfDark, false)
  rect(cv, 41, 12, 12, 1, c.scarfDark)
  rect(cv, 41, 15, 9, 1, c.scarfDark)
  box(cv, 40, 27, 18, 15, '#BFE7DA', c.jacketDark, false)
  rect(cv, 42, 31, 12, 1, c.jacketDark)
  rect(cv, 42, 34, 8, 1, c.jacketDark)
  box(cv, 8, 33, 22, 10, c.paper, c.paperShade, false)
  rect(cv, 10, 36, 16, 1, c.line)
  rect(cv, 10, 39, 11, 1, c.line)
  // Pins.
  for (const [x, y, color] of [[19, 6, c.pinRed], [47, 8, c.pinBlue], [48, 27, c.pinRed], [18, 33, c.pinBlue]]) {
    rect(cv, x - 1, y - 1, 3, 3, c.outline)
    px(cv, x, y, color)
  }
  return cv
}

// ---------------------------------------------------------------------------
// PNG encoding (RGBA, no filter).

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let v = n
  for (let k = 0; k < 8; k++) v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1
  return v >>> 0
})

function crc32(buffer) {
  let v = 0xffffffff
  for (const byte of buffer) v = crcTable[(v ^ byte) & 0xff] ^ (v >>> 8)
  return (v ^ 0xffffffff) >>> 0
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(cv) {
  const raw = Buffer.alloc((cv.width * 4 + 1) * cv.height)
  for (let y = 0; y < cv.height; y++) {
    const rowStart = y * (cv.width * 4 + 1)
    raw[rowStart] = 0
    Buffer.from(cv.pixels.buffer, y * cv.width * 4, cv.width * 4).copy(raw, rowStart + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(cv.width, 0)
  ihdr.writeUInt32BE(cv.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND'),
  ])
}

async function writePng(path, cv) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, encodePng(cv))
  console.log(`${path} ${cv.width}x${cv.height}`)
}

await writePng('public/assets/characters/programmer.png', drawGuardian())
await writePng('public/assets/tech/digital-vault-shell.png', drawLanternVault())
await writePng('public/assets/furniture/plant-pot.png', drawPlant())
await writePng('public/assets/furniture/ledger-shelf.png', drawLedgerShelf())
await writePng('public/assets/furniture/desk-mug.png', drawMug())
await writePng('public/assets/tech/month-board.png', drawMonthBoard())
