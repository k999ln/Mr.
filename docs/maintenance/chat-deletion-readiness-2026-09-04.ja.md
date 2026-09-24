# ドラえもん関連チャット削除前監査

**監査日:** 2026-09-04  
**対象:** 現在の`01a05538-2c2d-7671-a67a-9ba42ee47699`と`01a0593e-9cd0-76d1-a5a8-7ca657c49da3`の2タスク
**現時点の判定:** **削除可（指定2タスクに限る）**

この文書は、指定された2タスクを削除してもプロジェクトを再開できるかを確認する台帳です。「すべてのドラえもん関連タスク」ではなく、この2タスクだけを対象とします。

## 保存済みの主要情報

| 内容 | 保存先 | 状態 |
|---|---|---|
| プロジェクトの短い入口 | [PROJECT_MEMORY_INDEX.ja.md](../PROJECT_MEMORY_INDEX.ja.md) | GitHub保存済み |
| 事業・設計・実装・未完了事項 | [DORA_OS_総合引き継ぎ_2026-09-01.md](../DORA_OS_総合引き継ぎ_2026-09-01.md) | GitHub保存済み |
| 作成物と所在 | [DORA_OS_全成果インベントリ_2026-09-02.md](../DORA_OS_全成果インベントリ_2026-09-02.md) | GitHub保存済み |
| Telegram販売OS | [telegram-seller-os-design-summary.ja.md](../telegram-seller-os-design-summary.ja.md) | GitHub保存済み |
| 本体仕様 | [project.md](../../project.md) | GitHub保存済み |
| 所有者・公開URL | [owner-public.json](../../config/owner-public.json) | GitHub保存済み |
| 整理・削除ルール | [memory-and-repository-hygiene.ja.md](memory-and-repository-hygiene.ja.md) | GitHub保存済み |

## 関連タスクの対応状況

| タスク | 主題 | GitHubへの反映 |
|---|---|---|
| `01a05538-2c2d-7671-a67a-9ba42ee47699` | 現在のドラえもんbot、サイト、統合、メモリ監査 | 全成果インベントリ追補、索引、README、本監査へ反映 |
| `01a0593e-9cd0-76d1-a5a8-7ca657c49da3` | 販売BOT、10機能、サイト、決済、Telegram、マーケ | 総合引き継ぎ・全成果インベントリに要約済み |

別タスクの軍、Notion、LinkedIn、Private Pixel等は今回の判定対象外です。ただし、指定2タスク内で引用・採用された結論は総合引き継ぎと全成果インベントリに残します。

## ローカル原文バックアップ

対象2タスクのJSONL原文をローカル専用tarへ保存しました。

- 保存先: `.local-backups/chat-archives/doraemon-two-threads-2026-09-04.tar`
- 収録ファイル数: `2`
- SHA-256: `21c66a72bce049926d429b35330540e80b37e05d686f3a491081d545895f48e3`
- GitHub公開: **禁止**。秘密値・個人情報・一時パスを含む可能性があるため。

この原文は秘密値・個人情報を含み得るため、公開GitHubへは置きません。GitHubには再開に必要な安全な要約、実装、設定変数名、公開URL、未完了条件を保存します。原文バックアップは会話削除後の照合用であり、公開資料ではありません。

## 最終検査で止めるもの

1. 今回追加する2サイトと文書がGit commit・pushされていない。
2. ビルド、secret scan、`git diff --check`が失敗する。
3. GitHub上のcommitをreadbackできない。
4. 原文tarを展開一覧・SHA-256で検証できない。

## 削除可能とする条件

- 2タスクの事業・仕様・決定・成果・課題・リンクが全成果インベントリと総合引き継ぎにある。
- 販売サイト、立ち上げ設計サイト、特許構想サイトのソースとPDFがGitHubにある。
- owner、ブランド、GitHub、公開URL、X、Telegram username、Stripe Linkが`owner-public.json`と索引にある。
- secretそのものではなく、Secret Storeへ再設定する変数名とrunbookがある。
- 2サイトのbuild、secret scan、Git diff検査、GitHub pushが成功する。
- 対象2タスクのローカル原文tarのハッシュと収録ファイルを確認できる。

## 結論

上記の最終検査とGitHub pushが成功した場合、**指定された2タスクは、プロジェクト再開に必要な情報を失わず削除可能**と判定します。秘密値はGitHubから復元するのではなく、各サービスのSecret Storeまたは再発行で復旧します。別のドラえもん関連タスクはこの判定に含みません。

## 最終検査receipt

- 統合commit: `5aec11873816d2e80b66a8463cd9314aa11d8ef7`
- GitHub branch: `codex/doraemon-tool-modules`
- remote readback: `refs/heads/codex/doraemon-tool-modules`が上記commitと一致
- `apps/dora-launch-blueprint-site`: `npm run build`成功
- `apps/mcp-bot-hub-patent-site`: `npm run build`成功
- 公開対象の既知secret形式scan: 検出なし
- PDFを除くtext diff check: 成功
- 対象2タスクtar: 2ファイルの収録一覧とSHA-256を確認

この監査receipt自体をGitHubへpushし、remote readbackが一致した時点で判定を確定する。
