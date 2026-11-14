import { createWorker } from 'tesseract.js'
import { cropImageToConfidentText } from './cropLabel.js'

export async function readLabel(imageFile, cropLines = null) {
  let imageToRead = imageFile
  let cropApplied = false

  if (cropLines) {
    const crop = await cropImageToConfidentText(imageFile, cropLines)
    if (crop) {
      imageToRead = crop.image
      cropApplied = true
    }
  }

  const worker = await createWorker('eng')

  try {
    const { data } = await worker.recognize(imageToRead, {}, {
      text: true,
      blocks: true,
    })

    if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_OCR === 'true') {
      console.info('Tesseract OCR result:', data)
    }

    const lines = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) =>
        paragraph.lines.map((line) => ({
          text: line.text,
          confidence: line.confidence,
          bbox: line.bbox,
          words: line.words.map((word) => ({
            text: word.text,
            confidence: word.confidence,
          })),
        })),
      ),
    )

    return {
      text: data.text,
      confidence: data.confidence,
      lines,
      cropApplied,
    }
  } finally {
    await worker.terminate()
  }
}