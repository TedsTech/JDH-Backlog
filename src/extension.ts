import * as vscode from 'vscode';
import * as path from 'path';
import { Card, Target, TARGETS, cardGroup, parseTodo } from './parser';
import { insertCardText, moveCardText, moveCardsText } from './mover';
import { newCardBlock } from './template';
import { isTodoFileName } from './todoFile';

const VIEW_ID = 'swasthalinkTodo.backlog';
const TREE_MIME = 'application/vnd.code.tree.swasthalinktodo.backlog';

type Node = { kind: 'group'; target: Target } | { kind: 'card'; card: Card };

const GROUP_ICONS: Record<Target, string> = {
  Inbox: 'inbox',
  Now: 'rocket',
  Next: 'arrow-right',
  Later: 'clock',
  Parked: 'archive',
  Done: 'check',
};

const GROUP_COLORS: Record<Target, string> = {
  Inbox: 'charts.blue',
  Now: 'charts.red',
  Next: 'charts.orange',
  Later: 'charts.purple',
  Parked: 'disabledForeground',
  Done: 'charts.green',
};

class BacklogProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Node | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private cards: Card[] = [];

  refresh(cards: Card[]): void {
    this.cards = cards;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(el: Node): vscode.TreeItem {
    if (el.kind === 'group') {
      const count = this.cards.filter((c) => cardGroup(c) === el.target).length;
      const item = new vscode.TreeItem(el.target, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = 'todoGroup';
      item.description = `${count}`;
      item.iconPath = new vscode.ThemeIcon(
        GROUP_ICONS[el.target],
        new vscode.ThemeColor(GROUP_COLORS[el.target])
      );
      return item;
    }
    const c = el.card;
    const item = new vscode.TreeItem(`[${c.id}] ${c.title}`, vscode.TreeItemCollapsibleState.None);
    item.contextValue = 'todoCard';
    const status = c.status || c.sectionTarget;
    item.tooltip = `Status: ${status}${c.preview ? '\n\n' + c.preview : ''}`;
    item.iconPath = new vscode.ThemeIcon(
      'circle-filled',
      new vscode.ThemeColor(GROUP_COLORS[cardGroup(c)])
    );
    item.command = {
      command: 'swasthalinkTodo.revealCard',
      title: 'Go to Card',
      arguments: [c.id],
    };
    return item;
  }

  getChildren(el?: Node): Node[] {
    if (!el) {
      return TARGETS.map((t) => ({ kind: 'group', target: t }) as Node);
    }
    if (el.kind === 'group') {
      return this.cards
        .filter((c) => cardGroup(c) === el.target)
        .map((c) => ({ kind: 'card', card: c }) as Node);
    }
    return [];
  }
}

interface Loaded {
  uri: vscode.Uri;
  doc: vscode.TextDocument;
  cards: Card[];
}

async function resolveTodoFile(): Promise<vscode.Uri | undefined> {
  const cfg = vscode.workspace.getConfiguration('swasthalinkTodo');
  const configured = (cfg.get<string>('filePath') ?? '').trim();
  if (configured) {
    if (path.isAbsolute(configured)) {
      return vscode.Uri.file(configured);
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      return vscode.Uri.joinPath(folder.uri, configured);
    }
    return undefined;
  }
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const found = await vscode.workspace.findFiles(
    '**/*.{md,MD,Md,mD}',
    '**/{node_modules,.git}/**'
  );
  const candidates = found.filter((uri) => isTodoFileName(path.basename(uri.fsPath)));
  for (const folder of workspaceFolders) {
    const rootCandidate = candidates.find(
      (uri) =>
        uri.toString() ===
        vscode.Uri.joinPath(folder.uri, path.basename(uri.fsPath)).toString()
    );
    if (rootCandidate) {
      return rootCandidate;
    }
  }
  return candidates[0];
}

async function loadCards(): Promise<Loaded | undefined> {
  const uri = await resolveTodoFile();
  if (!uri) {
    vscode.window.showWarningMessage(
      'JDH Backlog: no todo.md or TODOS.md found. Set swasthalinkTodo.filePath or open a folder containing a backlog file.'
    );
    return undefined;
  }
  const doc = await vscode.workspace.openTextDocument(uri);
  return { uri, doc, cards: parseTodo(doc.getText()).cards };
}

async function applyText(doc: vscode.TextDocument, newText: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)),
    newText
  );
  await vscode.workspace.applyEdit(edit);
  await doc.save();
}

function cardAtCursor(doc: vscode.TextDocument, cards: Card[]): Card | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.uri.toString() !== doc.uri.toString()) {
    return undefined;
  }
  const line = editor.selection.active.line;
  return cards.find((c) => line >= c.startLine && line <= c.endLine);
}

