import './App.css'
import { useEffect, useState } from 'react'
import { readLabel } from './ocr.js'
import { parseLabel, shouldRetryOCR } from './parseLabel.js'
import { countUnclearFields, mergeValidatedFallback } from './parseFallback.js'
import { getTranslationLanguages, translateLabelSentences } from './translateLabel.js'
import { groupLabelRegions } from './groupLabels.js'
import {
  deleteAllSavedLabels,
  deleteSavedLabel,
  listSavedLabels,
  saveLabel,
} from './labelStorage.js'

const FIELD_LABELS = [
  ['drugName', 'Medication'],
  ['dose', 'Dose'],
  ['directions', 'Directions'],
  ['frequency', 'Frequency'],
  ['route', 'Route'],
  ['quantity', 'Quantity'],
  ['refills', 'Refills'],
  ['warnings', 'Warnings'],
]
const PARSE_LABEL_API_URL = import.meta.env.VITE_PARSE_LABEL_API_URL
  ?? 'http://localhost:3001/api/parse-label'
const TRANSLATE_API_URL = import.meta.env.VITE_TRANSLATE_API_URL
  ?? 'http://localhost:3001/api/translate'
const TRANSLATE_LANGUAGES_API_URL = import.meta.env.VITE_TRANSLATE_LANGUAGES_API_URL
  ?? 'http://localhost:3001/api/translate/languages'

function getFieldSentence(key, field, label) {
  if (field.status !== 'found') {
    return `Couldn't read the ${label.toLowerCase()}, please check the label.`
  }

  if (key === 'directions') return field.value
  if (key === 'drugName') return `Medication: ${field.value}.`
  return `${label}: ${field.value}.`
}

function getSpokenSummary(parsed) {
  const foundSentences = FIELD_LABELS
    .map(([key, label]) => getFieldSentence(key, parsed[key], label))
    .filter((sentence, index) => parsed[FIELD_LABELS[index][0]].status === 'found')

  return foundSentences.length > 0
    ? `${foundSentences.join(' ')} Please confirm this information with your pharmacist.`
    : 'This label could not be read clearly. Please check it with your pharmacist.'
}

