/**
 * Parser for the JDH Backlog Markdown format.
 *
 * Sections are `## <Name>` headings; cards are `### [ID] Title` blocks.
 * Only the six workflow targets (Inbox, Now, Next, Later, Parked, Done)
 * are treated as sections. A heading like "## Now and Next" matches both
 * Now and Next (first match in TARGETS order wins); unrecognized headings
 * (e.g. "## Template (copy for new items)", "## GSTACK REVIEW REPORT")
 * are ignored so nested sub-headings inside a card never split it.
 */

export const TARGETS = ['Inbox', 'Now', 'Next', 'Later', 'Parked', 'Done'] as const;
export type Target = (typeof TARGETS)[number];

export interface Card {
  id: string;
  title: string;
  /** Target derived from the ## heading the card sits under. */
  sectionTarget: Target;
  /** Raw heading text, e.g. "Now and Next". */
  sectionLabel: string;
  startLine: number; // 0-based, inclusive
  endLine: number; // 0-based, inclusive
  /** Raw `- Status:` field value ('' when missing). */
  status: string;
  /** First body lines, used for tree tooltips. */
  preview: string;
}

const HEADING_RE = /^##(?!#)\s*(.+?)\s*$/;
const CARD_RE = /^###(?!#)\s*\[([^\]]+)\]\s*(.*?)\s*$/;
const STATUS_RE = /^\s*-\s*Status\s*:\s*(.+?)\s*$/;

/** Map a ## heading label to a workflow target, if any. */
export function targetForLabel(label: string): Target | undefined {
  const norm = label.trim().toLowerCase();
  for (const t of TARGETS) {
    if (norm === t.toLowerCase()) {
      return t;
    }
  }
  const words = norm.split(/[^a-z0-9]+/);
  for (const t of TARGETS) {
    if (words.includes(t.toLowerCase())) {
      return t;
    }
  }
  return undefined;
}

/** Map a raw `- Status:` value to a target (handles `- Status: **In Progress**`). */
export function normalizeStatus(raw: string): Target | undefined {
  const clean = raw.replace(/\*/g, '').trim().toLowerCase();
  for (const t of TARGETS) {
    if (clean === t.toLowerCase()) {
      return t;
    }
  }
  return undefined;
}

/** The group a card belongs to: its Status field wins, else its section. */
export function cardGroup(card: Card): Target {
  return normalizeStatus(card.status) ?? card.sectionTarget;
}

export function parseTodo(text: string): { cards: Card[] } {
  const lines = text.split('\n');

  interface Section {
    target: Target;
    label: string;
    line: number;
  }
  const sections: Section[] = [];
  lines.forEach((l, i) => {
    const m = l.match(HEADING_RE);
    if (m) {
      const t = targetForLabel(m[1]);
      if (t) {
        sections.push({ target: t, label: m[1].trim(), line: i });
      }
    }
  });

  interface CardStart {
    id: string;
    title: string;
    line: number;
  }
  const starts: CardStart[] = [];
  lines.forEach((l, i) => {
    const m = l.match(CARD_RE);
    // Skip the template placeholder card `### [ID] Title`.
    if (m && m[1].trim() !== 'ID') {
      starts.push({ id: m[1].trim(), title: m[2].trim(), line: i });
    }
  });

  const cards: Card[] = [];
  starts.forEach((c, ci) => {
    // Nearest preceding recognized section heading.
    let sec: Section | undefined;
    for (const s of sections) {
      if (s.line < c.line) {
        sec = s;
      }
    }
    if (!sec) {
      return; // Card before any workflow section (e.g. template example).
    }
    // Card runs until the next card, the next recognized section, or EOF.
    let end = lines.length - 1;
    if (ci + 1 < starts.length) {
      end = Math.min(end, starts[ci + 1].line - 1);
    }
    const nextSec = sections.find((s) => s.line > c.line);
    if (nextSec) {
      end = Math.min(end, nextSec.line - 1);
    }

    let status = '';
    const preview: string[] = [];
    for (let i = c.line + 1; i <= end; i++) {
      const sm = lines[i].match(STATUS_RE);
      if (sm && !status) {
        status = sm[1].replace(/\*/g, '').trim();
      }
      if (preview.length < 2 && lines[i].trim() && !lines[i].startsWith('#')) {
        preview.push(lines[i].trim().slice(0, 140));
      }
    }

    cards.push({
      id: c.id,
      title: c.title,
      sectionTarget: sec.target,
      sectionLabel: sec.label,
      startLine: c.line,
      endLine: end,
      status,
      preview: preview.join('\n'),
    });
  });

  return { cards };
}
