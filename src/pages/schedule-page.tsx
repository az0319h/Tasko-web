import { useSearchParams } from "react-router";
import { TaskCalendar } from "@/components/schedule/task-calendar";

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

  return (
    <div className=" md:p-4 ">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">일정 관리</h1>
        <p className="text-muted-foreground mt-2">
          Task 기반 일정을 캘린더에서 확인하고 관리할 수 있습니다.
        </p>
      </div>
      <div className="bg-card rounded-lg border p-4 md:p-6">
        <TaskCalendar initialView={initialView} />
      </div>
    </div>
  );
}
