/** Split multiline input into non-empty topic lines (preserves order). */
export function parseBatchTopics(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
