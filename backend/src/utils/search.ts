export function normalizeSearchText(text: string): string {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function buildSearchTerms(query: string): string[] {
  const normalized = normalizeSearchText(query)
  if (!normalized) return []
  const terms = new Set<string>()
  for (const part of normalized.split(/\s+/).filter(Boolean)) {
    if (part.length >= 2) terms.add(part)
  }
  if (/[\u4e00-\u9fff]/.test(normalized)) {
    for (let i = 0; i < normalized.length - 1; i++) {
      const chunk = normalized.slice(i, i + 2).trim()
      if (chunk.length === 2 && /[\u4e00-\u9fff]/.test(chunk)) terms.add(chunk)
    }
  }
  terms.add(normalized)
  return Array.from(terms).sort((a, b) => b.length - a.length).slice(0, 12)
}

export function lexicalScore(query: string, title: string, text: string): number {
  const q = normalizeSearchText(query)
  const titleText = normalizeSearchText(title)
  const bodyText = normalizeSearchText(text)
  if (!q || !bodyText) return 0
  let score = 0
  if (titleText.includes(q)) score += 0.28
  if (bodyText.includes(q)) score += 0.22
  for (const term of buildSearchTerms(q)) {
    if (term === q) continue
    if (titleText.includes(term)) score += 0.06
    else if (bodyText.includes(term)) score += 0.03
  }
  return Math.min(score, 0.42)
}

export function buildSnippet(query: string, text: string): string {
  const plain = (text || '').replace(/\s+/g, ' ').trim()
  if (!plain) return ''
  const normalized = normalizeSearchText(plain)
  for (const term of buildSearchTerms(query)) {
    const idx = normalized.indexOf(term)
    if (idx >= 0) {
      const start = Math.max(0, idx - 30)
      const end = Math.min(plain.length, start + 140)
      const prefix = start > 0 ? '…' : ''
      const suffix = end < plain.length ? '…' : ''
      return `${prefix}${plain.slice(start, end)}${suffix}`
    }
  }
  return plain.slice(0, 140) + (plain.length > 140 ? '…' : '')
}
