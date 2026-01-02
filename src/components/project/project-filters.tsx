import React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { 
  Filter, 
  ChevronDown, 
  Check,
  Clock,
  CheckCircle,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X
} from 'lucide-react';

// 필터 옵션 타입
export type ProjectStatus = 'all' | 'inProgress' | 'done';
export type SortBy = 'created_at' | 'due_date' | 'title';
export type SortOrder = 'asc' | 'desc';

// 필터 상태 인터페이스
export interface ProjectFilters {
  status: ProjectStatus;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

// 필터 변경 핸들러
export interface ProjectFiltersProps {
  filters: ProjectFilters;
  onFiltersChange: (filters: ProjectFilters) => void;
  resultCount?: number;
  className?: string;
}

// 상태 옵션 설정
const statusOptions = [
  { value: 'all' as const, label: '전체 상태', icon: Filter, count: 0 },
  { value: 'inProgress' as const, label: '진행중', icon: Clock, count: 0 },
  { value: 'done' as const, label: '완료', icon: CheckCircle, count: 0 },
];

// 정렬 옵션 설정
const sortOptions = [
  { value: 'created_at' as const, label: '생성일' },
  { value: 'due_date' as const, label: '완료예정일' },
  { value: 'title' as const, label: '제목' },
];

const ProjectFilters: React.FC<ProjectFiltersProps> = ({
  filters,
  onFiltersChange,
  resultCount,
  className = ""
}) => {
  // 필터 상태 업데이트 핸들러
  const updateFilters = (updates: Partial<ProjectFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  };

  // 필터 초기화
  const resetFilters = () => {
    onFiltersChange({
      status: 'all',
      sortBy: 'created_at',
      sortOrder: 'desc'
    });
  };

  // 활성 필터 개수 계산
  const activeFiltersCount = [
    filters.status !== 'all',
    filters.sortBy !== 'created_at' || filters.sortOrder !== 'desc'
  ].filter(Boolean).length;

  // 현재 상태 라벨 가져오기
  const currentStatusLabel = statusOptions.find(opt => opt.value === filters.status)?.label || '전체 상태';
  const currentSortLabel = sortOptions.find(opt => opt.value === filters.sortBy)?.label || '생성일';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 상태 필터 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            <Filter className="w-4 h-4 mr-2" />
            {currentStatusLabel}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>프로젝트 상태</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup 
            value={filters.status} 
            onValueChange={(value) => updateFilters({ status: value as ProjectStatus })}
          >
            {statusOptions.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      {option.label}
                    </div>
                    {filters.status === option.value && (
                      <Check className="w-4 h-4 text-blue-600" />
                    )}
                  </div>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 정렬 필터 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-9">
            {filters.sortOrder === 'asc' ? (
              <ArrowUp className="w-4 h-4 mr-2" />
            ) : (
              <ArrowDown className="w-4 h-4 mr-2" />
            )}
            {currentSortLabel}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>정렬 기준</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup 
            value={filters.sortBy} 
            onValueChange={(value) => updateFilters({ sortBy: value as SortBy })}
          >
            {sortOptions.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {option.label}
                  </div>
                  {filters.sortBy === option.value && (
                    <Check className="w-4 h-4 text-blue-600" />
                  )}
                </div>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          
          <DropdownMenuSeparator />
          <DropdownMenuLabel>정렬 순서</DropdownMenuLabel>
          <DropdownMenuRadioGroup 
            value={filters.sortOrder} 
            onValueChange={(value) => updateFilters({ sortOrder: value as SortOrder })}
          >
            <DropdownMenuRadioItem value="desc">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <ArrowDown className="w-4 h-4" />
                  내림차순
                </div>
                {filters.sortOrder === 'desc' && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </div>
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="asc">
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <ArrowUp className="w-4 h-4" />
                  오름차순
                </div>
                {filters.sortOrder === 'asc' && (
                  <Check className="w-4 h-4 text-blue-600" />
                )}
              </div>
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 활성 필터 표시 */}
      {activeFiltersCount > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {activeFiltersCount}개 필터 적용됨
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-6 px-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <X className="w-3 h-3 mr-1" />
            초기화
          </Button>
        </div>
      )}

      {/* 결과 개수 표시 */}
      {typeof resultCount === 'number' && (
        <div className="text-sm text-gray-500 ml-auto">
          {resultCount}개 결과
        </div>
      )}
    </div>
  );
};

// 필터 요약 컴포넌트 (선택적으로 사용)
export const ProjectFiltersummary: React.FC<{
  filters: ProjectFilters;
  searchQuery?: string;
  resultCount?: number;
}> = ({ filters, searchQuery, resultCount }) => {
  const hasFilters = filters.status !== 'all' || searchQuery;
  
  if (!hasFilters) return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
      <Filter className="w-4 h-4" />
      <span>필터 적용:</span>
      
      {searchQuery && (
        <Badge variant="outline" className="text-xs">
          검색: "{searchQuery}"
        </Badge>
      )}
      
      {filters.status !== 'all' && (
        <Badge variant="outline" className="text-xs">
          상태: {statusOptions.find(opt => opt.value === filters.status)?.label}
        </Badge>
      )}
      
      {typeof resultCount === 'number' && (
        <span className="ml-auto font-medium">
          {resultCount}개 결과
        </span>
      )}
    </div>
  );
};

export default ProjectFilters;
