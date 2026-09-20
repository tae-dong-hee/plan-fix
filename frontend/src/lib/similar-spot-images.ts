import catalog from "@/constants/similar-spot-images.json";
import menuCatalog from "@/constants/similar-spot-menu-hints.json";

export const similarSpotImages = catalog.images;
const menuHints = new Map(menuCatalog.spots.map((spot) => [spot.spotId, spot]));

export type SimilarSpot = {
  spotId: number;
  title: string;
  category: string;
  sigungu?: string | null;
};

// 분류 안에서 세부 유형을 먼저 고른다. "바다횟집"에 해변, "소노카페 오토캠핑장"에
// 커피를 연결하지 않도록 다른 업종의 이름 키워드는 섞지 않는다.
type ImageRule = readonly [kind: string, keywords: readonly string[]];
const foodRules: readonly ImageRule[] = [
  ["spicy-tofu", ["짬뽕순두부"]],
  ["dakgalbi", ["닭갈비"]],
  ["meal", ["김밥", "후토마끼"]],
  ["dessert", ["인절미", "팥빙수", "케이크", "케익", "타르트"]],
  ["noodles", ["막국수", "메밀", "냉면", "면옥", "소바", "국시", "칼국수", "국수"]],
  ["dumplings", ["옹심", "감자전", "감자적", "만두"]],
  ["tofu", ["순두부", "두부", "청국장", "콩"]],
  ["mulhoe", ["물회"]],
  ["crab", ["대게", "홍게", "랍스터", "게장"]],
  ["sashimi", ["횟집", "막회", "회식당", "초밥", "스시", "참치", "송어회", "모둠회", "모듬회", "광어회"]],
  ["seafood-stew", ["매운탕", "동태탕", "생대구", "대구탕", "해물탕", "해물뚝배기", "섭국", "꾹저구탕", "물곰탕", "곰치", "생태찌개", "도루묵찌개", "황태전골", "황태뚝배기"]],
  ["fish", ["생선", "황태", "코다리", "해물", "조개", "전복", "쭈꾸미", "아구"]],
  ["eel", ["장어"]],
  ["cutlet", ["돈까스", "돈가스", "경양식"]],
  ["burger", ["버거", "맥도날드", "롯데리아", "맘스터치", "패티"]],
  ["jjamppong", ["짬뽕"]],
  ["chinese", ["중화", "중국", "반점", "짜장", "양자강", "탕수육"]],
  ["chicken-soup", ["삼계탕", "백숙"]],
  ["chicken", ["치킨", "통닭", "닭강정"]],
  ["soup", ["국밥", "곰탕", "설렁탕", "감자탕", "해장국", "순대", "매운탕", "추어탕", "육개장", "곰치국", "부대찌개"]],
  ["beef", ["한우", "참하누", "소고기"]],
  ["barbecue", ["삼겹", "갈비", "갈빗", "고기", "고깃", "숯불", "화로", "식육", "흑돈", "흑돼지", "돼지", "양꼬치", "오리", "불고기", "구이", "오겹살", "목살", "생등심", "냉삼", "제육", "두루치기"]],
  ["meal", ["산채", "나물", "보리밥", "더덕밥", "쌈밥", "시래", "밥상", "정식", "비빔밥"]],
  ["bakery", ["베이커리", "브레드", "제빵", "빵", "타르트", "케익", "케이크"]],
  ["coffee", ["카페", "커피", "로스터리", "토프레소", "라떼", "라테"]],
  ["restaurant", ["레스토랑", "파스타", "스테이크", "피자", "꽈뜨로", "라운지"]],
];
const cafeRules: readonly ImageRule[] = [
  ["icecream", ["젤라또", "배스킨", "아이스크림"]],
  ["bakery", ["베이커리", "브레드", "제빵", "빵"]],
  ["dessert", ["디저트", "과자", "케이크", "케익", "타르트", "명과", "돌체"]],
  ["tea", ["전통차", "찻집", "다원", "다구"]],
  ["books", ["북카페", "책방", "북샵"]],
  ["ocean-cafe", ["바다", "해변", "오션"]],
];
const stayRules: readonly ImageRule[] = [
  ["hanok", ["한옥", "고택", "가옥", "초가", "황토"]],
  ["glamping", ["글램핑", "카라반"]],
  ["camping", ["캠프", "캠핑", "야영"]],
  ["pool", ["풀빌라"]],
  ["pension", ["펜션", "민박", "산장", "캐빈", "게스트하우스"]],
];
const natureRules: readonly ImageRule[] = [
  ["river", ["계곡", "폭포", "약수", "한탄강", "동강"]],
  ["forest", ["휴양림", "수목원", "숲", "삼림", "산림", "둘레길", "탐방로", "트레킹"]],
  ["beach", ["해변", "해수욕장", "해안", "해상", "바다", "정동진"]],
  ["harbor", ["여객터미널", "선착장", "포구", "항구", "동명항", "외옹치항", "어항"]],
  ["lake", ["호수", "소양호", "영랑호", "파로호", "댐"]],
  ["temple", ["사찰", "암자", "향교", "산성", "유일사", "용화사", "명주사", "현지사"]],
  ["church", ["교회", "성당"]],
  ["farm", ["목장", "농장", "농원", "동물"]],
  ["museum", ["박물관", "문화관", "기념관", "전시관", "문화센터", "교육센터"]],
  ["gallery", ["예술", "미술", "갤러리"]],
  ["village", ["마을", "거리", "가옥", "문화공원"]],
  ["park", ["공원", "가든", "정원", "전망대"]],
  ["pool", ["워터", "오션700", "블루캐니언", "사우나", "온천"]],
  ["railbike", ["열차", "레일"]],
];
const activityRules: readonly ImageRule[] = [
  ["glamping", ["글램핑", "카라반"]],
  ["camping", ["캠핑", "야영", "캠프", "camp", "잼버리"]],
  ["surf", ["서핑", "서프"]],
  ["ski", ["스키", "스노우", "스노보드"]],
  ["golf", ["골프", "컨트리", "cc"]],
  ["rafting", ["래프팅"]],
  ["paragliding", ["패러글라이딩"]],
  ["watersports", ["카누", "카약", "수상", "낚시", "피싱"]],
  ["railbike", ["레일", "추추"]],
  ["kart", ["카트", "서킷"]],
  ["forest", ["둘레길", "굽이길", "봄내길", "바우길", "자전거길", "트레킹"]],
];
const cultureRules: readonly ImageRule[] = [
  ["books", ["책방", "도서", "북샵", "서점"]],
  ["gallery", ["예술", "미술", "갤러리"]],
  ["tea", ["다구", "다도"]],
];

