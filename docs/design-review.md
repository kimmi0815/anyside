# anyside デザインレビュー

> ブランチ: `codex/design-system-refresh`（base: `codex/feature-version-upgrade`）

---

## 概要

現状の anyside は「丁寧に作られたChrome拡張」のレベルには達しているが、プロダクトとして見たときにいくつか明確な課題がある。大きく分けると **「2つのCSSが独立に進化したことによる不整合」** と **「UIの言葉・アイコン・状態設計の雑さ」** に集約される。

---

## デザイン方針（確定事項）

- **ブランドの自己主張は控えめに保つ** — anyside はサイドパネルにAIサービスを表示するだけのツールなので、ブランドアピールは最小限
- **現在選択中のAIサービスの強調は不要** — iframeの中身で一目でわかるため、ヘッダーで別途強調しない
- ただし「控えめ」は「不整合」を許容する理由にはならない。**統一された控えめさ**を目指す

---

## 特定された問題点

### 1. 共有トークンが存在しない（根本原因）

`src/sidepanel/sidepanel.css` と `src/options/options.css` はそれぞれの `:root` で同じ変数名を**別の値**で定義している。これが「2つのプロダクトに見える」すべての不整合の根本原因。

| トークン | Sidepanel | Options |
|---|---|---|
| `--accent` | `#007aff`（iOSブルー） | `#6366f1`（インディゴ/紫） |
| `--bg` | `#f5f5f7` | `#f6f7fb` |
| `--surface` | `rgba(255,255,255,0.72)` | `rgba(255,255,255,0.72)` ← 同じ |
| `--surface-solid` | `rgba(255,255,255,0.92)` | `rgba(255,255,255,0.94)` ← 微妙にずれ |
| `--surface-glass` | `rgba(255,255,255,0.86)` | `rgba(255,255,255,0.6)` ← 大きくずれ |
| `--shadow` | `0 24px 64px rgba(0,0,0,0.18)` | `0 12px 36px rgba(31,41,55,0.08)` |
| border-radius | 12 / 16 / 20px系 | 8px系（サイドバー） |
| type scale | 11–17px / `font-weight: 650` 中心 | 14–36px / `font-weight: 700–750` 中心（LP寄り） |

**修正方針:** `src/shared/tokens.css` を作成し、両ファイルから import する。

---

### 2. アクセントカラーの分裂

- **拡張アイコン**（ユーザーの第一接点） → 紫（shadow: `rgba(99, 102, 241, 0.32)`）
- **Options ページ** → 紫（`#6366f1`）
- **Sidepanel**（実際に1日中見る画面） → 青（`#007aff`）

アイコンと日常的に目にするメイン画面の色が違うのは、意図せずブランドが分裂しているシグナルに見える。また `#6366f1` はTailwindのindigo寄りで主張が強く、`#007aff` はApple/Chromeの中立カラーに近い。

**修正方針:** 青（`#007aff`系）に一本化する。Optionsとアイコンshadowを合わせる。

---

### 3. "Options" vs "Settings" 用語の不統一

同一の設定画面を指す言葉が3箇所で異なっている:

| 場所 | 表記 |
|---|---|
| `manifest.json` / README / HTML `<title>` / サイドバー brand-tag | **Options** |
| Options ページ `<h1>` [options/index.html:44] | **Settings** |
| サイドパネルの歯車ボタン `aria-label` / `title` [sidepanel/index.html:131] | **"Open settings"** |

Chrome Web Storeや `chrome://extensions` との整合性も考えると、どちらかに統一が必要。

**修正方針:** ユーザーに見える場所（H1・ボタンラベル）は **Settings** に寄せ、Chrome API との契約上の命名（`options_ui`）は Options のまま維持する。

---

### 4. アイコン体系が即興的

フッターの5要素がそれぞれ出自の異なる記号を使っている:

| ボタン | 現在 | 問題 |
|---|---|---|
| Launcher | `✦` (Unicode装飾記号) | 意味が不明確 |
| Context | `＋` (全角プラス) | 半角SVGと混在 |
| Prompt | `⌘` (コマンド記号) | ショートカット記号であって機能の記号ではない |
| Shelf | `▤` (Unicode) | 「棚」を表すとは読み取りにくい |
| Settings | SVG歯車 | 唯一SVGで他と異質 |

