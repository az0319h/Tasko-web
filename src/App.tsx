import { useTranslation } from "react-i18next";
import RootRoute from "./root-router";
import DefaultSpinner from "./components/common/default-spinner";
import SessionProvider from "./provider/session-provider";

export default function App() {
  const { ready } = useTranslation();
  if (!ready) return <DefaultSpinner />;

  return (
    <SessionProvider>
      <RootRoute />
    </SessionProvider>
  );
}
