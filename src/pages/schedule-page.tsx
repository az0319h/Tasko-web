import { useMemo } from "react";
import { useSearchParams } from "react-router";
import { TaskCalendar } from "@/components/schedule/task-calendar";
import { useIsAdmin, useUsers, useCurrentProfile } from "@/hooks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import DefaultSpinner from "@/components/common/default-spinner";
import type { Tables } from "@/database.type";

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";
type Profile = Tables<"profiles">;

function getViewFromUrl(viewParam: string | null): CalendarView {
  if (viewParam === "week") return "timeGridWeek";
  if (viewParam === "day") return "timeGridDay";
  return "dayGridMonth"; // 기본값: 월
}

export default function SchedulePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const viewModeParam = searchParams.get("viewMode");
  const initialView = getViewFromUrl(viewParam);
  
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: currentProfile } = useCurrentProfile();

  // viewMode를 searchParams로 관리 (기본값: "me")
  const viewMode = viewModeParam || "me";
  const isAllUsersMode = viewMode === "all";

  // 필터링된 사용자 목록: 일반 멤버만 표시 (관리자 및 현재 사용자 제외)
  const filteredUsers = useMemo(() => {
    if (!users || !currentProfile) return [];
    return users.filter((user: Profile) => {
      // 관리자 제외
      if (user.role === "admin") return false;
      // 현재 사용자 제외
      if (user.id === currentProfile.id) return false;
      return true;
    });
  }, [users, currentProfile]);

  if (isAdminLoading || usersLoading) {
    return (
      <div className="md:p-4">
        <DefaultSpinner />
      </div>
    );
  }

  return (
    <div className="md:p-4">
      <div className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">일정 관리</h1>
            <p className="text-muted-foreground mt-2">
              {isAllUsersMode
                ? "일반 멤버들의 일정을 확인할 수 있습니다."
                : "Task 기반 일정을 캘린더에서 확인하고 관리할 수 있습니다."}
            </p>
          </div>
          
          {/* 관리자용 일정 조회 옵션 선택 */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                일정 조회:
              </label>
              <Select
                value={viewMode}
                onValueChange={(value) => {
                  const newParams = new URLSearchParams(searchParams);
                  if (value === "me") {
                    newParams.delete("viewMode");
                  } else {
                    newParams.set("viewMode", value);
                  }
                  setSearchParams(newParams, { replace: true });
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="일정 조회 선택">
                    {isAllUsersMode ? "전체 사용자 일정" : "내 일정"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="me">
                    <div className="flex items-center gap-2">
                      <ProfileAvatar 
                        avatarUrl={currentProfile?.avatar_url} 
                        size={20}
                        alt={currentProfile?.full_name || currentProfile?.email || "내 프로필"}
                      />
                      <span>내 일정</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="all">
                    <span>전체 사용자 일정</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>

      {/* 전체 사용자 일정 모드: 필터링된 일반 멤버들의 일정만 표시 */}
      {isAllUsersMode && isAdmin ? (
        <div className="space-y-8">
          {filteredUsers.length > 0 ? (
            filteredUsers.map((user: Profile) => (
              <div key={user.id} className="bg-card rounded-lg border p-4 md:p-6">
                <div className="mb-4 flex items-center gap-2">
                  <ProfileAvatar 
                    avatarUrl={user.avatar_url} 
                    size={24}
                    alt={user.full_name || user.email || "사용자"}
                  />
                  <h2 className="text-lg font-semibold">
                    {user.full_name || user.email || "사용자"}
                  </h2>
                </div>
                <TaskCalendar 
                  initialView={initialView} 
                  selectedUserId={user.id}
                  readOnly={true}
                />
              </div>
            ))
          ) : (
            <div className="bg-card rounded-lg border p-4 md:p-6">
              <p className="text-muted-foreground text-center">
                표시할 일반 멤버 일정이 없습니다.
              </p>
            </div>
          )}
        </div>
      ) : (
        /* 내 일정 모드: 단일 캘린더 표시 */
        <div className="bg-card rounded-lg border p-4 md:p-6">
          <TaskCalendar 
            initialView={initialView} 
            selectedUserId={undefined}
            readOnly={false}
          />
        </div>
      )}
    </div>
  );
}
