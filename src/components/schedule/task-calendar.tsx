import { useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import type { EventDropArg, EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { useNavigate } from "react-router";
import { useTaskSchedules, useUpdateTaskSchedule } from "@/hooks/queries/use-schedules";
import { convertToFullCalendarEvents } from "@/utils/schedule";
// FullCalendar v6 automatically injects CSS, no manual import needed

interface TaskCalendarProps {
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
}

export function TaskCalendar({ initialView = "dayGridMonth" }: TaskCalendarProps) {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date>(() => {
    // Initialize with current month start
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    // Initialize with current month end
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  });

  // Fetch schedules for the current date range
  const { data: schedules = [], isLoading, error } = useTaskSchedules(startDate, endDate, true);
  const updateScheduleMutation = useUpdateTaskSchedule();

  // Convert schedules to FullCalendar events
  const events = useMemo(() => {
    return convertToFullCalendarEvents(schedules);
  }, [schedules]);

  // Handle date range changes from FullCalendar
  const handleDatesSet = (arg: DatesSetArg) => {
    // FullCalendar provides start and end dates for the current view
    setStartDate(arg.start);
    setEndDate(arg.end);
  };

  // Handle event click - navigate to task detail page
  const handleEventClick = (info: EventClickArg) => {
    const taskId = info.event.extendedProps?.taskId;
    if (taskId) {
      navigate(`/tasks/${taskId}`);
    }
  };

  // Handle event drop - update schedule (날짜/시간 변경)
  const handleEventDrop = async (info: EventDropArg) => {
    try {
      console.log("일정 드래그 시작:", {
        eventId: info.event.id,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay,
        viewType: info.view.type,
      });

      // 시간 기반 뷰(timeGridWeek, timeGridDay)에서 드래그하면 종일 일정이 아닌 것으로 변경
      const viewType = info.view.type;
      const isTimeBasedView = viewType === "timeGridWeek" || viewType === "timeGridDay";
      const shouldBeAllDay = info.event.allDay && !isTimeBasedView;

      // 종일 일정의 경우 end가 없을 수 있으므로 start_time을 기준으로 계산
      let endTime = info.event.end;
      if (!endTime && info.event.start) {
        // 종일 일정인 경우 하루 종료 시간으로 설정
        if (shouldBeAllDay) {
          endTime = new Date(info.event.start);
          endTime.setHours(23, 59, 59, 999);
        } else {
          // 시간 기반 일정인 경우 기본 1시간
          endTime = new Date(info.event.start.getTime() + 60 * 60 * 1000);
        }
      }

      console.log("일정 업데이트 요청:", {
        id: info.event.id,
        start_time: info.event.start,
        end_time: endTime,
        is_all_day: shouldBeAllDay,
      });

      await updateScheduleMutation.mutateAsync({
        id: info.event.id,
        updates: {
          start_time: info.event.start!,
          end_time: endTime || info.event.start!,
          is_all_day: shouldBeAllDay,
        },
      });

      console.log("일정 이동 성공");
    } catch (error) {
      // Revert the event on error
      console.error("일정 이동 실패:", error);
      if (error instanceof Error) {
        console.error("에러 메시지:", error.message);
        console.error("에러 스택:", error.stack);
      }
      info.revert();
    }
  };

  // Handle event resize - update schedule (기간/시간 조정)
  const handleEventResize = async (info: EventResizeDoneArg) => {
    try {
      console.log("일정 리사이즈 시작:", {
        eventId: info.event.id,
        start: info.event.start,
        end: info.event.end,
        allDay: info.event.allDay,
      });

      // 리사이즈는 시간 기반 뷰에서만 가능하므로 종일 일정이 아님
      const endTime = info.event.end || new Date(info.event.start!.getTime() + 60 * 60 * 1000);

      console.log("일정 리사이즈 업데이트 요청:", {
        id: info.event.id,
        start_time: info.event.start,
        end_time: endTime,
        is_all_day: false,
      });

      await updateScheduleMutation.mutateAsync({
        id: info.event.id,
        updates: {
          start_time: info.event.start!,
          end_time: endTime,
          is_all_day: false, // 리사이즈는 시간 기반 뷰에서만 가능하므로 항상 false
        },
      });

      console.log("일정 리사이즈 성공");
    } catch (error) {
      // Revert the event on error
      console.error("일정 기간 조정 실패:", error);
      if (error instanceof Error) {
        console.error("에러 메시지:", error.message);
        console.error("에러 스택:", error.stack);
      }
      info.revert();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">일정을 불러오는 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-destructive">
          일정을 불러오는 중 오류가 발생했습니다: {error instanceof Error ? error.message : "알 수 없는 오류"}
        </div>
      </div>
    );
  }

  console.log("캘린더 렌더링:", {
    eventsCount: events.length,
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
    })),
  });

  return (
    <div className="w-full h-full">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={initialView}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        events={events}
        editable={true}
        droppable={false}
        eventStartEditable={true}
        eventDurationEditable={true}
        eventClick={handleEventClick}
        eventDrop={handleEventDrop}
        eventResize={handleEventResize}
        datesSet={handleDatesSet}
        height="auto"
        locale={koLocale}
        buttonText={{
          today: "오늘",
          month: "월",
          week: "주",
          day: "일",
        }}
        dayHeaderFormat={{ weekday: "short" }}
      />
    </div>
  );
}
