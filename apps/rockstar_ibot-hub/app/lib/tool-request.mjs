// Requests are work items, not install grants or execution permissions.
export function toolRequestTitle(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['name', 'origin', 'url'].includes(key))) {
    throw new TypeError('ツール情報が正しくありません。');
  }
  if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 70 || /[\r\n\x00-\x1f]/.test(body.name)) {
    throw new TypeError('ツール名は2〜70文字で入力してください。');
  }
  if (!['builtin', 'external'].includes(body.origin)) throw new TypeError('開発元を選択してください。');
  if (body.url !== undefined && typeof body.url !== 'string') throw new TypeError('公式URLが正しくありません。');
  const inputUrl = (body.url || '').trim();
  let url = '';
  if (inputUrl) {
    let parsed;
    try { parsed = new URL(inputUrl); } catch { throw new TypeError('HTTPSの公式URLを入力してください。'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.href.length > 120) {
      throw new TypeError('認証情報・クエリを含まない短いHTTPS URLを入力してください（URL変換後120文字以内）。');
    }
    url = ` / ${parsed.href}`;
  }
  return `[ツール導入確認・${body.origin === 'builtin' ? '自社開発' : '外部'}] ${body.name.trim()}${url}`;
}
