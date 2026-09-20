import { UnauthorizedError } from "./spots";
import type { CourseResponse } from "./course";
import type { BoardDetail } from "./board";

export type WishlistSpot = {
  spotId: number;
  title: string;
  category: string;
  region: string | null;
  sigungu: string | null;
  address: string | null;
  latitude?: number | null;
  longitude?: number | null;
  thumbnail: string | null;
  likeCount: number;
  isLiked: boolean;
};

export type WishlistCourse = CourseResponse;
export type WishlistBoard = BoardDetail;

function getApiBaseUrl(): string | undefined {
  return import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
}

/** 위시리스트에 담긴 스팟 목록 조회 (로그인 필요) */
export async function fetchLikedSpots(): Promise<WishlistSpot[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return [];
  }

  const response = await fetch(`${apiBaseUrl}/wishlist/spots`, {
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("위시리스트 스팟 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as WishlistSpot[];
}

/** 위시리스트에 담긴 코스 목록 조회 (로그인 필요) */
export async function fetchLikedCourses(): Promise<CourseResponse[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return [];
  }

  const response = await fetch(`${apiBaseUrl}/wishlist/courses`, {
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("위시리스트 코스 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as CourseResponse[];
}

/** 위시리스트에 담긴 여행기(게시글) 목록 조회 (로그인 필요) */
export async function fetchLikedBoards(): Promise<BoardDetail[]> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    return [];
  }

  const response = await fetch(`${apiBaseUrl}/wishlist/boards`, {
    credentials: "include",
  });

  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError();
  }
  if (!response.ok) {
    throw new Error("위시리스트 게시글 목록을 불러오지 못했습니다.");
  }

  return (await response.json()) as BoardDetail[];
}
