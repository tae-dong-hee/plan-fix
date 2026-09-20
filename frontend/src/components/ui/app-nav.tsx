import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Heart,
  LogOut,
  Luggage,
  Route,
  UserRound,
} from "lucide-react";

import CourseSelectModal from "@/components/ui/course-select-modal";
import { signOut } from "@/services/auth";

export interface AppNavProps {
  className?: string;
  courseIsOwner?: boolean;
}

export default function AppNav({ className = "", courseIsOwner }: AppNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileContainerRef = useRef<HTMLDivElement>(null);

  // 공개 목록과 다른 여행자의 상세 코스는 '여행' 메뉴에 속한다.
  const isPublicCourse = location.pathname === "/courses/public" ||
    (location.pathname.startsWith("/courses/") && courseIsOwner === false);
  const isMyCourseActive =
    location.pathname === "/courses" ||
    (location.pathname.startsWith("/courses/") && !location.pathname.startsWith("/courses/create") && !isPublicCourse);

  // 현재 경로가 메인, 장소, 게시글, 코스생성 관련 페이지일 때 '여행' 메뉴를 활성 상태로 표시
  const isTripActive =
    isPublicCourse ||
    location.pathname.startsWith("/main") ||
    location.pathname.startsWith("/spots") ||
    location.pathname.startsWith("/boards") ||
    location.pathname.startsWith("/courses/create");

  const isWishlistActive = location.pathname.startsWith("/wishlist");

  const navigationItems = [
    { label: "내 코스", icon: Route, active: isMyCourseActive },
    { label: "여행", icon: Luggage, active: isTripActive },
    { label: "위시리스트", icon: Heart, active: isWishlistActive },
    { label: "프로필", icon: UserRound, active: false },
  ];

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        profileContainerRef.current &&
        !profileContainerRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await signOut();
    } catch {
      // 로그아웃 중 에러가 발생해도 로그인 페이지로 이동
    } finally {
      setIsLoggingOut(false);
      setIsProfileMenuOpen(false);
      navigate("/login", { replace: true });
    }
  };

  const handleItemClick = (label: string) => {
    if (label === "프로필") {
      setIsProfileMenuOpen((prev) => !prev);
    } else if (label === "여행") {
      setIsCourseModalOpen((prev) => !prev);
    } else if (label === "위시리스트") {
      navigate("/wishlist");
    } else if (label === "내 코스") {
      navigate("/courses");
    }
  };

  const handleSelectAiCourse = () => {
    setIsCourseModalOpen(false);
    navigate("/courses/create?mode=ai");
  };

  const handleSelectManualCourse = () => {
    setIsCourseModalOpen(false);
    navigate("/courses/create");
  };

  return (
    <>
      {isProfileMenuOpen ? (
        <div
          data-testid="profile-menu-backdrop"
          className="fixed inset-0 z-40 bg-foreground/5"
          onClick={() => setIsProfileMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <nav
        className={`app-nav fixed inset-x-0 bottom-0 z-40 border-t border-border/70 md:bottom-auto md:top-0 md:border-t-0 md:border-b ${className}`}
        aria-label="하단 메뉴"
      >
        <div className="mx-auto h-20 max-w-7xl px-5 sm:h-24 sm:px-8 md:flex md:h-16 md:items-center md:justify-between lg:px-10">
          <Link
            to="/main"
            className="hidden items-center gap-2.5 rounded-lg text-xl font-bold tracking-[-0.06em] text-foreground transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 md:flex"
            aria-label="PlanFix 홈"
          >
            <img
              src="/logo.png"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 rounded-[10px] bg-black object-cover"
            />
            <span>
              Plan<span className="text-primary">Fix</span>
            </span>
          </Link>

          <div className="grid h-full grid-cols-4 md:flex md:items-center md:gap-1 lg:gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isProfile = item.label === "프로필";

              const isTrip = item.label === "여행";

              return (
                <div
                  key={item.label}
                  ref={isProfile ? profileContainerRef : undefined}
                  className="relative flex h-full items-center justify-center"
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.label)}
                    className={`relative flex h-full w-full flex-col items-center justify-center gap-1.5 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-xs md:w-auto md:flex-row md:gap-2 md:px-4 md:text-[13px] md:font-medium ${
                      item.active
                        ? "font-semibold text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    aria-current={item.active ? "page" : undefined}
                    aria-expanded={
                      isProfile
                        ? isProfileMenuOpen
                        : isTrip
                          ? isCourseModalOpen
                          : undefined
                    }
                    aria-haspopup={
                      isProfile
                        ? "menu"
                        : isTrip
                          ? "dialog"
                          : undefined
                    }
                  >
                    {item.active ? (
                      <span className="absolute top-0 h-0.5 w-6 rounded-b-full bg-primary md:bottom-0 md:left-4 md:right-4 md:top-auto md:w-auto md:rounded-b-none md:rounded-t-full" />
                    ) : null}
                    <Icon
                      className="relative h-[22px] w-[22px] sm:h-6 sm:w-6 md:h-[18px] md:w-[18px]"
                      strokeWidth={item.active ? 2 : 1.7}
                      aria-hidden="true"
                    />
                    <span className="relative">{item.label}</span>
                  </button>

                  {isProfile && isProfileMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="프로필 메뉴"
                      className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[160px] rounded-2xl border border-border/70 bg-background p-1.5 shadow-[0_8px_30px_hsl(var(--foreground)/0.08)] sm:bottom-[calc(100%+12px)] md:bottom-auto md:top-[calc(100%+8px)]"
                    >
                      <Link to="/profile" role="menuitem" onClick={() => setIsProfileMenuOpen(false)} className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/70">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                        <span>프로필 보기</span>
                      </Link>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{isLoggingOut ? "로그아웃 중..." : "로그아웃"}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </nav>

      <CourseSelectModal
        open={isCourseModalOpen}
        onClose={() => setIsCourseModalOpen(false)}
        onSelectAi={handleSelectAiCourse}
        onSelectManual={handleSelectManualCourse}
      />
    </>
  );
}
