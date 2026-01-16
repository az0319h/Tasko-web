import { Route, Routes } from "react-router";
import IndexPage from "./pages/index-page";
import ResetPasswordPage from "./pages/reset-password-page";
import GlobalLayout from "./components/layout/global-layout";
import NotfoundPage from "./pages/not-found-page";
import SignInPage from "./pages/sign-in-page";
import GuestOnlyLayout from "./components/layout/guest-only-layout";
import MemberOnlyLayout from "./components/layout/member-only-layout";
import ProfileRequiredLayout from "./components/layout/profile-required-layout";
import AdminOnlyLayout from "./components/layout/admin-only-layout";
import ProfilePage from "./pages/profile-page";
import ProfileSetupPage from "./pages/profile-setup-page";
import ForgotPasswordPage from "./pages/forgot-password-page";
import SignupPage from "./pages/signup-page";
import AdminUsersPage from "./pages/admin-users-page";
import ProjectDetailPage from "./pages/project-detail-page";
import TaskDetailPage from "./pages/task-detail-page";
import CommunityPage from "./pages/community-page";
import AgentsPage from "./pages/agents-page";
import NotificationsPage from "./pages/notifications-page";

export default function RootRoute() {
  return (
    <Routes>
      <Route element={<GuestOnlyLayout />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/signup" element={<SignupPage />} />
      </Route>

      <Route element={<MemberOnlyLayout />}>
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/profile/setup" element={<ProfileSetupPage />} />

        <Route element={<ProfileRequiredLayout />}>
          <Route element={<GlobalLayout />}>
            <Route path="/" element={<IndexPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/agents" element={<AgentsPage />} />

            <Route element={<AdminOnlyLayout />}>
              <Route path="/admin/users" element={<AdminUsersPage />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotfoundPage />} />
    </Routes>
  );
}
