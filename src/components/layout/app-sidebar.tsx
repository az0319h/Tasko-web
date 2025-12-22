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
import EditProfileDialog from "../dialog/edit-profile-dialog";
import ChangePasswordDialog from "../dialog/change-password-dialog";
import { useResolvedThemeMode, useCurrentProfile, useIsAdmin } from "@/hooks";
import { Users } from "lucide-react";

const getMenuItems = (isAdmin: boolean) => {
  const items = [
    { id: "home", key: "layout.sidebar.menu.home", url: "/", icon: Home },
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

  // Admin 전용 메뉴 추가 (설정 메뉴 바로 앞)
  if (isAdmin) {
    items.splice(3, 0, {
      id: "users",
      key: "layout.sidebar.menu.users",
      url: "/admin/users",
      icon: Users,
    });
  }

  return items;
};

const settingsSubItems = [
  { id: "language", key: "layout.sidebar.settingsSub.language" },
  { id: "theme", key: "layout.sidebar.settingsSub.theme" },
  { id: "edit-profile", key: "layout.sidebar.settingsSub.editProfile" },
  { id: "change-password", key: "layout.sidebar.settingsSub.changePassword" },
];

export function AppSidebar() {
  const { i18n, t } = useTranslation();
  const mode = useResolvedThemeMode();
  const { data: profile } = useCurrentProfile();
  const { data: isAdmin } = useIsAdmin();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent className="bg-background">
        {/* 회사 정보 영역 */}
        <SidebarGroup>
          <SidebarGroupLabel className="py-6 md:py-8">
            <Link to={"/"}>로고</Link>
          </SidebarGroupLabel>
        </SidebarGroup>

        {/* 플랫폼 메뉴 */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {getMenuItems(isAdmin ?? false).map((item) => {
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

                              if (sub.id === "edit-profile") {
                                return (
                                  <EditProfileDialog key={sub.id}>
                                    <Button
                                      type={"button"}
                                      variant={"ghost"}
                                      className="text-14-regular block w-full rounded-md px-6 py-2 text-left"
                                    >
                                      {t(sub.key)}
                                    </Button>
                                  </EditProfileDialog>
                                );
                              }

                              if (sub.id === "change-password") {
                                return (
                                  <ChangePasswordDialog key={sub.id}>
                                    <Button
                                      type={"button"}
                                      variant={"ghost"}
                                      className="text-14-regular block w-full rounded-md px-6 py-2 text-left"
                                    >
                                      {t(sub.key)}
                                    </Button>
                                  </ChangePasswordDialog>
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
                      <div>{profile?.full_name || "사용자"}</div>
                      <div className="text-xs text-muted-foreground">{profile?.email || ""}</div>
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
