import { describe, expect, it } from 'vitest'
import { probeFrameRateInBytes } from './mp4-probe'

function box(type: string, content: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + content.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, out.length)
  out.set(new TextEncoder().encode(type), 4)
  out.set(content, 8)
  return out
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4)
  new DataView(out.buffer).setUint32(0, value)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** Minimal MP4 with a 25 fps video track (timescale 25000, stts delta 1000). */
function make25FpsMp4(): Uint8Array {
  const mdhd = box(
    'mdhd',
    new Uint8Array([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(25000), ...u32(25000),
    ]),
  )
  const hdlr = box(
    'hdlr',
    new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, ...new TextEncoder().encode('vide'), 0, 0, 0, 0]),
  )
  const stts = box('stts', new Uint8Array([0, 0, 0, 0, ...u32(1), ...u32(1000), ...u32(1000)]))
  const stbl = box('stbl', stts)
  const minf = box('minf', stbl)
  const mdia = box('mdia', concat(mdhd, hdlr, minf))
  const trak = box('trak', mdia)
  const moov = box('moov', trak)
  const ftyp = box('ftyp', new TextEncoder().encode('isom'))
  return concat(ftyp, moov)
}

describe('probeFrameRateInBytes', () => {
  it('reads average frame rate from a minimal moov', () => {
    expect(probeFrameRateInBytes(make25FpsMp4())).toEqual({ numerator: 25, denominator: 1 })
  })

  it('returns null when moov is missing', () => {
    expect(probeFrameRateInBytes(new Uint8Array([0, 0, 0, 8, ...new TextEncoder().encode('ftyp')]))).toBeNull()
  })
})
