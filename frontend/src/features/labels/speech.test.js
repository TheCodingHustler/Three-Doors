import test from 'node:test'
import assert from 'node:assert/strict'
import { getTranslatedSpeechAudio, readWithSpeechFallback, selectLocalVoice, speakLocalReading } from './speech.js'

test('read aloud plays cloud speech first without requesting browser speech', async () => {
  const audio = new Blob(['wave'])
  const provider = await readWithSpeechFallback({
    text: 'Hola', language: 'es-419',
    getCloudAudio: async (text, language) => {
      assert.equal(text, 'Hola'); assert.equal(language, 'es-419')
      return audio
    },
    playCloudAudio: async (blob) => assert.equal(blob, audio),
    speakBrowser: () => assert.fail('Browser fallback must not run when cloud playback works'),
  })
  assert.equal(provider, 'cloud')
})

test('read aloud falls back to the same text and language on cloud or playback failure', async () => {
  for (const failure of ['request', 'playback']) {
    let spoken
    const provider = await readWithSpeechFallback({
      text: 'مرحبا', language: 'ar',
      getCloudAudio: async () => { if (failure === 'request') throw new Error('Unavailable'); return new Blob() },
      playCloudAudio: async () => { throw new Error('Playback unavailable') },
      speakBrowser: (text, language) => { spoken = { text, language } },
    })
    assert.equal(provider, 'browser')
    assert.deepEqual(spoken, { text: 'مرحبا', language: 'ar' })
  }
})

test('stopping a pending reading prevents late cloud playback or browser fallback', async () => {
  for (const reject of [false, true]) {
    let active = true
    const provider = await readWithSpeechFallback({
      text: 'Hola', language: 'es', isCurrent: () => active,
      getCloudAudio: async () => { active = false; if (reject) throw new Error('Aborted'); return new Blob() },
      playCloudAudio: () => assert.fail('Canceled reading must not play'),
      speakBrowser: () => assert.fail('Canceled reading must not fall back'),
    })
    assert.equal(provider, null)
  }
})

test('reports browser failure when both speech options are unavailable', async () => {
  await assert.rejects(readWithSpeechFallback({
    text: 'Hola', language: 'es', getCloudAudio: async () => { throw new Error('Quota exceeded') },
    speakBrowser: () => { throw new Error('No installed voice matches') },
  }), /No installed voice matches/)
})

test('selects a local voice for the translated language, preferring the exact region', () => {
  const voices = [
    { name: 'English', lang: 'en-US', localService: true, default: true },
    { name: 'Spanish cloud', lang: 'es-419', localService: false },
    { name: 'Spanish Spain', lang: 'es-ES', localService: true },
    { name: 'Spanish Mexico', lang: 'es-MX', localService: true },
  ]
  assert.equal(selectLocalVoice(voices, 'es-MX').name, 'Spanish Mexico')
  assert.equal(selectLocalVoice(voices, 'es-419').name, 'Spanish Spain')
  assert.equal(selectLocalVoice(voices, 'ar'), null)
  assert.equal(selectLocalVoice(voices.filter((voice) => !voice.localService), 'es-419'), null)
})

test('reads translated text with the matching installed voice and selected speed', () => {
  const voice = { name: 'Spanish', lang: 'es-MX', localService: true }
  let spoken, canceled = 0, started = false, ended = false, error = ''
  const utterance = speakLocalReading({
    text: 'Tomar dos veces al día.', language: 'es-419', rate: 1.2,
    synth: { getVoices: () => [voice], cancel: () => { canceled++ }, speak: (value) => { spoken = value } },
    Utterance: class { constructor(text) { this.text = text } },
    onStart: () => { started = true }, onEnd: () => { ended = true }, onError: (message) => { error = message },
  })
  assert.equal(canceled, 1)
  assert.equal(spoken.text, 'Tomar dos veces al día.')
  assert.equal(spoken.voice, voice)
  assert.equal(spoken.lang, 'es-MX')
  assert.equal(spoken.rate, 1.2)
  utterance.onstart(); utterance.onend()
  assert.equal(started, true)
  assert.equal(ended, true)
  utterance.onerror({ error: 'interrupted' })
  assert.equal(error, '')
  utterance.onerror({ error: 'audio-hardware' })
  assert.match(error, /audio output/)
})

test('does not read Arabic with an English voice or invoke another speech provider', () => {
  assert.throws(() => speakLocalReading({
    text: 'مرحبا', language: 'ar', rate: 1,
    synth: { getVoices: () => [{ lang: 'en-US', localService: true }],
      cancel: () => assert.fail('Must not cancel speech without a matching voice'),
      speak: () => assert.fail('Must not speak in the wrong language') },
  }), /No installed voice matches/)
})

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
