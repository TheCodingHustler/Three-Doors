export const FIELD_LABELS = [
  ['drugName', 'Medication'],
  ['dose', 'Dose'],
  ['directions', 'Directions'],
  ['frequency', 'Frequency'],
  ['route', 'Route'],
  ['quantity', 'Quantity'],
  ['refills', 'Refills'],
  ['warnings', 'Warnings'],
]

export function getFieldSentence(key, field, label) {
  if (field?.status !== 'found') {
    return `Couldn't read the ${label.toLowerCase()}, please check the label.`
  }

  if (key === 'directions') return field.value
  if (key === 'drugName') return `Medication: ${field.value}.`
  return `${label}: ${field.value}.`
}

export function getSpokenSummary(parsed) {
  const foundSentences = FIELD_LABELS
    .map(([key, label]) => getFieldSentence(key, parsed[key], label))
    .filter((sentence, index) => parsed[FIELD_LABELS[index][0]]?.status === 'found')

  return foundSentences.length > 0
    ? `${foundSentences.join(' ')} Please confirm this information with your pharmacist.`
    : 'This label could not be read clearly. Please check it with your pharmacist.'
}

export function getPlainLanguageSentences(parsed) {
  return [
    ...FIELD_LABELS.map(([key, label]) => getFieldSentence(key, parsed[key], label)),
    'Please confirm this label information with your pharmacist.',
  ]
}
