import { SEO } from "@/components/common/seo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUsers, useDeactivateUser } from "@/hooks";
import { toast } from "sonner";
import { generateErrorMessage } from "@/lib/error";
import DefaultSpinner from "@/components/common/default-spinner";
import { InviteUserDialog } from "@/components/dialog/invite-user-dialog";
import { Trash2 } from "lucide-react";
import type { Database, Tables } from "@/database.type";

type Profile = Tables<"profiles">;

export default function AdminUsersPage() {
  const { data: users, isLoading, isError } = useUsers();
  const { mutate: deactivateUser } = useDeactivateUser({
    onSuccess: () => {
      toast.success("사용자가 비활성화되었습니다.", {
        position: "bottom-right",
      });
    },
    onError: (error) => {
      const message = generateErrorMessage(error);
      toast.error(message, {
        position: "bottom-right",
      });
    },
  });

  const handleDeactivate = (userId: string, email: string) => {
    if (confirm(`정말로 ${email} 사용자를 비활성화하시겠습니까?`)) {
      deactivateUser(userId);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (isLoading) {
    return <DefaultSpinner />;
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">사용자 목록을 불러올 수 없습니다.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <SEO title="사용자 관리" description="사용자를 관리할 수 있습니다." />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>사용자 관리</CardTitle>
                <CardDescription>모든 사용자를 조회하고 관리할 수 있습니다.</CardDescription>
              </div>
              <InviteUserDialog>
                <Button>사용자 초대</Button>
              </InviteUserDialog>
            </div>
          </CardHeader>
          <CardContent>
            {users && users.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left text-sm font-medium">이메일</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">이름</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">직책</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">전화번호</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">역할</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">상태</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">프로필 설정</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">가입일</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-3 text-sm">{user.email}</td>
                        <td className="px-4 py-3 text-sm">{user.full_name || "-"}</td>
                        <td className="px-4 py-3 text-sm">{user.position || "-"}</td>
                        <td className="px-4 py-3 text-sm">{user.phone || "-"}</td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              user.role === "admin"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {user.role === "admin" ? "관리자" : "멤버"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              user.is_active
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            }`}
                          >
                            {user.is_active ? "활성" : "비활성"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              user.profile_completed
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                            }`}
                          >
                            {user.profile_completed ? "완료" : "미완료"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {formatDate(user.created_at)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.is_active && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivate(user.id, user.email)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-muted-foreground">등록된 사용자가 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

