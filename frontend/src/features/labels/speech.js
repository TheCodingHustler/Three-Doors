export function selectLocalVoice(voices, language) {
  const requested = language.toLowerCase().replaceAll('_', '-')
  const base = requested.split('-')[0]
  const matching = voices.filter((voice) => voice.localService === true
    && voice.lang.toLowerCase().replaceAll('_', '-').split('-')[0] === base)
  return matching.find((voice) => voice.lang.toLowerCase().replaceAll('_', '-') === requested)
    ?? matching.find((voice) => voice.default)
    ?? matching[0]
    ?? null
}

export function speakLocalReading({ text, language, rate, synth, Utterance, onStart, onEnd, onError }) {
  const voice = selectLocalVoice(synth.getVoices(), language)
  if (!voice) throw new Error('No installed voice matches this language. Install a matching system voice, then reopen the page in Chrome or Safari.')
  synth.cancel()
  const utterance = new Utterance(text)
  utterance.voice = voice
  utterance.lang = voice.lang
  utterance.rate = rate
  utterance.onstart = onStart
  utterance.onend = onEnd
  utterance.onerror = (event) => {
    if (event.error === 'canceled' || event.error === 'interrupted') onEnd()
    else onError('Your device could not read this text aloud. Check the system voice and audio output, then try again.')
  }
  synth.speak(utterance)
  return utterance
}

export async function readWithSpeechFallback({ text, language, getCloudAudio, playCloudAudio, speakBrowser, isCurrent = () => true }) {
  try {
    const audio = await getCloudAudio(text, language)
    if (!isCurrent()) return null
    await playCloudAudio(audio)
    return isCurrent() ? 'cloud' : null
  } catch {
    if (!isCurrent()) return null
    speakBrowser(text, language)
    return 'browser'
  }
}

export async function getTranslatedSpeechAudio(
  text,
  language,
  fetchImpl = fetch,
  endpoint = '/api/speech',
  signal,
) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
    ...(signal ? { signal } : {}),
  })
  const result = await response.json()
  if (!response.ok || typeof result.audioBase64 !== 'string'
    || result.mimeType !== 'audio/wav') {
    throw new Error(result.error ?? 'Translated audio is unavailable.')
  }

  const binary = atob(result.audioBase64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: result.mimeType })
}
