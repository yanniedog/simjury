export function storyParagraphs(text: string): string[] {
  if (!text.trim()) return []
  // A sentence ending is followed by whitespace/end, so decimal values such
  // as "1.1 million" stay exactly as authored.
  const sentences = text.match(/\S(?:.*?)(?:[.!?](?:["'”])?(?=\s|$)|$)/gs) ?? [text]
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    paragraphs.push(sentences.slice(i, i + 2).map((sentence) => sentence.trim()).join(' '))
  }
  return paragraphs
}
