export const CROP_CONFIDENCE_THRESHOLD = 60

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export function getConfidentTextBounds(
  lines,
  imageWidth,
  imageHeight,
  threshold = CROP_CONFIDENCE_THRESHOLD,
) {
  const confidentLines = lines.filter((line) => (
    Number.isFinite(line.confidence)
    && line.confidence >= threshold
    && line.bbox
    && Number.isFinite(line.bbox.x0)
    && Number.isFinite(line.bbox.y0)
    && Number.isFinite(line.bbox.x1)
    && Number.isFinite(line.bbox.y1)
  ))

  if (confidentLines.length === 0) return null

  const heights = confidentLines.map((line) => Math.max(1, line.bbox.y1 - line.bbox.y0))
  const padding = Math.max(12, Math.round(median(heights) * 2))
  const left = Math.max(0, Math.floor(Math.min(...confidentLines.map((line) => line.bbox.x0)) - padding))
  const top = Math.max(0, Math.floor(Math.min(...confidentLines.map((line) => line.bbox.y0)) - padding))
  const right = Math.min(imageWidth, Math.ceil(Math.max(...confidentLines.map((line) => line.bbox.x1)) + padding))
  const bottom = Math.min(imageHeight, Math.ceil(Math.max(...confidentLines.map((line) => line.bbox.y1)) + padding))

  if (right <= left || bottom <= top) return null

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  }
}

export async function cropImageToConfidentText(imageFile, lines) {
  if (typeof globalThis.createImageBitmap !== 'function') return null

  let bitmap
  try {
    bitmap = await createImageBitmap(imageFile)
    const bounds = getConfidentTextBounds(lines, bitmap.width, bitmap.height)
    if (!bounds || (bounds.width === bitmap.width && bounds.height === bitmap.height)) return null

    const canvas = document.createElement('canvas')
    canvas.width = bounds.width
    canvas.height = bounds.height
    const context = canvas.getContext('2d')
    if (!context) return null

    context.drawImage(
      bitmap,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
      0,
      0,
      bounds.width,
      bounds.height,
    )

    const croppedImage = await new Promise((resolve) => canvas.toBlob(resolve, imageFile.type || 'image/png'))
    return croppedImage ? { image: croppedImage, bounds } : null
  } catch {
    return null
  } finally {
    bitmap?.close()
  }
}
