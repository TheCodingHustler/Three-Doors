import test from 'node:test'
import assert from 'node:assert/strict'
import { getConfidentTextBounds } from './cropLabel.js'

function line(confidence, x0, y0, x1, y1) {
  return { confidence, bbox: { x0, y0, x1, y1 } }
}

test('calculates crop bounds from confident text and excludes low-confidence junk', () => {
  const bounds = getConfidentTextBounds([
    line(95, 40, 50, 180, 64),
    line(92, 45, 80, 190, 94),
    line(12, 0, 0, 500, 20),
  ], 500, 300)

  assert.deepEqual(bounds, { left: 12, top: 22, width: 206, height: 100 })
})

test('clamps crop padding at image edges', () => {
  const bounds = getConfidentTextBounds([line(90, 2, 1, 50, 15)], 100, 80)
  assert.deepEqual(bounds, { left: 0, top: 0, width: 78, height: 43 })
})

test('returns no crop when there are no confident positioned lines', () => {
  assert.equal(getConfidentTextBounds([line(20, 10, 10, 40, 20)], 100, 100), null)
  assert.equal(getConfidentTextBounds([{ confidence: 99, text: 'no box' }], 100, 100), null)
})
