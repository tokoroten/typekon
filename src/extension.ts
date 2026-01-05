import * as vscode from 'vscode';
import { getCombinedIconUri } from './identicon';

/**
 * Typekon Extension
 * 型をカラードットで可視化するVSCode拡張機能
 * LSP連携で正確な型情報を取得
 */

let isEnabled = true;
let showInheritance = true;
let showOnDeclaration = true;
let showOnParameters = true;
let showOnUsage = false;
let activeDecorations: vscode.TextEditorDecorationType[] = [];
let updateTimeout: NodeJS.Timeout | undefined;

// 基本的な継承関係（LSPで取得できない場合のフォールバック）
const KNOWN_INHERITANCE: Record<string, string[]> = {
  // Java
  'Integer': ['Number', 'Object'],
  'Long': ['Number', 'Object'],
  'Double': ['Number', 'Object'],
  'Float': ['Number', 'Object'],
  'String': ['Object'],
  'Boolean': ['Object'],
  'Number': ['Object'],
  'ArrayList': ['AbstractList', 'Object'],
  'HashMap': ['AbstractMap', 'Object'],
  // TypeScript/JavaScript
  'Array': ['Object'],
  'Map': ['Object'],
  'Set': ['Object'],
  'Date': ['Object'],
  'Promise': ['Object'],
  // C#
  'List': ['IList', 'Object'],
  'Dictionary': ['IDictionary', 'Object'],
  'StringBuilder': ['Object'],
  // Python (common types)
  'DataFrame': ['Object'],
  'Series': ['Object'],
  // Rust (no inheritance, but common types)
  'Vec': [],
  'Option': [],
  'Result': [],
};

export function activate(context: vscode.ExtensionContext) {
  console.log('Typekon is now active!');

  loadConfig();

  const toggleCommand = vscode.commands.registerCommand('typekon.toggle', () => {
    isEnabled = !isEnabled;
    vscode.workspace.getConfiguration('typekon').update('enabled', isEnabled, true);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      if (isEnabled) {
        triggerUpdateDecorations(editor);
      } else {
        clearDecorations(editor);
      }
    }

    vscode.window.showInformationMessage(`Typekon: ${isEnabled ? 'Enabled' : 'Disabled'}`);
  });

  const onDidChangeActiveEditor = vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor && isEnabled) {
      triggerUpdateDecorations(editor);
    }
  });

  const onDidChangeDocument = vscode.workspace.onDidChangeTextDocument(event => {
    const editor = vscode.window.activeTextEditor;
    if (editor && event.document === editor.document && isEnabled) {
      triggerUpdateDecorations(editor);
    }
  });

  const onDidChangeConfig = vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('typekon')) {
      loadConfig();
      const editor = vscode.window.activeTextEditor;
      if (editor && isEnabled) {
        triggerUpdateDecorations(editor);
      }
    }
  });

  if (vscode.window.activeTextEditor && isEnabled) {
    triggerUpdateDecorations(vscode.window.activeTextEditor);
  }

  context.subscriptions.push(toggleCommand, onDidChangeActiveEditor, onDidChangeDocument, onDidChangeConfig);
}

function loadConfig(): void {
  const config = vscode.workspace.getConfiguration('typekon');
  isEnabled = config.get<boolean>('enabled', true);
  showInheritance = config.get<boolean>('showInheritance', true);
  showOnDeclaration = config.get<boolean>('showOnDeclaration', true);
  showOnParameters = config.get<boolean>('showOnParameters', true);
  showOnUsage = config.get<boolean>('showOnUsage', false);
}

function triggerUpdateDecorations(editor: vscode.TextEditor): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => updateDecorationsWithLSP(editor), 300);
}