async function pickCard(cards: Card[], placeHolder: string): Promise<Card | undefined> {
  const picked = await vscode.window.showQuickPick(
    cards.map((c) => ({
      label: `[${c.id}] ${c.title}`,
      description: cardGroup(c),
      card: c,
    })),
    { placeHolder }
  );
  return picked?.card;
}

async function performMove(doc: vscode.TextDocument, card: Card, target: Target): Promise<void> {
  if (card.sectionTarget === target && (card.status === '' || card.status === target)) {
    vscode.window.showInformationMessage(`[${card.id}] is already in ${target}.`);
    return;
  }
  if (target === 'Parked') {
    const body = doc
      .getText()
      .split('\n')
      .slice(card.startLine, card.endLine + 1)
      .join('\n');
    if (!/-\s*Readiness trigger:\s*\S/i.test(body)) {
      const choice = await vscode.window.showWarningMessage(
        `[${card.id}] has no readiness trigger. Your backlog rule: Parked items must include an explicit readiness trigger.`,
        'Move anyway',
        'Cancel'
      );
      if (choice !== 'Move anyway') {
        return;
      }
    }
  }
  await applyText(doc, moveCardText(doc.getText(), card, target));
  vscode.window.showInformationMessage(`Moved [${card.id}] to ${target}.`);
}

async function performBatchMove(
  doc: vscode.TextDocument,
  cardIds: readonly string[],
  target: Target
): Promise<void> {
  const cards = parseTodo(doc.getText()).cards;
  const readyToMove: string[] = [];
  const missingIds: string[] = [];
  let cancelled = 0;

  for (const id of cardIds) {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) {
      missingIds.push(id);
      continue;
    }
    if (card.sectionTarget === target && (card.status === '' || card.status === target)) {
      continue;
    }
    if (target === 'Parked') {
      const body = doc
        .getText()
        .split('\n')
        .slice(card.startLine, card.endLine + 1)
        .join('\n');
      if (!/-\s*Readiness trigger:\s*\S/i.test(body)) {
        const choice = await vscode.window.showWarningMessage(
          `[${card.id}] has no readiness trigger. Your backlog rule: Parked items must include an explicit readiness trigger.`,
          'Move anyway',
          'Cancel'
        );
        if (choice !== 'Move anyway') {
          cancelled++;
          continue;
        }
      }
    }
    readyToMove.push(id);
  }

  if (readyToMove.length > 0) {
    await applyText(doc, moveCardsText(doc.getText(), readyToMove, target));
    vscode.window.showInformationMessage(
      `Moved ${readyToMove.length} card${readyToMove.length === 1 ? '' : 's'} to ${target}.`
    );
  } else if (cancelled === 0 && missingIds.length === 0) {
    vscode.window.showInformationMessage(`Selected cards are already in ${target}.`);
  }

  if (missingIds.length > 0) {
    vscode.window.showWarningMessage(
      `Could not move ${missingIds.length} card${missingIds.length === 1 ? '' : 's'} because they no longer exist in the backlog.`
    );
  }
}

