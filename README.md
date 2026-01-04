# Typekon

型をidenticonで可視化するVSCode拡張機能です。

Type + Identicon = **Typekon**

## スクリーンショット
![スクリーンショット](images/screenshot.png)

## 機能

- 変数の型名からユニークなアイコン（identicon）を生成
- 型名の前にアイコンを表示
- 継承関係も視覚化（親クラスのアイコンも表示）
- Java, TypeScript, JavaScript対応

## インストール

### 開発版をローカルで実行

```bash
# 依存関係をインストール
npm install

# コンパイル
npm run compile

# VSCodeで開いてF5でデバッグ実行
```

### VSIXパッケージを作成

```bash
npm install -g @vscode/vsce
vsce package
```

## 設定

| 設定 | 説明 | デフォルト |
|------|------|------------|
| `typekon.enabled` | 機能のON/OFF | `true` |
| `typekon.showInheritance` | 継承アイコンを表示 | `true` |
| `typekon.iconSize` | アイコンサイズ (px) | `14` |

## コマンド

- `Typekon: Toggle Type Icons` - 表示のON/OFFを切り替え

## 仕組み

1. 型名をハッシュ化（djb2アルゴリズム）
2. ハッシュ値から5x5の対称パターンを生成
3. ハッシュ値からHSLカラーを決定
4. SVGとしてレンダリング
5. VSCodeのTextEditorDecorationとして表示

## 今後の改善案

- [ ] LSP連携でより正確な型情報を取得
- [ ] ジェネリクスの型パラメータも表示
- [ ] 型エラー時のハイライト
- [ ] カスタム継承関係の設定
- [ ] パフォーマンス最適化

## コンセプトアート
![概念図](./images/concept.png)

## ライセンス

MIT
