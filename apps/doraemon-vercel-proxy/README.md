# avocadomini Vercel入口

`doraos.vercel.app`を、avocadominiの正規公開面であるCodex Sitesへ307リダイレクトするための最小構成です。

- 正本のコードは`k999ln/Mr.`の`main`
- 正規公開面は`https://effect-os-verified.kirin-999.chatgpt.site`
- Vercelは既存リンクを壊さないための互換入口だけを担当
- 307を使い、パス、クエリ、HTTPメソッドを維持
- 個別のデータベース、秘密値、メール、決済設定をVercelへ複製しない

Vercel project `doraos`のRoot Directoryは`apps/doraemon-vercel-proxy`に固定します。旧`vvvv`へ再接続しないでください。