**修正方針:** lucide-icons か phosphor など1つのアイコンセットに統一する（SVGスプライト or インライン）。

---

### 5. マイクロコピーの不統一

- **Caseが揃っていない:** "Hide from header" / "Add to Shelf" / "Try" / "Insert" / "Try again" / "Open in side window"
- **日英混在のプレースホルダー:** "Promptを検索...", "選択テキストなし", "Add to Shelf"
- **Fallback panel が説明過多:** "Sign-in, cookies, or embed restrictions can block the frame. Try again, or open it in a side window when the frame stays blank." → 読まれない長さ

---

### 6. Options ページの構造的な問題

**Hero セクションが不要**

設定ページにマーケティングLPのような見出し (`clamp(28px, 3.5vw, 36px)`) と説明文は要らない。

**説明文過多**

ほぼ全セクションが `<h2> + <p>` の構造で、見ればわかることを都度説明している:

```html
<!-- 現状 -->
<h2>Services</h2>
<p>Choose which services appear in the side panel header. Add trusted custom AI workspaces below.</p>
```

サービスリスト自体が説明している。説明が必要なのは本当にエッジケース（custom URLのHTTPS要件など）だけで、それも inline hint で十分。

**原因:** type scale を LP 寄り（`font-weight: 750`, 36px h1）にしたことで「説明文も添えなければ」という流れになっている。sidepanel の type scale（11–13px, w650）に揃えるだけで自然に削ぎ落とせる。

---

### 7. 未使用・衝突するUI要素

**Launcher ボタンが常時 `display: none`**

```css
/* sidepanel.css:614 */
.composer-launcher-button {
  display: none;
}
```

DOMには存在するが常に非表示。半実装のまま残っている状態はプロダクト感を下げる。使うなら実装する、使わないなら削除する。

**Header 歯車 vs Footer 設定ボタンの衝突**

フッターに設定への導線（歯車ボタン）があるのに、ヘッダー折り畳み時にも何らかの設定アクセスが必要になる。現状は動線が整理されていない。

---

### 8. サービス選択状態の表示が弱い（軽微）

`aria-selected="true"` の視覚差分が薄い線ボーダーのみ:

```css
/* sidepanel.css:194-198 */
.service-button[aria-selected="true"] {
  border-color: var(--line);
  background: var(--surface-solid);
}
```

iframeの中身で識別できるので強調は不要という方針だが、**タブとしての最低限の視認性**として背景を `accent-soft` にする程度の調整はあってもよい。

---

### 9. サービス切り替えのトランジションが無い

iframe の表示切り替えは `hidden` 属性の付け外しのみで、アニメーションがない。Apple的なガラスUI が成立するのはモーションがあってこそ。popover の `composer-popover-in` アニメーションは実装されているが、メインコンテンツのトランジションが抜けている。

---

## 修正優先順位

| 優先度 | 作業 | 対象ファイル |
|---|---|---|
| 1 | 共有トークン抽出 | `src/shared/tokens.css`（新規）、両CSS |
| 2 | アクセントカラー統一（紫→青） | `options.css`、アイコンshadow |
| 3 | Settings/Options 用語統一 | `options/index.html`、`sidepanel/index.html`、`options.css` |
| 4 | Options hero・説明文削減 | `options/index.html`、`options.css` |
| 5 | 未使用UIの整理（launcher、設定動線） | `sidepanel/index.html`、`sidepanel.css`、`main.ts` |
| 6 | アイコン体系の統一 | `sidepanel/index.html`、`options/index.html`、CSS |
| 7 | マイクロコピー統一 | `sidepanel/index.html`、`options/index.html`、i18n files |
| 8 | サービス切り替えトランジション追加 | `sidepanel.css`、`main.ts` |
| 9 | type scale・余白をOptions/Sidepanelで揃える | `options.css` |

---

## やらないこと

- 強いブランドアピール（ロゴの大型化、独自カラーの強調）
- 現在選択中のAIサービスの大きな強調表示
- 設定画面以外の構造的な変更

---

## 参照ファイル

- `src/sidepanel/sidepanel.css` — サイドパネルのトークン・スタイル定義
- `src/options/options.css` — Optionsページのトークン・スタイル定義
- `src/sidepanel/index.html` — サイドパネルのDOM構造
- `src/options/index.html` — Optionsページの DOM構造
- `src/shared/` — 共有ロジック（今後トークンCSSも置く場所）
