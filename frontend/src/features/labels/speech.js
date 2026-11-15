export async function getTranslatedSpeechAudio(
  text,
  language,
  fetchImpl = fetch,
  endpoint = '/api/speech',
) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language }),
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
