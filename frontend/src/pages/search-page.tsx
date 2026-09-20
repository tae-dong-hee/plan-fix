import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, MapPin, Search as SearchIcon, TrendingUp } from "lucide-react";
import AppNav from "@/components/ui/app-nav";
import SpotImage from "@/components/ui/spot-image";
import { GooglePhotoAttribution } from "@/components/ui/spot-photo-gallery";
import { useGoogleSpotCover } from "@/hooks/use-google-spot-cover";
import { getSimilarSpotImage } from "@/lib/similar-spot-images";
import { fetchPopularBoards, type BoardItem } from "@/services/board";
import { fetchPublicCourses, type PublicCourseItem } from "@/services/course";
import { searchSpots, type PopularSpot } from "@/services/spots";

const POPULAR_KEYWORDS = ["강릉", "속초", "바다", "카페", "맛집", "가족 여행", "강원도"];

function SearchSpotCard({ spot }: { spot: PopularSpot }) {
  const { viewportRef, photo, attribution, onSourceChange } = useGoogleSpotCover(spot);

  return (
    <article ref={viewportRef} className="rounded-xl border border-border bg-card hover:border-primary/50">
      <Link to={`/spots/${spot.spotId}`} className="flex items-center gap-3 rounded-xl p-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          <SpotImage
            src={photo?.url ?? spot.thumbnail}
            alt={spot.title}
            similarImage={getSimilarSpotImage(spot)}
            compactSimilarLabel
            className="h-full w-full object-cover"
            onSourceChange={onSourceChange}
          />
        </div>
        <div>
          <p className="font-semibold">{spot.title}</p>
          <p className="text-xs text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{spot.region} {spot.sigungu} · {spot.category}</p>
        </div>
      </Link>
      {attribution ? <GooglePhotoAttribution google={attribution} compact className="px-3 pb-2" /> : null}
    </article>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("q") ?? "";
  const [input, setInput] = useState(keyword);
  const [spots, setSpots] = useState<PopularSpot[]>([]);
  const [boards, setBoards] = useState<BoardItem[]>([]);
  const [courses, setCourses] = useState<PublicCourseItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setInput(keyword);
    if (!keyword.trim()) {
      let ignore = false;
      setLoading(true);
      Promise.all([searchSpots({ sort: "popular", size: 5 }), fetchPopularBoards({ size: 5 }), fetchPublicCourses({ sort: "popular", size: 5 })])
        .then(([spotResult, boardResult, courseResult]) => { if (!ignore) { setSpots(spotResult.items); setBoards(boardResult.items); setCourses(courseResult.items); } })
        .catch(() => { if (!ignore) { setSpots([]); setBoards([]); setCourses([]); } })
        .finally(() => { if (!ignore) setLoading(false); });
      return () => { ignore = true; };
    }
    let ignore = false;
    setLoading(true);
    Promise.all([searchSpots({ keyword, size: 12 }), fetchPopularBoards({ size: 30 }), fetchPublicCourses({ size: 30 })])
      .then(([spotResult, boardResult, courseResult]) => {
        if (ignore) return;
        const normalized = keyword.toLowerCase();
        setSpots(spotResult.items);
        setBoards(boardResult.items.filter((item) => item.title.toLowerCase().includes(normalized)));
        setCourses(courseResult.items.filter((item) => `${item.title} ${item.description ?? ""}`.toLowerCase().includes(normalized)));
      })
      .catch(() => { if (!ignore) { setSpots([]); setBoards([]); setCourses([]); } })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [keyword]);

  const submit = (event: FormEvent) => { event.preventDefault(); const next = input.trim(); setParams(next ? { q: next } : {}); };

  return <div className="app-page min-h-screen bg-muted/20 pb-24"><AppNav /><main className="app-page-content mx-auto max-w-6xl px-4 sm:px-6">
    <h1 className="text-2xl font-bold sm:text-3xl">무엇을 찾고 있나요?</h1>
    <form onSubmit={submit} className="mt-5 flex gap-2"><div className="relative flex-1"><SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" /><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="장소, 코스, 게시글을 검색해보세요" className="w-full rounded-2xl border border-border bg-background py-3.5 pl-12 pr-4 outline-none focus:border-primary" /></div><button className="rounded-2xl bg-primary px-5 font-semibold text-primary-foreground">검색</button></form>
    {!keyword && (loading ? <div className="mt-8 flex h-40 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : <><section className="mt-8 rounded-2xl border border-border bg-card p-6"><h2 className="flex items-center gap-2 font-bold"><TrendingUp className="h-4 w-4 text-primary" />인기 검색어</h2><div className="mt-4 flex flex-wrap gap-2">{POPULAR_KEYWORDS.map((item, index) => <button key={item} onClick={() => setParams({ q: item })} className="rounded-full bg-muted px-4 py-2 text-sm hover:bg-primary/10 hover:text-primary"><span className="mr-1 text-xs text-primary">{index + 1}</span>{item}</button>)}</div></section><div className="mt-8 space-y-8"><ResultSection title="인기 장소" count={spots.length}>{spots.slice(0, 5).map((spot) => <Link key={spot.spotId} to={`/spots/${spot.spotId}`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50"><p className="font-semibold">{spot.title}</p><p className="mt-1 text-xs text-muted-foreground">{spot.region} {spot.sigungu} · {spot.category}</p></Link>)}</ResultSection><ResultSection title="인기 공개 코스" count={courses.length}>{courses.slice(0, 5).map((course) => <Link key={course.courseId} to={`/courses/${course.courseId}`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50"><p className="font-semibold">{course.title}</p><p className="mt-1 text-xs text-muted-foreground">좋아요 {course.likeCount} · 조회 {course.viewCount}</p></Link>)}</ResultSection></div></>)}
    {keyword && (loading ? <div className="flex h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div> : <div className="mt-8 space-y-8"><ResultSection title="장소" count={spots.length}>{spots.map((spot) => <SearchSpotCard key={spot.spotId} spot={spot} />)}</ResultSection><ResultSection title="공개 코스" count={courses.length}>{courses.map((course) => <Link key={course.courseId} to={`/courses/${course.courseId}`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50"><p className="font-semibold">{course.title}</p><p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{course.description || "여행 코스"}</p></Link>)}</ResultSection><ResultSection title="게시글" count={boards.length}>{boards.map((board) => <Link key={board.boardId} to={`/boards/${board.boardId}`} className="rounded-xl border border-border bg-card p-4 hover:border-primary/50"><p className="font-semibold">{board.title}</p><p className="mt-1 text-xs text-muted-foreground">조회 {board.viewCount} · 좋아요 {board.likeCount}</p></Link>)}</ResultSection></div>)}
  </main></div>;
}

function ResultSection({ title, count, children }: { title: string; count: number; children: ReactNode }) { return <section><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><span className="text-sm text-muted-foreground">{count}건</span></div>{count > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div> : <p className="mt-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">검색 결과가 없습니다.</p>}</section>; }
