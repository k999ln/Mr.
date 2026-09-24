# Rockstar_ibot — Thesis

Rockstar_ibot は、会話で受けた依頼を、本人のアカウントと本人のルールで、安全に実行する生活オペレーティングシステムである。

## 仮説

日常の自動化で難しいのは、文章生成ではなく、誰の権限で何を実行し、結果をどう確認するかである。Rockstar_ibot は次の閉ループをプロダクトの中心に置く。

`intent → plan → approval/rule check → execution → receipt → memory`

## アーキテクチャ

- **Core**: identity、policy、memory、jobs、receipts
- **One Hub**: capability、接続状態、運用状況、設定導線
- **Service Cells**: Telegram、メール、移動、予約など、外部作用を持つ adapter

詳細と現在の優先順位は `project.md` を SSOT とする。

## 所有モデル

- すべての外部アカウントは Kai または明示されたユーザー本人が所有する。
- Telegram はユーザー自身の bot を接続する BYOB single-bot を基本とする。
- 未接続 capability は unavailable として表示し、他人の資格情報へフォールバックしない。
- 支払い、送金、公開、メッセージ送信は receipt を得て初めて完了とする。

## 現段階

まず単一ユーザー環境で Core、Hub、Telegram、主要 3 Cells の閉ループを完成させる。その後、権限分離と監査性を保ったまま複数ユーザーへ広げる。
