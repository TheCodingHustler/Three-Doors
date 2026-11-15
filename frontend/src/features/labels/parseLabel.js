export const FIELD_CONFIDENCE_THRESHOLD = 60

export const ABBREVIATION_MEANINGS = {
  BID: 'twice daily',
  TID: 'three times daily',
  QID: 'four times daily',
  QD: 'once daily',
  PRN: 'as needed',
  PO: 'by mouth',
}

export function normalizeText(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function getMedianLineConfidence(lines) {
  const scores = lines
    .map((line) => line.confidence)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)

  if (scores.length === 0) return null

  const middle = Math.floor(scores.length / 2)
  return scores.length % 2 === 0
    ? (scores[middle - 1] + scores[middle]) / 2
    : scores[middle]
}

export function shouldRetryOCR(lines) {
  const medicationLinePattern = /\b(?:\d+(?:\.\d+)?\s*(?:mg|mcg)|take|use|apply|instill|inject|swallow|dissolve|once daily|twice|daily|every\s+\d+\s+hours?|bedtime|BID|TID|QID|QD|PRN|qty|quantity|refills?|rf)\b/i
  const medicationLines = lines.filter((line) => medicationLinePattern.test(line.text ?? ''))
  const medianConfidence = getMedianLineConfidence(medicationLines.length > 0 ? medicationLines : lines)
  return medianConfidence === null || medianConfidence < FIELD_CONFIDENCE_THRESHOLD
}

function makeField(value = null, originalText = '', status = 'unclear') {
  return { value, originalText, status, confidence: null }
}

function getLines(text, ocrLines) {
  if (Array.isArray(ocrLines) && ocrLines.length > 0) {
    return ocrLines.map((line) => ({
      text: line.text,
      confidence: Number.isFinite(line.confidence) ? line.confidence : null,
    }))
  }

  return text.split(/\r?\n/).map((line) => ({ text: line, confidence: null }))
}

function isLowConfidence(candidate) {
  return candidate.confidence !== null
    && candidate.confidence < FIELD_CONFIDENCE_THRESHOLD
}

function resolveCandidates(candidates) {
  if (candidates.length === 0) return makeField()

  const uniqueValues = new Map()
  for (const candidate of candidates) {
    const key = normalizeText(candidate.value)
    if (!uniqueValues.has(key)) uniqueValues.set(key, candidate)
  }

  const originalText = [...new Set(candidates.map((candidate) => candidate.originalText))]
    .join('\n')

  if (uniqueValues.size !== 1 || candidates.some((candidate) => candidate.uncertain || isLowConfidence(candidate))) {
    const field = makeField(null, originalText)
    field.confidence = candidates.every((candidate) => Number.isFinite(candidate.confidence))
      ? Math.min(...candidates.map((candidate) => candidate.confidence))
      : null
    return field
  }

  const [candidate] = uniqueValues.values()
  return {
    ...makeField(candidate.value, candidate.originalText, 'found'),
    confidence: Number.isFinite(candidate.confidence) ? candidate.confidence : null,
  }
}

function findMatches(lines, pattern, getValue = (match) => match[0]) {
  const candidates = []

  for (const line of lines) {
    for (const match of line.text.matchAll(pattern)) {
      candidates.push({
        value: getValue(match),
        originalText: match[0],
        confidence: line.confidence,
        lineText: line.text,
        index: match.index,
      })
    }
  }

  return candidates
}

function normalizeFrequency(match) {
  const normalized = normalizeText(match[0])
  if (/\b(?:once|1\s*time)\s+(?:daily|a day|per day)\b/.test(normalized)) return 'once daily'
  if (/\b(?:twice|2\s*times)\s+(?:daily|a day|per day)\b/.test(normalized)) return 'twice daily'
  if (/\b(?:three|3\s*times)\s+(?:daily|a day|per day)\b/.test(normalized)) return 'three times daily'
  if (/\b(?:four|4\s*times)\s+(?:daily|a day|per day)\b/.test(normalized)) return 'four times daily'
  if (/\bevery\s+\d+\s+hours?\b/.test(normalized)) return normalized.replace(/\s+/g, ' ')
  if (/\bevery\s+(?:morning|evening|night)\b/.test(normalized)) return normalized
  if (/\bat bedtime\b/.test(normalized)) return 'at bedtime'
  if (/^(?:daily|every day)$/.test(normalized)) return 'daily'

  const abbreviation = normalized.toUpperCase()
  return ABBREVIATION_MEANINGS[abbreviation] ?? null
}

function getFrequencyCandidates(lines) {
  const patterns = [
    /\b(?:once|1\s*time)\s+(?:daily|a day|per day)\b/gi,
    /\b(?:twice|2\s*times)\s+(?:daily|a day|per day)\b/gi,
    /\b(?:three|3\s*times)\s+(?:daily|a day|per day)\b/gi,
    /\b(?:four|4\s*times)\s+(?:daily|a day|per day)\b/gi,
    /\bevery\s+\d+\s+hours?\b/gi,
    /\bevery\s+(?:morning|evening|night)\b/gi,
    /\bat bedtime\b/gi,
    /\b(?:BID|TID|QID|QD|PRN)\b/gi,
  ]

  const matches = patterns.flatMap((pattern) => findMatches(lines, pattern, normalizeFrequency))
  const dailyMatches = findMatches(lines, /\bdaily\b/gi, () => 'daily')
    .filter((candidate) => !/\b(?:once|twice|three|four|\d+\s*times)\s+daily\b/i.test(candidate.lineText))

  return [...matches, ...dailyMatches]
    .filter((candidate) => candidate.value)
}

