import { Button } from "@/components/ui/button";
import { Link } from "react-router";

export default function IndexPage() {
  return (
    <div>
      <h1 className="">indexpage</h1>
      <Button>
        <div>홈으로 이동</div>
      </Button>
      <Button variant={"outline"} size={"lg"} asChild>
        <Link to={"/home"}>홈으로 이동</Link>
      </Button>
    </div>
  );
}
