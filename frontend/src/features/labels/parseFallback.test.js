import test from 'node:test'
import assert from 'node:assert/strict'
import { countUnclearFields, mergeValidatedFallback } from './parseFallback.js'

function field(value = null, originalText = '', status = 'unclear') {
  return { value, originalText, status }
}

const patternFields = {
  drugName: field(),
  dose: field(),
  frequency: field(),
  quantity: field(),
  refills: field('30', 'Qty: 30', 'found'),
}

test('counts unclear core fields for deciding whether to call fallback', () => {
  assert.equal(countUnclearFields(patternFields), 4)
})

test('merges a fallback field only when its value and source appear in OCR text', () => {
  const merged = mergeValidatedFallback(patternFields, {
    ...patternFields,
    dose: field('10 MG', '10 MG tablet', 'found'),
  }, 'SAMPLE DRUG 10 MG tablet')

  assert.equal(merged.dose.status, 'found')
  assert.equal(merged.dose.value, '10 MG')
  assert.equal(merged.refills.value, '30')
})

test('rejects invented values and source excerpts absent from OCR text', () => {
  const merged = mergeValidatedFallback(patternFields, {
    ...patternFields,
    dose: field('20 MG', '10 MG tablet', 'found'),
    drugName: field('INVENTED DRUG', 'INVENTED DRUG', 'found'),
  }, 'SAMPLE DRUG 10 MG tablet')

  assert.equal(merged.dose.status, 'unclear')
  assert.equal(merged.drugName.status, 'unclear')
})
