-- 이메일 변경 시 profiles.email을 자동으로 동기화하는 트리거 함수
CREATE OR REPLACE FUNCTION sync_profile_email_on_auth_email_change()
RETURNS TRIGGER AS $$
BEGIN
  -- auth.users.email이 변경되면 profiles.email도 업데이트
  IF OLD.email IS DISTINCT FROM NEW.email THEN
    UPDATE public.profiles
    SET email = NEW.email, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 생성: auth.users.email 변경 시 자동 실행
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_email_on_auth_email_change();

