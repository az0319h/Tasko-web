import type { TaskScheduleWithTask, FullCalendarEvent, TaskCategory } from "@/types/schedule";

/**
 * Convert TaskScheduleWithTask to FullCalendar event format
 */
export function convertToFullCalendarEvents(
  schedules: TaskScheduleWithTask[]
): FullCalendarEvent[] {
  return schedules.map((schedule) => {
    // 종일 일정의 경우 end가 없을 수 있으므로 확인
    let endTime = schedule.end_time;
    if (schedule.is_all_day && endTime) {
      // 종일 일정의 경우 end_time이 다음 날 00:00:00일 수 있으므로
      // FullCalendar가 올바르게 처리하도록 Date 객체로 변환
      endTime = new Date(endTime);
    }

    const event = {
      id: schedule.id,
      title: schedule.task.title,
      start: schedule.start_time instanceof Date ? schedule.start_time : new Date(schedule.start_time),
      end: endTime instanceof Date ? endTime : endTime ? new Date(endTime) : undefined,
      allDay: schedule.is_all_day,
      backgroundColor: getCategoryColor(schedule.task.task_category),
      editable: true, // 드래그/리사이즈 가능하도록 명시적으로 설정
      extendedProps: {
        taskId: schedule.task_id,
        taskCategory: schedule.task.task_category,
        taskStatus: schedule.task.task_status,
      },
    };

    console.log("이벤트 변환:", {
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      editable: event.editable,
    });

    return event;
  });
}

/**
 * Get color for task category
 */
export function getCategoryColor(category: TaskCategory): string {
  const colors: Record<TaskCategory, string> = {
    REVIEW: "#3b82f6", // 파란색
    REVISION: "#f97316", // 주황색
    CONTRACT: "#22c55e", // 초록색
    SPECIFICATION: "#a855f7", // 보라색
    APPLICATION: "#ec4899", // 분홍색
  };
  return colors[category] || "#6b7280";
}
