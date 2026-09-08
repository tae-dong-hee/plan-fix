export type TravelGuide = {
  id: string;
  getTitle: (region: string) => string;
  image: string;
  alt: string;
  isSample?: boolean;
};

const originalGuideCards: TravelGuide[] = [
  {
    id: "course",
    getTitle: (region: string) => `${region} 필수\n관광 코스`,
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=85",
    alt: "해 질 무렵의 바다와 해변",
  },
  {
    id: "food",
    getTitle: (region: string) => `건강한\n${region} 음식`,
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85",
    alt: "채소와 면이 담긴 따뜻한 음식",
  },
  {
    id: "place",
    getTitle: () => "요즘 떠오르는\n인기 명소",
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85",
    alt: "초록빛 나무가 울창한 숲길",
  },
  // 좌우 이동을 여러 번 확인할 수 있는 화면용 샘플 카드.
  {
    id: "sample-drive",
    getTitle: (region: string) => `${region} 바다 따라\n드라이브`,
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=85",
    alt: "드라이브 중 만나는 푸른 바다와 해변",
    isSample: true,
  },
  {
    id: "sample-walk",
    getTitle: () => "숲길 따라\n힐링 산책",
    image:
      "https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=900&q=85",
    alt: "산책하기 좋은 초록빛 숲길",
    isSample: true,
  },
  {
    id: "sample-lake",
    getTitle: () => "호수 옆에서\n쉬어가기",
    image:
      "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=85",
    alt: "산과 호수가 어우러진 풍경",
    isSample: true,
  },
  {
    id: "sample-food",
    getTitle: () => "여행 중 만나는\n한 끼의 행복",
    image:
      "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=85",
    alt: "여행 중 즐기는 따뜻한 한 끼",
    isSample: true,
  },
];

const extraSampleTitles = [
  "바람 따라\n걷는 여행",
  "느긋한 오후\n작은 쉼표",
  "새로운 풍경\n사진 한 장",
  "가벼운 발걸음\n주말 나들이",
  "친구와 함께\n떠나는 하루",
  "나만의 속도로\n느린 여행",
  "아침 햇살\n기분 좋은 출발",
  "낯선 길에서\n만나는 즐거움",
  "일상 밖으로\n잠깐의 탈출",
  "여행 가방 속\n설레는 계획",
  "소중한 사람과\n추억 만들기",
  "발길이 닿는 곳\n즉흥 여행",
  "오늘의 풍경\n오래 기억하기",
  "다음 여행도\n함께 떠나요",
];

export const guideCards: TravelGuide[] = [
  ...originalGuideCards,
  ...extraSampleTitles.map((title, index) => ({
    id: `sample-random-${index + 1}`,
    getTitle: () => title,
    image: `/travel-guides/random-${String(index + 1).padStart(2, "0")}.jpg`,
    alt: `랜덤 여행 샘플 이미지 ${index + 1}`,
    isSample: true,
  })),
];
