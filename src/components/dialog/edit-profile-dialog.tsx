import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "../ui/field";
import { Input } from "../ui/input";
import {
  profileUpdateSchema,
  type ProfileUpdateFormValues,
} from "@/schemas/profile/profile-schema";
import { useUpdateProfile, useCurrentProfile } from "@/hooks";
import { toast } from "sonner";
import { generateErrorMessage } from "@/lib/error";
import { useState, useEffect } from "react";

export default function EditProfileDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: currentProfile } = useCurrentProfile();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ProfileUpdateFormValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      full_name: "",
      position: "",
      phone: "",
    },
  });

  // 다이얼로그가 열릴 때 프로필 데이터로 폼 초기화
  useEffect(() => {
    if (open && currentProfile) {
      reset({
        full_name: currentProfile.full_name ?? "",
        position: currentProfile.position ?? "",
        phone: currentProfile.phone ?? "",
      });
    }
  }, [open, currentProfile, reset]);

  const { mutate: updateProfile, isPending } = useUpdateProfile({
    onSuccess: () => {
      toast.success("프로필이 수정되었습니다.", {
        position: "bottom-right",
      });
      setOpen(false);
    },
    onError: (error) => {
      const message = generateErrorMessage(error);
      toast.error(message, {
        position: "bottom-right",
      });
    },
  });

  function onSubmit(data: ProfileUpdateFormValues) {
    updateProfile({
      full_name: data.full_name,
      position: data.position,
      phone: data.phone,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>

      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>프로필 수정</DialogTitle>
          <DialogDescription>프로필 정보를 수정할 수 있습니다.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldSet disabled={isPending}>
            <FieldGroup>
              {/* Email (읽기 전용) */}
              <Field>
                <FieldLabel htmlFor="email">이메일</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  value={currentProfile?.email ?? ""}
                  disabled
                  className="bg-muted"
                />
                <FieldDescription>이메일은 변경할 수 없습니다.</FieldDescription>
              </Field>

              {/* Full Name */}
              <Field data-invalid={!!errors.full_name}>
                <FieldLabel htmlFor="full_name">이름</FieldLabel>
                <Input
                  id="full_name"
                  type="text"
                  placeholder="홍길동"
                  {...register("full_name")}
                />
                {errors.full_name ? (
                  <FieldError errors={[errors.full_name]} />
                ) : (
                  <FieldDescription>이름을 입력해주세요.</FieldDescription>
                )}
              </Field>

              {/* Position */}
              <Field data-invalid={!!errors.position}>
                <FieldLabel htmlFor="position">직책</FieldLabel>
                <Input
                  id="position"
                  type="text"
                  placeholder="예: 개발자, 디자이너"
                  {...register("position")}
                />
                {errors.position ? (
                  <FieldError errors={[errors.position]} />
                ) : (
                  <FieldDescription>직책을 입력해주세요.</FieldDescription>
                )}
              </Field>

              {/* Phone */}
              <Field data-invalid={!!errors.phone}>
                <FieldLabel htmlFor="phone">전화번호</FieldLabel>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="010-1234-5678"
                  {...register("phone")}
                />
                {errors.phone ? (
                  <FieldError errors={[errors.phone]} />
                ) : (
                  <FieldDescription>전화번호를 입력해주세요.</FieldDescription>
                )}
              </Field>
            </FieldGroup>
          </FieldSet>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

