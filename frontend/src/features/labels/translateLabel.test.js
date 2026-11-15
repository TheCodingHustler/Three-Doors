import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getTranslationLanguages,
  translateLabelSentences,
} from './translateLabel.js'

function mockResponse(body, ok = true) {
  return { ok, json: async () => body }
}

test('loads target languages from backend', async () => {
  const languages = [{ code: 'ES', name: 'Spanish' }]
  const result = await getTranslationLanguages(
    async () => mockResponse({ languages }),
  )
  assert.deepEqual(result, languages)
})

test('masks medication values in request and restores them in translation', async () => {
  let requestBody
  const translated = await translateLabelSentences(
    ['Take 1 tablet of ExampleDrug 10 mg twice daily.'],
    'es',
    ['ExampleDrug', '10 mg'],
    async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return mockResponse({
        translatedTexts: [requestBody.texts[0].replace('Take', 'Tome').replace('tablet', 'tableta')],
      })
    },
  )

  assert.equal(requestBody.targetLanguage, 'es')
  assert.doesNotMatch(requestBody.texts[0], /ExampleDrug|10 mg|\b1\b/i)
  assert.match(translated[0], /ExampleDrug/)
  assert.match(translated[0], /10 mg/)
  assert.match(translated[0], /1/)
})

test('rejects translation if provider alters or drops a protected value marker', async () => {
  await assert.rejects(() => translateLabelSentences(
    ['Take 2 tablets of SampleDrug.'],
    'fr',
    ['SampleDrug'],
    async () => mockResponse({ translatedTexts: ['Prenez un comprimé.'] }),
  ), /altered a protected medication value/)
})

test('reports backend errors and malformed translation responses', async () => {
  await assert.rejects(() => translateLabelSentences(
    ['Take daily.'],
    'es',
    [],
    async () => mockResponse({ error: 'DeepL is not configured.' }, false),
  ), /DeepL is not configured/)

  await assert.rejects(() => translateLabelSentences(
    ['Take daily.'],
    'es',
    [],
    async () => mockResponse({ translatedTexts: [] }),
  ), /Translation response was invalid/)
})
