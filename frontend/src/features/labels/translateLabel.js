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

// Last-known DeepL target-language catalog from the existing reader's service.
// The backend response replaces this list whenever its route is available.
export const FALLBACK_TRANSLATION_LANGUAGES = [
  ['ace', 'Acehnese'], ['af', 'Afrikaans'], ['an', 'Aragonese'], ['ar', 'Arabic'],
  ['as', 'Assamese'], ['ay', 'Aymara'], ['az', 'Azerbaijani'], ['ba', 'Bashkir'],
  ['be', 'Belarusian'], ['bg', 'Bulgarian'], ['bho', 'Bhojpuri'], ['bn', 'Bengali'],
  ['br', 'Breton'], ['bs', 'Bosnian'], ['ca', 'Catalan'], ['ceb', 'Cebuano'],
  ['ckb', 'Kurdish (Sorani)'], ['cs', 'Czech'], ['cy', 'Welsh'], ['da', 'Danish'],
  ['de', 'German'], ['de-CH', 'German (Swiss)'], ['de-DE', 'German'], ['el', 'Greek'],
  ['en-GB', 'English (British)'], ['en-US', 'English (American)'], ['eo', 'Esperanto'],
  ['es', 'Spanish'], ['es-419', 'Spanish (Latin American)'], ['es-ES', 'Spanish'],
  ['et', 'Estonian'], ['eu', 'Basque'], ['fa', 'Persian'], ['fi', 'Finnish'],
  ['fr', 'French'], ['fr-CA', 'French (Canadian)'], ['fr-FR', 'French'], ['ga', 'Irish'],
  ['gl', 'Galician'], ['gn', 'Guarani'], ['gom', 'Konkani'], ['gu', 'Gujarati'],
  ['ha', 'Hausa'], ['he', 'Hebrew'], ['hi', 'Hindi'], ['hr', 'Croatian'],
  ['ht', 'Haitian Creole'], ['hu', 'Hungarian'], ['hy', 'Armenian'], ['id', 'Indonesian'],
  ['ig', 'Igbo'], ['is', 'Icelandic'], ['it', 'Italian'], ['ja', 'Japanese'],
  ['jv', 'Javanese'], ['ka', 'Georgian'], ['kk', 'Kazakh'], ['kmr', 'Kurdish (Kurmanji)'],
  ['ko', 'Korean'], ['ky', 'Kyrgyz'], ['la', 'Latin'], ['lb', 'Luxembourgish'],
  ['lmo', 'Lombard'], ['ln', 'Lingala'], ['lt', 'Lithuanian'], ['lv', 'Latvian'],
  ['mai', 'Maithili'], ['mg', 'Malagasy'], ['mi', 'Maori'], ['mk', 'Macedonian'],
  ['ml', 'Malayalam'], ['mn', 'Mongolian'], ['mr', 'Marathi'], ['ms', 'Malay'],
  ['mt', 'Maltese'], ['my', 'Burmese'], ['nb', 'Norwegian (bokmål)'], ['ne', 'Nepali'],
  ['nl', 'Dutch'], ['oc', 'Occitan'], ['om', 'Oromo'], ['pa', 'Punjabi'],
  ['pag', 'Pangasinan'], ['pam', 'Kapampangan'], ['pl', 'Polish'], ['prs', 'Dari'],
  ['ps', 'Pashto'], ['pt', 'Portuguese'], ['pt-BR', 'Portuguese (Brazilian)'],
  ['pt-PT', 'Portuguese (European)'], ['qu', 'Quechua'], ['ro', 'Romanian'],
  ['ru', 'Russian'], ['sa', 'Sanskrit'], ['scn', 'Sicilian'], ['sk', 'Slovak'],
  ['sl', 'Slovenian'], ['sq', 'Albanian'], ['sr', 'Serbian'], ['st', 'Sesotho'],
  ['su', 'Sundanese'], ['sv', 'Swedish'], ['sw', 'Swahili'], ['ta', 'Tamil'],
  ['te', 'Telugu'], ['tg', 'Tajik'], ['th', 'Thai'], ['tk', 'Turkmen'],
  ['tl', 'Tagalog'], ['tn', 'Tswana'], ['tr', 'Turkish'], ['ts', 'Tsonga'],
  ['tt', 'Tatar'], ['uk', 'Ukrainian'], ['ur', 'Urdu'], ['uz', 'Uzbek'],
  ['vi', 'Vietnamese'], ['wo', 'Wolof'], ['xh', 'Xhosa'], ['yi', 'Yiddish'],
  ['yue', 'Cantonese'], ['zh', 'Chinese'], ['zh-HANS', 'Chinese (simplified)'],
  ['zh-HANT', 'Chinese (traditional)'], ['zu', 'Zulu'],
].map(([code, name]) => ({ code, name }))

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
