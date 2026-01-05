# Typekon 開発計画

## 現在の状態
- [x] 基本的なカラードット表示
- [x] 型ごとに異なる色
- [x] 継承チェーン表示（●●●）
- [x] 変数名の後ろに表示
- [x] ホバーで継承情報表示

## 対応言語
- [x] TypeScript / JavaScript / TSX / JSX
- [x] Java
- [x] Python
- [x] C#
- [x] Go
- [x] Rust
- [x] Kotlin
- [x] C / C++

## 次のタスク（優先順位順）

### Phase 1: 複数色対応（継承チェーンを色分け）
- [x] 各●を異なる色で表示（Integer=赤、Number=青、Object=緑 のように）
- 方法: 複数のデコレーションをmarginでずらして重ねて表示

### Phase 2: 型検出の精度向上
- [x] クラス定義の型も検出 (`class Foo { bar: String }`)
- [x] 関数の戻り値型も検出 (`function foo(): String`)
- [x] インターフェース定義内のプロパティ
- [x] 関数パラメータ（複数対応）

### Phase 3: LSP連携
- [x] `vscode.executeDocumentSymbolProvider` でシンボル一覧を取得
- [x] `vscode.executeHoverProvider` で正確な型情報を取得
- [x] `vscode.provideDocumentSemanticTokens` で変数使用箇所を取得
- [ ] 動的に継承チェーンを解析（KNOWN_INHERITANCE不要に）
- [ ] ジェネリクスの型パラメータも表示

### Phase 4: UI改善
- [x] SVGベースのidenticon表示（5x5パターン）
- [x] アイコンを下揃えに配置、フォントサイズに合わせた高さ
- [x] 表示箇所の設定（宣言、パラメータ、使用箇所）
- [ ] 設定画面でカスタムカラー指定
- [ ] ガター表示オプション

### Phase 5: 追加機能
- [ ] 型エラー時のハイライト（赤色表示）
- [ ] ホバー時に継承ツリーをポップアップ表示
- [ ] 型定義へのジャンプリンク

## 開発の進め方

1. このファイルを読み込む
2. 未完了タスク `[ ]` の最初のものに着手
3. 実装 → コンパイル → 動作確認
4. 完了したら `[x]` に更新
5. 次のタスクへ

## テスト方法
```bash
npm run compile
# F5 でデバッグ実行
# test-samples/sample.ts を開いて確認
```

## 注意事項
- `vscode.Uri.parse()` にData URIを渡すとクラッシュする
- デコレーションは `after` で変数名の後ろに表示
- コンパイルエラーが出たら必ず修正してから次へ

---

## 各言語のLSPホバーテキスト形式

各言語のLanguage Serverが返すホバーテキストの形式と、それに対応する正規表現パターン。

### TypeScript / JavaScript

**Language ID**: `typescript`, `javascript`, `typescriptreact`, `javascriptreact`

**ホバー形式**:
```
```typescript
(property) Calculator.value: Number
```
```

```
```typescript
let count: Number
```
```

**抽出パターン**:
1. `\([^)]+\)\s+[\w.]+\s*:\s*([^\s=;,\n]+)` - `(kind) name: Type`
2. `(?:let|const|var)\s+\w+\s*:\s*([^\s=;,\n]+)` - `let/const/var name: Type`
3. `:\s*([A-Z][a-zA-Z0-9_<>[\]|&]*)` - `: Type` フォールバック

---

### Java

**Language ID**: `java`

**ホバー形式**:
```
```java
Boolean isEnabled
```
```

```
```java
HashMap<String, Integer> mapping
```
```

```
```java
String message - Sample.greet(String, Integer)
```
```

**抽出パターン**:
- `^(.+?)\s+\w+(?:\s*-.*)?$/m` - `Type name` または `Type name - context`

**注意**: ジェネリクス内のカンマとスペースを含むため、単純な文字クラスでは対応できない

---

### Python

**Language ID**: `python`

**ホバー形式**:
```
(variable) name: Type
```

**抽出パターン**:
1. `\([^)]+\)\s+\w+\s*:\s*([^\s=,\n|]+)` - `(variable) name: Type`
2. `:\s*([a-zA-Z_][\w[\]]*)` - `: Type` フォールバック

**状態**: ✅ 動作確認済み（Pylance必要、初期化に時間がかかる場合あり）

---

### Go

**Language ID**: `go`

**ホバー形式**:
```
```go
field Name string // size=16 (0x10), offset=0
```
```

```
```go
field history []string // size=24 (0x18), offset=8
```
```

**抽出パターン**:
- `(?:var|field)\s+\w+\s+(.+?)(?:\s*\/\/|$)/m` - `field/var name Type // comment`

**注意**: スライス型 `[]string` やマップ型 `map[string]int` に対応するため、型部分を広くキャプチャ

---

### Rust

**Language ID**: `rust`

**ホバー形式**: 未確認

**抽出パターン**:
1. `(?:let\s+(?:mut\s+)?|field\s+)\w+\s*:\s*([a-zA-Z_][\w:&<>[\]]*)` - `let [mut] name: Type`
2. `:\s*([a-zA-Z_][\w:&<>[\]]*)` - `: Type` フォールバック

