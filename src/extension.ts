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
  console.log(`Typekon config: showOnUsage=${showOnUsage}, showOnDeclaration=${showOnDeclaration}, showOnParameters=${showOnParameters}`);
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

    console.log(`Typekon: Collected ${typeInfos.length} type infos`);
    for (const info of typeInfos) {
      console.log(`Typekon: - ${info.typeName} at line ${info.range.start.line + 1}`);
    }

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

    console.log(`Typekon: Created ${typeGroups.size} type groups`);
    for (const [key, { ranges, chain }] of typeGroups) {
      console.log(`Typekon: - ${key}: ${ranges.length} occurrences, lines: ${ranges.map(r => r.start.line + 1).join(', ')}`);
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
        range: range,  // 変数名全体をカバーしてホバーを有効に
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

  // デバッグ: シンボル構造を出力
  logSymbolStructure(symbols, 0);

  // パラメータを収集（showOnParametersがtrueの場合）
  // 注: 多くのLSPはパラメータをDocumentSymbolの子として返さないため、
  // メソッドシグネチャを解析してホバーで型を取得する汎用アプローチを使用
  if (showOnParameters) {
    collectParameterSymbols(symbols, targetSymbols);
    await collectMethodParametersViaHover(document, symbols, results);
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

  // Go言語の場合、追加の型収集（goplsはパラメータとローカル変数をDocumentSymbolとして返さない）
  if (document.languageId === 'go') {
    await collectGoAdditionalTypes(document, symbols, results);
  }

  // 変数の使用箇所を収集（showOnUsageがtrueの場合）
  console.log(`Typekon: showOnUsage=${showOnUsage}, about to collect usages`);
  if (showOnUsage) {
    await collectVariableUsages(document, results);
  } else {
    console.log('Typekon: Skipping usage collection (showOnUsage is false)');
  }
}

// Go言語専用: goplsがDocumentSymbolとして返さないパラメータとローカル変数を収集
async function collectGoAdditionalTypes(
  document: vscode.TextDocument,
  _symbols: vscode.DocumentSymbol[], // 将来の拡張用に保持
  results: { range: vscode.Range; typeName: string }[]
): Promise<void> {
  const text = document.getText();
  const existingPositions = new Set(
    results.map(r => `${r.range.start.line}:${r.range.start.character}`)
  );

  // 重複チェック用ヘルパー
  const isDuplicate = (line: number, char: number) => {
    return existingPositions.has(`${line}:${char}`);
  };

  const addResult = (range: vscode.Range, typeName: string) => {
    const key = `${range.start.line}:${range.start.character}`;
    if (!existingPositions.has(key)) {
      existingPositions.add(key);
      results.push({ range, typeName });
    }
  };

  // 1. 関数パラメータを収集
  if (showOnParameters) {
    await collectGoFunctionParameters(document, text, isDuplicate, addResult);
  }

  // 2. := 宣言を収集
  if (showOnDeclaration) {
    await collectGoShortVarDeclarations(document, text, isDuplicate, addResult);
  }

  // 3. var 宣言を収集（関数内）
  if (showOnDeclaration) {
    await collectGoVarDeclarations(document, text, isDuplicate, addResult);
  }
}

// Go: 関数パラメータを収集
async function collectGoFunctionParameters(
  document: vscode.TextDocument,
  text: string,
  isDuplicate: (line: number, char: number) => boolean,
  addResult: (range: vscode.Range, typeName: string) => void
): Promise<void> {
  // 関数シグネチャを検出: func name(params) または func (receiver) name(params)
  // パラメータ部分を解析
  const funcRegex = /func\s+(?:\([^)]*\)\s*)?(\w+)\s*\(([^)]*)\)/g;
  let match;

  const paramPromises: Promise<void>[] = [];

  while ((match = funcRegex.exec(text)) !== null) {
    const paramsStr = match[2];
    if (!paramsStr.trim()) continue;

    // パラメータ文字列の開始位置を計算
    const funcMatchStart = match.index;
    const paramsStartInMatch = match[0].lastIndexOf('(') + 1;
    const paramsStartOffset = funcMatchStart + paramsStartInMatch;

    // Goのパラメータを解析: "a int, b int" or "a, b int" or "a int"
    // 各パラメータの位置を特定
    const params = parseGoParameters(paramsStr);

    for (const param of params) {
      const paramOffset = paramsStartOffset + param.offset;
      const position = document.positionAt(paramOffset);

      if (isDuplicate(position.line, position.character)) continue;

      const range = new vscode.Range(
        position,
        position.translate(0, param.name.length)
      );

      paramPromises.push(
        (async () => {
          const typeName = await getTypeFromHover(document, position);
          if (typeName) {
            addResult(range, typeName);
          }
        })()
      );
    }
  }

  await Promise.all(paramPromises);
}

