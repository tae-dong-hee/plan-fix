import { Navigate, Route, Routes } from "react-router-dom";

import LoginFormDemo from "@/components/ui/demo";
import UniqueLoaderDemo from "@/components/ui/unique-loader-demo";
import BoardsPage from "@/pages/boards-page";
import BoardCreatePage from "@/pages/board-create-page";
import BoardDetailPage from "@/pages/board-detail-page";
import CourseCreatePage from "@/pages/course-create-page";
import CourseDetailPage from "@/pages/course-detail-page";
import CourseListPage from "@/pages/course-list-page";
import CourseInvitationPage from "@/pages/course-invitation-page";
import LoginPage from "@/pages/login-page";
import MainPage from "@/pages/main-page";
import PopularSpotsPage from "@/pages/popular-spots-page";
import SignupPage from "@/pages/signup-page";
import SpotDetailPage from "@/pages/spot-detail-page";
import TravelGuidesPage from "@/pages/travel-guides-page";
import WishlistPage from "@/pages/wishlist-page";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login/demo" element={<LoginFormDemo />} />
      <Route path="/loading/demo" element={<UniqueLoaderDemo />} />
      <Route path="/main" element={<MainPage />} />
      <Route path="/invite" element={<CourseInvitationPage />} />
      <Route path="/travel-guides" element={<TravelGuidesPage />} />
      <Route path="/wishlist" element={<WishlistPage />} />
      <Route path="/spots/popular" element={<PopularSpotsPage />} />
      <Route path="/spots/:spotId" element={<SpotDetailPage />} />
      <Route path="/boards" element={<BoardsPage />} />
      <Route path="/boards/create" element={<BoardCreatePage />} />
      <Route path="/boards/:boardId" element={<BoardDetailPage />} />
      <Route path="/courses" element={<CourseListPage />} />
      <Route path="/courses/create" element={<CourseCreatePage />} />
      <Route path="/courses/:courseId" element={<CourseDetailPage />} />
      <Route path="/courses/:courseId/edit" element={<CourseCreatePage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