function App() {
  const [images, setImages] = useState([])
  const [ocrResults, setOcrResults] = useState([])
  const [isReading, setIsReading] = useState(false)
  const [readingStatus, setReadingStatus] = useState('')
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [speechRate, setSpeechRate] = useState(1)
  const [voices, setVoices] = useState([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [displayLanguage, setDisplayLanguage] = useState('en')
  const [translations, setTranslations] = useState({})
  const [translateLanguages, setTranslateLanguages] = useState([])
  const [languageListStatus, setLanguageListStatus] = useState('loading')
  const [languageListAttempt, setLanguageListAttempt] = useState(0)
  const [savedLabels, setSavedLabels] = useState([])
  const [savedLabelsStatus, setSavedLabelsStatus] = useState('loading')
  const [savingSourceKey, setSavingSourceKey] = useState('')
  const [storageError, setStorageError] = useState('')
  const speechAvailable = typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && 'SpeechSynthesisUtterance' in window

  useEffect(() => {
    if (!speechAvailable) return undefined

    const updateVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      setVoices(availableVoices)
    }

    updateVoices()
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', updateVoices)
  }, [speechAvailable])

  useEffect(() => {
    let active = true

    listSavedLabels()
      .then((records) => {
        if (!active) return
        setSavedLabels(records)
        setSavedLabelsStatus('ready')
      })
      .catch(() => {
        if (active) setSavedLabelsStatus('unavailable')
      })

    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true

    getTranslationLanguages(fetch, TRANSLATE_LANGUAGES_API_URL)
      .then((languages) => {
        if (!active) return
        setTranslateLanguages(languages)
        setLanguageListStatus('loaded')
      })
      .catch(() => {
        if (active) setLanguageListStatus('unavailable')
      })

    return () => { active = false }
  }, [languageListAttempt])

  useEffect(() => () => {
    images.forEach(({ preview }) => URL.revokeObjectURL(preview))
  }, [images])

  useEffect(() => () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  }, [])

  function handleImageChanges(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''

    if (files.length === 0) return

    setImages(files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    })))
    setOcrResults([])
    setTranslations({})
  }

  async function handleReadLabels() {
    if (images.length === 0) return

    setIsReading(true)
    setReadingStatus('Reading labels...')
    setOcrResults([])

    const results = []
    for (const { file } of images) {
      try {
        const ocrResult = await readLabel(file)
        const labelRegions = groupLabelRegions(ocrResult.lines, ocrResult.text)

        for (const [regionIndex, region] of labelRegions.entries()) {
          const refinedOcr = await readLabel(file, region.lines)
          const regionText = refinedOcr.cropApplied ? refinedOcr.text : region.text
          const regionLines = refinedOcr.cropApplied ? refinedOcr.lines : region.lines
          const lineConfidences = regionLines
            .map((line) => line.confidence)
            .filter(Number.isFinite)
          const regionConfidence = lineConfidences.length > 0
            ? lineConfidences.reduce((total, confidence) => total + confidence, 0) / lineConfidences.length
            : ocrResult.confidence
          const lowConfidence = shouldRetryOCR(regionLines)
          let parsed = lowConfidence ? null : parseLabel(regionText, regionLines)
          let fallbackStatus = 'not-needed'

          if (parsed && countUnclearFields(parsed) >= 3) {
            setReadingStatus(`Checking unclear fields in ${file.name}...`)
            try {
              const response = await fetch(PARSE_LABEL_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: regionText }),
              })

              if (!response.ok) throw new Error('Backend fallback request failed')

              const fallback = await response.json()
              parsed = mergeValidatedFallback(parsed, fallback.fields, regionText)
              fallbackStatus = fallback.isStub ? 'stub' : 'complete'
            } catch {
              fallbackStatus = 'error'
            }
          }

          results.push({
            name: file.name,
            labelNumber: regionIndex + 1,
            labelCount: labelRegions.length,
            text: regionText,
            lines: regionLines,
            confidence: regionConfidence,
            cropApplied: refinedOcr.cropApplied,
            lowConfidence,
            parsed,
            fallbackStatus,
          })
        }
      } catch {
        results.push({
          name: file.name,
          error: "We couldn't read this image. Please try another one.",
        })
      }
    }

    setOcrResults(results)
    setIsReading(false)
    setReadingStatus('')
  }

  function handleReadAloud(text, language = 'en') {
    if (!speechAvailable) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = voices.find((availableVoice) => availableVoice.lang.toLowerCase().startsWith(language))
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? language
    utterance.rate = speechRate
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  function handleStopReading() {
    if (!speechAvailable) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  function getSavedSourceKey(result) {
    return `${result.name}:${result.labelNumber ?? 1}:${result.text}`
  }

  function isLabelSaved(result) {
    const sourceKey = getSavedSourceKey(result)
    return savedLabels.some((record) => record.sourceKey === sourceKey)
  }

  async function handleSaveLabel(result) {
    const sourceKey = getSavedSourceKey(result)
    setSavingSourceKey(sourceKey)
    setStorageError('')

    try {
      const savedRecord = await saveLabel(result)
      setSavedLabels((current) => [
        savedRecord,
        ...current.filter((record) => record.id !== savedRecord.id),
      ].sort((left, right) => right.savedAt.localeCompare(left.savedAt)))
    } catch {
      setStorageError('Could not save this label in this browser.')
    } finally {
      setSavingSourceKey('')
    }
  }

  async function handleDeleteSavedLabel(id) {
    setStorageError('')
    try {
      await deleteSavedLabel(id)
      setSavedLabels((current) => current.filter((record) => record.id !== id))
    } catch {
      setStorageError('Could not delete the saved label from this browser.')
    }
  }

  async function handleDeleteAllSavedLabels() {
    setStorageError('')
    try {
      await deleteAllSavedLabels()
      setSavedLabels([])
    } catch {
      setStorageError('Could not clear saved labels from this browser.')
    }
  }

  async function handleTranslateResult(result, index) {
    const key = `${index}-${result.name}`
    setTranslations((current) => ({
      ...current,
      [key]: { loading: true, error: '', texts: null, progress: null },
    }))

    const fieldSentences = FIELD_LABELS.map(([fieldKey, label]) =>
      getFieldSentence(fieldKey, result.parsed[fieldKey], label))
    const sentences = [
      ...fieldSentences,
      'Machine translated. Please confirm this label information with your pharmacist.',
    ]
    const protectedTerms = ['drugName', 'dose', 'quantity', 'refills']
      .map((field) => result.parsed[field].value)
      .filter(Boolean)

    try {
      const translatedTexts = await translateLabelSentences(
        sentences,
        displayLanguage,
        protectedTerms,
        fetch,
        TRANSLATE_API_URL,
      )
      setTranslations((current) => ({
        ...current,
        [key]: { loading: false, error: '', texts: translatedTexts },
      }))
      return translatedTexts
    } catch {
      setTranslations((current) => ({
        ...current,
        [key]: {
          loading: false,
          error: 'Translation is unavailable. The original English text is still shown.',
          texts: null,
        },
      }))
      return null
    }
  }

  async function handleReadAloudResult(result, index) {
    if (displayLanguage === 'en') {
      handleReadAloud(getSpokenSummary(result.parsed), 'en')
      return
    }

    const key = `${index}-${result.name}`
    const translated = translations[key]?.texts ?? await handleTranslateResult(result, index)
    if (translated) handleReadAloud(translated.join(' '), displayLanguage)
  }

  return (
    <main className={`${largeText ? 'large-text' : ''} ${highContrast ? 'high-contrast' : ''}`.trim()}>
      <h1>Label Reader</h1>
      <fieldset className="accessibility-controls">
        <legend>Accessibility</legend>
        <label>
          <input
            type="checkbox"
            checked={largeText}
            onChange={(event) => setLargeText(event.target.checked)}
          />
          Large text
        </label>
        <label>
          <input
            type="checkbox"
            checked={highContrast}
            onChange={(event) => setHighContrast(event.target.checked)}
          />
          High contrast
        </label>
      </fieldset>
      <label className="speech-rate-control" htmlFor="speech-rate">
        Read-aloud speed: {speechRate.toFixed(2)}x
      </label>
      <input
        id="speech-rate"
        type="range"
        min="0.75"
        max="1.5"
        step="0.05"
        value={speechRate}
        onChange={(event) => setSpeechRate(Number(event.target.value))}
        disabled={!speechAvailable}
      />
      <label className="speech-language-control" htmlFor="display-language">
        Plain-language display and read-aloud language
      </label>
      <select
        id="display-language"
        value={displayLanguage}
        onChange={(event) => {
          window.speechSynthesis?.cancel()
          setIsSpeaking(false)
          setDisplayLanguage(event.target.value)
          setTranslations({})
        }}
        aria-describedby="display-language-note"
      >
        <option value="en">English</option>
        {translateLanguages
          .filter((language) => language.code.toLowerCase() !== 'en')
          .map((language) => (
            <option value={language.code} key={language.code}>{language.name}</option>
          ))}
      </select>
      <p id="display-language-note" className="speech-language-note">
        {languageListStatus === 'loading'
          ? 'Loading DeepL languages...'
          : languageListStatus === 'unavailable'
            ? 'Could not load DeepL languages. Check the backend configuration, restart the backend, then retry.'
            : displayLanguage === 'en'
              ? 'English is available. Choose a target language for DeepL translation.'
              : 'Plain-language sentences are translated by DeepL. The original label text stays unchanged.'}
      </p>
      {languageListStatus === 'unavailable' && (
        <button
          type="button"
          onClick={() => {
            setLanguageListStatus('loading')
            setLanguageListAttempt((attempt) => attempt + 1)
          }}
        >
          Retry language list
        </button>
      )}
      <label htmlFor="prescription">Upload prescription label images</label>
      <br />
      <input
        type="file"
        id="prescription"
        name="prescription"
        accept="image/*"
        multiple
        onChange={handleImageChanges}
      />
      <p>Separated label areas are read as separate results when the image layout makes them distinguishable. Cropping to one label per image is still best for accuracy.</p>
      {images.map(({ file, preview }) => (
        <figure key={`${file.name}-${file.lastModified}`}>
          <figcaption>{file.name}</figcaption>
          <img
            src={preview}
            alt={`Preview of ${file.name}`}
            style={{ maxWidth: '300px', width: '100%', marginTop: '12px' }}
          />
        </figure>
      ))}
      <div>
        <button type="button" onClick={handleReadLabels} disabled={images.length === 0 || isReading}>
          Read labels
        </button>
        {isReading && <p role="status">{readingStatus}</p>}
      </div>
      <section className="saved-labels" aria-labelledby="saved-labels-heading">
        <div className="saved-labels-heading">
          <div>
            <h2 id="saved-labels-heading">Saved on this device</h2>
            <p>Saved labels stay in this browser profile only. They are not synced; other people using this profile may see them.</p>
          </div>
          {savedLabels.length > 0 && (
            <button type="button" onClick={handleDeleteAllSavedLabels}>
              Delete all saved labels
            </button>
          )}
        </div>
        {savedLabelsStatus === 'loading' && <p role="status">Loading saved labels...</p>}
        {savedLabelsStatus === 'unavailable' && (
          <p role="alert">Local browser storage is unavailable in this browser.</p>
        )}
        {savedLabelsStatus === 'ready' && savedLabels.length === 0 && (
          <p>No labels saved on this device.</p>
        )}
        {savedLabels.map((record) => (
          <details className="saved-label" key={record.id}>
            <summary>
              {record.name}{record.labelNumber > 1 ? ` - Label ${record.labelNumber}` : ''}
              {' | '}{new Date(record.savedAt).toLocaleString()}
            </summary>
            <p>OCR confidence: {record.confidence === null ? 'Unavailable' : `${record.confidence}%`}</p>
            {record.lowConfidence && <p role="status">This label was flagged low confidence when saved.</p>}
            {record.fields && FIELD_LABELS.map(([key, label]) => {
              const field = record.fields[key]
              return (
                <p className="saved-label-field" key={key}>
                  <strong>{label}: {field?.status === 'found' ? field.value : 'Unclear'}</strong>
                  <span>Source: {field?.originalText || 'No matching text found.'}</span>
                </p>
              )
            })}
            <h3>Original label text</h3>
            <pre className="ocr-raw-text">{record.text}</pre>
            <button type="button" onClick={() => handleDeleteSavedLabel(record.id)}>
              Delete saved label
            </button>
          </details>
        ))}
        {storageError && <p role="alert">{storageError}</p>}
      </section>
      {ocrResults.map((result, index) => (
        <section className="ocr-result" aria-labelledby={`ocr-result-heading-${index}`} key={`${index}-${result.name}`}>
          <h2 id={`ocr-result-heading-${index}`}>
            {result.labelCount > 1
              ? `${result.name} - Label ${result.labelNumber} of ${result.labelCount}`
              : result.name}
          </h2>
          {result.error ? (
            <p role="alert">{result.error}</p>
          ) : (
            <>
              <p>Page average confidence (reference only): {result.confidence}%</p>
              {result.cropApplied && (
                <p role="status">Cropped to confident text and reread.</p>
              )}
              {result.fallbackStatus === 'stub' && (
                <p role="status">Backend fallback is a sample stub; showing pattern-parser results only.</p>
              )}
              {result.fallbackStatus === 'error' && (
                <p role="status">Backend fallback is unavailable; showing pattern-parser results only.</p>
              )}
              <div className="label-columns">
                <section aria-label="Plain-language label reading">
                  <h3>Plain-language reading</h3>
                  {result.lowConfidence ? (
                    <p role="alert">Hold the label flat in good light and try again.</p>
                  ) : (
                    <>
                      {displayLanguage !== 'en' && (
                        <div className="translation-controls">
                          <button
                            type="button"
                            onClick={() => handleTranslateResult(result, index)}
                            disabled={translations[`${index}-${result.name}`]?.loading}
                          >
                            {translations[`${index}-${result.name}`]?.loading
                              ? 'Translating...'
                              : 'Translate with DeepL'}
                          </button>
                          {translations[`${index}-${result.name}`]?.error && (
                            <p role="alert">{translations[`${index}-${result.name}`].error}</p>
                          )}
                        </div>
                      )}
                      {translations[`${index}-${result.name}`]?.texts && (
                        <p className="translation-notice" role="status">
                          Machine translated. Confirm the wording with your pharmacist.
                        </p>
                      )}
                      {FIELD_LABELS.map(([key, label]) => {
                        const field = result.parsed[key]
                        const translatedText = translations[`${index}-${result.name}`]?.texts?.[
                          FIELD_LABELS.findIndex(([fieldKey]) => fieldKey === key)
                        ]
                        return (
                          <p className={`parsed-field ${field.status}`} key={key}>
                            <span className={`field-status ${field.status}`}>
                              {field.status === 'found' ? '✓ Found' : '! Unclear'}
                            </span>
                            <strong>{translatedText ?? getFieldSentence(key, field, label)}</strong>
                            <span className="field-source">
                              Original: {field.originalText || 'No matching text found.'}
                            </span>
                          </p>
                        )
                      })}
                      {speechAvailable && (
                        <button
                          type="button"
                          onClick={() => handleReadAloudResult(result, index)}
                          disabled={isSpeaking || translations[`${index}-${result.name}`]?.loading}
                        >
                          {displayLanguage !== 'en' && !translations[`${index}-${result.name}`]?.texts
                            ? 'Translate & read aloud'
                            : 'Play aloud'}
                        </button>
                      )}
                      {speechAvailable && displayLanguage !== 'en'
                        && !translations[`${index}-${result.name}`]?.texts && (
                          <button
                            type="button"
                            onClick={() => handleReadAloud(getSpokenSummary(result.parsed), 'en')}
                            disabled={isSpeaking || translations[`${index}-${result.name}`]?.loading}
                          >
                            Play English aloud
                          </button>
                        )}
                      {speechAvailable && (
                        <button
                          type="button"
                          onClick={handleStopReading}
                          disabled={!isSpeaking}
                        >
                          Stop reading
                        </button>
                      )}
                    </>
                  )}
                </section>
                <section aria-label="Original label text">
                  <h3>Original label text</h3>
                  <pre className="ocr-raw-text">{result.text}</pre>
                </section>
              </div>
              <button
                type="button"
                onClick={() => handleSaveLabel(result)}
                disabled={isLabelSaved(result)
                  || savingSourceKey === getSavedSourceKey(result)
                  || savedLabelsStatus !== 'ready'}
              >
                {isLabelSaved(result)
                  ? 'Saved on this device'
                  : savingSourceKey === getSavedSourceKey(result)
                    ? 'Saving...'
                    : 'Save on this device'}
              </button>
              <details>
                <summary>Line and word confidence</summary>
                {result.lines.length > 0 ? (
                  <ol className="ocr-lines">
                    {result.lines.map((line, lineIndex) => (
                      <li className="ocr-line" key={`${lineIndex}-${line.text}`}>
                        <p className="ocr-line-text">
                          <span>{line.text}</span>
                          <small>Line confidence: {line.confidence}%</small>
                        </p>
                        <p className="ocr-word-list">
                          {line.words.map((word, wordIndex) => (
                            <span className="ocr-word" key={`${lineIndex}-${wordIndex}-${word.text}`}>
                              {word.text} <small>{word.confidence}%</small>
                            </span>
                          ))}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>Line-level confidence data is unavailable for this image.</p>
                )}
              </details>
            </>
          )}
                            <p className="pharmacist-reminder">
                              {translations[`${index}-${result.name}`]?.texts?.[FIELD_LABELS.length]
                                ?? 'Please confirm this label information with your pharmacist.'}
                            </p>
        </section>
      ))}
    </main>
  )
}

export default App