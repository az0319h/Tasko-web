import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/mutations/use-sign-out";
import { generateErrorMessage } from "@/lib/error";
import { useSetSession } from "@/store/session";
import { toast } from "sonner";

export default function IndexPage() {
  const setSession = useSetSession();
  const { mutate: signOut } = useSignOut({
    onSuccess: () => {
      setSession(null);
    },
    onError: (error) => {
      const message = generateErrorMessage(error);
      toast.error(message, {
        position: "bottom-right",
      });
    },
  });

  return (
    <div>
      <Button type="button" onClick={() => signOut()}>
        로그아웃
      </Button>
    </div>
  );
}
