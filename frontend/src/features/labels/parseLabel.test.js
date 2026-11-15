import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLabel, shouldRetryOCR } from './parseLabel.js'
import { getFieldSentence } from './plainLanguage.js'

const sampleLabel = `EXAMPLE MEDICINE 10 MG TABLET
Take 1 tablet in the evening.
Qty: 30 Refills: 4`

test('extracts a labeled strength, drug name, quantity, and refills', () => {
  const parsed = parseLabel(sampleLabel)

  assert.equal(parsed.drugName.value, 'EXAMPLE MEDICINE')
  assert.equal(parsed.drugName.status, 'found')
  assert.equal(parsed.dose.value, '10 MG')
  assert.equal(parsed.dose.originalText, '10 MG')
  assert.equal(parsed.quantity.value, '30')
  assert.equal(parsed.refills.value, '4')
  assert.equal(parsed.directions.value, 'Take 1 tablet in the evening.')
  assert.equal(parsed.frequency.status, 'unclear')
})

test('extracts common frequency and flags low-confidence quantity fields', () => {
  const text = `SAMPLE MEDICINE 25 mg tablet
Take 1 tablet by mouth once daily
QTY: 30 RF: 3
Avoid alcohol.`
  const lines = text.split('\n').map((textLine) => ({
    text: textLine,
    confidence: textLine.startsWith('QTY:') ? 58 : 95,
  }))
  const parsed = parseLabel(text, lines)

  assert.equal(parsed.drugName.value, 'SAMPLE MEDICINE')
  assert.equal(parsed.dose.value, '25 mg')
  assert.equal(parsed.frequency.value, 'once daily')
  assert.equal(parsed.route.value, 'by mouth')
  assert.equal(parsed.quantity.value, null)
  assert.equal(parsed.quantity.originalText, 'QTY: 30')
  assert.equal(parsed.quantity.status, 'unclear')
  assert.equal(parsed.refills.status, 'unclear')
  assert.match(parsed.warnings.value, /Avoid alcohol/)
})

test('normalizes frequency while preserving exact source text', () => {
  const parsed = parseLabel(`SAMPLE DRUG 50 mg tablet
Take one capsule twice a day.
Quantity: 60 Refills: 2`)

  assert.equal(parsed.drugName.value, 'SAMPLE DRUG')
  assert.equal(parsed.dose.value, '50 mg')
  assert.equal(parsed.frequency.value, 'twice daily')
  assert.equal(parsed.frequency.originalText, 'twice a day')
  assert.equal(parsed.quantity.value, '60')
  assert.equal(parsed.refills.value, '2')
})

test('maps abbreviations and keeps PO as route rather than frequency', () => {
  const parsed = parseLabel('Drug A 5 mg\nTake 1 tablet PO BID')

  assert.equal(parsed.frequency.value, 'twice daily')
  assert.equal(parsed.route.value, 'by mouth')
  assert.equal(parsed.directions.value, 'Take 1 tablet by mouth twice daily')
})

test('maps TID, QD, and PRN abbreviations', () => {
  assert.equal(parseLabel('Take one capsule TID').frequency.value, 'three times daily')
  assert.equal(parseLabel('Take one tablet QD').frequency.value, 'once daily')
  assert.equal(parseLabel('Use PRN').frequency.value, 'as needed')
})

test('recognizes interval, bedtime, and RF wording', () => {
  assert.equal(parseLabel('Take every 8 hours').frequency.value, 'every 8 hours')
  assert.equal(parseLabel('Take at bedtime').frequency.value, 'at bedtime')
  assert.equal(parseLabel('Take 1 tablet every morning on an empty stomach.').frequency.value, 'every morning')
  assert.equal(parseLabel('Qty: 15 RF: 2').refills.value, '2')
})

test('does not treat prescription numbers, dates, or phone numbers as dose', () => {
  const parsed = parseLabel('Rx 0014456\n11/13/2026\n(555) 010-0145')

  assert.equal(parsed.dose.value, null)
  assert.equal(parsed.dose.status, 'unclear')
})

