import { Navigate, Route, Routes } from "react-router-dom";

import LoginFormDemo from "@/components/ui/demo";
import UniqueLoaderDemo from "@/components/ui/unique-loader-demo";
import AuthReturnRedirect from "@/components/auth-return-redirect";
import BoardCreatePage from "@/pages/board-create-page";
import BoardDetailPage from "@/pages/board-detail-page";
import BoardListPage from "@/pages/board-list-page";
import CourseCreatePage from "@/pages/course-create-page";
import CourseDetailPage from "@/pages/course-detail-page";
import CourseListPage from "@/pages/course-list-page";
import CourseInvitePage from "@/pages/course-invite-page";
import LoginPage from "@/pages/login-page";
import ForgotPasswordPage from "@/pages/forgot-password-page";
import FindIdPage from "@/pages/find-id-page";
import ResetPasswordPage from "@/pages/reset-password-page";
import MainPage from "@/pages/main-page";
import ImageCreditsPage from "@/pages/image-credits-page";
import PublicCourseListPage from "@/pages/public-course-list-page";
import PopularSpotsPage from "@/pages/popular-spots-page";
import ProfilePage from "@/pages/profile-page";
import SignupPage from "@/pages/signup-page";
import SearchPage from "@/pages/search-page";
import SpotDetailPage from "@/pages/spot-detail-page";
import WishlistPage from "@/pages/wishlist-page";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/find-id" element={<FindIdPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login/demo" element={<LoginFormDemo />} />
      <Route path="/loading/demo" element={<UniqueLoaderDemo />} />
      <Route path="/main" element={<AuthReturnRedirect><MainPage /></AuthReturnRedirect>} />
      <Route path="/image-credits" element={<ImageCreditsPage />} />
      <Route path="/wishlist" element={<WishlistPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/spots" element={<PopularSpotsPage mode="discover" />} />
      <Route path="/spots/popular" element={<PopularSpotsPage />} />
      <Route path="/spots/:spotId" element={<SpotDetailPage />} />
      <Route path="/boards" element={<BoardListPage />} />
      <Route path="/boards/create" element={<BoardCreatePage />} />
      <Route path="/boards/:boardId" element={<BoardDetailPage />} />
      <Route path="/courses" element={<CourseListPage />} />
      <Route path="/courses/public" element={<PublicCourseListPage />} />
      <Route path="/courses/create" element={<CourseCreatePage />} />
      <Route path="/courses/:courseId" element={<CourseDetailPage />} />
      <Route path="/courses/:courseId/edit" element={<CourseCreatePage />} />
      <Route path="/course-invites/:token?" element={<CourseInvitePage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
