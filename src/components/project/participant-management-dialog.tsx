import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useProjectParticipants, useAddProjectParticipants, useRemoveProjectParticipant, useProfiles, useCurrentProfile } from "@/hooks";
import { useDebounce } from "@/hooks";
import { Trash2, UserPlus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/api/project";

interface ParticipantManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

/**
 * 참여자 관리 다이얼로그
 * 참여자 추가/삭제 기능 제공
 */
export function ParticipantManagementDialog({
  open,
  onOpenChange,
  project,
}: ParticipantManagementDialogProps) {
  const { data: participants, isLoading: participantsLoading } = useProjectParticipants(project?.id);
  const { data: profiles } = useProfiles();
  const { data: currentProfile } = useCurrentProfile();
  const addParticipants = useAddProjectParticipants();
  const removeParticipant = useRemoveProjectParticipant();

  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string; email: string } | null>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // 현재 참여자 ID 목록
  const participantIds = participants?.map((p) => p.user_id) || [];

  // 추가 가능한 프로필 목록 (프로필 완료된 사용자, 활성 상태 사용자, 아직 참여하지 않은 사용자)
  const availableProfiles = useMemo(() => {
    const filtered = profiles?.filter(
      (profile) =>
        profile.profile_completed &&
        profile.is_active &&
        !participantIds.includes(profile.id)
    ) || [];

    // 검색 필터링
    if (!debouncedSearch.trim()) {
      return filtered;
    }

    const query = debouncedSearch.toLowerCase();
    return filtered.filter((profile) => {
      const name = (profile.full_name || "").toLowerCase();
      const email = (profile.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [profiles, participantIds, debouncedSearch]);

  // 참여자 추가 핸들러
  const handleAddParticipants = async () => {
    if (!project || selectedUserIds.size === 0) return;

    try {
      await addParticipants.mutateAsync({
        projectId: project.id,
        userIds: Array.from(selectedUserIds),
      });
      setSelectedUserIds(new Set());
      setSearchQuery("");
    } catch (error) {
      // 에러는 mutation의 onError에서 처리됨
    }
  };

  // 참여자 삭제 확인 다이얼로그 열기
  const handleDeleteClick = (participant: { user_id: string; profile: { full_name: string | null; email: string } | null }) => {
    if (!project || !participant.profile) return;

    // 프로젝트 생성자는 삭제 불가
    if (project.created_by === participant.user_id) {
      toast.error("프로젝트 생성자는 삭제할 수 없습니다.");
      return;
    }

    setUserToDelete({
      id: participant.user_id,
      name: participant.profile.full_name || participant.profile.email,
      email: participant.profile.email,
    });
    setDeleteConfirmOpen(true);
  };

  // 참여자 삭제 핸들러
  const handleRemoveParticipant = async () => {
    if (!project || !userToDelete) return;

    try {
      await removeParticipant.mutateAsync({
        projectId: project.id,
        userId: userToDelete.id,
      });
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    } catch (error) {
      // 에러는 mutation의 onError에서 처리됨
    }
  };

  // Checkbox 토글 핸들러
  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUserIds(newSelected);
  };

  // 다이얼로그가 열릴 때 선택 상태 초기화
  useEffect(() => {
    if (open) {
      setSelectedUserIds(new Set());
      setSearchQuery("");
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>참여자 관리</DialogTitle>
          <DialogDescription>
            프로젝트에 참여하는 사용자를 추가하거나 삭제할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 참여자 추가 섹션 */}
          <div className="space-y-2">
            <Label>참여자 추가</Label>
            <p className="text-sm text-muted-foreground">
              여러명을 선택하여 한 번에 추가할 수 있습니다.
            </p>
            {/* 검색 입력 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름 또는 이메일로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {/* 사용자 선택 리스트 */}
            <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto space-y-2">
              {availableProfiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {debouncedSearch ? "검색 결과가 없습니다." : "추가할 사용자가 없습니다."}
                </p>
              ) : (
                availableProfiles.map((profile) => {
                  const isSelected = selectedUserIds.has(profile.id);
                  return (
                    <label
                      key={profile.id}
                      className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleUser(profile.id)}
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {profile.full_name || "이름 없음"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {profile.email}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <Button
              onClick={handleAddParticipants}
              disabled={selectedUserIds.size === 0 || addParticipants.isPending}
              className="w-full"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              {selectedUserIds.size > 0
                ? `${selectedUserIds.size}명 추가`
                : "참여자 추가"}
            </Button>
          </div>

          {/* 참여자 목록 */}
          <div className="space-y-2">
            <Label>참여자 목록</Label>
            {participantsLoading ? (
              <p className="text-sm text-muted-foreground">로딩 중...</p>
            ) : participants && participants.length > 0 ? (
              <div className="border rounded-md divide-y">
                {participants
                  ?.filter((participant) => participant.profile !== null) // profile이 null인 참여자 제외
                  .map((participant) => {
                    const isCreator = project?.created_by === participant.user_id;
                    const isCurrentUser = currentProfile?.id === participant.user_id;
                    // 이미 필터링했으므로 profile은 null이 아님
                    const profile = participant.profile!;
                    return (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-3"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {profile.full_name || "이름 없음"}
                            {isCreator && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (생성자)
                              </span>
                            )}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (나)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {profile.email}
                          </p>
                        </div>
                      {!isCreator && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteClick(participant)}
                          disabled={removeParticipant.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">참여자가 없습니다.</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>

      {/* 참여자 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>참여자 제거</AlertDialogTitle>
            <AlertDialogDescription>
              {userToDelete && (
                <>
                  정말로 <strong>{userToDelete.name}</strong> ({userToDelete.email}) 님을
                  프로젝트에서 제거하시겠습니까?
                  <br />
                  진행중인 Task가 있는 경우 제거할 수 없습니다.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeParticipant.isPending}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveParticipant}
              disabled={removeParticipant.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeParticipant.isPending ? "제거 중..." : "제거"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