// Goパラメータ文字列を解析して各パラメータの名前と位置を返す
function parseGoParameters(paramsStr: string): { name: string; offset: number }[] {
  const results: { name: string; offset: number }[] = [];

  // Goのパラメータ形式:
  // "a int" -> a: int
  // "a, b int" -> a: int, b: int (グループ化された型)
  // "a int, b string" -> a: int, b: string

  let currentOffset = 0;
  const parts = paramsStr.split(',');

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      currentOffset += part.length + 1; // +1 for comma
      continue;
    }

    // 先頭の空白をスキップ
    const leadingSpaces = part.length - part.trimStart().length;

    // パラメータ名を抽出（型名は後ろにある、または省略されている）
    // "a int" -> ["a", "int"]
    // "a" -> ["a"] (グループ化された型の一部)
    const tokens = trimmed.split(/\s+/);

    if (tokens.length >= 1) {
      const paramName = tokens[0];
      // 型名でないことを確認（大文字で始まる or 基本型でない）
      if (paramName && !isGoTypeName(paramName)) {
        results.push({
          name: paramName,
          offset: currentOffset + leadingSpaces
        });
      }
    }

    currentOffset += part.length + 1; // +1 for comma
  }

  return results;
}

// Goの型名かどうかを判定
function isGoTypeName(name: string): boolean {
  const goBuiltinTypes = [
    'int', 'int8', 'int16', 'int32', 'int64',
    'uint', 'uint8', 'uint16', 'uint32', 'uint64', 'uintptr',
    'float32', 'float64', 'complex64', 'complex128',
    'bool', 'string', 'byte', 'rune', 'error', 'any'
  ];

  if (goBuiltinTypes.includes(name)) return true;
  // ポインタ型、スライス型、マップ型
  if (name.startsWith('*') || name.startsWith('[]') || name.startsWith('map[')) return true;
  // 大文字で始まる = エクスポートされた型
  if (/^[A-Z]/.test(name)) return true;

  return false;
}

// Go: := 短縮変数宣言を収集
async function collectGoShortVarDeclarations(
  document: vscode.TextDocument,
  text: string,
  isDuplicate: (line: number, char: number) => boolean,
  addResult: (range: vscode.Range, typeName: string) => void
): Promise<void> {
  // := パターンを検出: "name :=" or "a, b :="
  // 行ごとに処理して確実に検出
  const lines = text.split('\n');
  const declPromises: Promise<void>[] = [];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // for range の変数を検出: for key, value := range ... または for _, value := range ...
    const forRangeMatch = line.match(/^\s*for\s+(\w+|_)\s*,\s*(\w+)\s*:=\s*range/);
    if (forRangeMatch) {
      const [, keyVar, valueVar] = forRangeMatch;

      // key変数（_でない場合）
      if (keyVar !== '_') {
        const keyIndex = line.indexOf(keyVar, line.indexOf('for') + 3);
        const position = new vscode.Position(lineNum, keyIndex);
        if (!isDuplicate(lineNum, keyIndex)) {
          const range = new vscode.Range(position, position.translate(0, keyVar.length));
          declPromises.push(
            (async () => {
              const typeName = await getTypeFromHover(document, position);
              if (typeName) {
                console.log(`Typekon Go: for-range key '${keyVar}' line ${lineNum + 1}: ${typeName}`);
                addResult(range, typeName);
              }
            })()
          );
        }
      }

      // value変数
      const valueIndex = line.indexOf(valueVar, line.indexOf(','));
      const valuePosition = new vscode.Position(lineNum, valueIndex);
      if (!isDuplicate(lineNum, valueIndex)) {
        const range = new vscode.Range(valuePosition, valuePosition.translate(0, valueVar.length));
        declPromises.push(
          (async () => {
            const typeName = await getTypeFromHover(document, valuePosition);
            if (typeName) {
              console.log(`Typekon Go: for-range value '${valueVar}' line ${lineNum + 1}: ${typeName}`);
              addResult(range, typeName);
            }
          })()
        );
      }
      continue; // for-rangeはこれで処理済み
    }

    // 通常の := 宣言を検出（行の任意の位置）
    // 例: result := a + b, entry := fmt.Sprintf(...)
    const shortDeclRegex = /\b(\w+(?:\s*,\s*\w+)*)\s*:=/g;
    let match;

    while ((match = shortDeclRegex.exec(line)) !== null) {
      const varsStr = match[1];
      const matchIndex = match.index;

      // カンマで分割して各変数を処理
      const vars = varsStr.split(',');
      let charOffset = matchIndex;

      for (const varPart of vars) {
        const trimmed = varPart.trim();
        if (!trimmed || !isValidGoIdentifier(trimmed)) {
          charOffset += varPart.length + 1;
          continue;
        }

        // 変数の実際の位置を計算
        const leadingSpaces = varPart.length - varPart.trimStart().length;
        const varCharPos = charOffset + leadingSpaces;
        const position = new vscode.Position(lineNum, varCharPos);

        if (!isDuplicate(lineNum, varCharPos)) {
          const range = new vscode.Range(position, position.translate(0, trimmed.length));

          declPromises.push(
            (async () => {
              const typeName = await getTypeFromHover(document, position);
              if (typeName) {
                console.log(`Typekon Go: := decl '${trimmed}' line ${lineNum + 1}: ${typeName}`);
                addResult(range, typeName);
              }
            })()
          );
        }

        charOffset += varPart.length + 1;
      }
    }
  }

  await Promise.all(declPromises);
}

