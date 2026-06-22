import { useMemo } from 'react';

/**
 * Renders text with search keyword matches highlighted using <mark> tags.
 * Supports case-insensitive matching.
 * If searchTerm is empty or not found, returns the original text as-is.
 */
export default function HighlightText({
  text,
  searchTerm,
}: {
  text: string;
  searchTerm?: string;
}) {
  const parts = useMemo(() => {
    if (!searchTerm) return null;

    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const match = text.match(regex);
    if (!match) return null;

    const result: Array<{ key: number; text: string; highlight: boolean }> = [];
    let lastIndex = 0;
    let keyIdx = 0;

    text.replace(regex, (matched, _, offset) => {
      // Text before this match
      if (offset > lastIndex) {
        result.push({ key: keyIdx++, text: text.slice(lastIndex, offset), highlight: false });
      }
      result.push({ key: keyIdx++, text: matched, highlight: true });
      lastIndex = offset + matched.length;
      return matched;
    });

    // Remaining text after last match
    if (lastIndex < text.length) {
      result.push({ key: keyIdx++, text: text.slice(lastIndex), highlight: false });
    }

    return result;
  }, [text, searchTerm]);

  if (!parts) {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((p) =>
        p.highlight ? (
          <mark
            key={p.key}
            className="bg-yellow-200 dark:bg-yellow-700/60 text-inherit rounded-sm px-0.5"
          >
            {p.text}
          </mark>
        ) : (
          <span key={p.key}>{p.text}</span>
        )
      )}
    </>
  );
}