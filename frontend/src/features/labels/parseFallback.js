const FALLBACK_FIELDS = ['drugName', 'dose', 'frequency', 'quantity', 'refills']

export function createFallbackStub() {
  return {
    isStub: true,
    fields: Object.fromEntries(FALLBACK_FIELDS.map((field) => [field, {
      value: null,
      originalText: '',
      status: 'unclear',
    }])),
  }
}

export function countUnclearFields(parsed) {
  return FALLBACK_FIELDS.filter((field) => parsed[field]?.status !== 'found').length
}

export function mergeValidatedFallback(patternResult, fallbackFields, originalText) {
  const merged = { ...patternResult }
  const normalizedOriginal = originalText.toLowerCase()

  for (const key of FALLBACK_FIELDS) {
    const candidate = fallbackFields?.[key]
    if (merged[key]?.status === 'found' || candidate?.status !== 'found') continue
    if (typeof candidate.value !== 'string' || typeof candidate.originalText !== 'string') continue

    const source = candidate.originalText.trim()
    if (!source || !normalizedOriginal.includes(source.toLowerCase())) continue
    if (!source.toLowerCase().includes(candidate.value.toLowerCase())) continue

    merged[key] = {
      value: candidate.value,
      originalText: source,
      status: 'found',
      confidence: null,
    }
  }

  return merged
}