// LSP経由でシンボル情報を取得し、型を表示
async function updateDecorationsWithLSP(editor: vscode.TextEditor): Promise<void> {
  const languageId = editor.document.languageId;
  console.log(`Typekon: Processing file with languageId: ${languageId}`);

  const supportedLanguages = [
    'java', 'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
    'python', 'csharp', 'go', 'rust', 'kotlin', 'cpp', 'c'
  ];
  if (!supportedLanguages.includes(languageId)) {
    console.log(`Typekon: Language ${languageId} not supported`);
    return;
  }

  try {
    // ドキュメント内のシンボルを取得
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider',
      editor.document.uri
    );

    console.log(`Typekon: Got ${symbols?.length ?? 0} symbols for ${languageId}`);

    if (!symbols || symbols.length === 0) {
      clearDecorations(editor);
      return;
    }

    // シンボルから変数・プロパティを抽出
    const typeInfos: { range: vscode.Range; typeName: string }[] = [];
    await collectSymbolTypes(editor.document, symbols, typeInfos);

    // 型ごとにグループ化
    const typeGroups = new Map<string, { ranges: vscode.Range[]; chain: string[] }>();

    for (const { range, typeName } of typeInfos) {
      const chain = getInheritanceChain(typeName);
      const key = showInheritance ? chain.join(':') : typeName;

      if (!typeGroups.has(key)) {
        typeGroups.set(key, { ranges: [], chain });
      }
      typeGroups.get(key)!.ranges.push(range);
    }

    // 新しいデコレーションを先に準備
    const newDecorations: {
      decorationType: vscode.TextEditorDecorationType;
      decorations: { range: vscode.Range; hoverMessage: string }[];
    }[] = [];

    const iconSize = 14;

    for (const [key, { ranges, chain }] of typeGroups) {
      const typesToShow = showInheritance ? chain : [chain[0]];
      const combinedIconUri = getCombinedIconUri(typesToShow, iconSize);
      const totalWidth = typesToShow.length * iconSize;

      const decorationType = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: '\u200B',
          width: `${totalWidth}px`,
          height: `1em`,
          margin: '0 0 0 4px',
          textDecoration: `none; background-image: url("${combinedIconUri}"); background-size: contain; background-repeat: no-repeat; background-position: center; vertical-align: middle;`,
        },
      });

      const hoverMessage = `Type: ${chain[0]}${chain.length > 1 ? `\nInherits: ${chain.slice(1).join(' → ')}` : ''}`;

      const decorations = ranges.map(range => ({
        range: new vscode.Range(range.end, range.end),
        hoverMessage,
      }));

      newDecorations.push({ decorationType, decorations });
    }

    // 古いデコレーションを削除してから新しいものを適用（ちらつき軽減）
    clearDecorations(editor);

    for (const { decorationType, decorations } of newDecorations) {
      editor.setDecorations(decorationType, decorations);
      activeDecorations.push(decorationType);
    }
  } catch (error) {
    console.error('Typekon error:', error);
  }
}

// シンボルを再帰的に探索して型情報を収集（並列化）
async function collectSymbolTypes(
  document: vscode.TextDocument,
  symbols: vscode.DocumentSymbol[],
  results: { range: vscode.Range; typeName: string }[]
): Promise<void> {
  const targetKinds: vscode.SymbolKind[] = [];

  if (showOnDeclaration) {
    targetKinds.push(
      vscode.SymbolKind.Variable,
      vscode.SymbolKind.Property,
      vscode.SymbolKind.Field,
      vscode.SymbolKind.Constant
    );
  }

  // 対象シンボルを収集
  const targetSymbols: vscode.DocumentSymbol[] = [];
  collectTargetSymbols(symbols, targetKinds, targetSymbols);

  // パラメータを収集（showOnParametersがtrueの場合）
  if (showOnParameters) {
    collectParameterSymbols(symbols, targetSymbols);
  }

  // 並列でホバー情報を取得
  const promises = targetSymbols.map(async (symbol) => {
    const typeName = await getTypeFromHover(document, symbol.selectionRange.start);
    if (typeName) {
      return { range: symbol.selectionRange, typeName };
    }
    return null;
  });

  const typeResults = await Promise.all(promises);
  for (const result of typeResults) {
    if (result) {
      results.push(result);
    }
  }

  // 変数の使用箇所を収集（showOnUsageがtrueの場合）
  if (showOnUsage) {
    await collectVariableUsages(document, results);
  }
}

// 対象シンボルを再帰的に収集
function collectTargetSymbols(
  symbols: vscode.DocumentSymbol[],
  targetKinds: vscode.SymbolKind[],
  results: vscode.DocumentSymbol[]
): void {
  for (const symbol of symbols) {
    if (targetKinds.includes(symbol.kind)) {
      results.push(symbol);
    }
    if (symbol.children && symbol.children.length > 0) {
      collectTargetSymbols(symbol.children, targetKinds, results);
    }
  }
}

