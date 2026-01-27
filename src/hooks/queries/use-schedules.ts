import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getTaskSchedules, updateTaskSchedule } from "@/api/schedule";
import type { TaskScheduleWithTask, TaskSchedule } from "@/types/schedule";

/**
 * Get task schedules for a date range
 * 
 * @param startDate Start date of the range
 * @param endDate End date of the range
 * @param excludeApproved Whether to exclude approved tasks (default: true)
 */
export function useTaskSchedules(
  startDate: Date,
  endDate: Date,
  excludeApproved: boolean = true
) {
  return useQuery<TaskScheduleWithTask[]>({
    queryKey: ["task-schedules", startDate, endDate, excludeApproved],
    queryFn: () => getTaskSchedules(startDate, endDate, excludeApproved),
    staleTime: 30 * 1000,
  });
}

/**
 * Update task schedule mutation
 */
export function useUpdateTaskSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: {
        start_time?: Date;
        end_time?: Date;
        is_all_day?: boolean;
      };
    }) => updateTaskSchedule(id, updates),
    onSuccess: () => {
      // Invalidate all schedule queries to refetch
      queryClient.invalidateQueries({ queryKey: ["task-schedules"] });
    },
  });
}
