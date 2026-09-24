# avocadomini 立ち上げ設計サイト

`docs/DORA_OS_立ち上げ設計書_2026-09-03.md`を、共有・閲覧しやすいWebページとPDFにしたSitesプロジェクトです。

## 役割

- 事業コンセプト、10個の道具、課金、安全境界、立ち上げ手順を説明する
- 本体販売サイトとは分離し、共同開発者・事業関係者向けの設計資料として使う
- `public/avocadomini_立ち上げ設計書_2026-09-03.pdf`を配布する

## 確認

```bash
npm install
npm run build
```

`.openai/hosting.json`はSites公開先の識別情報です。秘密値は含めません。