// 関数・メソッドからパラメータシンボルを収集
function collectParameterSymbols(
  symbols: vscode.DocumentSymbol[],
  results: vscode.DocumentSymbol[]
): void {
  for (const symbol of symbols) {
    // 関数・メソッドの場合、子シンボルからパラメータを探す
    if (
      symbol.kind === vscode.SymbolKind.Function ||
      symbol.kind === vscode.SymbolKind.Method ||
      symbol.kind === vscode.SymbolKind.Constructor
    ) {
      for (const child of symbol.children || []) {
        // TypeParameterは型パラメータなので除外
        if (child.kind === vscode.SymbolKind.Variable || child.kind === vscode.SymbolKind.Field) {
          // 重複チェック: 既に追加済みのシンボルはスキップ
          const isDuplicate = results.some(r =>
            r.selectionRange.start.line === child.selectionRange.start.line &&
            r.selectionRange.start.character === child.selectionRange.start.character
          );
          if (!isDuplicate) {
            results.push(child);
          }
        }
      }
    }
    if (symbol.children && symbol.children.length > 0) {
      collectParameterSymbols(symbol.children, results);
    }
  }
}

// Semantic Tokensを使って変数の使用箇所を収集
async function collectVariableUsages(
  document: vscode.TextDocument,
  results: { range: vscode.Range; typeName: string }[]
): Promise<void> {
  try {
    // Semantic Tokens APIを使って変数の使用箇所を取得
    const semanticTokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
      'vscode.provideDocumentSemanticTokens',
      document.uri
    );

    if (!semanticTokens) {
      return;
    }

    // トークンの凡例を取得
    const legend = await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      'vscode.provideDocumentSemanticTokensLegend',
      document.uri
    );

    if (!legend) {
      return;
    }

    // 変数・パラメータのトークンタイプを特定
    const variableTokenTypes = new Set<number>();
    legend.tokenTypes.forEach((type, index) => {
      if (type === 'variable' || type === 'parameter' || type === 'property') {
        variableTokenTypes.add(index);
      }
    });

    // トークンデータをデコード
    const data = semanticTokens.data;
    let line = 0;
    let char = 0;

    // 並列処理用のプロミス配列
    const usagePromises: Promise<{ range: vscode.Range; typeName: string } | null>[] = [];

    for (let i = 0; i < data.length; i += 5) {
      const deltaLine = data[i];
      const deltaChar = data[i + 1];
      const length = data[i + 2];
      const tokenType = data[i + 3];
      // const tokenModifiers = data[i + 4]; // 未使用

      if (deltaLine > 0) {
        line += deltaLine;
        char = deltaChar;
      } else {
        char += deltaChar;
      }

      // 変数・パラメータのトークンのみ処理
      if (variableTokenTypes.has(tokenType)) {
        const position = new vscode.Position(line, char);
        const range = new vscode.Range(position, new vscode.Position(line, char + length));

        // 重複チェック（既に宣言で収集済みの場合はスキップ）
        const isDuplicate = results.some(r =>
          r.range.start.line === range.start.line &&
          r.range.start.character === range.start.character
        );

        if (!isDuplicate) {
          usagePromises.push(
            (async () => {
              const typeName = await getTypeFromHover(document, position);
              if (typeName) {
                return { range, typeName };
              }
              return null;
            })()
          );
        }
      }
    }

    // 並列で型情報を取得（バッチ処理でパフォーマンス向上）
    const batchSize = 20;
    for (let i = 0; i < usagePromises.length; i += batchSize) {
      const batch = usagePromises.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch);
      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }
    }
  } catch (error) {
    console.error('Typekon semantic tokens error:', error);
  }
}