// Go: var 宣言を収集（関数内のローカル変数）
async function collectGoVarDeclarations(
  document: vscode.TextDocument,
  text: string,
  isDuplicate: (line: number, char: number) => boolean,
  addResult: (range: vscode.Range, typeName: string) => void
): Promise<void> {
  // var name Type または var name = value パターン
  const varDeclRegex = /\bvar\s+(\w+)\s+/g;
  let match;

  const declPromises: Promise<void>[] = [];

  while ((match = varDeclRegex.exec(text)) !== null) {
    const varName = match[1];
    const varOffset = match.index + match[0].indexOf(varName);
    const position = document.positionAt(varOffset);

    if (isDuplicate(position.line, position.character)) continue;

    const range = new vscode.Range(
      position,
      position.translate(0, varName.length)
    );

    declPromises.push(
      (async () => {
        const typeName = await getTypeFromHover(document, position);
        if (typeName) {
          addResult(range, typeName);
        }
      })()
    );
  }

  await Promise.all(declPromises);
}

// 有効なGo識別子かどうか
function isValidGoIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

// 汎用: メソッド/関数シグネチャからパラメータを検出（ホバーで型を取得）
async function collectMethodParametersViaHover(
  document: vscode.TextDocument,
  symbols: vscode.DocumentSymbol[],
  results: { range: vscode.Range; typeName: string }[]
): Promise<void> {
  const existingPositions = new Set(
    results.map(r => `${r.range.start.line}:${r.range.start.character}`)
  );

  const methodSymbols: vscode.DocumentSymbol[] = [];
  collectMethodSymbols(symbols, methodSymbols);

  console.log(`Typekon: Found ${methodSymbols.length} method/function symbols for parameter detection`);

  const paramPromises: Promise<void>[] = [];

  for (const method of methodSymbols) {
    // メソッドの開始行（シグネチャ行）を取得
    const lineNum = method.selectionRange.start.line;
    const line = document.lineAt(lineNum);
    const text = line.text;

    // 括弧内のパラメータ部分を見つける
    const parenOpenIdx = text.indexOf('(');
    const parenCloseIdx = text.lastIndexOf(')');
    if (parenOpenIdx === -1 || parenCloseIdx === -1 || parenCloseIdx <= parenOpenIdx) {
      continue;
    }

    const paramsStr = text.substring(parenOpenIdx + 1, parenCloseIdx);
    if (!paramsStr.trim()) continue;

    // 識別子らしきものを見つける（単語境界で区切られた英数字）
    const identifierRegex = /\b([a-zA-Z_]\w*)\b/g;
    let match;

    while ((match = identifierRegex.exec(paramsStr)) !== null) {
      const identName = match[1];
      const charPos = parenOpenIdx + 1 + match.index;
      const position = new vscode.Position(lineNum, charPos);
      const key = `${lineNum}:${charPos}`;

      if (existingPositions.has(key)) continue;

      paramPromises.push(
        (async () => {
          const typeName = await getTypeFromHover(document, position);
          if (typeName && typeName !== identName) {
            // 型名と識別子名が異なる場合のみ追加（型名自体は除外）
            const range = new vscode.Range(position, position.translate(0, identName.length));
            const resultKey = `${range.start.line}:${range.start.character}`;
            if (!existingPositions.has(resultKey)) {
              existingPositions.add(resultKey);
              results.push({ range, typeName });
              console.log(`Typekon: Parameter '${identName}' at line ${lineNum + 1}: ${typeName}`);
            }
          }
        })()
      );
    }
  }

  await Promise.all(paramPromises);
}

