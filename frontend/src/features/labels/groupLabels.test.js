import test from 'node:test'
import assert from 'node:assert/strict'
import { groupLabelRegions } from './groupLabels.js'
import { parseLabel } from './parseLabel.js'

function line(text, x0, y0, x1, y1) {
  return { text, confidence: 95, bbox: { x0, y0, x1, y1 }, words: [] }
}

test('keeps nearby OCR lines together as one label region', () => {
  const lines = [
    line('SAMPLE PHARMACY', 20, 20, 180, 34),
    line('SAMPLE DRUG 10 MG', 20, 42, 190, 56),
    line('Take one tablet daily', 20, 64, 190, 78),
  ]

  const regions = groupLabelRegions(lines)
  assert.equal(regions.length, 1)
  assert.equal(regions[0].text, 'SAMPLE PHARMACY\nSAMPLE DRUG 10 MG\nTake one tablet daily')
})

test('splits vertically separated labels into separate ordered regions', () => {
  const lines = [
    line('LABEL ONE', 20, 20, 120, 34),
    line('DRUG ONE 10 MG', 20, 42, 160, 56),
    line('LABEL TWO', 20, 150, 120, 164),
    line('DRUG TWO 20 MG', 20, 172, 160, 186),
  ]

  const regions = groupLabelRegions(lines)
  assert.equal(regions.length, 2)
  assert.match(regions[0].text, /DRUG ONE/)
  assert.match(regions[1].text, /DRUG TWO/)
})

test('splits horizontally separated labels into separate regions', () => {
  const lines = [
    line('LEFT LABEL', 20, 20, 120, 34),
    line('LEFT DRUG 10 MG', 20, 42, 160, 56),
    line('RIGHT LABEL', 320, 20, 440, 34),
    line('RIGHT DRUG 20 MG', 320, 42, 470, 56),
  ]

  const regions = groupLabelRegions(lines)
  assert.equal(regions.length, 2)
  assert.match(regions[0].text, /LEFT DRUG/)
  assert.match(regions[1].text, /RIGHT DRUG/)
})

test('parses spatially separated medications independently', () => {
  const lines = [
    line('ALPHA MEDICINE 10 MG TABLET', 20, 20, 220, 34),
    line('Take one tablet once daily', 20, 42, 220, 56),
    line('BETA MEDICINE 20 MG TABLET', 20, 150, 220, 164),
    line('Take one tablet twice daily', 20, 172, 220, 186),
  ]

  const regions = groupLabelRegions(lines)
  const parsedLabels = regions.map((region) => parseLabel(region.text, region.lines))

  assert.equal(parsedLabels.length, 2)
  assert.equal(parsedLabels[0].drugName.value, 'ALPHA MEDICINE')
  assert.equal(parsedLabels[0].dose.value, '10 MG')
  assert.equal(parsedLabels[1].drugName.value, 'BETA MEDICINE')
  assert.equal(parsedLabels[1].dose.value, '20 MG')
})

test('falls back to a single OCR result when bounding boxes are unavailable', () => {
  const regions = groupLabelRegions([{ text: 'line one' }, { text: 'line two' }], 'line one\nline two')

  assert.equal(regions.length, 1)
  assert.equal(regions[0].text, 'line one\nline two')
})

test('keeps all text together rather than dropping lines with partial geometry', () => {
  const lines = [line('positioned', 10, 10, 100, 24), { text: 'unpositioned' }]
  const regions = groupLabelRegions(lines, 'positioned\nunpositioned')

  assert.equal(regions.length, 1)
  assert.equal(regions[0].text, 'positioned\nunpositioned')
})
