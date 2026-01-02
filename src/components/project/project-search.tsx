import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, Loader2 } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';

interface ProjectSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  debounceMs?: number;
  className?: string;
}

const ProjectSearch: React.FC<ProjectSearchProps> = ({
  value,
  onChange,
  placeholder = "프로젝트 제목, 클라이언트명, 특허명으로 검색...",
  isLoading = false,
  debounceMs = 300,
  className = ""
}) => {
  const [inputValue, setInputValue] = useState(value);
  const debouncedValue = useDebounce(inputValue, debounceMs);

  // 디바운스된 값이 변경되면 부모 컴포넌트에 알림
  useEffect(() => {
    onChange(debouncedValue);
  }, [debouncedValue, onChange]);

  // 외부에서 value가 변경되면 입력값도 동기화 (예: 초기화)
  useEffect(() => {
    if (value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  const handleClear = () => {
    setInputValue('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Enter 키 누르면 즉시 검색 (디바운스 무시)
    if (e.key === 'Enter') {
      onChange(inputValue);
    }
    
    // ESC 키 누르면 검색어 초기화
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {/* 검색 아이콘 */}
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
        
        {/* 검색 입력창 */}
        <Input
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-20"
          disabled={isLoading}
        />
        
        {/* 우측 아이콘들 */}
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {/* 로딩 인디케이터 */}
          {isLoading && (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
          )}
          
          {/* 검색어 초기화 버튼 */}
          {inputValue && !isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 hover:bg-gray-100"
              title="검색어 초기화"
            >
              <X className="w-3 h-3 text-gray-400" />
            </Button>
          )}
        </div>
      </div>
      
      {/* 검색 힌트 */}
      {inputValue && inputValue !== debouncedValue && (
        <div className="absolute top-full left-0 right-0 mt-1 p-2 bg-white border border-gray-200 rounded-md shadow-sm z-10">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Search className="w-3 h-3" />
            "{inputValue}"로 검색 중...
          </p>
        </div>
      )}
      
      {/* 검색 결과 힌트 */}
      {debouncedValue && (
        <div className="mt-2">
          <p className="text-xs text-gray-500">
            검색어: "{debouncedValue}" 
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleClear}
              className="p-0 h-auto text-xs ml-2 text-blue-600"
            >
              초기화
            </Button>
          </p>
        </div>
      )}
    </div>
  );
};

export default ProjectSearch;