test('flags conflicting strengths rather than choosing one', () => {
  const parsed = parseLabel('Drug A 5 mg\nDrug B 10 mg')

  assert.equal(parsed.dose.value, null)
  assert.equal(parsed.dose.status, 'unclear')
  assert.equal(parsed.dose.originalText, '5 mg\n10 mg')
})

test('does not confidently guess a drug name from the line above directions', () => {
  const parsed = parseLabel('ALEX SAMPLE\nTake one tablet by mouth daily')

  assert.equal(parsed.drugName.value, null)
  assert.equal(parsed.drugName.originalText, 'ALEX SAMPLE')
  assert.equal(parsed.drugName.status, 'unclear')
})

test('reads the screenshot label without inventing a strength or route', () => {
  const parsed = parseLabel('Ibuprofen\nTake twice a day, 2 tablets each time')
  assert.equal(parsed.drugName.value, 'Ibuprofen')
  assert.equal(parsed.drugName.status, 'found')
  assert.equal(parsed.dose.value, '2 tablets')
  assert.equal(parsed.dose.originalText, '2 tablets')
  assert.equal(parsed.frequency.value, 'twice daily')
  assert.equal(parsed.route.value, null)
  assert.equal(getFieldSentence('drugName', parsed.drugName, 'Medication'), 'Medication: Ibuprofen.')
  assert.equal(getFieldSentence('dose', parsed.dose, 'Dose'), 'Dose: 2 tablets.')
})

test('accepts explicit medication names but does not correct unknown standalone text', () => {
  assert.equal(parseLabel('Medication: ExampleDrug\nTake two capsules daily').drugName.value, 'ExampleDrug')
  assert.equal(parseLabel('Ibuproten\nTake two capsules daily').drugName.status, 'unclear')
  assert.equal(parseLabel('Ibuproten\nTake two capsules daily').dose.value, 'two capsules')
})

test('keeps low-confidence medication names and tablet amounts unclear', () => {
  const text = 'Ibuprofen\nTake 2 tablets twice daily'
  const parsed = parseLabel(text, text.split('\n').map((text) => ({ text, confidence: 45 })))
  assert.equal(parsed.drugName.status, 'unclear')
  assert.equal(parsed.dose.status, 'unclear')
  assert.equal(parsed.dose.reason, 'low-confidence')
  assert.match(getFieldSentence('dose', parsed.dose, 'Dose'), /text found, but it could not be confirmed/)
})

test('does not mistake bottle contents for the directed dose or resolve conflicting amounts', () => {
  assert.equal(parseLabel('Ibuprofen\nQty: 30 tablets').dose.status, 'unclear')
  const parsed = parseLabel('Ibuprofen\nTake 1 tablet daily\nTake 2 tablets daily')
  assert.equal(parsed.dose.status, 'unclear')
  assert.equal(parsed.dose.reason, 'conflicting')
  assert.match(getFieldSentence('dose', parsed.dose, 'Dose'), /Conflicting dose text/)
})

test('distinguishes missing and uncertain fields in the displayed reading', () => {
  const parsed = parseLabel('ALEX SAMPLE\nTake daily')
  assert.match(getFieldSentence('drugName', parsed.drugName, 'Medication'), /Possible medication text found/)
  assert.match(getFieldSentence('dose', parsed.dose, 'Dose'), /No dose information identified/)
})

test('one low-confidence line does not block a mostly readable label', () => {
  assert.equal(shouldRetryOCR([
    { confidence: 40 },
    { confidence: 94 },
    { confidence: 95 },
    { confidence: 96 },
  ]), false)
})

test('blocks parsing when most lines have low confidence or scores are absent', () => {
  assert.equal(shouldRetryOCR([
    { confidence: 40 },
    { confidence: 54 },
    { confidence: 58 },
  ]), true)
  assert.equal(shouldRetryOCR([]), true)
})
