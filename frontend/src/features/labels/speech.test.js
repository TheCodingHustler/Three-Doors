import test from 'node:test'
import assert from 'node:assert/strict'
import { getTranslatedSpeechAudio } from './speech.js'

function mockResponse(body, ok = true) {
  return { ok, json: async () => body }
}

test('requests cloud audio for the translated text and selected language', async () => {
  const wave = Buffer.from('RIFF0000WAVEsample')
  let requestBody
  const audio = await getTranslatedSpeechAudio(
    'النص المترجم',
    'ar',
    async (_url, options) => {
      requestBody = JSON.parse(options.body)
      return mockResponse({ audioBase64: wave.toString('base64'), mimeType: 'audio/wav' })
    },
  )

  assert.deepEqual(requestBody, { text: 'النص المترجم', language: 'ar' })
  assert.equal(audio.type, 'audio/wav')
  assert.deepEqual(Buffer.from(await audio.arrayBuffer()), wave)
})

test('surfaces a cloud speech error without substituting local English speech', async () => {
  await assert.rejects(
    () => getTranslatedSpeechAudio(
      'Hola',
      'es',
      async () => mockResponse({ error: 'Cloud speech is not configured.' }, false),
    ),
    /Cloud speech is not configured/,
  )
})