const categoryRules: Record<string, { rules: readonly ImageRule[]; defaultKind: string }> = {
  "음식점": { rules: foodRules, defaultKind: "meal" },
  "카페/음료": { rules: cafeRules, defaultKind: "coffee" },
  "숙박": { rules: stayRules, defaultKind: "hotel" },
  "관광지": { rules: natureRules, defaultKind: "park" },
  "문화시설": { rules: cultureRules, defaultKind: "museum" },
  "레포츠": { rules: activityRules, defaultKind: "sports" },
  "쇼핑": { rules: [["market", ["시장", "일장", "새벽시장"]]], defaultKind: "shop" },
  "축제공연행사": { rules: [], defaultKind: "park" },
};

function stableIndex(value: string, count: number) {
  let hash = 0;
  for (const char of value) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

/** 장소 사진을 덮어쓰지 않고 화면의 대체 사진만 선택한다. 같은 장소는 항상 같은 사진이다. */
export function getSimilarSpotImage(spot: SimilarSpot) {
  const normalize = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const name = normalize(spot.title);
  const { rules, defaultKind } = categoryRules[spot.category] ?? categoryRules["관광지"];
  const hint = menuHints.get(spot.spotId);
  // 이름만으로 업종을 알기 어려운 기존 식당은 확인한 대표 메뉴를 참고한다.
  // ID가 재사용되거나 상호/분류가 바뀌면 과거 메뉴 힌트를 적용하지 않는다.
  const menu = hint?.title === spot.title && hint.category === spot.category ? normalize(hint.menu) : "";
  const kindFor = (text: string) => rules.find(([, keywords]) => keywords.some((keyword) => text.includes(keyword)))?.[0];
  // 앞쪽 규칙이 더 구체적이다(짬뽕순두부 → 순두부, 닭갈비 → 갈비 등).
  let kind = kindFor(menu) ?? kindFor(name) ?? defaultKind;
  if (spot.category === "관광지" && kind === defaultKind && /(?:산|봉)(?:\(|$|\/)/.test(name)) kind = "mountain";
  const candidates = similarSpotImages.filter((image) => image.kind === kind);
  const regional = candidates.filter((image) => spot.sigungu && image.regions.includes(spot.sigungu));
  const pool = regional.length > 0 ? regional : candidates;
  return pool[stableIndex(`${spot.spotId}:${name}`, pool.length)];
}
