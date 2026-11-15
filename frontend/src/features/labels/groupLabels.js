function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function getBoxDistance(first, second) {
  const horizontalGap = Math.max(0, first.bbox.x0 - second.bbox.x1, second.bbox.x0 - first.bbox.x1)
  const verticalGap = Math.max(0, first.bbox.y0 - second.bbox.y1, second.bbox.y0 - first.bbox.y1)
  return Math.hypot(horizontalGap, verticalGap)
}

export function groupLabelRegions(lines, fallbackText = '') {
  const positionedLines = lines.filter((line) => (
    line.bbox
    && Number.isFinite(line.bbox.x0)
    && Number.isFinite(line.bbox.y0)
    && Number.isFinite(line.bbox.x1)
    && Number.isFinite(line.bbox.y1)
  ))

  if (positionedLines.length < 2 || positionedLines.length !== lines.length) {
    return [{ text: fallbackText || positionedLines.map((line) => line.text).join('\n'), lines }]
  }

  const lineHeights = positionedLines.map((line) => Math.max(1, line.bbox.y1 - line.bbox.y0))
  const neighborDistance = Math.max(20, median(lineHeights) * 2.5)
  const visited = new Set()
  const components = []

  positionedLines.forEach((startLine, startIndex) => {
    if (visited.has(startIndex)) return

    const component = []
    const queue = [startIndex]
    visited.add(startIndex)

    while (queue.length > 0) {
      const currentIndex = queue.shift()
      const currentLine = positionedLines[currentIndex]
      component.push(currentLine)

      positionedLines.forEach((candidate, candidateIndex) => {
        if (visited.has(candidateIndex)) return
        if (getBoxDistance(currentLine, candidate) > neighborDistance) return
        visited.add(candidateIndex)
        queue.push(candidateIndex)
      })
    }

    components.push(component)
  })

  components.sort((left, right) => {
    const leftTop = Math.min(...left.map((line) => line.bbox.y0))
    const rightTop = Math.min(...right.map((line) => line.bbox.y0))
    if (leftTop !== rightTop) return leftTop - rightTop
    return Math.min(...left.map((line) => line.bbox.x0))
      - Math.min(...right.map((line) => line.bbox.x0))
  })

  return components.map((component) => {
    const orderedLines = component.sort((left, right) => {
      if (left.bbox.y0 !== right.bbox.y0) return left.bbox.y0 - right.bbox.y0
      return left.bbox.x0 - right.bbox.x0
    })
    return {
      text: orderedLines.map((line) => line.text).join('\n'),
      lines: orderedLines,
    }
  })
}