**問題**: シンボルが0個（`Got 0 symbols`）
- 原因: rust-analyzerがシンボルを返していない
- 対処:
  1. rust-analyzer拡張機能がインストール・有効化されているか確認
  2. `Cargo.toml` があるか確認
  3. Language Serverの初期化完了を待つ

---

### Kotlin

**Language ID**: `kotlin`

**ホバー形式**: 未確認

**抽出パターン**:
1. `(?:val|var)\s+\w+\s*:\s*([a-zA-Z_][\w.<>[\]?]*)` - `val/var name: Type`
2. `:\s*([a-zA-Z_][\w.<>[\]?]*)` - `: Type` フォールバック

**問題**: ファイルが `plaintext` として認識される
- 原因: Kotlin拡張機能がインストールされていない
- 対処: Kotlin Language拡張機能をインストール

---

### C# (csharp)

**Language ID**: `csharp`

**ホバー形式**: 未確認

**抽出パターン**:
1. `\([^)]+\)\s+([a-zA-Z_][\w.<>[\]?]*)\s+\w+` - `(field) Type name`
2. `^([a-zA-Z_][\w.<>[\]?]*)\s+\w+/m` - `Type name`

**問題**: シンボルが0個（`Got 0 symbols`）
- 原因: OmniSharp / C# Dev Kitがシンボルを返していない
- 対処:
  1. C#拡張機能がインストール・有効化されているか確認
  2. `.csproj` ファイルがあるか確認
  3. Language Serverの初期化完了を待つ

---

### C / C++

**Language ID**: `cpp`, `c`

**ホバー形式**: 未確認

**抽出パターン**:
1. `^([a-zA-Z_][\w:<>*&\s]*?)\s+\w+\s*\(/m` - 関数の戻り値型
2. `^([a-zA-Z_][\w:<>*&]*(?:\s*[*&])?)\s+[*&]?\w+/m` - `Type name` または `Type *name`

**問題**: シンボルが0個（`Got 0 symbols`）
- 原因: C/C++拡張機能（Microsoft C/C++ または clangd）がシンボルを返していない
- 対処:
  1. C/C++拡張機能がインストール・有効化されているか確認
  2. `compile_commands.json` または `.vscode/c_cpp_properties.json` があるか確認
  3. Language Serverの初期化完了を待つ

---

## 型名のクリーンアップ処理

抽出後、以下の処理を行う：

1. `/<.*>/` - ジェネリクスパラメータを除去 (`HashMap<String, Integer>` → `HashMap`)
2. `/\[.*\]/` - 配列ブラケットを除去 (`String[]` → `String`, `[]string` → `string`)
3. `/[*&]+$/` - ポインタ/参照マーカーを除去
4. `::` で分割して最後の部分を取得（名前空間除去）
5. キーワードフィルタ: `let`, `var`, `val`, `const`, `mut`, `field`, `property`, `parameter`, `void`, `async`, `static`, `public`, `private`, `protected`

---

## 既知の問題

### 多くの言語で「0 symbols」になる

Language Serverがシンボルを返さない場合、Typekonは動作しません。

| 言語 | 状態 | 必要条件 |
|------|------|----------|
| TypeScript/JS | ✅ 動作 | - |
| Java | ✅ 動作 | Language Support for Java |
| Go | ✅ 動作 | Go extension |
| Python | ✅ 動作 | Pylance（初期化に時間がかかる場合あり） |
| Rust | ❌ 0 symbols | rust-analyzer + Cargo.toml |
| Kotlin | ❌ plaintext | Kotlin Language extension |
| C# | ❌ 0 symbols | C# Dev Kit + .csproj |
| C++ | ❌ 0 symbols | C/C++ + compile_commands.json |

**共通の対処法**:
1. 対応するLanguage拡張機能をインストール
2. プロジェクトファイルを作成（Cargo.toml, .csproj 等）
3. VSCodeを再起動してLanguage Serverの初期化を待つ

### TypeScript のジェネリクス（修正済み）

- `Map<String, Number>` が `Map<String` として抽出される問題
- 修正: クリーンアップで `/<.*/` を使用（不完全なジェネリクスも除去）

### Go のスライス型（修正済み）

- `field history []string` で `history` が抽出される問題
- 修正: パターンを `(.+?)(?:\s*\/\/|$)` に変更

### Java の HashMap（修正済み）

- `HashMap<String, Integer>` でカンマを含むため抽出できない問題
- 修正: パターンを `^(.+?)\s+\w+(?:\s*-.*)?$/m` に変更

---

## デバッグ方法

1. デバッグコンソールで以下のログを確認：
   - `Typekon: Processing file with languageId: xxx` - 言語ID確認
   - `Typekon: Got N symbols for xxx` - シンボル数確認
   - `Typekon [xxx] hover: ...` - ホバーテキスト確認
   - `Typekon [xxx] extracted type: ...` - 抽出された型名確認

2. ホバーテキストが出力されるが `extracted type` が出ない場合、パターンが合っていない

3. `Processing file` すら出ない場合、言語IDの問題またはアクティベーションの問題
