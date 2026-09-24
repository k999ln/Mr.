import Link from "next/link";

export default function LegalPage() {
  const name = process.env.DORAEMON_LEGAL_NAME || "公開前に販売事業者名を設定します";
  const address = process.env.DORAEMON_LEGAL_ADDRESS || "公開前に事業者住所を設定します";
  const contact = process.env.DORAEMON_PRIVACY_CONTACT || "公開前に問い合わせ先を設定します";
  const starsPrice = process.env.DORAEMON_STARS_DISPLAY_PRICE || "購入確認画面に表示されるTelegram Stars数";
  return (
    <main className="legal-page">
      <Link className="wordmark" href="/">avocadomini<span>/</span>10</Link>
      <p className="eyebrow">COMMERCIAL TRANSACTIONS</p>
      <h1>特定商取引法に基づく表記</h1>
      <h2>販売事業者</h2><p>{name}</p>
      <h2>所在地</h2><p>{address}</p>
      <h2>問い合わせ先</h2><p>{contact}</p>
      <h2>販売価格</h2><p>機能の選択、初期調査、結果概要の確認は無料です。詳細結果の開示または自動実行を選ぶ場合の価格は、購入確認画面に表示される{starsPrice}です。</p>
      <h2>商品代金以外の必要料金</h2><p>インターネット接続料金および通信料金は購入者の負担です。</p>
      <h2>支払方法・時期</h2><p>Telegram Starsによる都度購入です。初回同意には、有料操作があること、料金の決まり方、データ利用範囲を含みます。ただし、初回同意だけで将来の金額未確定の決済は行いません。価値の概要と根拠、今回の利用料、提供内容を同じ結果カードに表示し、金額入りの「支払って実行」ボタンを選ぶとTelegram公式の購入確認を直接開きます。購入者がそこで承認した時点で決済されます。</p>
      <h2>提供時期</h2><p>選択した機能の初期調査はTelegram BOT上で同意後に開始します。詳細結果または実行権限はStars決済の完了確認後に提供します。</p>
      <h2>返品・キャンセル</h2><p>デジタルサービスの性質上、提供開始後の購入者都合による返品は受け付けません。重複決済、提供不能その他当社側の不具合は問い合わせ先で確認し、法令および表示条件に従って対応します。</p>
      <h2>動作環境</h2><p>Telegramを利用できるスマートフォンまたはPCと、インターネット接続が必要です。</p>
      <h2>利用条件</h2><p>購入者本人の事業運営に利用できます。第三者へのアカウント貸与、認証情報の共有、無断広告送信、迷惑行為、違法な商品・サービスの販売、プラットフォーム規約を回避する操作には利用できません。</p>
      <h2>サービスの範囲</h2><p>avocadominiは外部サービスを接続して販売業務を補助します。外部サービスの障害、仕様変更、審査、アカウント制限により、一部機能を利用できない場合があります。売上や収益を保証するものではありません。</p>
      <h2>サポート</h2><p>購入に関する問題はavocadominiの問い合わせ先またはTelegram BOTの /paysupport で受け付けます。Telegram運営のサポートでは本商品の購入問題に対応できません。</p>
      <p><small>最終更新：2026年9月2日</small></p>
      <Link href="/">サイトへ戻る</Link>
    </main>
  );
}
