/** New-card template matching the Backlog Workflow card format. */
export function newCardBlock(id: string, title: string): string[] {
  return [
    `### [${id}] ${title}`,
    '',
    '- Status: Inbox',
    '- Problem:',
    '- User:',
    '- Outcome metric:',
    '- Impact: High | Medium | Low',
    '- Confidence: High | Medium | Low',
    '- Effort: S | M | L | XL',
    '- Risk: Low | Medium | High',
    '- Dependencies:',
    '- Readiness trigger:',
    '- Scope notes:',
    '- Acceptance checklist:',
    '  - [ ]',
    '',
    '---',
  ];
}
