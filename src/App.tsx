import { useTranslation } from "react-i18next";
import RootRoute from "./root-router";

export default function App() {
  const { ready } = useTranslation();

  if (!ready) return <div>로딩중...</div>;

  return <RootRoute />;
}
