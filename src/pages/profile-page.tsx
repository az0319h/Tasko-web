import { SEO } from "@/components/common/seo";
import { useCurrentProfile } from "@/hooks";
import { useTranslation } from "react-i18next";
import DefaultSpinner from "@/components/common/default-spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import EditProfileDialog from "@/components/dialog/edit-profile-dialog";
import { Pencil } from "lucide-react";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: profile, isLoading } = useCurrentProfile();

  if (isLoading) {
    return <DefaultSpinner />;
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <>
      <SEO title="프로필" description="내 프로필을 확인할 수 있습니다." />
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>프로필</CardTitle>
                <CardDescription>내 프로필 정보를 확인할 수 있습니다.</CardDescription>
              </div>
              <EditProfileDialog>
                <Button variant="outline" size="sm">
                  <Pencil className="mr-2 size-4" />
                  수정
                </Button>
              </EditProfileDialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Email */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">이메일</label>
                <p className="mt-1 text-base">{profile?.email || "-"}</p>
              </div>

              {/* Full Name */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">이름</label>
                <p className="mt-1 text-base">{profile?.full_name || "-"}</p>
              </div>

              {/* Position */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">직책</label>
                <p className="mt-1 text-base">{profile?.position || "-"}</p>
              </div>

              {/* Phone */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">전화번호</label>
                <p className="mt-1 text-base">{profile?.phone || "-"}</p>
              </div>

              {/* Role */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">역할</label>
                <p className="mt-1 text-base">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                      profile?.role === "admin"
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {profile?.role === "admin" ? "관리자" : "멤버"}
                  </span>
                </p>
              </div>

              {/* Created At */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">가입일</label>
                <p className="mt-1 text-base">{formatDate(profile?.created_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}


