import { Route, Routes } from "react-router";
import IndexPage from "./pages/index-page";
import ResetPasswordPage from "./pages/reset-password";
import GlobalLayout from "./components/layout/global-layout";
import NotfoundPage from "./pages/not-found-page";
import SignInPage from "./pages/sign-in-page";
import GuestOnlyLayout from "./components/layout/guest-only-layout";
import MemberOnlyLayout from "./components/layout/member-only-layout";

export default function RootRoute() {
  return (
    <Routes>
      <Route element={<GuestOnlyLayout />}>
        <Route path="/sign-in" element={<SignInPage />} />
      </Route>

      <Route element={<MemberOnlyLayout />}>
        <Route element={<GlobalLayout />}>
          <Route path="/" element={<IndexPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotfoundPage />} />
    </Routes>
  );
}