function getRouteCandidates(lines) {
  return findMatches(lines, /\b(?:PO|by mouth|orally)\b/gi, (match) => {
    return /\bPO\b/i.test(match[0]) || /\borally\b/i.test(match[0])
      ? 'by mouth'
      : 'by mouth'
  })
}

function normalizeDirections(text) {
  return text
    .replace(/\bBID\b/gi, ABBREVIATION_MEANINGS.BID)
    .replace(/\bTID\b/gi, ABBREVIATION_MEANINGS.TID)
    .replace(/\bQID\b/gi, ABBREVIATION_MEANINGS.QID)
    .replace(/\bQD\b/gi, ABBREVIATION_MEANINGS.QD)
    .replace(/\bPRN\b/gi, ABBREVIATION_MEANINGS.PRN)
    .replace(/\bPO\b/gi, ABBREVIATION_MEANINGS.PO)
    .replace(/\s+/g, ' ')
    .trim()
}

function getDirectionsCandidates(lines) {
  const candidates = []
  const actionPattern = /\b(?:take|use|apply|instill|inject|swallow|dissolve)\b/i
  const abbreviationPattern = /\b(?:BID|TID|QID|QD|PRN|PO)\b/i

  for (const line of lines) {
    if (!actionPattern.test(line.text) && !abbreviationPattern.test(line.text)) continue

    candidates.push({
      value: normalizeDirections(line.text),
      originalText: line.text,
      confidence: line.confidence,
      lineText: line.text,
      index: 0,
    })
  }

  return candidates
}

function getDrugNameCandidates(lines, doseCandidates) {
  const candidates = []

  for (const dose of doseCandidates) {
    const prefix = dose.lineText.slice(0, dose.index).trim()
      .replace(/^(?:drug(?: name)?|medication|name)\s*[:=-]\s*/i, '')
    if (isPlausibleDrugName(prefix)) {
      candidates.push({
        value: prefix,
        originalText: dose.lineText,
        confidence: dose.confidence,
      })
    }
  }

  if (candidates.length > 0) return candidates

  const directionIndex = lines.findIndex((line) => /\b(?:take|use|apply|instill|inject)\b/i.test(line.text))
  if (directionIndex > 0) {
    const previousLine = lines[directionIndex - 1]
    const value = previousLine.text.trim()
    if (isPlausibleDrugName(value)) {
      candidates.push({
        value,
        originalText: previousLine.text,
        confidence: previousLine.confidence,
        uncertain: true,
      })
    }
  }

  return candidates
}

function isPlausibleDrugName(value) {
  return value.length > 0
    && value.length <= 80
    && /[A-Za-z]/.test(value)
    && !/\d/.test(value)
    && !/\b(?:take|use|apply|instill|inject|pharmacy|filled|rx|qty|quantity|refill|warning|label|mock|tablet|capsule)\b/i.test(value)
}

function getWarningField(lines) {
  const warningPattern = /\b(?:warning|may cause|avoid|do not|don't|keep out of reach|store at|take with|with food)\b/i
  const matches = lines.filter((line) => warningPattern.test(line.text))

  if (matches.length === 0) return makeField()

  const originalText = matches.map((line) => line.text).join('\n')
  if (matches.some((line) => line.confidence !== null && line.confidence < FIELD_CONFIDENCE_THRESHOLD)) {
    return {
      ...makeField(null, originalText),
      confidence: Math.min(...matches.map((line) => line.confidence).filter(Number.isFinite)),
    }
  }

  return {
    ...makeField(originalText, originalText, 'found'),
    confidence: matches.every((line) => Number.isFinite(line.confidence))
      ? Math.min(...matches.map((line) => line.confidence))
      : null,
  }
}

export function parseLabel(text, ocrLines = []) {
  const lines = getLines(text, ocrLines)
  const doseCandidates = findMatches(
    lines,
    /\b\d+(?:\.\d+)?\s*(?:mg|mcg)\b/gi,
    (match) => match[0].replace(/\s+/g, ' '),
  )
  const quantityCandidates = findMatches(
    lines,
    /\b(?:qty|quantity)\s*[:#-]?\s*\d+\b/gi,
    (match) => match[0].match(/\d+$/)[0],
  )
  const refillCandidates = findMatches(
    lines,
    /\b(?:refills?|rf)\s*[:#-]?\s*\d+\b/gi,
    (match) => match[0].match(/\d+$/)[0],
  )
  const dose = resolveCandidates(doseCandidates)
  const directions = resolveCandidates(getDirectionsCandidates(lines))

  return {
    originalText: text,
    drugName: resolveCandidates(getDrugNameCandidates(lines, doseCandidates)),
    dose,
    directions,
    frequency: resolveCandidates(getFrequencyCandidates(lines)),
    route: resolveCandidates(getRouteCandidates(lines)),
    quantity: resolveCandidates(quantityCandidates),
    refills: resolveCandidates(refillCandidates),
    warnings: getWarningField(lines),
  }
}
