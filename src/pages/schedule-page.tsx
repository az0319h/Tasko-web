import { useState } from "react";
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

type CalendarView = "dayGridMonth" | "timeGridWeek" | "timeGridDay";

function getViewFromUrl(viewParam: string | null): CalendarView {
  if (viewParam === "week") return "timeGridWeek";
  if (viewParam === "day") return "timeGridDay";
  return "dayGridMonth"; // 기본값: 월
}

export default function SchedulePage() {
  const [searchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const initialView = getViewFromUrl(viewParam);
  
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: currentProfile } = useCurrentProfile();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);

  // 관리자가 다른 사용자를 선택한 경우 읽기 모드
  const isReadOnly = selectedUserId !== undefined && selectedUserId !== currentProfile?.id;

  if (isAdminLoading) {
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
              {isReadOnly 
                ? "선택한 사용자의 일정을 확인할 수 있습니다. (읽기 전용)"
                : "Task 기반 일정을 캘린더에서 확인하고 관리할 수 있습니다."}
            </p>
          </div>
          
          {/* 관리자용 사용자 선택 드롭다운 */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">
                사용자 선택:
              </label>
              <Select
                value={selectedUserId || "me"}
                onValueChange={(value) => {
                  setSelectedUserId(value === "me" ? undefined : value);
                }}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="사용자 선택">
                    {selectedUserId 
                      ? users?.find(u => u.id === selectedUserId)?.full_name || users?.find(u => u.id === selectedUserId)?.email || "사용자"
                      : "내 일정"}
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
                  {usersLoading ? (
                    <SelectItem value="loading" disabled>로딩 중...</SelectItem>
                  ) : (
                    users?.filter(user => user.id !== currentProfile?.id).map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <ProfileAvatar 
                            avatarUrl={user.avatar_url} 
                            size={20}
                            alt={user.full_name || user.email || "사용자"}
                          />
                          <span>{user.full_name || user.email}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </div>
      <div className="bg-card rounded-lg border p-4 md:p-6">
        <TaskCalendar 
          initialView={initialView} 
          selectedUserId={selectedUserId}
          readOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
