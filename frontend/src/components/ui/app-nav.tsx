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
}

export default function AppNav({ className = "" }: AppNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isCourseModalOpen, setIsCourseModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const profileContainerRef = useRef<HTMLDivElement>(null);

  // 현재 경로가 내 코스 관련 페이지일 때 '내 코스' 활성 상태로 표시 (생성 페이지 제외)
  const isMyCourseActive =
    location.pathname === "/courses" ||
    (location.pathname.startsWith("/courses/") && !location.pathname.startsWith("/courses/create"));

  // 현재 경로가 메인, 장소, 게시글, 코스생성 관련 페이지일 때 '여행' 메뉴를 활성 상태로 표시
  const isTripActive =
    location.pathname.startsWith("/main") ||
    location.pathname.startsWith("/travel-guides") ||
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
          className="fixed inset-0 z-40 bg-foreground/10 backdrop-blur-[1px]"
          onClick={() => setIsProfileMenuOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <nav
        className={`fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 shadow-[0_-8px_32px_hsl(var(--foreground)/0.08)] backdrop-blur-md md:bottom-auto md:top-0 md:border-t-0 md:border-b md:shadow-sm md:backdrop-blur-md ${className}`}
        aria-label="하단 메뉴"
      >
        <div className="mx-auto h-20 max-w-3xl px-2 sm:h-24 md:flex md:h-16 md:max-w-6xl md:items-center md:justify-between md:px-6 lg:px-8">
          <Link
            to="/main"
            className="hidden items-center gap-2.5 text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-90 md:flex"
            aria-label="PlanFix 홈"
          >
            <img
              src="/logo.png"
              alt=""
              aria-hidden="true"
              className="h-8 w-8 rounded-lg object-cover shadow-sm bg-black"
            />
            <span>
              Plan<span className="text-primary">Fix</span>
            </span>
          </Link>

          <div className="grid h-full grid-cols-4 md:flex md:items-center md:gap-1.5 lg:gap-2">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isProfile = item.label === "프로필";

              const isTrip = item.label === "여행";

              return (
                <div
                  key={item.label}
                  ref={isProfile ? profileContainerRef : undefined}
                  className="relative flex items-center justify-center"
                >
                  <button
                    type="button"
                    onClick={() => handleItemClick(item.label)}
                    className={`relative flex h-full w-full flex-col items-center justify-center gap-1 text-xs transition-colors sm:text-sm md:h-10 md:w-auto md:flex-row md:gap-2 md:rounded-full md:px-4 md:py-2 md:text-sm md:font-medium md:transition-all ${
                      item.active
                        ? "font-semibold text-primary md:bg-primary/10 md:text-primary md:hover:bg-primary/15"
                        : "text-muted-foreground hover:text-primary md:hover:bg-muted/70 md:hover:text-foreground"
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
                      <span className="absolute inset-y-2 aspect-square rounded-full bg-primary/10 md:hidden" />
                    ) : null}
                    <Icon
                      className="relative h-6 w-6 sm:h-7 sm:w-7 md:h-4 md:w-4"
                      strokeWidth={item.active ? 2.2 : 1.8}
                      aria-hidden="true"
                    />
                    <span className="relative">{item.label}</span>
                  </button>

                  {isProfile && isProfileMenuOpen ? (
                    <div
                      role="menu"
                      aria-label="프로필 메뉴"
                      className="absolute bottom-[calc(100%+8px)] right-0 z-50 min-w-[120px] rounded-xl border border-border bg-background/95 p-1 shadow-lg backdrop-blur-md sm:bottom-[calc(100%+12px)] sm:min-w-[140px] md:bottom-auto md:top-[calc(100%+8px)] md:min-w-[140px] md:shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        disabled={isLoggingOut}
                        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm md:justify-start md:px-3 md:py-2 md:text-sm"
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
