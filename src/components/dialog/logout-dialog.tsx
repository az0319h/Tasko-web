import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { DialogClose } from "@radix-ui/react-dialog";
import logo_character_dark from "@/assets/logo_character_dark.svg";
import logo_character_light from "@/assets/logo_character_light.svg";
import { useResolvedThemeMode } from "@/hooks";
import { useTranslation } from "react-i18next";

export default function LogoutDialog({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const mode = useResolvedThemeMode();

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <div className="flex justify-center">
            {mode === "light" ? (
              <img src={logo_character_dark} alt="logo_character" className="size-10 md:size-12" />
            ) : (
              <img src={logo_character_light} alt="logo_character" className="size-10 md:size-12" />
            )}
          </div>
        </DialogHeader>

        <div>
          <p className="text-18-semibold md:text-20-semibold mb-2"> {t("dialog.logout.title")}</p>
          <span className="text-14-regular md:text-16-regular text-muted-foreground">
            {t("dialog.logout.description")}
          </span>
        </div>

        <DialogFooter>
          <div className="flex w-full flex-col-reverse gap-2 md:gap-3">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <DialogClose asChild>
              <Button type="button" className="xs:text-14-semibold">
                {t("common.logout")}
              </Button>
            </DialogClose>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
