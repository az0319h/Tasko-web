import { useMemo, useState, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import koLocale from "@fullcalendar/core/locales/ko";
import type { EventDropArg, EventClickArg, DatesSetArg, EventContentArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { useNavigate, useSearchParams } from "react-router";
import { useTaskSchedules, useUpdateTaskSchedule } from "@/hooks/queries/use-schedules";
import { convertToFullCalendarEvents } from "@/utils/schedule";
import DefaultSpinner from "../common/default-spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { createRoot } from "react-dom/client";
import type { TaskScheduleWithTask } from "@/types/schedule";
// FullCalendar v6 automatically injects CSS, no manual import needed

interface TaskCalendarProps {
  initialView?: "dayGridMonth" | "timeGridWeek" | "timeGridDay";
}

export function TaskCalendar({ initialView = "dayGridMonth" }: TaskCalendarProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const scheduleMapRef = useRef<Map<string, TaskScheduleWithTask>>(new Map());

  // Convert schedules to FullCalendar events
  const events = useMemo(() => {
    // Schedule map을 업데이트 (tooltip에서 사용)
    scheduleMapRef.current.clear();
    schedules.forEach((schedule) => {
      scheduleMapRef.current.set(schedule.id, schedule);
    });
    return convertToFullCalendarEvents(schedules);
  }, [schedules]);

  // Handle date range changes from FullCalendar
  // Also updates URL search params when view changes
  const handleDatesSet = (arg: DatesSetArg) => {
    // FullCalendar provides start and end dates for the current view
    setStartDate(arg.start);
    setEndDate(arg.end);

    // Update URL search params based on current view
    const viewType = arg.view.type;
    let viewParam: string;
    
    if (viewType === "timeGridWeek") {
      viewParam = "week";
    } else if (viewType === "timeGridDay") {
      viewParam = "day";
    } else {
      viewParam = "month"; // dayGridMonth
    }

    // URL 파라미터 업데이트 (replace: true로 브라우저 히스토리 쌓지 않음)
    const newParams = new URLSearchParams(searchParams);
    const currentViewParam = newParams.get("view");
    
    // 현재 URL 파라미터와 다를 때만 업데이트 (무한 루프 방지)
    if (currentViewParam !== viewParam) {
      if (viewParam === "month") {
        // 기본값이므로 파라미터에서 제거
        newParams.delete("view");
      } else {
        newParams.set("view", viewParam);
      }
      setSearchParams(newParams, { replace: true });
    }
  };

  // Format date for display
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "미정";
    const date = new Date(dateString);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // Format time for display (HH:mm format)
  const formatTime = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  // Handle event click - navigate to task detail page
  const handleEventClick = (info: EventClickArg) => {
    const taskId = info.event.extendedProps?.taskId;
    if (taskId) {
      navigate(`/tasks/${taskId}`);
    }
  };

  // Handle event content rendering - display instructions and schedule time with tooltip
  const handleEventContent = (arg: EventContentArg) => {
    const schedule = scheduleMapRef.current.get(arg.event.id);
    if (!schedule) {
      // Fallback to default title if schedule not found
      return { html: arg.event.title };
    }

    const task = schedule.task;
    const startTime = schedule.start_time instanceof Date ? schedule.start_time : new Date(schedule.start_time);
    const endTime = schedule.end_time instanceof Date ? schedule.end_time : new Date(schedule.end_time);
    
    // 지시사항 (task title)
    const instructions = task.title;
    
    // 일정 관리 시간 (HH:mm - HH:mm 형식)
    const timeRange = schedule.is_all_day 
      ? "종일" 
      : `${formatTime(startTime)} - ${formatTime(endTime)}`;

    // Tooltip 내용 생성
    const tooltipContent = [
      `고유 ID: ${task.id.slice(0, 8).toUpperCase()}`,
      task.client_name && `고객명: ${task.client_name}`,
      `지시사항: ${task.title}`,
      `생성일: ${formatDate(task.created_at)}`,
      task.due_date && `마감일: ${formatDate(task.due_date)}`,
    ]
      .filter(Boolean)
      .join("\n");

    // DOM 요소 생성 (tooltip을 포함한 wrapper)
    const wrapper = document.createElement("div");
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    wrapper.style.cursor = "pointer";
    
    // React 컴포넌트로 tooltip과 내용 렌더링
    const root = createRoot(wrapper);
    
    root.render(
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            style={{ 
              width: "100%", 
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "2px 4px",
              fontSize: "12px",
              lineHeight: "1.3"
            }}
          >
            {/* 지시사항 */}
            <div 
              style={{
                fontWeight: "500",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap"
              }}
            >
              {instructions}
            </div>
            {/* 시간 */}
            <div 
              style={{
                fontSize: "11px",
                opacity: "0.8"
              }}
            >
              {timeRange}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs whitespace-pre-line text-left">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );

    return { domNodes: [wrapper] };
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
      <DefaultSpinner />
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
        eventContent={handleEventContent}
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