async function revealCardById(id: string): Promise<void> {
  const loaded = await loadCards();
  if (!loaded) {
    return;
  }
  const card = loaded.cards.find((c) => c.id === id);
  if (!card) {
    return;
  }
  const editor = await vscode.window.showTextDocument(loaded.doc, { preview: false });
  const pos = new vscode.Position(card.startLine, 0);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new BacklogProvider();
  const dragAndDropController: vscode.TreeDragAndDropController<Node> = {
    dragMimeTypes: [TREE_MIME],
    dropMimeTypes: [TREE_MIME],
    handleDrag(source, dataTransfer, token) {
      if (token.isCancellationRequested) {
        return;
      }
      const cardNodes = source
        .filter((node): node is Extract<Node, { kind: 'card' }> => node.kind === 'card')
        .sort((a, b) => a.card.startLine - b.card.startLine);
      if (cardNodes.length > 0) {
        dataTransfer.set(
          TREE_MIME,
          new vscode.DataTransferItem(cardNodes.map((node) => node.card.id))
        );
      }
    },
    async handleDrop(target, dataTransfer, token) {
      if (token.isCancellationRequested || !target) {
        return;
      }
      const transferred = dataTransfer.get(TREE_MIME);
      if (!transferred) {
        return;
      }
      const value: unknown = transferred.value;
      if (!Array.isArray(value) || !value.every((id): id is string => typeof id === 'string')) {
        vscode.window.showErrorMessage('The dragged backlog cards could not be identified.');
        return;
      }
      const cardIds = [...new Set(value)];
      if (cardIds.length === 0) {
        return;
      }
      const targetGroup = target.kind === 'group' ? target.target : cardGroup(target.card);
      const loaded = await loadCards();
      if (!loaded) {
        return;
      }
      await performBatchMove(loaded.doc, cardIds, targetGroup);
      await refresh();
    },
  };
  const treeView = vscode.window.createTreeView(VIEW_ID, {
    treeDataProvider: provider,
    canSelectMany: true,
    dragAndDropController,
  });
  context.subscriptions.push(treeView);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = 'swasthalinkTodo.openCard';
  statusBar.tooltip = 'JDH Backlog — go to a card';
  context.subscriptions.push(statusBar);

  let currentUri: vscode.Uri | undefined;
  let refreshTimer: NodeJS.Timeout | undefined;

  async function refresh(): Promise<void> {
    const loaded = await loadCards();
    if (!loaded) {
      return;
    }
    currentUri = loaded.uri;
    provider.refresh(loaded.cards);
    const cfg = vscode.workspace.getConfiguration('swasthalinkTodo');
    if (cfg.get<boolean>('showStatusBar', true)) {
      const count = (t: Target) => loaded.cards.filter((c) => cardGroup(c) === t).length;
      statusBar.text = `$(checklist) Now ${count('Now')} · Next ${count('Next')} · Inbox ${count('Inbox')}`;
      statusBar.show();
    } else {
      statusBar.hide();
    }
  }

  function scheduleRefresh(): void {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => void refresh(), 250);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (currentUri && e.document.uri.toString() === currentUri.toString()) {
        scheduleRefresh();
      }
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('swasthalinkTodo')) {
        void refresh();
      }
    })
  );

  async function resolveCard(node: unknown, loaded: Loaded): Promise<Card | undefined> {
    if (node && typeof node === 'object' && (node as Node).kind === 'card') {
      const id = (node as { card: Card }).card.id;
      // Re-parse by id: tree line numbers may be stale after edits.
      return loaded.cards.find((c) => c.id === id);
    }
    const atCursor = cardAtCursor(loaded.doc, loaded.cards);
    if (atCursor) {
      return atCursor;
    }
    return pickCard(loaded.cards, 'Pick a card to move');
  }

  const moveCommands: Array<[string, Target]> = [
    ['swasthalinkTodo.moveToInbox', 'Inbox'],
    ['swasthalinkTodo.moveToNow', 'Now'],
    ['swasthalinkTodo.moveToNext', 'Next'],
    ['swasthalinkTodo.moveToLater', 'Later'],
    ['swasthalinkTodo.moveToParked', 'Parked'],
    ['swasthalinkTodo.moveToDone', 'Done'],
  ];
  for (const [cmd, target] of moveCommands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, async (node?: unknown) => {
        const loaded = await loadCards();
        if (!loaded) {
          return;
        }
        const card = await resolveCard(node, loaded);
        if (!card) {
          return;
        }
        await performMove(loaded.doc, card, target);
      })
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('swasthalinkTodo.moveCardTo', async (node?: unknown) => {
      const loaded = await loadCards();
      if (!loaded) {
        return;
      }
      const card = await resolveCard(node, loaded);
      if (!card) {
        return;
      }
      const options = TARGETS.filter((t) => t !== card.sectionTarget);
      const picked = await vscode.window.showQuickPick(options, {
        placeHolder: `Move [${card.id}] to…`,
      });
      if (!picked) {
        return;
      }
      await performMove(loaded.doc, card, picked as Target);
    }),

    vscode.commands.registerCommand('swasthalinkTodo.newCard', async () => {
      const loaded = await loadCards();
      if (!loaded) {
        return;
      }
      const id = await vscode.window.showInputBox({
        prompt: 'Card ID',
        placeHolder: 'e.g. PLT-010',
        validateInput: (v) => {
          const t = v.trim();
          if (!t) {
            return 'ID is required';
          }
          if (loaded.cards.some((c) => c.id.toLowerCase() === t.toLowerCase())) {
            return 'A card with this ID already exists';
          }
          return undefined;
        },
      });
      if (!id) {
        return;
      }
      const title = await vscode.window.showInputBox({ prompt: 'Card title' });
      if (!title) {
        return;
      }
      const cleanId = id.trim();
      await applyText(loaded.doc, insertCardText(loaded.doc.getText(), newCardBlock(cleanId, title.trim()), 'Inbox'));
      vscode.window.showInformationMessage(`Created [${cleanId}] in Inbox.`);
      await revealCardById(cleanId);
    }),

    vscode.commands.registerCommand('swasthalinkTodo.openCard', async () => {
      const loaded = await loadCards();
      if (!loaded) {
        return;
      }
      const card = await pickCard(loaded.cards, 'Go to card…');
      if (card) {
        await revealCardById(card.id);
      }
    }),

    vscode.commands.registerCommand('swasthalinkTodo.revealCard', async (id: string) => {
      await revealCardById(id);
    }),

    vscode.commands.registerCommand('swasthalinkTodo.refresh', async () => {
      await refresh();
    })
  );

  void refresh();
}

export function deactivate(): void {
  // Nothing to clean up.
}
