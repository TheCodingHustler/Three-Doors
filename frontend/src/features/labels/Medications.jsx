import { useEffect, useRef, useState } from 'react'
import './labels.css'
import { readLabel } from './ocr.js'
import { parseLabel, shouldRetryOCR } from './parseLabel.js'
import {
  FALLBACK_TRANSLATION_LANGUAGES,
  getTranslationLanguages,
  translateLabelSentences,
} from './translateLabel.js'
import { groupLabelRegions } from './groupLabels.js'
import {
  deleteAllSavedLabels,
  deleteSavedLabel,
  listSavedLabels,
  saveLabel,
} from './labelStorage.js'
import { FIELD_LABELS, getFieldSentence, getPlainLanguageSentences, getSpokenSummary } from './plainLanguage.js'
import { getTranslatedSpeechAudio } from './speech.js'

const TRANSLATE_API_URL = '/api/translate'
const TRANSLATE_LANGUAGES_API_URL = '/api/translate/languages'

function translationKey(index, resultName, language) {
  return `${index}-${resultName}-${language}`
}

function Medications() {
  const [images, setImages] = useState([])
  const [ocrResults, setOcrResults] = useState([])
  const [isReading, setIsReading] = useState(false)
  const [readingStatus, setReadingStatus] = useState('')
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [speechRate, setSpeechRate] = useState(1)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [displayLanguage, setDisplayLanguage] = useState('en')
  const [translations, setTranslations] = useState({})
  const [speechAudio, setSpeechAudio] = useState(null)
  const [speechLoadingKey, setSpeechLoadingKey] = useState('')
  const [speechError, setSpeechError] = useState(null)
  const audioRef = useRef(null)
  const [translateLanguages, setTranslateLanguages] = useState(FALLBACK_TRANSLATION_LANGUAGES)
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
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speechRate
  }, [speechRate, speechAudio])

  useEffect(() => () => {
    if (speechAudio?.url) URL.revokeObjectURL(speechAudio.url)
  }, [speechAudio])

  function handleImageChanges(event) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    setImages(files.map((file) => ({ file, preview: URL.createObjectURL(file) })))
    setOcrResults([])
    setTranslations({})
    setSpeechAudio(null)
    setSpeechError(null)
  }

  async function handleReadLabels() {
    if (images.length === 0) return

    setIsReading(true)
    setReadingStatus('Reading labels in this browser…')
    setOcrResults([])
    setTranslations({})
    setSpeechAudio(null)
    setSpeechError(null)
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
          const parsed = lowConfidence ? null : parseLabel(regionText, regionLines)

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
          })
        }
      } catch {
        results.push({ name: file.name, error: "We couldn't read this image. Please try another one." })
      }
    }

    setOcrResults(results)
    setIsReading(false)
    setReadingStatus('')
    translateResults(results, displayLanguage)
  }

  function handleReadAloud(text) {
    if (!speechAvailable) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = window.speechSynthesis.getVoices()
      .find((availableVoice) => availableVoice.lang.toLowerCase().startsWith('en'))
    if (voice) utterance.voice = voice
    utterance.lang = voice?.lang ?? 'en'
    utterance.rate = speechRate
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }

  async function handleGenerateTranslatedSpeech(text, index, resultName) {
    const language = displayLanguage
    const key = translationKey(index, resultName, language)
    setSpeechLoadingKey(key)
    setSpeechError(null)
    setSpeechAudio(null)
    if (speechAvailable) window.speechSynthesis.cancel()
    setIsSpeaking(false)
    console.info('[Three Doors cloud TTS]', {
      requestedLanguage: language,
      provider: 'Gemini 3.8 Flash TTS',
      textCharacters: text.length,
      arabicCharacters: (text.match(/[\u0600-\u06ff]/g) ?? []).length,
    })
    try {
      const blob = await getTranslatedSpeechAudio(text, language, fetch, '/api/speech')
      setSpeechAudio({ key, url: URL.createObjectURL(blob) })
    } catch (error) {
      setSpeechError({ key, message: error?.message || 'Could not generate translated audio.' })
    } finally {
      setSpeechLoadingKey((current) => current === key ? '' : current)
    }
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
    return savedLabels.some((record) => record.sourceKey === getSavedSourceKey(result))
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

  async function handleTranslateResult(result, index, language = displayLanguage) {
    const key = translationKey(index, result.name, language)
    setTranslations((current) => ({
      ...current,
      [key]: { loading: true, error: '', texts: null },
    }))

    const protectedTerms = ['drugName', 'dose', 'quantity', 'refills']
      .map((field) => result.parsed[field].value)
      .filter(Boolean)

    try {
      const translatedTexts = await translateLabelSentences(
        getPlainLanguageSentences(result.parsed),
        language,
        protectedTerms,
        fetch,
        TRANSLATE_API_URL,
      )
      setTranslations((current) => ({
        ...current,
        [key]: { loading: false, error: '', texts: translatedTexts },
      }))
      return translatedTexts
    } catch (error) {
      setTranslations((current) => ({
        ...current,
        [key]: {
          loading: false,
          error: `${error?.message || 'Automatic translation is unavailable.'} The English original is still shown.`,
          texts: null,
        },
      }))
      return null
    }
  }

  async function handleTranslateLowConfidenceResult(result, index, language = displayLanguage) {
    const key = translationKey(index, result.name, language)
    setTranslations((current) => ({
      ...current,
      [key]: { loading: true, error: '', texts: null },
    }))

    try {
      const translatedTexts = await translateLabelSentences(
        [result.text],
        language,
        [],
        fetch,
        TRANSLATE_API_URL,
      )
      setTranslations((current) => ({
        ...current,
        [key]: { loading: false, error: '', texts: translatedTexts },
      }))
    } catch (error) {
      setTranslations((current) => ({
        ...current,
        [key]: {
          loading: false,
          error: `${error?.message || 'Automatic translation is unavailable.'} The original OCR text is still shown.`,
          texts: null,
        },
      }))
    }
  }

  function translateResults(results, language) {
    if (language === 'en') return
    results.forEach((result, index) => {
      if (result.error) return
      if (result.lowConfidence) void handleTranslateLowConfidenceResult(result, index, language)
      else void handleTranslateResult(result, index, language)
    })
  }

  function changeLanguage(language) {
    if (speechAvailable) window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setDisplayLanguage(language)
    setTranslations({})
    setSpeechAudio(null)
    setSpeechError(null)
    translateResults(ocrResults, language)
  }

  function retryLanguageList() {
    setLanguageListStatus('loading')
    setLanguageListAttempt((attempt) => attempt + 1)
  }

  return (
    <section className={`label-reader${largeText ? ' label-reader-large' : ''}${highContrast ? ' label-reader-contrast' : ''}`} aria-labelledby="label-reader-heading">
      <header className="label-reader-header">
        <div>
          <div className="label-reader-eyebrow">THREE DOORS / MEDICATIONS</div>
          <h1 id="label-reader-heading">Prescription label reader</h1>
          <p>Read the label in this browser, review what is clear, and confirm uncertain details with your pharmacist.</p>
        </div>
        <span className="label-reader-local-status"><span aria-hidden="true">●</span> Images stay on this device</span>
      </header>

      <section className="label-reader-card label-reader-accessibility" aria-labelledby="label-reader-accessibility-heading">
        <h2 id="label-reader-accessibility-heading">Accessibility and reading</h2>
        <div className="label-reader-control-row">
          <label className="label-reader-toggle">
            <input type="checkbox" checked={largeText} onChange={(event) => setLargeText(event.target.checked)} />
            <span>Large text</span>
          </label>
          <label className="label-reader-toggle">
            <input type="checkbox" checked={highContrast} onChange={(event) => setHighContrast(event.target.checked)} />
            <span>High contrast</span>
          </label>
          <label className="label-reader-speed" htmlFor="label-reader-speech-rate">
            Read-aloud speed: {speechRate.toFixed(2)}×
          </label>
          <input
            id="label-reader-speech-rate"
            className="label-reader-range"
            type="range"
            min="0.75"
            max="1.5"
            step="0.05"
            value={speechRate}
            onChange={(event) => setSpeechRate(Number(event.target.value))}
          />
        </div>
        <div className="label-reader-language-control">
          <label htmlFor="label-reader-language">Plain-language display and read-aloud language</label>
          <select
            id="label-reader-language"
            value={displayLanguage}
            disabled={isReading}
            onChange={(event) => changeLanguage(event.target.value)}
            aria-describedby="label-reader-language-note"
          >
            <option value="en">English</option>
            {translateLanguages
              .filter((language) => !language.code.toLowerCase().startsWith('en'))
              .map((language) => <option value={language.code} key={language.code}>{language.name}</option>)}
          </select>
          <p id="label-reader-language-note" role="status">
            {languageListStatus === 'loading'
              ? 'Loading translation languages…'
              : languageListStatus === 'unavailable'
                ? 'Showing the last-known language list. Automatic translation needs DeepL configured on the team backend; English remains available.'
                : displayLanguage === 'en'
                  ? 'Choose a language for automatic translation. The English original remains beside it.'
                  : 'Translations are automatic. The English original remains beside each translated result.'}
          </p>
          {displayLanguage !== 'en' && (
            <p className="label-reader-speech-note">
              Generating audio sends the translated text to Gemini. Images and raw OCR text are not sent for speech.
            </p>
          )}
          {languageListStatus === 'unavailable' && (
            <button className="label-reader-button label-reader-button-secondary" type="button" onClick={retryLanguageList}>
              Retry language list
            </button>
          )}
        </div>
      </section>

      <section className="label-reader-card" aria-labelledby="label-reader-upload-heading">
        <div className="label-reader-section-heading">
          <div>
            <div className="label-reader-step">01 / UPLOAD</div>
            <h2 id="label-reader-upload-heading">Your medication label</h2>
            <p>Choose a clear photo. OCR and cropping happen in this browser; the photo is not uploaded.</p>
          </div>
        </div>
        <label className="label-reader-upload" htmlFor="label-reader-files">
          <span className="label-reader-upload-icon" aria-hidden="true">↑</span>
          <span className="label-reader-upload-title">Choose label images</span>
          <span className="label-reader-upload-hint">JPEG, PNG, or WebP · Multiple images supported</span>
          <input
            id="label-reader-files"
            className="label-reader-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleImageChanges}
          />
        </label>
        {images.length > 0 && (
          <div className="label-reader-previews" aria-label="Selected images">
            {images.map(({ file, preview }) => (
              <figure className="label-reader-preview" key={`${file.name}-${file.lastModified}`}>
                <figcaption>{file.name}</figcaption>
                <img src={preview} alt={`Preview of ${file.name}; stored only in this browser`} />
              </figure>
            ))}
          </div>
        )}
        <div className="label-reader-actions">
          <button className="label-reader-button label-reader-button-primary" type="button" onClick={handleReadLabels} disabled={images.length === 0 || isReading}>
            {isReading ? 'Reading labels…' : 'Read labels'} <span aria-hidden="true">→</span>
          </button>
          {isReading && <p className="label-reader-status" role="status" aria-live="polite">{readingStatus}</p>}
        </div>
        {images.length > 0 && <p className="label-reader-help">Separated label areas are read separately when their layout can be distinguished. For best accuracy, crop to one label per image.</p>}
      </section>

      <section className="label-reader-card label-reader-saved" aria-labelledby="label-reader-saved-heading">
        <div className="label-reader-section-heading label-reader-saved-heading">
          <div>
            <div className="label-reader-step">ON THIS DEVICE</div>
            <h2 id="label-reader-saved-heading">Saved labels</h2>
            <p>Saved labels stay in this browser profile and are not synced.</p>
          </div>
          {savedLabels.length > 0 && (
            <button className="label-reader-button label-reader-button-secondary" type="button" onClick={handleDeleteAllSavedLabels}>Delete all saved labels</button>
          )}
        </div>
        {savedLabelsStatus === 'loading' && <p role="status">Loading saved labels…</p>}
        {savedLabelsStatus === 'unavailable' && <p role="alert">Local browser storage is unavailable in this browser.</p>}
        {savedLabelsStatus === 'ready' && savedLabels.length === 0 && <p>No labels saved on this device.</p>}
        {savedLabels.map((record) => (
          <details className="label-reader-saved-item" key={record.id}>
            <summary>{record.name}{record.labelNumber > 1 ? ` — Label ${record.labelNumber}` : ''} · {new Date(record.savedAt).toLocaleString()}</summary>
            <p>OCR confidence: {record.confidence === null ? 'Unavailable' : `${record.confidence}%`}</p>
            {record.lowConfidence && <p role="status">This label was flagged low confidence when saved.</p>}
            {record.fields && FIELD_LABELS.map(([key, label]) => {
              const field = record.fields[key]
              return (
                <p className="label-reader-saved-field" key={key}>
                  <strong>{label}: {field?.status === 'found' ? field.value : 'Unclear'}</strong>
                  <span>Source: {field?.originalText || 'No matching text found.'}</span>
                </p>
              )
            })}
            <h3>Original label text</h3>
            <pre>{record.text}</pre>
            <button className="label-reader-button label-reader-button-secondary" type="button" onClick={() => handleDeleteSavedLabel(record.id)}>Delete saved label</button>
          </details>
        ))}
        {storageError && <p role="alert">{storageError}</p>}
      </section>

      {ocrResults.map((result, index) => {
        const resultSpeechKey = translationKey(index, result.name, displayLanguage)
        const translation = translations[resultSpeechKey]
        return (
          <article className="label-reader-card label-reader-result" aria-labelledby={`label-reader-result-${index}`} key={`${index}-${result.name}`}>
            <div className="label-reader-section-heading">
              <div>
                <div className="label-reader-step">02 / REVIEW</div>
                <h2 id={`label-reader-result-${index}`}>
                  {result.labelCount > 1 ? `${result.name} — Label ${result.labelNumber} of ${result.labelCount}` : result.name}
                </h2>
                {!result.error && <p>Page average confidence (reference only): {Number.isFinite(result.confidence) ? `${result.confidence.toFixed(1)}%` : 'Unavailable'}</p>}
              </div>
              <span className="label-reader-result-icon" aria-hidden="true">✚</span>
            </div>
            {result.error ? (
              <>
                <p role="alert">{result.error}</p>
                <p className="label-reader-reminder" role="note">Please confirm medication information with your pharmacist.</p>
              </>
            ) : (
              <>
                <div className="label-reader-language-control">
                  <label htmlFor={`result-language-${index}`}>Translate and listen</label>
                  <select id={`result-language-${index}`} value={displayLanguage} disabled={isReading}
                    onChange={(event) => changeLanguage(event.target.value)}>
                    <option value="en">English (original)</option>
                    {translateLanguages.filter((language) => !language.code.toLowerCase().startsWith('en'))
                      .map((language) => <option value={language.code} key={language.code}>{language.name}</option>)}
                  </select>
                  <p role="status">{displayLanguage === 'en'
                    ? 'Showing English. Choose another language to translate this reading.'
                    : translation?.loading ? 'Translating your reading…'
                    : translation?.texts ? 'Translation ready. Read it below or generate audio, then press Play.'
                    : 'Translation is unavailable. The original text is shown below.'}</p>
                  <div className="label-reader-actions">
                    {displayLanguage === 'en' && speechAvailable ? (
                      <>
                        <button className="label-reader-button label-reader-button-primary" type="button"
                          onClick={() => handleReadAloud(result.parsed ? getSpokenSummary(result.parsed) : result.text)}
                          disabled={isSpeaking}>Read English aloud</button>
                        <button className="label-reader-button label-reader-button-secondary" type="button"
                          onClick={handleStopReading} disabled={!isSpeaking}>Stop reading</button>
                      </>
                    ) : (
                      <button className="label-reader-button label-reader-button-primary" type="button"
                        disabled={speechLoadingKey === resultSpeechKey || (displayLanguage !== 'en' && !translation?.texts)}
                        onClick={() => handleGenerateTranslatedSpeech(displayLanguage === 'en'
                          ? (result.parsed ? getSpokenSummary(result.parsed) : result.text)
                          : translation.texts.join(' '), index, result.name)}>
                        {speechLoadingKey === resultSpeechKey ? 'Generating audio…' : 'Generate reading audio'}
                      </button>
                    )}
                    {speechAudio?.key === resultSpeechKey && (
                      <audio className="label-reader-cloud-audio" controls preload="none" src={speechAudio.url}
                        ref={audioRef} aria-label="Label reading audio" />
                    )}
                  </div>
                  {displayLanguage === 'en' && !speechAvailable && <p>This browser does not support built-in read-aloud. Audio generation uses the server speech service.</p>}
                  {speechError?.key === resultSpeechKey && <p role="alert">{speechError.message}</p>}
                </div>
                {result.cropApplied && <p className="label-reader-status" role="status">Cropped to confident text and reread in this browser.</p>}
                {result.lowConfidence ? (
                  <div className="label-reader-result-columns">
                    <section aria-label="Plain-language label reading">
                      <div className="label-reader-result-title">
                        <h3 className="label-reader-low-confidence-title">Translation of extracted text</h3>
                        {translation?.texts && <span className="label-reader-auto-badge"><span aria-hidden="true">✦</span> Automatic translation</span>}
                      </div>
                      <p className="label-reader-alert" role="alert">Some text is unclear. Hold the label flat in good light and try again.</p>
                      <p className="label-reader-speech-note">This label was read with low confidence. Translation does not correct or verify the OCR.</p>
                      {displayLanguage !== 'en' && (
                        <div className="label-reader-translation-controls">
                          <button
                            className="label-reader-button label-reader-button-secondary"
                            type="button"
                            onClick={() => handleTranslateLowConfidenceResult(result, index)}
                            disabled={translation?.loading}
                          >
                            {translation?.loading ? 'Translating…' : 'Translate automatically'}
                          </button>
                          {translation?.error && <p role="alert">{translation.error}</p>}
                        </div>
                      )}
                      {translation?.texts && <p className="label-reader-low-confidence-translation">{translation.texts[0]}</p>}
                      <p className="label-reader-reminder" role="note">Please confirm this label information with your pharmacist.</p>
                    </section>
                    <section className="label-reader-original" aria-label="Original label text in English">
                      <div className="label-reader-result-title">
                        <h3>Original label text</h3>
                        <span className="label-reader-ocr-badge">OCR</span>
                      </div>
                      <pre>{result.text}</pre>
                    </section>
                  </div>
                ) : (
                  <>
                    <div className="label-reader-result-columns">
                      <section aria-label="Plain-language label reading">
                        <div className="label-reader-result-title">
                          <h3>Plain-language reading</h3>
                          {translation?.texts && <span className="label-reader-auto-badge"><span aria-hidden="true">✦</span> Automatic translation</span>}
                        </div>
                        {displayLanguage !== 'en' && (
                          <div className="label-reader-translation-controls">
                            <button
                              className="label-reader-button label-reader-button-secondary"
                              type="button"
                              onClick={() => handleTranslateResult(result, index)}
                              disabled={translation?.loading}
                            >
                              {translation?.loading ? 'Translating…' : 'Translate automatically'}
                            </button>
                            {translation?.error && <p role="alert">{translation.error}</p>}
                          </div>
                        )}
                        {FIELD_LABELS.map(([key, label], fieldIndex) => {
                          const field = result.parsed[key]
                          const translatedText = translation?.texts?.[fieldIndex]
                          return (
                            <div className={`label-reader-field label-reader-field-${field.status}`} key={key}>
                              <span className={`label-reader-field-status label-reader-field-status-${field.status}`}>
                                <span aria-hidden="true">{field.status === 'found' ? '✓' : '!'}</span>
                                {field.status === 'found' ? 'Found' : 'Unclear'}
                              </span>
                              <strong>{translatedText ?? getFieldSentence(key, field, label)}</strong>
                              <span className="label-reader-field-source">English original: {getFieldSentence(key, field, label)}</span>
                              <span className="label-reader-field-source">Label text: {field.originalText || 'No matching text found.'}</span>
                            </div>
                          )
                        })}
                        <p className="label-reader-reminder" role="note">
                          {translation?.texts?.[FIELD_LABELS.length] ?? 'Please confirm this label information with your pharmacist.'}
                        </p>
                      </section>
                      <section className="label-reader-original" aria-label="Original label text in English">
                        <div className="label-reader-result-title">
                          <h3>Original label text</h3>
                          <span className="label-reader-ocr-badge">OCR</span>
                        </div>
                        <pre>{result.text}</pre>
                      </section>
                    </div>
                    <div className="label-reader-save-row">
                      <button
                        className="label-reader-button label-reader-button-secondary"
                        type="button"
                        onClick={() => handleSaveLabel(result)}
                        disabled={isLabelSaved(result) || savingSourceKey === getSavedSourceKey(result) || savedLabelsStatus !== 'ready'}
                      >
                        {isLabelSaved(result) ? 'Saved on this device' : savingSourceKey === getSavedSourceKey(result) ? 'Saving…' : 'Save on this device'}
                      </button>
                    </div>
                  </>
                )}
                <details className="label-reader-confidence">
                  <summary>Line and word confidence</summary>
                  {result.lines.length > 0 ? (
                    <ol>
                      {result.lines.map((line, lineIndex) => (
                        <li key={`${lineIndex}-${line.text}`}>
                          <p><span>{line.text}</span><small>Line confidence: {line.confidence}%</small></p>
                          <p className="label-reader-word-list">
                            {line.words.map((word, wordIndex) => (
                              <span key={`${lineIndex}-${wordIndex}-${word.text}`}>{word.text} <small>{word.confidence}%</small></span>
                            ))}
                          </p>
                        </li>
                      ))}
                    </ol>
                  ) : <p>Line-level confidence data is unavailable for this image.</p>}
                </details>
              </>
            )}
          </article>
        )
      })}
      <p className="label-reader-footer-note">This tool does not provide medical advice. Please confirm medication details with your pharmacist.</p>
    </section>
  )
}

export default Medications
