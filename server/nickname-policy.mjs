// Project-maintained policy, not an official or exhaustive platform moderation list.
// Keep rules server-side. Add reviewed terms here or via NICKNAME_BLOCKLIST (comma/newline separated).
const BLOCKED_PHRASES = [
  '习近平', '习主席', '习大大', '习包子', '刁近平', '毛泽东', '毛主席',
  '邓小平', '江泽民', '胡锦涛', '温家宝', '李克强', '李强', '赵紫阳', '胡耀邦',
  '周恩来', '朱镕基', '薄熙来', '王岐山', '彭丽媛', '蒋介石', '蒋经国',
  '蔡英文', '赖清德', '陈水扁', '马英九', '孙中山', '刘晓波',
  '中共中央', '中央军委', '国家主席', '共产党', '国民党', '共青团中央',
  '台独', '台湾独立', '港独', '香港独立', '藏独', '西藏独立', '疆独', '新疆独立',
  '六四事件', '六四天安门', '天安门事件', '天安门屠杀', '八九六四', '8964',
  '法轮功', '法轮大法', '达赖喇嘛', '推翻共产党', '打倒共产党',
  'xijinping', 'maozedong', 'dengxiaoping', 'jiangzemin', 'hujintao', 'likeqiang',
  'falungong', 'tiananmenmassacre', 'adolfhitler', '希特勒', '纳粹万岁',
  '操你妈', '草泥马', '傻逼', '煞笔', '他妈的', '妈卖批', '去死吧',
  'fuckyou', 'motherfucker',
];
const BLOCKED_EXACT = new Set(['xjp', 'ccp', '19890604', 'fuck', 'shit', 'nigger', 'rape']);
const VARIANTS = /** @type {Record<string, string>} */ ({
  習: '习', 澤: '泽', 鄧: '邓', 錦: '锦', 濤: '涛', 溫: '温', 寶: '宝', 強: '强',
  國: '国', 黨: '党', 軍: '军', 臺: '台', 灣: '湾', 獨: '独', 產: '产',
  輪: '轮', 劉: '刘', 曉: '晓', 陳: '陈', 蔣: '蒋', 東: '东', 馬: '马',
  賴: '赖', 麗: '丽', 媽: '妈', 萬: '万', 歲: '岁', 殺: '杀', 鎔: '镕',
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j',
});

/** @param {string} value */
function matchKey(value) {
  return [...value.normalize('NFKC').normalize('NFD').toLowerCase()]
    .map(character => VARIANTS[character] || character).join('')
    .replace(/[\p{M}\p{Default_Ignorable_Code_Point}]/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}
const PHRASE_KEYS = BLOCKED_PHRASES.map(matchKey);

/** @param {unknown} value @param {string} [extraTerms] */
export function reviewNickname(value, extraTerms = '') {
  if (typeof value !== 'string' || value.length > 128 || /[\p{Cc}\p{Cs}]/u.test(value)) {
    return { allowed: false, code: 'nickname_invalid', message: '昵称格式不正确，请使用 1–24 个字符。' };
  }
  const name = value.normalize('NFKC').replace(/\p{Default_Ignorable_Code_Point}/gu, '').trim();
  if (![...name].length || [...name].length > 24 || !/[\p{L}\p{N}]/u.test(name)) {
    return { allowed: false, code: 'nickname_invalid', message: '昵称请使用 1–24 个字符，且至少包含一个文字或数字。' };
  }
  const key = matchKey(name);
  const extra = extraTerms.split(/[,\n，]/u).map(matchKey).filter(Boolean);
  if (BLOCKED_EXACT.has(key) || [...PHRASE_KEYS, ...extra].some(term => key.includes(term))) {
    return { allowed: false, code: 'nickname_not_allowed', message: '昵称包含不适合公开展示的内容，请更换昵称。' };
  }
  return { allowed: true, name };
}
