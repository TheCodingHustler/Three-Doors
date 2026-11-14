import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { DeepLClient } from 'deepl-node'

const app = express()
const port = Number(process.env.PORT ?? 3001)
const fields = ['drugName', 'dose', 'frequency', 'quantity', 'refills']
const deeplClient = process.env.DEEPL_AUTH_KEY
  ? new DeepLClient(process.env.DEEPL_AUTH_KEY)
  : null
let cachedTargetLanguages = null
let targetLanguagesCachedAt = 0

async function getTargetLanguages() {
  if (!deeplClient) throw new Error('DeepL is not configured.')
  if (cachedTargetLanguages && Date.now() - targetLanguagesCachedAt < 60 * 60 * 1000) {
    return cachedTargetLanguages
  }

  cachedTargetLanguages = await deeplClient.getTargetLanguages()
  targetLanguagesCachedAt = Date.now()
  return cachedTargetLanguages
}

const configuredClientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'
app.use(cors({
  origin(origin, callback) {
    const isLocalDevelopmentOrigin = origin
      && /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)

    callback(null, !origin || origin === configuredClientOrigin || isLocalDevelopmentOrigin)
  },
}))
app.use(express.json({ limit: '50kb' }))

app.get('/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.get('/api/translate/languages', async (_request, response) => {
  try {
    const languages = await getTargetLanguages()
    return response.json({
      languages: languages.map(({ code, name }) => ({ code, name })),
    })
  } catch {
    return response.status(deeplClient ? 502 : 503).json({
      error: deeplClient
        ? 'Could not load DeepL target languages.'
        : 'DeepL is not configured on the backend.',
    })
  }
})

app.post('/api/parse-label', (request, response) => {
  const { text } = request.body ?? {}
  if (typeof text !== 'string' || text.trim().length === 0) {
    return response.status(400).json({ error: 'A non-empty OCR text string is required.' })
  }

  return response.json({
    provider: 'stub',
    isStub: true,
    fields: Object.fromEntries(fields.map((field) => [field, {
      value: null,
      originalText: '',
      status: 'unclear',
    }])),
  })
})

app.post('/api/translate', async (request, response) => {
  const { texts, targetLanguage } = request.body ?? {}
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > 20
    || texts.some((text) => typeof text !== 'string' || text.length === 0 || text.length > 3000)) {
    return response.status(400).json({ error: 'Provide 1 to 20 text strings, each 1-3000 characters.' })
  }
  if (typeof targetLanguage !== 'string' || !/^[A-Za-z-]{2,10}$/.test(targetLanguage)) {
    return response.status(400).json({ error: 'A valid target language code is required.' })
  }
  if (!deeplClient) {
    return response.status(503).json({ error: 'DeepL is not configured on the backend.' })
  }

  try {
    const languages = await getTargetLanguages()
    const target = languages.find(({ code }) => code.toLowerCase() === targetLanguage.toLowerCase())
    if (!target) return response.status(400).json({ error: 'DeepL does not support this target language.' })

    const results = await deeplClient.translateText(texts, 'EN', target.code)
    return response.json({ translatedTexts: results.map(({ text }) => text) })
  } catch {
    return response.status(502).json({ error: 'DeepL translation failed. English text is still available.' })
  }
})

app.listen(port, () => {
  console.info(`Label parsing stub listening on port ${port}`)
})
