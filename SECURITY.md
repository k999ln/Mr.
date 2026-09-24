# Security Policy

## Ownership boundary

Rockstar_ibot の現行運用者は Kai。外部サービスは Kai または明示された利用者本人の所有確認ができた接続だけを使う。履歴資料に残る旧所有者の token、bot、domain、email、SNS、wallet は無効な値として扱う。

## Secrets

- token、API key、private key、session、webhook secret をコミットしない。
- 公開設定は `config/owner-public.json`、秘密値はローカル `.env`、Keychain、または hosting provider の Secret Store に分離する。
- ログ、テスト fixture、エラーメッセージへ秘密値を出さない。

## Reporting a vulnerability

公開 security contact は未設定。Kai 所有の連絡先が `config/owner-public.json` に登録されるまでは、このリポジトリを公開せず、GitHub の private security advisory または所有者へ直接報告する。

## External effects

メッセージ送信、メール、公開、決済、送金は fail closed を既定とし、宛先・所有者・receipt を確認する。
