# Typekon

> **[日本語版 README はこちら](README_JP.md)**

A VSCode extension that visualizes types with identicons.

Type + Identicon = **Typekon**

## Screenshot
![Screenshot](images/screenshot.png)

## Features

- Generate unique icons (identicons) from type names
- Display icons after variable names
- Visualize inheritance chains (parent class icons)
- Accurate type information via LSP integration
- Function parameter type display (generic hover-based detection)
- Variable usage site type icons (using DocumentHighlights)

## Supported Languages

| Language | Status | Requirements |
|----------|--------|--------------|
| TypeScript / JavaScript | ✅ | - |
| Java | ✅ | Language Support for Java |
| Go | ✅ | Go extension |
| Python | ✅ | Pylance |
| Rust | ⚠️ | rust-analyzer + Cargo.toml |
| Kotlin | ⚠️ | Kotlin Language extension |
| C# | ⚠️ | C# Dev Kit + .csproj |
| C / C++ | ⚠️ | C/C++ extension + project config |

⚠️ Languages require appropriate extensions and project configuration.

## Installation

### Run development version locally

```bash
# Install dependencies
npm install

# Compile
npm run compile

# Open in VSCode and press F5 to debug
```

### Create VSIX package

```bash
npm install -g @vscode/vsce
vsce package
```

## Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `typekon.enabled` | Enable/disable the extension | `true` |
| `typekon.showInheritance` | Show inheritance icons | `true` |
| `typekon.iconSize` | Icon size (px) | `14` |
| `typekon.showOnDeclaration` | Show icons on variable declarations | `true` |
| `typekon.showOnParameters` | Show icons on function parameters | `true` |
| `typekon.showOnUsage` | Show icons on variable usage sites (performance note) | `false` |

## Commands

- `Typekon: Toggle Type Icons` - Toggle icon display on/off

## How It Works

### Icon Generation
1. Hash the type name (djb2 algorithm)
2. Generate a 5x5 symmetric pattern from the hash
3. Determine HSL color from the hash
4. Render as SVG
5. Display as VSCode TextEditorDecoration

### Type Information Retrieval
1. Get symbol list via `vscode.executeDocumentSymbolProvider`
2. Get accurate type info via `vscode.executeHoverProvider`
3. Detect parameters generically from method signatures (hover-based)
4. Track variable usage sites via `vscode.executeDocumentHighlights`

## Future Improvements

- [x] LSP integration for accurate type information
- [ ] Display generic type parameters
- [ ] Highlight type errors
- [ ] Custom inheritance chain settings
- [ ] Popup inheritance tree on hover
- [ ] Jump to type definition link

## Concept Art
![Concept](./images/concept.png)

## License

MIT
