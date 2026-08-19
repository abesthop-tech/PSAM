export function appendSegment(
  existing: string,
  segment: string,
  opts?: { newParagraph?: boolean },
): { text: string; inserted: string } {
  const seg = segment.trim()
  if (!seg) return { text: existing, inserted: '' }
  const trimmed = existing.trimEnd()
  if (!trimmed) return { text: seg, inserted: seg }
  if (opts?.newParagraph) {
    const insertedPiece = '\n\n' + seg
    return { text: trimmed + insertedPiece, inserted: insertedPiece }
  }
  const needsComma = !trimmed.endsWith(',')
  const insertedPiece = (needsComma ? ', ' : ' ') + seg
  return { text: trimmed + insertedPiece, inserted: insertedPiece }
}

export function removeSegment(existing: string, inserted: string): string {
  if (!inserted || !existing.includes(inserted)) return existing
  return existing
    .replace(inserted, '')
    .replace(/,?[ \t]*\n[ \t]*\n[ \t]*,?/g, '\n\n')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
    .trim()
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildLoraTag(name: string, model: number, clip: number | null): string {
  if (clip === null || clip === model) return `<lora:${name}:${model}>`
  return `<lora:${name}:${model}:${clip}>`
}

function loraTagRe(name: string): RegExp {
  return new RegExp(`<lora:${escapeRegex(name)}:[^>]*>`, 'g')
}

export function upsertLoraTag(text: string, name: string, model: number, clip: number | null): string {
  const tag = buildLoraTag(name, model, clip)
  if (loraTagRe(name).test(text)) {
    return text.replace(loraTagRe(name), tag)
  }
  return appendSegment(text, tag).text
}

export function removeLoraTag(text: string, name: string): string {
  return text
    .replace(loraTagRe(name), '')
    .replace(/,\s*,/g, ',')
    .replace(/^\s*,\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function containsSegment(text: string, segment: string): boolean {
  return text.includes(segment.trim())
}
