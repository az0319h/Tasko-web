import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn, getResolvedThemeMode } from "@/lib/utils";

import logo_dark from "@/assets/logo_dark.png";
import logo_light from "@/assets/logo_light.png";

import { useNavigate } from "react-router";

import { useSignInWithPassword } from "@/hooks/mutations/use-sign-in-with-password";

import { toast } from "sonner";
import { generateErrorMessage } from "@/lib/error";
import { signInSchema, type SigninFormValues } from "@/schemas/auth/sign-in-schema";

export function SigninForm({ ...props }: React.ComponentProps<typeof Card>) {
  const mode = getResolvedThemeMode();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    resetField,
    formState: { errors },
  } = useForm<SigninFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const { mutate: signInWithPassword, isPending: isSignInWithPasswordPending } =
    useSignInWithPassword({
      onSuccess: () => {
        navigate("/", { replace: true });
      },
      onError: async (error, variables) => {
        if (error.code === "email_not_confirmed") {
          navigate("/verify-otp", {
            replace: true,
            state: { email: variables.email, autoResend: true },
          });
          return;
        }

        const message = generateErrorMessage(error);

        toast.error(message, {
          position: "bottom-right",
        });

        resetField("password");
      },
    });

  function onSubmit(data: SigninFormValues) {
    signInWithPassword({
      email: data.email,
      password: data.password,
    });
  }
  return (
    <Card className={cn("border-0 outline-0")} {...props}>
      <CardHeader>
        <div className="flex flex-col items-center gap-4">
          <img
            src={mode === "light" ? logo_dark : logo_light}
            alt="logo_character"
            className="size-10"
          />
          <CardTitle className="text-20-medium text-center">Sign in to Tasko</CardTitle>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FieldSet disabled={isSignInWithPasswordPending}>
            <FieldGroup>
              {/* Email */}
              <Field data-invalid={!!errors.email}>
                <FieldLabel htmlFor="email">이메일</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@basspat.co"
                  {...register("email")}
                />
                {errors.email ? (
                  <FieldError errors={[errors.email]} />
                ) : (
                  <FieldDescription>이메일 주소를 입력해주세요.</FieldDescription>
                )}
              </Field>

              {/* Password */}
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">비밀번호</FieldLabel>
                <Input id="password" type="password" {...register("password")} />
                {errors.password ? (
                  <FieldError errors={[errors.password]} />
                ) : (
                  <FieldDescription>비밀번호를 입력해주세요.</FieldDescription>
                )}
              </Field>

              <Field>
                <Button type="submit">로그인</Button>

                <FieldDescription className="px-6 text-center">
                  이 서비스는 초대받은 사용자만 이용할 수 있습니다.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
        </form>
      </CardContent>
    </Card>
  );
}
