import { useNavigate } from "react-router";
import { SEO } from "@/components/common/seo";
import { AnnouncementForm } from "@/components/announcement/announcement-form";
import { useCreateAnnouncement } from "@/hooks/mutations/use-announcement";
import DefaultSpinner from "@/components/common/default-spinner";
import { useState } from "react";

export default function AdminAnnouncementCreatePage() {
  const navigate = useNavigate();
  const { mutate: createAnnouncement, isPending } = useCreateAnnouncement();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    data: {
      title: string;
      content: string;
      image_url: string | null;
      is_active: boolean;
      expires_at: string | null;
    },
    attachments: Array<{ file_name: string; file_url: string; file_size: number; file_type: string }>
  ) => {
    setIsSubmitting(true);
    createAnnouncement(
      {
        announcement: {
          title: data.title,
          content: data.content,
          image_url: data.image_url,
          is_active: data.is_active,
          expires_at: data.expires_at,
        },
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      {
        onSuccess: () => {
          navigate("/admin/announcements");
        },
        onError: () => {
          setIsSubmitting(false);
        },
      }
    );
  };

  if (isPending && isSubmitting) {
    return <DefaultSpinner />;
  }

  return (
    <>
      <div className="w-full p-4">
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">공지사항 작성</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            새로운 공지사항을 작성하세요
          </p>
        </div>

        <AnnouncementForm
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/announcements")}
          isSubmitting={isPending || isSubmitting}
        />
      </div>
    </>
  );
}
