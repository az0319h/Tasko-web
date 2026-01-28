import type { TaskScheduleWithTask, FullCalendarEvent, TaskStatus } from "@/types/schedule";

/**
 * Convert TaskScheduleWithTask to FullCalendar event format
 */
export function convertToFullCalendarEvents(
  schedules: TaskScheduleWithTask[]
): FullCalendarEvent[] {
  return schedules
    .filter((schedule) => schedule.task.task_status !== "APPROVED") // 승인됨 상태는 제외
    .map((schedule) => {
      // 종일 일정의 경우 end가 없을 수 있으므로 확인
      let endTime = schedule.end_time;
      if (schedule.is_all_day && endTime) {
        // 종일 일정의 경우 end_time이 다음 날 00:00:00일 수 있으므로
        // FullCalendar가 올바르게 처리하도록 Date 객체로 변환
        endTime = new Date(endTime);
      }

      const status = schedule.task.task_status;
      const backgroundColor = getStatusColor(status);

      const event = {
        id: schedule.id,
        title: schedule.task.title,
        start: schedule.start_time instanceof Date ? schedule.start_time : new Date(schedule.start_time),
        end: endTime instanceof Date ? endTime : endTime ? new Date(endTime) : undefined,
        allDay: schedule.is_all_day,
        backgroundColor,
        editable: true, // 드래그/리사이즈 가능하도록 명시적으로 설정
        extendedProps: {
          taskId: schedule.task_id,
          taskCategory: schedule.task.task_category,
          taskStatus: schedule.task.task_status,
          taskClientName: schedule.task.client_name,
          taskCreatedAt: schedule.task.created_at,
          taskDueDate: schedule.task.due_date,
        },
      };

      console.log("이벤트 변환:", {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        editable: event.editable,
        backgroundColor: event.backgroundColor,
      });

      return event;
    });
}

/**
 * Get color for task status
 * 이미지와 동일한 색상 사용 (할당됨: 파란색, 진행중: 노란색, 확인대기: 주황색, 거부됨: 빨간색)
 * index.css의 chart 색상과 유사한 Tailwind 표준 색상 사용
 */
export function getStatusColor(status: TaskStatus): string {
  // 이미지에서 본 색상과 유사한 Tailwind 표준 색상 사용
  // index.css의 chart 색상과 유사한 톤
  const statusColors: Record<TaskStatus, string> = {
    ASSIGNED: "#3b82f6", // blue-500 - 파란색 (chart-2와 유사)
    IN_PROGRESS: "#eab308", // yellow-500 - 노란색 (chart-4와 유사)
    WAITING_CONFIRM: "#f97316", // orange-500 - 주황색 (chart-1과 유사)
    APPROVED: "#22c55e", // green-500 (사용되지 않음 - 필터링됨)
    REJECTED: "#ef4444", // red-500 - 빨간색 (destructive와 유사)
  };
  return statusColors[status] || "#3b82f6";
}
