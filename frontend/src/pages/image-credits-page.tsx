import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import AppNav from "@/components/ui/app-nav";
import catalog from "@/constants/course-cover-images.json";
import { verifiedSpotImages } from "@/lib/verified-spot-images";

type ImageCredit = {
  id: string;
  title: string;
  url: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  changes?: string;
};

const images: ImageCredit[] = [...catalog.images, ...verifiedSpotImages];

const externalLinkClassName = "inline-flex items-center gap-1 rounded text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export default function ImageCreditsPage() {
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;

    // 라우트 전환 후 화면이 배치된 다음 이동한다. 같은 출처로 다시 방문해도 실행한다.
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, key]);

  return (
    <div className="min-h-screen bg-muted/20 pb-28 text-foreground md:pb-16 md:pt-20">
      <AppNav />
      <main className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <Link
          to="/main"
          className="inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          메인으로 돌아가기
        </Link>

        <header className="mt-6 border-b border-border pb-6 sm:mt-8 sm:pb-8">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">사진 출처</h1>
          <p className="mt-3 break-keep text-sm leading-6 text-muted-foreground sm:text-base">
            여행 코스 기본 이미지와 장소 사진의 저작자, 원본, 이용 조건을 확인할 수 있어요.
          </p>
        </header>

        <section id="google-maps" aria-labelledby="google-maps-heading" className="mt-6 scroll-mt-24 rounded-2xl border border-border bg-background p-5 sm:p-6">
          <h2 id="google-maps-heading" className="text-base font-semibold">Google Maps 장소 사진</h2>
          <p className="mt-3 break-keep text-sm leading-6 text-muted-foreground">
            Google Maps로 표시된 장소 카드와 사진은 Google에서 제공합니다. 사진을 확대하면 촬영자와 원본 출처를 확인할 수 있습니다.
          </p>
          <h3 className="mt-4 text-sm font-medium">이용 조건</h3>
          <p className="mt-2 break-keep text-sm leading-6 text-muted-foreground">
            Google Maps 콘텐츠 이용에는{" "}
            <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noopener noreferrer" className={externalLinkClassName}>Google Maps / Google Earth 추가 서비스 약관</a>
            이 적용됩니다.
          </p>
          <h3 className="mt-4 text-sm font-medium">개인정보 안내</h3>
          <p className="mt-2 break-keep text-sm leading-6 text-muted-foreground">
            장소 카드를 불러올 때 브라우저가 Google 서버에 연결됩니다. 이 과정에서 Google이 처리하는 정보에는{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className={externalLinkClassName}>Google 개인정보처리방침</a>
            이 적용됩니다.
          </p>
        </section>

        <ol className="mt-6 grid gap-4 md:grid-cols-2">
          {images.map((image, index) => (
            <li
              key={image.id}
              id={image.id}
              className="scroll-mt-24 rounded-2xl border border-border bg-background p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold tabular-nums text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="min-w-0 pt-1 break-keep text-base font-semibold leading-6 [overflow-wrap:anywhere]">
                  {image.title}
                </h2>
              </div>

              <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm leading-6">
                <dt className="text-muted-foreground">저작자</dt>
                <dd className="min-w-0 break-words">{image.author}</dd>

                <dt className="text-muted-foreground">라이선스</dt>
                <dd className="min-w-0">
                  <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer" className={externalLinkClassName}>
                    <span className="break-words">{image.license}</span>
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </dd>

                <dt className="text-muted-foreground">원본</dt>
                <dd>
                  <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className={externalLinkClassName}>
                    원본 사진 보기
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </a>
                </dd>

                {image.changes && (
                  <>
                    <dt className="text-muted-foreground">변경 내역</dt>
                    <dd className="min-w-0 break-keep text-muted-foreground [overflow-wrap:anywhere]">{image.changes}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
