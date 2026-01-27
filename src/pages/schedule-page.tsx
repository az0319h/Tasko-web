import { TaskCalendar } from "@/components/schedule/task-calendar";

export default function SchedulePage() {
  return (
    <div className=" md:p-4 ">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">일정 관리</h1>
        <p className="text-muted-foreground mt-2">
          Task 기반 일정을 캘린더에서 확인하고 관리할 수 있습니다.
        </p>
      </div>
      <div className="bg-card rounded-lg border p-4 md:p-6">
        <TaskCalendar initialView="dayGridMonth" />
      </div>
    </div>
  );
}