// メソッド/関数シンボルを再帰的に収集
function collectMethodSymbols(
  symbols: vscode.DocumentSymbol[],
  results: vscode.DocumentSymbol[]
): void {
  for (const symbol of symbols) {
    if (
      symbol.kind === vscode.SymbolKind.Method ||
      symbol.kind === vscode.SymbolKind.Function ||
      symbol.kind === vscode.SymbolKind.Constructor
    ) {
      results.push(symbol);
    }
    if (symbol.children && symbol.children.length > 0) {
      collectMethodSymbols(symbol.children, results);
    }
  }
}

// デバッグ: シンボル構造をログ出力
function logSymbolStructure(symbols: vscode.DocumentSymbol[], depth: number): void {
  const indent = '  '.repeat(depth);
  for (const symbol of symbols) {
    console.log(`Typekon Symbol: ${indent}${vscode.SymbolKind[symbol.kind]} "${symbol.name}" at line ${symbol.selectionRange.start.line + 1}`);
    if (symbol.children && symbol.children.length > 0) {
      logSymbolStructure(symbol.children, depth + 1);
    }
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

// DocumentHighlightsを使って変数の使用箇所を収集
async function collectVariableUsages(
  document: vscode.TextDocument,
  results: { range: vscode.Range; typeName: string }[]
): Promise<void> {
  try {
    console.log(`Typekon: collectVariableUsages called for ${document.languageId}`);

    // 宣言位置と型名のマップを作成
    const declarations = new Map<string, { range: vscode.Range; typeName: string }>();
    for (const result of results) {
      const key = `${result.range.start.line}:${result.range.start.character}`;
      declarations.set(key, result);
    }

    console.log(`Typekon: Using ${declarations.size} declarations to find usages`);

    // 各宣言位置からDocumentHighlightsを取得
    const usagePromises: Promise<void>[] = [];
    const existingPositions = new Set(
      results.map(r => `${r.range.start.line}:${r.range.start.character}`)
    );

    for (const [, decl] of declarations) {
      usagePromises.push(
        (async () => {
          const highlights = await vscode.commands.executeCommand<vscode.DocumentHighlight[]>(
            'vscode.executeDocumentHighlights',
            document.uri,
            decl.range.start
          );

          console.log(`Typekon: DocumentHighlights for ${decl.typeName} at line ${decl.range.start.line + 1}: ${highlights?.length ?? 0} highlights`);

          if (highlights && highlights.length > 0) {
            for (const highlight of highlights) {
              const key = `${highlight.range.start.line}:${highlight.range.start.character}`;
              // 重複チェック（宣言位置を含む既存のものはスキップ）
              if (!existingPositions.has(key)) {
                existingPositions.add(key);
                results.push({
                  range: highlight.range,
                  typeName: decl.typeName
                });
              }
            }
          }
        })()
      );
    }

    await Promise.all(usagePromises);

    const addedCount = results.length - declarations.size;
    console.log(`Typekon: Added ${addedCount} usage decorations via DocumentHighlights`);
  } catch (error) {
    console.error('Typekon DocumentHighlights error:', error);
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

    // Go のスライス型を処理 ([]string -> string)
    if (typeName.startsWith('[]')) {
      typeName = typeName.substring(2);
    }
    // Go の map 型を処理 (map[string]int -> map)
    if (typeName.startsWith('map[')) {
      typeName = 'map';
    }
    // Go のポインタ型を処理 (*Type -> Type)
    if (typeName.startsWith('*')) {
      typeName = typeName.substring(1);
    }

    // Remove generic parameters (complete or incomplete)
    typeName = typeName.replace(/<.*/, '');
    // Remove array brackets at the end (Java/C# style: String[] -> String)
    typeName = typeName.replace(/\[.*$/, '');
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
