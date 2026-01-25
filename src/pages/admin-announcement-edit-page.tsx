import { useNavigate, useParams } from "react-router";
import { SEO } from "@/components/common/seo";
import { AnnouncementForm } from "@/components/announcement/announcement-form";
import { useAnnouncement } from "@/hooks/queries/use-announcement";
import { useUpdateAnnouncement } from "@/hooks/mutations/use-announcement";
import DefaultSpinner from "@/components/common/default-spinner";
import { useState } from "react";

export default function AdminAnnouncementEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: announcement, isLoading } = useAnnouncement(id);
  const { mutate: updateAnnouncement, isPending } = useUpdateAnnouncement();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    data: {
      title: string;
      content: string;
      image_url: string | null;
      is_active: boolean;
      expires_at: string | null;
    },
    attachments: Array<{ file_name: string; file_url: string; file_size: number; file_type: string }>,
    deletedAttachmentIds?: string[]
  ) => {
    if (!id) return;

    setIsSubmitting(true);
    updateAnnouncement(
      {
        id,
        updates: {
          title: data.title,
          content: data.content,
          image_url: data.image_url,
          is_active: data.is_active,
          expires_at: data.expires_at,
        },
        attachments: attachments.length > 0 ? attachments : undefined,
        deletedAttachmentIds: deletedAttachmentIds,
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

  if (isLoading) {
    return <DefaultSpinner />;
  }

  if (!announcement) {
    return (
      <div className="w-full p-4">
        <p className="text-muted-foreground text-center">공지사항을 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <SEO title="공지사항 수정" />
      <div className="w-full p-4">
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">공지사항 수정</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            공지사항을 수정하세요
          </p>
        </div>

        <AnnouncementForm
          initialData={announcement}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/admin/announcements")}
          isSubmitting={isPending || isSubmitting}
        />
      </div>
    </>
  );
}
