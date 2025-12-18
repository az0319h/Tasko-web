import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Home,
  Bell,
  MessageCircle,
  User,
  Settings2Icon,
  Ellipsis,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import logo_en_light from "@/assets/logo_en_light.svg";
import logo_en_dark from "@/assets/logo_en_dark.svg";
import logo_ko_light from "@/assets/logo_ko_light.svg";
import logo_ko_dark from "@/assets/logo_ko_dark.svg";
import profile from "@/assets/profile.svg";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import LanguageDialog from "../dialog/language-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import LogoutDialog from "../dialog/logout-dialog";
import { Button } from "../ui/button";
import ThemeDialog from "../dialog/theme-dialog";
import { useResolvedThemeMode } from "@/hooks";

const items = [
  { id: "home", key: "layout.sidebar.menu.home", url: "/home", icon: Home },
  {
    id: "notifications",
    key: "layout.sidebar.menu.notifications",
    url: "/notifications",
    icon: Bell,
  },
  { id: "chats", key: "layout.sidebar.menu.chats", url: "/chats", icon: MessageCircle },
  { id: "settings", key: "layout.sidebar.menu.settings", icon: Settings2Icon },
  { id: "profile", key: "layout.sidebar.menu.profile", url: "/profile", icon: User },
  { id: "post", key: "layout.sidebar.menu.post" },
];

const settingsSubItems = [
  { id: "language", key: "layout.sidebar.settingsSub.language" },
  { id: "theme", key: "layout.sidebar.settingsSub.theme" },
  { id: "reset-password", key: "layout.sidebar.settingsSub.resetPassword" },
];

export function AppSidebar() {
  const { i18n, t } = useTranslation();
  const mode = useResolvedThemeMode();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent className="bg-background">
        {/* 회사 정보 영역 */}
        <SidebarGroup>
          <SidebarGroupLabel className="py-6 md:py-8">
            <Link to={"/home"}>
              {mode === "light" ? (
                <img
                  src={i18n.language.startsWith("ko") ? logo_ko_dark : logo_en_dark}
                  alt="logo"
                  className="h-6"
                />
              ) : (
                <img
                  src={i18n.language.startsWith("ko") ? logo_ko_light : logo_en_light}
                  alt="logo"
                  className="h-6"
                />
              )}
            </Link>
          </SidebarGroupLabel>
        </SidebarGroup>

        {/* 플랫폼 메뉴 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                if (item.id === "settings") {
                  return (
                    <Collapsible key={item.id} className="group/collapsible">
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton className="flex items-center gap-2 rounded-md px-3 py-2 md:gap-3 md:py-6">
                            {item.icon && <item.icon className="!size-4 md:!size-5" />}
                            <span className="text-14-regular md:text-16-regular">
                              {t(item.key)}
                            </span>
                            <ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                          <div className="flex flex-col">
                            {settingsSubItems.map((sub) => {
                              if (sub.id === "language") {
                                return (
                                  <LanguageDialog key={sub.id}>
                                    <Button
                                      type={"button"}
                                      variant={"ghost"}
                                      className="text-14-regular block w-full rounded-md px-6 py-2 text-left"
                                    >
                                      {t(sub.key)}
                                    </Button>
                                  </LanguageDialog>
                                );
                              }

                              if (sub.id === "theme") {
                                return (
                                  <ThemeDialog key={sub.id}>
                                    <Button
                                      type={"button"}
                                      variant={"ghost"}
                                      className="text-14-regular block w-full rounded-md px-6 py-2 text-left"
                                    >
                                      {t(sub.key)}
                                    </Button>
                                  </ThemeDialog>
                                );
                              }

                              if (sub.id === "reset-password") {
                                // 나중에 PasswordDialog 만들면 여기도 같은 패턴으로
                                return (
                                  <Button
                                    key={sub.id}
                                    variant={"ghost"}
                                    className="text-14-regular block w-full rounded-md px-6 py-2 text-left"
                                  >
                                    {t(sub.key)}
                                  </Button>
                                );
                              }

                              return null;
                            })}
                          </div>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                // 일반 메뉴
                return (
                  <SidebarMenuItem key={item.id}>
                    {item.id !== "post" ? (
                      <SidebarMenuButton asChild>
                        <Link
                          to={item.url ?? "#"}
                          className="flex items-center gap-2 rounded-md px-3 py-2 md:gap-3 md:py-6"
                        >
                          {item.icon && <item.icon className="!size-4 md:!size-5" />}
                          <span className="text-14-regular md:text-16-regular">{t(item.key)}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <Button
                        type="button"
                        className="xs:text-14-semibold md:text-16-semibold text-background bg-foreground my-2 w-full cursor-pointer rounded-full py-2 md:my-3 md:py-3"
                      >
                        {t(item.key)}
                      </Button>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* 하단 사용자 정보 */}
      <SidebarFooter className="bg-background">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* 트리거는 실제 버튼/메뉴 버튼으로 */}
                <Button
                  type="button"
                  variant="ghost"
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <img src={profile} alt="profile" className="size-10" />
                    <div className="text-14-regular text-left">
                      <div>Full Name</div>
                      <div>Email</div>
                    </div>
                  </div>
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent side="top" className="w-[16rem] md:w-[14rem]">
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                  }}
                >
                  <LogoutDialog>
                    <Button
                      type={"button"}
                      variant={"none"}
                      className="text-14-medium flex w-full items-center justify-between gap-2 !p-1"
                    >
                      <span>{t("layout.sidebar.footer.logout")}</span>
                      <LogOut />
                    </Button>
                  </LogoutDialog>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