// ホバーテキストから型名を抽出（言語別対応）
function extractTypeFromHoverText(text: string, languageId: string): string | null {
  // コードブロックの中身を抽出
  const codeBlockMatch = text.match(/```\w*\n?([\s\S]*?)```/);
  const codeText = codeBlockMatch ? codeBlockMatch[1].trim() : text;

  let match: RegExpMatchArray | null = null;

  switch (languageId) {
    case 'typescript':
    case 'javascript':
    case 'typescriptreact':
    case 'javascriptreact':
      // Format: "(kind) name: Type" or "let/const name: Type" or "name: Type"
      match = codeText.match(/\([^)]+\)\s+[\w.]+\s*:\s*([^\s=;,\n]+)/);
      if (!match) {
        // Handle "let name: Type" or "const name: Type" format
        match = codeText.match(/(?:let|const|var)\s+\w+\s*:\s*([^\s=;,\n]+)/);
      }
      if (!match) {
        // Generic ": Type" fallback
        match = codeText.match(/:\s*([A-Z][a-zA-Z0-9_<>[\]|&]*)/);
      }
      break;

    case 'java':
      // Format: "Type name" or "Type name - context"
      // Handle generics with commas like HashMap<String, Integer>
      match = codeText.match(/^(.+?)\s+\w+(?:\s*-.*)?$/m);
      break;

    case 'python':
      // Format: "(variable) name: Type" or "name: Type"
      match = codeText.match(/\([^)]+\)\s+\w+\s*:\s*([^\s=,\n|]+)/);
      if (!match) {
        match = codeText.match(/:\s*([a-zA-Z_][\w[\]]*)/);
      }
      break;

    case 'csharp':
      // Format: "(field) Type name" or "Type name"
      match = codeText.match(/\([^)]+\)\s+([a-zA-Z_][\w.<>[\]?]*)\s+\w+/);
      if (!match) {
        match = codeText.match(/^([a-zA-Z_][\w.<>[\]?]*)\s+\w+/m);
      }
      break;

    case 'go':
      // Format: "field Name Type // comment" or "var name Type"
      // Handle slice/map types like []string, map[string]int
      match = codeText.match(/(?:var|field)\s+\w+\s+(.+?)(?:\s*\/\/|$)/m);
      break;

    case 'rust':
      // Format: "let name: Type" or "let mut name: Type" or "field name: Type"
      match = codeText.match(/(?:let\s+(?:mut\s+)?|field\s+)\w+\s*:\s*([a-zA-Z_][\w:&<>[\]]*)/);
      if (!match) {
        match = codeText.match(/:\s*([a-zA-Z_][\w:&<>[\]]*)/);
      }
      break;

    case 'kotlin':
      // Format: "val name: Type" or "var name: Type"
      match = codeText.match(/(?:val|var)\s+\w+\s*:\s*([a-zA-Z_][\w.<>[\]?]*)/);
      if (!match) {
        match = codeText.match(/:\s*([a-zA-Z_][\w.<>[\]?]*)/);
      }
      break;

    case 'cpp':
    case 'c':
      // Format: "Type name" or "Type *name" or complicated template types
      // Skip function signatures
      if (codeText.includes('(') && codeText.includes(')')) {
        // Could be a function, try to extract return type
        match = codeText.match(/^([a-zA-Z_][\w:<>*&\s]*?)\s+\w+\s*\(/m);
      }
      if (!match) {
        match = codeText.match(/^([a-zA-Z_][\w:<>*&]*(?:\s*[*&])?)\s+[*&]?\w+/m);
      }
      break;

    default:
      // Generic fallback: look for ": Type" or "Type name" patterns
      match = codeText.match(/:\s*([a-zA-Z_][\w.<>[\]*?]*)/);
      if (!match) {
        match = codeText.match(/^([a-zA-Z_][\w.<>[\]]*)\s+\w+/m);
      }
  }

  if (match && match[1]) {
    // ジェネリクスを除去して基本型を返す
    let typeName = match[1].trim();
    // Remove generic parameters (complete or incomplete)
    typeName = typeName.replace(/<.*/, '');
    // Remove array brackets (complete or incomplete)
    typeName = typeName.replace(/\[.*/, '');
    // Remove pointer/reference markers
    typeName = typeName.replace(/[*&]+$/, '').trim();
    // Remove namespace prefixes for cleaner display (optional, keep last part)
    const parts = typeName.split('::');
    typeName = parts[parts.length - 1];
    // Skip keywords
    const keywords = ['let', 'var', 'val', 'const', 'mut', 'field', 'property', 'parameter', 'void', 'async', 'static', 'public', 'private', 'protected'];
    if (keywords.includes(typeName.toLowerCase())) {
      return null;
    }
    return typeName || null;
  }

  return null;
}

// ホバー情報から型名を抽出
async function getTypeFromHover(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<string | null> {
  try {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
      'vscode.executeHoverProvider',
      document.uri,
      position
    );

    if (hovers && hovers.length > 0) {
      for (const hover of hovers) {
        for (const content of hover.contents) {
          let text = '';
          if (typeof content === 'string') {
            text = content;
          } else if ('value' in content) {
            text = content.value;
          }

          // デバッグ: ホバーテキストを出力
          console.log(`Typekon [${document.languageId}] hover:`, text.substring(0, 300));

          // 型情報を抽出（言語ごとのLSPフォーマットに対応）
          const typeName = extractTypeFromHoverText(text, document.languageId);
          if (typeName) {
            console.log(`Typekon [${document.languageId}] extracted type:`, typeName);
            return typeName;
          }
        }
      }
    }
  } catch (error) {
    console.error('Typekon hover error:', error);
  }
  return null;
}

function getInheritanceChain(typeName: string): string[] {
  const parents = KNOWN_INHERITANCE[typeName];
  return parents ? [typeName, ...parents] : [typeName];
}

function clearDecorations(editor: vscode.TextEditor): void {
  for (const decoration of activeDecorations) {
    editor.setDecorations(decoration, []);
    decoration.dispose();
  }
  activeDecorations = [];
}

export function deactivate() {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
}
