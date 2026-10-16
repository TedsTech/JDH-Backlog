/**
 * Pure text transforms: move a card block between sections and keep the
 * `- Status:` field in sync. Everything here is string in / string out so it
 * is easy to unit test without VS Code.
 */
import { Card, Target, parseTodo, targetForLabel } from './parser';

const HEADING_RE = /^##(?!#)\s*(.+?)\s*$/;

function cleanBlock(lines: string[]): string[] {
  const out = [...lines];
  while (out.length > 0 && out[0].trim() === '') {
    out.shift();
  }
  while (out.length > 0 && out[out.length - 1].trim() === '') {
    out.pop();
  }
  return out;
}

function syncStatus(block: string[], target: Target): string[] {
  const out = [...block];
  const idx = out.findIndex((l) => /^\s*-\s*Status\s*:/i.test(l));
  if (idx >= 0) {
    out[idx] = `- Status: ${target}`;
  } else {
    // Insert right after the `### [ID] Title` line.
    out.splice(1, 0, `- Status: ${target}`);
  }
  return out;
}

function tidy(lines: string[]): string {
  const out: string[] = [];
  let blanks = 0;
  for (const l of lines) {
    if (l.trim() === '') {
      blanks++;
      if (blanks <= 2) {
        out.push('');
      }
    } else {
      blanks = 0;
      out.push(l);
    }
  }
  let result = out.join('\n');
  if (!result.endsWith('\n')) {
    result += '\n';
  }
  return result;
}

/**
 * Insert a card block at the end of the target section. Uses the LAST
 * matching ## heading (cards accumulate at the bottom, e.g. Done), and
 * inserts after the last card's full extent — never in the middle of a
 * card that has trailing content (e.g. a review report block).
 * Creates `## <Target>` at the end of the file when missing.
 */
export function insertCardText(text: string, block: string[], target: Target): string {
  const lines = text.split('\n');
  const clean = cleanBlock(block);

  let headingLine = -1;
  lines.forEach((l, i) => {
    const m = l.match(HEADING_RE);
    if (m && targetForLabel(m[1]) === target) {
      headingLine = i;
    }
  });

  let insertAt: number;
  if (headingLine >= 0) {
    // Next recognized section heading after ours (any target).
    let nextSectionLine = lines.length;
    for (let i = headingLine + 1; i < lines.length; i++) {
      const m = lines[i].match(HEADING_RE);
      if (m && targetForLabel(m[1])) {
        nextSectionLine = i;
        break;
      }
    }
    // Cards belonging to this exact heading instance.
    const { cards } = parseTodo(text);
    const inSection = cards.filter(
      (c) => c.startLine > headingLine && c.startLine < nextSectionLine && c.sectionTarget === target
    );
    let floor: number;
    if (inSection.length > 0) {
      const lastEnd = Math.max(...inSection.map((c) => c.endLine));
      floor = lastEnd + 1;
      insertAt = lastEnd + 1;
    } else {
      floor = headingLine + 1;
      insertAt = headingLine + 1;
    }
    // Trim blank lines at the end of the section, but never cut into content.
    while (insertAt > floor && lines[insertAt - 1].trim() === '') {
      insertAt--;
    }
  } else {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    lines.push('', `## ${target}`, '');
    insertAt = lines.length;
  }

  lines.splice(insertAt, 0, '', ...clean, '');
  return tidy(lines);
}

/** Move a card to the target section, syncing its `- Status:` field. */
export function moveCardText(text: string, card: Card, target: Target): string {
  const lines = text.split('\n');
  const block = syncStatus(cleanBlock(lines.slice(card.startLine, card.endLine + 1)), target);
  const remaining = [...lines.slice(0, card.startLine), ...lines.slice(card.endLine + 1)];
  return insertCardText(remaining.join('\n'), block, target);
}

export function moveCardsText(text: string, cardIds: readonly string[], target: Target): string {
  let result = text;
  for (const id of new Set(cardIds)) {
    const card = parseTodo(result).cards.find((candidate) => candidate.id === id);
    if (card) {
      result = moveCardText(result, card, target);
    }
  }
  return result;
}
