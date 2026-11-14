function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function protectText(text, protectedTerms) {
  const tokens = []
  let protectedText = text
  const terms = [...new Set(protectedTerms.filter((term) => typeof term === 'string' && term.length > 0))]
    .sort((left, right) => right.length - left.length)

  function createToken(value) {
    const token = `ZXQSAFE${tokens.length}ENDQXZ`
    tokens.push({ token, value })
    return token
  }

  for (const term of terms) {
    protectedText = protectedText.replace(new RegExp(escapeRegExp(term), 'gi'), (match) => createToken(match))
  }
  protectedText = protectedText.replace(/\b\d+(?:[.,]\d+)*\b/g, (match) => createToken(match))

  return { text: protectedText, tokens }
}

function restoreProtectedText(text, tokens) {
  let restored = text
  for (const { token, value } of tokens) {
    const occurrences = restored.split(token).length - 1
    if (occurrences !== 1) throw new Error('Translation altered a protected medication value.')
    restored = restored.replace(token, value)
  }
  return restored
}

export async function getTranslationLanguages(
  fetchImpl = fetch,
  endpoint = '/api/translate/languages',
) {
  const response = await fetchImpl(endpoint)
  const result = await response.json()
  if (!response.ok || !Array.isArray(result.languages)) {
    throw new Error(result.error ?? 'Could not load translation languages.')
  }
  return result.languages
}

export async function translateLabelSentences(
  texts,
  targetLanguage,
  protectedTerms = [],
  fetchImpl = fetch,
  endpoint = '/api/translate',
) {
  const protectedEntries = texts.map((text) => protectText(text, protectedTerms))
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      texts: protectedEntries.map(({ text }) => text),
      targetLanguage,
    }),
  })
  const result = await response.json()

  if (!response.ok || !Array.isArray(result.translatedTexts)
    || result.translatedTexts.length !== texts.length) {
    throw new Error(result.error ?? 'Translation response was invalid.')
  }

  return result.translatedTexts.map((text, index) => {
    if (typeof text !== 'string') throw new Error('Translation returned invalid text.')
    return restoreProtectedText(text, protectedEntries[index].tokens)
  })
}
