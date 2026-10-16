/* Unit tests for parser.ts / mover.ts / template.ts / todoFile.ts (run against dist/). */
const { parseTodo, cardGroup } = require('../dist/parser');
const { moveCardText, moveCardsText, insertCardText } = require('../dist/mover');
const { newCardBlock } = require('../dist/template');
const { isTodoFileName } = require('../dist/todoFile');
const fs = require('fs');
const assert = require('assert');

for (const fileName of ['todo.md', 'TODOS.md', 'Todo.MD', 'ToDoS.Md']) {
  assert.ok(isTodoFileName(fileName), `${fileName} should be recognized`);
}
for (const fileName of ['my-todo.md', 'todos.markdown', 'todo.txt']) {
  assert.ok(!isTodoFileName(fileName), `${fileName} should not be recognized`);
}

const text = fs.readFileSync(__dirname + '/fixture.md', 'utf8');
const { cards } = parseTodo(text);
const byId = Object.fromEntries(cards.map((c) => [c.id, c]));

// 1. Template placeholder card is skipped; 6 real cards parsed.
assert.strictEqual(cards.length, 6, `expected 6 cards, got ${cards.length}`);
assert.ok(!cards.some((c) => c.id === 'ID'), 'template [ID] card must be skipped');

// 2. Grouping: Status field wins over section; bold status normalized.
assert.strictEqual(cardGroup(byId['AI-001']), 'Inbox');
assert.strictEqual(cardGroup(byId['PLT-007']), 'Next', 'Status: Next beats "Now and Next" heading');
assert.strictEqual(cardGroup(byId['SEC-004']), 'Done', '**In Progress** falls back to section');
assert.strictEqual(cardGroup(byId['PLT-006a']), 'Later');

// 3. Unrecognized ## heading inside a card does NOT split the card.
const secText = text.split('\n').slice(byId['SEC-004'].startLine, byId['SEC-004'].endLine + 1).join('\n');
assert.ok(secText.includes('GSTACK REVIEW REPORT'), 'nested ## heading must stay inside card extent');

// 4. Move Inbox -> Done: lands under the LAST ## Done, Status synced.
let moved = moveCardText(text, byId['AI-001'], 'Done');
let cards2 = parseTodo(moved).cards;
const ai1 = cards2.find((c) => c.id === 'AI-001');
assert.ok(ai1, 'AI-001 must survive the move');
assert.strictEqual(ai1.status, 'Done');
assert.strictEqual(cardGroup(ai1), 'Done');
const lines = moved.split('\n');
const doneHeadings = [];
lines.forEach((l, i) => {
  if (/^##\s+Done\s*$/.test(l)) doneHeadings.push(i);
});
assert.strictEqual(doneHeadings.length, 2, 'both Done sections must remain');
assert.ok(ai1.startLine > doneHeadings[1], 'AI-001 must be under the LAST Done section');

// 5. Move card carrying nested content Done -> Parked (section auto-created).
const sec4 = cards2.find((c) => c.id === 'SEC-004');
moved = moveCardText(moved, sec4, 'Parked');
const cards3 = parseTodo(moved).cards;
const sec4b = cards3.find((c) => c.id === 'SEC-004');
assert.strictEqual(cardGroup(sec4b), 'Parked');
assert.strictEqual(sec4b.status, 'Parked');
const sec4Text = moved.split('\n').slice(sec4b.startLine, sec4b.endLine + 1).join('\n');
assert.ok(sec4Text.includes('GSTACK REVIEW REPORT'), 'nested content must move with the card');
assert.ok(/^## Parked\s*$/m.test(moved), 'Parked section must be created');

// 6. Insert a brand-new card into Inbox.
moved = insertCardText(moved, newCardBlock('OPS-004', 'Test card'), 'Inbox');
const cards4 = parseTodo(moved).cards;
const ops = cards4.find((c) => c.id === 'OPS-004');
assert.ok(ops, 'new card must be parseable');
assert.strictEqual(cardGroup(ops), 'Inbox');
assert.strictEqual(ops.status, 'Inbox');
assert.strictEqual(cards4.length, 7, 'no card may be lost');
assert.ok(!/undefined/.test(moved), 'no undefined leaked into text');

// 7. Moving multiple selected cards keeps their order and synchronizes statuses.
const movedMany = moveCardsText(text, ['AI-001', 'AI-002'], 'Now');
const movedManyCards = parseTodo(movedMany).cards;
const ai1Now = movedManyCards.find((card) => card.id === 'AI-001');
const ai2Now = movedManyCards.find((card) => card.id === 'AI-002');
assert.ok(ai1Now && ai2Now, 'both selected cards must survive the move');
assert.strictEqual(cardGroup(ai1Now), 'Now');
assert.strictEqual(cardGroup(ai2Now), 'Now');
assert.ok(ai1Now.startLine < ai2Now.startLine, 'selected cards must retain their source order');

console.log('All parser/mover/file-detection tests passed.');
