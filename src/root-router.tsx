import { Route, Routes } from "react-router";
import IndexPage from "./pages/index-page";
import SignInPage from "./pages/sign-in-page";
import ResetPasswordPage from "./pages/reset-password";
import GlobalLayout from "./components/layout/global-layout";
import NotfoundPage from "./pages/not-found-page";

export default function RootRoute() {
  return (
    <Routes>
      <Route path="sign-in" element={<SignInPage />} />

      <Route element={<GlobalLayout />}>
        <Route path="/" element={<IndexPage />} />

        <Route path="reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route path="*" element={<NotfoundPage />} />
    </Routes>
  );
}
