
# 🚨🚨🚨 절대 경고 — AI가 반드시 숙지해야 할 사용자 특이사항 🚨🚨🚨

> **이 사용자는 한글 인코딩 깨짐 문제로 극도로 예민한 상태이다.**
> - 과거 AI의 한글 인코딩 실수로 수백 시간의 작업이 손실되었으며, 이 문제로 인해 심리적으로 극한의 스트레스를 받았다.
> - AI와 수천 번의 대화를 통해 이 문제를 반복적으로 경고하고 규칙화했다.
> - **한글 관련 실수는 단순 오류가 아니라 이 프로젝트 전체를 위험에 빠뜨리는 치명적 사고다.**
> - **한글 관련 경고를 가볍게 여기거나 절차를 생략하는 것은 절대 금지.**
> - `grep_search`는 한글 파일에서 오탐 발생 → 한글 포함 파일 검색은 반드시 `node -e`로 검증
> - PowerShell 파일 수정 절대 금지 → 직접 편집 도구(`replace_file_content` 등)만 사용

---


## 2026-04-01 - 시험 렌더링 전면 수정

### 수정 배경
온라인 시험 화면(Canvas 02-1)에서 ① 단독형 문항 레이아웃 비효율(오른쪽이 비어있음) ② 발문이 출력되지 않고 지문만 표시되는 렌더링 버그 ③ 묶음형 하위문항도 동일 문제 발견.

### 핵심 변경 (script.js, 커밋: b3e98c3)

#### 1. GAS 필드 매핑 확인 및 렌더링 수정
- **Questions 시트**: r[6]=질문내용(발문)=`title`, r[7]=지문내용=`text`
- **Bundles 시트**: r[1]=질문내용=`title`, r[2]=지문내용=`text`
- **버그**: `renderExamContent` pair/solo에서 `q.text`를 발문 자리(`<h4>`)에, `q.passage1`(없는 필드)을 지문으로 사용 → **모두 수정**

#### 2. 레이아웃: 단독형 문항 컬럼당 2개씩 배치
- **기존**: pair(2개)/solo(1개) 타입 → 오른쪽 컬럼이 자주 비어있음
- **변경**: `columns` 타입 도입 — `left: [q1, q2], right: [q3, q4]`
  - 작은 문항(이미지 없음 + 발문+지문 합계 1000자 미만): 각 컬럼 최대 2개
  - 큰 문항(이미지 있거나 1000자 이상): 컬럼 1개 단독
- **수정 함수**: `flushSingles()` 전면 교체, `renderExamContent()` pair/solo 분기→columns, `renderSingleQHtml()` 헬퍼 신규 추가

#### 3. 묶음형 하위문항(renderSubQuestion) 동일 수정
- `q.text` → `q.title` (발문), `q.passage1` → `q.text` (개별지문)

#### 4. getInputHtml choices 배열 수정
- 기존: `q.choice1, q.choice2,...` (GAS에서 반환하지 않는 필드)
- 수정: `q.choices`(배열) 우선, 없으면 `choice1/2/3...` 폴백
- `saveAnswer` → `updateAnswer` 통일

#### 5. isLargeQuestion 필드 수정
- `q.passage1` → `q.text`로 수정 (GAS 매핑 기준)

#### 6. updatePage 미답변 확인
- `columns` 타입 지원 추가: `left/right` 배열 합산으로 미답변 계산

### 검증
- `node --check script.js` → ExitCode: 0 ✅
- 한글 인코딩 (`node -e`) → 정상 ✅

---

## 2026-03-30 (오전 세션 - 3차) - 추가 기능

### 기능 추가

#### 6. 온라인 시험: 첫/마지막 페이지 경고창 → 토스트로 개선
- **문제**: 첫 페이지 Previous / 마지막 페이지 Next 클릭 시 불필요한 미답 경고창 표시
- **수정**: 이동 불가 시 경고 없이 토스트 메시지만 표시
  - 첫 페이지 Previous → "⬅️ 첫 번째 페이지입니다." 토스트
  - 마지막 페이지 Next → "➡️ 마지막 페이지입니다." 토스트
- **파일**: `script.js` 3503줄
- **커밋**: `fed6721`

#### 7. 학생 로그인: 권장 학년과 다른 학년 선택 시 경고창 추가
- **구현**: `sgr` select에 `onchange="handleSgrGradeChange"` 추가
- **로직**: 시험지 선택 시 `window._sgrTargetGrade`에 권장 학년 저장 → 변경 시 confirm 경고
- **파일**: `script.js` 3191줄(`handleSgrGradeChange`), 9447줄(`sgr` select), 9565줄(`_sgrTargetGrade` 저장)
- **커밋**: `fed6721`

---



### 추가 버그 수정

#### 4. 오디오 업로드 용량 제한 미설정
- **문제**: 60MB 제한이어서 대용량 오디오(41.7MB) 업로드 시 GAS 한계(30초 타임아웃) 초과 → fetch 실패
- **원인**: GAS POST 수신 한도 + base64 변환 후 크기 초과
- **수정**: 60MB → **14MB** 제한 + 경고 메시지 추가 ("14MB 이하, MP3 96kbps 이하 권장")
- **테스트**: 12.5MB 파일 업로드 ✅
- **파일**: `script.js` 7894줄 `MAX_AUDIO_MB = 14`
- **커밋**: `ec99db3`

#### 5. GAS: 통합DB 시트 이름이 "통합DB"로만 생성되는 버그 (2차 수정)
- **근본 원인**: `getOrCreateSpreadsheet`에서 suffix로 기존 파일 찾은 뒤 이름 변경 없이 그대로 반환
- **수정**: 파일 찾은 후 `f.getName() !== name` 이면 `f.setName(name)` 호출
- **결과**: 기존 "통합DB" → "시험지명_통합DB" 자동 rename ✅
- **파일**: `API script.gs` 1249줄
- **커밋**: `e0eb544`
- **⚠️ GAS 재배포 완료**

---

## 2026-03-30 (오전 세션 - 2차)

### 버그 수정 3건

#### 1. GAS: 신규 통합DB/학생DB 시트 이름 오류
- **문제**: `getOrCreateSpreadsheet`에서 `SpreadsheetApp.create(suffix)`로 `_` 뒤 문자열만 써서 "통합DB"로만 생성됨
- **수정**: `SpreadsheetApp.create(name)`으로 변경 → "시험지명_통합DB" 전체 이름으로 생성
- **파일**: `API script.gs` 1259줄
- **커밋**: `e241833`
- **⚠️ GAS 재배포 필요**

#### 2. 이미지/오디오 저장 문제
- GAS 재배포 후 정상 저장 확인됨 (시트 이름 버그와 연관 가능성)

#### 3. 08-1/08-2: 변경사항 없을 때도 저장 진행되는 버그
- **문제**: 이전 세션에서 차단 로직 제거 후 복원 안 됨
- **수정**:
  - `saveRegGroup()` 앞에 `_changedItems.size === 0` → "변경된 내용이 없습니다" 토스트 + return
  - `updateBuilderQuestion()` 앞에 `_editHasChanged() === false` → "변경된 내용이 없습니다" 토스트 + return
- **근거**: `renderRegForm()` 6699~6700줄에 `_builderInitChangeTrack()` 이미 존재 → 신규 시험지 카드 추가 시 변경감지 정상 작동 확인됨
- **파일**: `script.js`
- **커밋**: `b3894b4`

---

## 2026-03-30 (오전 세션)

### Canvas 08-2: 번들 카드 연결 문항 번호 표시 및 수정 불가 처리

#### 문제
- 부분 수정 화면(08-2)에서 번들 카드에 연결 문항 번호가 표시되지 않음
- `isEditMode` 판단이 구 canvas ID `"07-2"`를 참조 → 항상 false → 연결/해제 버튼 비활성화 안됨

#### 수정 내용
- **`getComponentHtml` 7365줄**: `[data-canvas-id="07-2"]` → `[data-canvas-id="08-2"]` 수정
- **`renderEditForm` 8232줄**: `addComponent('bundle', {...})` 호출 시 `questionIds: bundleInfo.questionIds` 추가 전달
- **번들 카드 HTML**: `value=""` → `value="${d.questionIds || ''}"` 변경
- **isEditMode 시 처리**: 숨기기 제거 → input `readonly` + 연결/해제 버튼 `opacity-40 pointer-events-none`으로 수정 불가 처리
- **수정 모드 안내 문구**: `"수정 모드에서는 해당 문항 및 소속 지문만 수정 가능합니다."` → `"연결된 번들(지문)과 선택 문항만 수정 가능 (연결 번호는 불가)"`
- **exitEditMode**: 직전 카테고리 자동 복귀(`_editReturnCatId`, `handleBankCategoryChange`) 로직 제거
- **구 ID 흔적 제거**: `// --- Edit Form Builder (New 07-2) ---` 주석, `console.log('[07-2 Debug]...')` 제거

#### 추가 작업 (근본 버그 수정)
- **Canvas 08-1 `saveRegGroup`**: `_changedItems.size===0` 저장 차단 로직 제거 (`3daf937`)
- **Canvas 08-2 `updateBuilderQuestion`**: `_editHasChanged()` 차단 (1차) + `questionChanged/bundleChanged` 비교 차단 (2차) + 중복 confirm 제거 (`89d4d52`, `b64d762`)
- **Canvas 08-1 `loadQuestionsFromCategory`**: `const bundleInfo` 재할당 런타임 오류 수정 → `let`으로 변경 (`3152849`)
- **Canvas 08-1 `loadQuestionsFromCategory` 근본 버그**: 신규 시험지(문항 없음) 진입 시 `_builderLoading=true`가 해제되지 않아 이후 카드 추가해도 변경감지 마킹이 안됨 → `return` 전 `_builderLoading=false` + `_builderInitChangeTrack()` 추가 (`82fefc2`)
  - **근본 원인**: 전체 등록 버튼 → 08-1 진입 → 자동 불러오기 → 문항 없음 → 중간 return → loading 플래그 미해제 → 카드 추가해도 `_changedItems` 빈 상태 유지 → 저장 차단
- **Canvas 08/08-1/08-2 이탈 경고**: `hasUnsavedChanges()` 경고 제거, 불필요한 confirm 제거 (`ba0b6ec`, `d440659`)

#### 영향 범위 확인
- 08-1 저장/불러오기: 영향 없음 (isEditMode=false, questionIds 미전달로 기존과 동일)
- 통합DB Bundles E열(questionIds): UPDATE_QUESTION에서 시트값 직접 읽어 유지 → 변경 안됨
- Git: `d4027ab` → `74424b2` → `8d47f98` → `371b76b` → `2eda498`

---

## 2026-03-30 (새벽 세션)

### Canvas 08: 문항 관리(Question Bank) UX 개편
- **안내 텍스트 변경**: "카테고리를 선택하세요" → "시험지를 선택 후 문항 수정 버튼을 클릭하세요"
- **버튼 추가**: "문항 수정" 버튼 신규 추가 (기존 "문항 등록" → "전체 등록"으로 이름 변경)
- **동작 변경**: 시험지 선택 시 즉시 문항 목록 로드 → "문항 수정" 클릭 시 로드
- **전체 등록 경고창**: 기존 문항 있을 경우 "전체 문항 상세 내용이 로딩됩니다" 경고 후 08-1 이동 + 자동 불러오기
- **Git**: `5707fae` → `410e6b8`

### Canvas 08-1: 변경 감지 시스템 구현
- **헬퍼 함수 추가**: `_builderGetLabel()`, `_builderMarkChanged()`, `_builderInitChangeTrack()`
- **변경 추적**: `window._changedItems` Set으로 변경된 컴포넌트 UUID 추적
- **이벤트 위임**: `builder-main-area`의 input/change/drop 이벤트 감지
- **addComponent**: 신규 추가 시 자동 마킹 (`_builderLoading` 플래그로 불러오기 제외)
- **저장 버튼**: 변경 없으면 토스트, 있으면 "N번 문항이 변경되었습니다" confirm 후 저장
- **나가기/불러오기**: 변경 있으면 "⚠️ N번 문항이 변경되었습니다! 저장되지 않습니다!" 강력 경고
- **저장/불러오기 완료**: `_changedItems` 초기화
- **renderRegForm 진입 시**: `_builderInitChangeTrack()` 즉시 호출 (불러오기 없이 수정해도 감지)
- **Git**: `8906fe6` → `9ec9aef`

### Canvas 08-2: 스냅샷 기반 변경 감지 구현
- **헬퍼 함수**: `_editGetSnapshot()` (builder-main-area 모든 필드값 JSON), `_editHasChanged()` (초기값 비교)
- **스냅샷 저장**: renderEditForm setTimeout 완료 후 자동 저장
- **저장 버튼**: 변경 없으면 토스트, 있으면 confirm 후 저장
- **나가기 버튼**: 변경 있으면 "⚠️ 이 문항이 변경되었습니다! 저장되지 않습니다!" 강력 경고
- **저장 완료**: `_editSnapshot = null` 초기화
- **Git**: `5134007`

### 전역 창 닫기/새로고침 경고 등록
- `window.onload`에서 `handleBeforeUnload`를 전역 등록 → 앱 전체에서 탭 닫기/새로고침 시 브라우저 기본 경고창 표시
- 기존 Canvas 02-1 한정 등록/해제 코드 제거 (전역으로 통합)
- **Git**: `64c7234` → `5134007`

### Canvas 06: 시험지 선택 시 권장 학년 자동 선택
- 시험지 선택 시 `category.targetGrade` → `input-grade` 드롭다운에 자동 선택
- `window._recommendedGrade06` 저장 → 다른 학년 선택 시 confirm 경고
- **Git**: `17b37ee`

### Canvas 09: 시험지 등록/수정/복사 UX 강화
- **시험 시간 필수화**: 0분 무제한 제거 → 1분 이상 필수, placeholder 변경
- **수정 변경없음**: "수정된 사항이 없습니다" 토스트 후 중단
- **변수 버그 수정**: cat → cat2 변수명 충돌 수정
- **Git**: `f37103b`

### Canvas 02: 시험 시작 전 정보 confirm 창
- 필수 입력 검증 후 시험지명/이름/학년/시험시간 confirm → 확인 시 02-3으로 이동
- **Git**: `ce19e1e`

### Canvas 02-3: 시험 안내 화면 개선
- 1번 문구: 시험지명/학생명/학년 동적 표시
- 오디오 테스트: 8.5초 → 6.5초
- **`preloadBundleAudios` catId 필터 수정**: 기존 전체 번들 로드 → 해당 시험지 번들만 로드 (`b.catId === catId` 필터 추가)
- **Canvas 02 흐름 preload 버그 수정**: Canvas 02에서 GET_FULL_DB 미호출로 catId 없던 문제 → renderExamInstructions에서 직접 GET_FULL_DB 호출 후 catId 주입 → preload
- **Git**: `1e152b5` → `fdf22bf`

### Canvas 05: AI 코멘트 생성/재생성 시 _dirtyComment 누락 수정
- 기존: `editComment`(수동 편집)에만 `_dirtyComment = true` 설정됨
- **추가**: `triggerAIAnalysis`, `regenerateSectionComment`, `regenerateOverallComment` 완료 시 `_dirtyComment = true` 추가
- **효과**: AI 코멘트 생성 후 인쇄 시 "저장 후 인쇄 권장" confirm 창 정상 표시
- **Git**: `b3f049b`

### Canvas 05: 코멘트 수동편집 textarea auto-resize 적용
- 기존 `resize-none` + 고정 rows → `resize-y` + scrollHeight 기반 auto-resize로 변경
- 내용 길이에 관계없이 textarea가 내용 전체를 스크롤 없이 표시
- overall/section 편집창 모두 적용
- **Git**: `cbd920d`

---

## 2026-03-30 (작업 - 자정)


### 무한로딩 버그 수정 + 시험지 복사 기능 추가

#### 무한로딩 근본 원인 및 수정
- **원인**: `RENAME_DB_FILES` (통합DB/학생DB 파일명 변경) GAS 처리 시 `getFiles()`로 이미지·오디오 포함 전체 파일 순회 → 30초 타임아웃
- **GAS 수정**: `getFiles()` → `getFilesByType(MimeType.GOOGLE_SHEETS)` (이미 사용자 복붙 버전에 반영됨)
- **script.js 수정**: `RENAME_DB_FILES` 호출을 **백그라운드 비동기(fire-and-forget)**로 변경 → UI 블로킹 없음
- **한글 깨짐 사고**: `git show | node` 파이프로 복원하면서 GAS 파일 한글 738개 깨짐 → 사용자 수동 복붙으로 복원
- **교훈**: 파이프 방식 복원 절대 금지, `git checkout` 또는 직접 편집 도구만 사용

#### 시험지 복사 기능 추가 (Canvas 09-4)
- **GAS**: `COPY_EXAM` 기능 추가 - 원본 폴더의 통합DB/학생DB 스프레드시트를 `makeCopy()`로 새 폴더에 복제
- **script.js**:
  - 시험지 목록에 📋 복사 버튼 추가
  - `showCopyCat(srcCatId)` - 복사 모달: 구분/학년/시간/새이름 입력 + 통합DB·학생DB 체크박스
  - `copyCat(srcCatId)` - 실행: 새 폴더 생성 → DB 복사 → 카테고리 등록 → 클라우드 저장
- **캔버스 ID**: `09-4` 배정, MD 파일 업데이트
- **Git**: `ffc037a` → `97d361f` → `6cacd99` → `aa0730c`

## 2026-03-29 (추가 작업 5차 - 저녁 3)


### Canvas 05-1: 저장 버튼 + 코멘트 편집창 개선
- **저장 버튼 추가** (인쇄 버튼 왼쪽)
  - `saveReportData()` 함수 신규: 등록학급(`SAVE_STUDENT_CLASS`) + 코멘트(`SAVE_AI_COMMENT`) DB 저장
  - `_dirtyClass` / `_dirtyComment` 세분화 플래그로 **변경된 항목만** 저장
  - printReport 자동 저장 로직 제거 → 저장은 저장 버튼으로만
- **변경 감지** `_dirtyClass` / `_dirtyComment`
  - `warnClassChange05` → `_dirtyClass = true`
  - `editComment` → `_dirtyComment = true`
  - `cancelCommentEdit` → `_dirtyComment = false`
  - `saveCommentEdit` 서버 성공 → `_dirtyComment = false`
  - `renderReportCard` 로드 시 → 양쪽 모두 false
- **인쇄 버튼**: `_dirtyClass || _dirtyComment` 이면 확인창 → 확인 시 인쇄
- **코멘트 편집창 rows 동적 설정**: `Math.max(최소값, 줄수+1)` → 편집창 크기 레이아웃 점프 해결
- **결과**: Git `58b5d1a` → `4329da4` → `5380d4d` → `8888cb0`

## 2026-03-29 (추가 작업 4차 - 저녁 2)


### printReport 롤백 + 인쇄 UI 전면 개선
- **지시**: 성적표 인쇄 화면이 작동 불안정 → html2canvas 신버전 제거, 구버전(DOM 클론 방식)으로 롤백
- **수행**:
  - `async function printReport()` → `function printReport()` (DOM 클론 방식) 복원
  - 인쇄 배너 로고 위치(padding-bottom 140px), `@page margin:12mm` 원복 (1a0badf/9d26855 인쇄 관련만)
  - 종합AI코멘트 프롬프트 개선은 유지
- **추가 개선**:
  - 팝업 창 가로: A4 너비(794px) 고정
  - 등록학급 박스(6A) 테두리 버그 수정: span height:61px + 부모 div border !important 강제
  - 코멘트(영역별·종합AI) 인쇄 글자크기 13px (.fs-15 정의)
  - 정오답표 인쇄 글자크기 13px (table.fs-14 td/th)
  - 정오답표 행높이 py-1 통일, Q번호 행도 py-1 통일, 정오답 ○/✕ text-[14px] 통일
- **PROJECT RULES 업데이트**: 규칙 #10 괄호 검증 원칙 추가 (node --check), GEMINI.md 전역룰에도 추가
- **결과**: Git 커밋 `ce94ab6` → `92dba57` → `0493690` → `41745ca` → `382661c` → `e06f377`

## 2026-03-29 (추가 작업 3차 - 저녁)


### Canvas 09-3: 응시년도+응시월일 → 응시년월일 통합
- 두 컬럼을 하나로 합치고, 기본 정렬을 최신순(date, dir=-1)으로 변경
- 정렬 케이스 통합: `year`/`md` → `date` (전체 날짜 문자열 비교)
- **결과**: Git 커밋 `e258781`

### Canvas 08-2: 편집 모드 Q번호 항상 Q.01 표시 버그 수정
- **원인**: 편집 모드에서 문항 1개만 로드되어 순서 기반으로 항상 01
- **수정**: `addComponent`에 `no: q.no` 전달 → 카드 헤더에 `data-original-no` 저장 → `updateQuestionNumbers`에서 우선 참조
- **결과**: Git 커밋 `d2cbb3e`

### Canvas 06: 등록학급 자동 추천 전면 개선
- **근본 원인**: `handleScoreCategoryChange`에서 학생 DB 미로드 → `cachedStudentRecords` 비어있어 추천 불가
- **수정 1**: 시험지 선택 시 `GET_STUDENT_LIST`도 함께 호출, 완료 후 `calcAndRecommendClass06()` 재계산
- **수정 2**: 달성미달 자동 선택 후 새 데이터 로드 시 재추천으로 덮어쓰도록 sel.value 조건 개선
- **수정 3**: AI 추천 badge → `🏫 등록학급` 레이블 옆 같은 크기로 이동
- **수정 4**: 점수 변경 시 무조건 AI 추천으로 드롭박스 덮어쓰기 (사용자 수동 선택 포함)
- **결과**: Git 커밋 `45cdf7d`

---

## 2026-03-29 (추가 작업 2차 - 오후)

### Canvas 07-1 / 07-2 정식 Canvas ID 부여
- **변경**: 기존 Canvas 07 단일 ID → 3단계 분리
  - Canvas 07: 통계 초기화면 (시험지 선택 드롭박스)
  - Canvas 07-1: 문항 통계 (`switchStatsMode('question')` → `setCanvasId('07-1')`)
  - Canvas 07-2: 학생 통계 (`switchStatsMode('student')` → `setCanvasId('07-2')`)
- **수행**: `script.js` switchStatsMode 함수에 setCanvasId 추가, CANVAS ID STANDARD.md 업데이트
- **결과**: Git 커밋 `5398411`

### 전체 Canvas 코드 전수 검증
- **수행**: 전 Canvas (01~10, 서브번호 포함) 렌더 함수 존재 여부 + onclick/onchange 핸들러 68개 전수 확인
- **결과**: MISSING 0개, 모든 핸들러 정상 매칭 확인. GAS↔JS API 타입 17개 전부 정상. 레거시 미사용 함수 3개(saveQ, obsolete_updateQ, delQ) 확인 — 실제 미호출로 안전.

### 08-1 / 08-2 저장 안정성 개선
- **기존 문제**: `saveRegGroup`(08-1), `updateBuilderQuestion`(08-2)이 `fetch()` 직접 1회 호출 → 재시도 없음
- **수정**: 두 함수 모두 `sendReliableRequest(payload)`로 교체 → 5회 자동 재시도, 60초 타임아웃 보장
- **영향 없음**: payload 구조 동일, 응답 처리 로직(`resData.status === "Success"`) 동일, 다른 Canvas 영향 없음
- **결과**: Git 커밋 `dd86e8e`

### GAS 재배포 완료
- 이미지 멀티모달 처리 로직이 포함된 `API script.gs` 재배포 완료 (2026-03-29 오후)
- 이미지 첨부 문항 AI 채점 기능 정식 활성화

---

## 2026-03-29 (추가 작업)

### 오디오 저장 구조 이미지 방식으로 전면 개선
- **원인**: `renderAudioUploader`에 기존 audioUrl/audioFileId를 DOM에 보관하는 방법이 없어, `collectBuilderData`에서 `_existBnd`(globalConfig 참조)에 의존했으나 UUID 불일치로 항상 실패
- **이전 방식**: `_existBnd = globalConfig.bundles.find(b => b.id === setId)` → UUID 불일치 시 빈값
- **새 방식 (이미지와 동일)**: hidden input `[data-field="audioUrl"]`, `[data-field="audioFileId"]`를 DOM에 심어 `collectBuilderData`에서 직접 읽기
- **수행**:
  - `renderAudioUploader`: hidden input 2개 추가 (audioUrl, audioFileId)
  - `clearBuilderAudio`: ✕ 클릭 시 hidden input도 초기화
  - `collectBuilderData`: `existingAudioUrl` = DOM hidden input 직접 읽기
  - `groups.push passage`: existingAudioUrl/FileId 포함
  - `newBundles.push`: `_existBnd` 제거, `group.passage.audioUrl` 직접 사용
  - `addComponent`: bundle/passage 타입에 `data-group-id` 명시적 세팅
- **결과**: Git 커밋 `8762050`

### AI 채점 로직 복원 (인코딩 복구 작업 중 누락된 로직 재적용)
- **원인**: `0698825` 한글 인코딩 복구 커밋에서 `submitExam`의 `for...of` 루프가 `forEach`로 바뀌어 `await gradeWithAI()` 미실행, `_gradingV2` 플래그 누락
- **수행**:
  - `forEach` → `for...of` 복원
  - 2단계 AI 채점 로직 (`gradeWithAI` 호출) 복원
  - `_gradingV2: true` 플래그 복원
  - `section`, `difficulty` 필드 복원
  - `earnedScore` 구조 복원 (부분점수 지원)
  - submitExam에 `bundleImgUrl` 주입 추가
- **결과**: Git 커밋 (AI 채점 복원)

### AI 채점 이미지 멀티모달 지원
- **내용**: 문항 이미지(`q.qImg`), 번들 이미지(`q.bundleImgUrl`)를 Gemini에 함께 전달하여 이미지 기반 채점 가능하게 수정
- **수행**:
  - `gradeWithAI`: imageUrls 수집 후 `callGeminiAPI` 전달
  - `callGeminiAPI`: `imageUrls` 3번째 파라미터 추가
  - `API script.gs` CALL_GEMINI: Drive 파일 ID 추출 → `DriveApp.getFileById().getBlob()` → base64 → `inlineData` 파트로 Gemini 전달
- **🚨 GAS 재배포 필요**
- **결과**: Git 커밋 `4ad452a`

### AI 채점 프롬프트 강화 (관대한 채점 기준 명시)
- **수행**: gradeWithAI Instructions에 아래 규칙 명시
  - 대소문자/띄어쓰기 무시
  - 하이픈-en dash-em dash 혼용 허용
  - 정답 핵심 단어 포함 시 추가 정보 있어도 정답
  - 숫자↔한글 표기 혼용 허용 (11.30 = 11시30분)
  - 괄호안 선택적 표현 허용
  - 철자(스펠링)는 엄격하게
- **결과**: Git 커밋 `29225be`

## 2026-03-29

### 시험화면 묶음 문항 객관식 A~E 원문자 미표시 버그 수정
- **지시**: A~E로 저장해도 시험화면에서 ①②③으로 표시되는 버그 수정 요청. `API script.gs`, `style.css`, `index.html` 전체 파일 점검 병행 요청.
- **전체 점검 결과**: `API script.gs`(labelType 저장/로드/업데이트 정상), `style.css`(이상 없음), `index.html`(이상 없음)
- **원인**: `script.js` 내 `renderChoices`(9661줄)가 `labelType`을 무시하고 `['①','②','③','④','⑤']`를 하드코딩. 묶음 문항은 `renderSubQuestion` → `getInputHtml`(9641줄) → `renderChoices` 경로를 타므로 alpha 설정이 반영되지 않음. (pair/solo 단독 문항은 3493줄의 다른 버전이 쓰여 정상)
- **수행**: `renderChoices` 함수에 `_lType = q.labelType || 'number'` 분기 추가
  - alpha 모드: 원문자 `['Ⓐ','Ⓑ','Ⓒ','Ⓓ','Ⓔ']`, 선택값 `A/B/C/D/E`
  - number 모드: 원문자 `['①','②','③','④','⑤']`, 선택값 `1/2/3/4/5`
- **결과**: `script.js` 수정, 한글 인코딩 검증 통과, Git 커밋 `e6142c4`

### 오디오 링크 DB 소실 + Questions 시트 파란배경 버그 수정
- **지시**: 빌더/시험 화면 오디오 미표시, Bundles DB 오디오 링크 소멸, Questions 시트 전행 파란배경 문제
- **원인 1 (오디오 링크 소실)**: 08-1 전체저장 시 `serializeBuilderState()`가 DOM만 읽어 `audioUrl`/`audioFileId` 누락 → `newBundles.push()`에 없음 → GAS가 빈값 저장 → 링크 소멸. (08-2 수정경로는 이미 올바르게 처리 중)
- **원인 2 (파란배경)**: GAS에서 `deleteRows()` 후 `setValues()` 시 구글시트가 1행 헤더 파란색 포맷 자동 상속
- **수행**:
  - `script.js` `newBundles.push()`: `_existBnd = globalConfig.bundles.find(setId)` 로 기존 번들 조회 후 `audioUrl`/`audioFileId` 보존 추가
  - `API script.gs` SAVE_FULL_TEST_DATA: `clearFormat()` + `setBackground("#ffffff")` + `setFontColor("#000000")` + `setFontWeight("normal")` 추가
- **GAS 재배포 필요** ← API script.gs 수정분 반드시 재배포
- **기존 소실된 링크 복구**: 구글 드라이브 오디오창고에 파일 존재 → 빌더(08-2)에서 해당 번들 수정 모드 진입 후 오디오 재업로드 必
- **결과**: `script.js`+`API script.gs` 수정, 한글 인코딩 검증 통과, Git 커밋 `e61a833`

### Questions 헤더 O열 어긋남 버그 수정
- **원인**: 헤더 생성 코드가 `getLastRow() === 0` (빈 시트)일 때만 실행 → '라벨타입' 컬럼 추가 후 재배포 시 기존 시트에 반영 안 됨 → N열(실제 데이터 위치)에 헤더 없고 O열에 잘못된 '라벨타입' 텍스트 생성됨
- **수행**: `API script.gs` SAVE_FULL_TEST_DATA - 헤더를 `setValues()`로 **항상 덮어쓰기** 방식으로 변경 (조건 제거)
- **수동 작업 필요**: 구글 시트 Questions탭 **O열 직접 삭제** 필요
- **결과**: `API script.gs` 수정, Git 커밋 `102631d`

### 빌더 불러오기 시 오디오 및 labelType 전수 누락 수정 (4커밋)
- **지시**: 매번 편집 시 오디오 재업로드 요구 문제, 로직 전수 점검 요구
- **원인 종합**:
  - 08-1 bundleMap 구성 시 `audioUrl`/`audioFileId`/`audioMaxPlay` 3필드 미포함 → addComponent에 전달 안 됨
  - 08-1/08-2 addComponent('bundle')에 audio 3필드 누락 → `d.audioUrl`이 항상 falsy → 오디오 박스 hidden
  - 08-1 번들문항/단독문항(orphan)/08-2 문항 addComponent에 `labelType` 누락
  - 08-2 `updateBuilderQuestion` questionData에서 `qInput.innerPassage`(존재X) 사용 → 실제 키 `qInput.passageText`로 수정 필요. 지문내용이 항상 빈값 저장되던 버그
  - 08-2 `updateBuilderQuestion` questionData에 `labelType` 누락 → 항상 'number'로 저장
- **수행**:
  - `script.js` bundleMap: audio 3필드 추가
  - `script.js` addComponent('bundle') 08-1/08-2: audio 3필드 추가
  - `script.js` addComponent(질문) 08-1 번들문항/단독문항/08-2: `labelType: q.labelType || 'number'` 추가
  - `script.js` updateBuilderQuestion questionData: `innerPassage` → `passageText`, `labelType` 추가
- **채점 영향 확인**: submitExam 채점로직 전수 점검 결과 A~E 변경이 채점/학생DB에 영향 없음 확인 (alpha 문항은 오히려 처음 정상화)
- **결과**: `script.js` 수정, 한글 인코딩 검증 통과, Git 커밋 `e39f94b`, `4d1b579`, `1d1fefc`

### 08-1 저장 시 번들 UUID 매번 신규 생성 버그 수정
- **원인**: `collectBuilderData()`에서 `block.getAttribute('data-group-id')`를 읽는데, `addComponent`에서 bundle div에 `data-group-id` 속성이 설정 안 됨 → 매번 `generateUUID()`로 신규 UUID 생성 → 저장할 때마다 모든 번들 세트번호가 바뀜 → `_existBnd` 매칭 실패 → audioUrl/audioFileId 소멸 + 문항 setId 연결도 깨짐
- **수행**: `collectBuilderData` 8471줄: `block.getAttribute('data-group-id') || block.id || generateUUID()` — `block.id`가 불러오기 시 원본 UUID로 설정되므로 이를 우선 사용
- **결과**: `script.js` 수정, 한글 인코딩 검증 통과, Git 커밋 `b7ade01`

### 완료된 수동 작업
1. ✅ **`API script.gs` 재배포** 완료
2. ✅ **구글 시트 Questions탭 O열 삭제** 완료
3. ⬜ **오디오 재업로드** — 08-1 전체저장으로 재업로드 시도했으나 UUID 버그로 실패 → b7ade01 수정 후 재시도 필요

## 2026-03-26

### 객관식 보기 라벨 타입 선택 기능 추가
- **지시**: 문항 카드(빌더)의 "보기 및 정답" 섹션에 1~5 / A~E 라벨 타입 선택 옵션 추가. 시험화면에도 선택된 타입에 맞게 원문자(①②③ / ⒶⒷⒸ) 표시 요청.
- **수행**:
  - `script.js` `getComponentHtml` (obj 케이스): 보기수 드롭다운 좌측에 `1~5 / A~E` 셀렉트(`data-field="labelType"`) 추가.
  - `renderBuilderChoices`: `labelType` 셀렉트 값을 읽어 보기 번호 라벨(1./A. 등) 실시간 반영.
  - `serializeBuilderState`: `val.labelType` 수집 추가 (저장 시 DB에 포함).
  - `getInputHtml` (시험화면): `q.labelType` 기반으로 원문자(`①~⑤` / `Ⓐ~Ⓔ`) 분기 처리.

### Canvas 8-1 PDF 버튼 및 기능 제거
- **지시**: 문항등록 화면(08-1)의 PDF 버튼 및 관련 기능 전체 제거 (미구현 상태로 숨김)
- **수행**:
  - PDF 업로드 `<label>` 버튼 제거
  - Split View 토글 버튼(`btn-split-toggle`) 제거
  - 좌측 Source Panel(`source-panel`, `source-text-area`) 제거
  - `handlePdfImport` 함수 전체 제거
  - 저장 오류 메시지에서 "PDF를 가져오거나" 문구 제거

### #Set 배지 클릭 시 묶음형 카드로 스크롤 이동
- **지시**: 문항 카드의 `#Set N` 배지 클릭 시 왼쪽 묶음형(zone-bundle) 영역의 해당 카드로 이동
- **수행**:
  - `syncBundles` 내 `bundle-badge` 생성 코드에 `data-target-bundle` 속성 및 `onclick` 핸들러 추가
  - 클릭 시 `scrollIntoView({ behavior: 'smooth', block: 'center' })`로 부드럽게 이동
  - 이동 후 1.5초간 파란색 outline 강조 효과 표시

### labelType(A~E/1~5) 저장 누락 버그 수정 (08-1/08-2 공통)
- **지시**: 객관형 카드에서 A~E로 변경 후 저장해도 반영 안 되는 문제 수정
- **원인**: 프론트엔드 `parseQuestionBlock` 및 `newQuestions.push`에 `labelType` 필드 누락. GAS Questions 시트에도 컬럼 미존재.
- **수행**:
  - `script.js` `parseQuestionBlock`: `[data-field="labelType"]` 셀렉트 값 수집 추가
  - `script.js` `newQuestions.push`: `labelType` 필드 payload에 추가 (08-1/08-2 공통 경로)
  - `API script.gs` Questions 헤더: `"라벨타입"` 컬럼 추가 (13→14컬럼)
  - `API script.gs` SAVE_FULL_TEST_DATA 저장 row: `q.labelType` 추가
  - `API script.gs` GET_FULL_DB mapper: `labelType: r[13]` 로드 추가
  - `API script.gs` UPDATE_QUESTION newRow: `q.labelType` 추가
  - **GAS 재배포 필요** ← 반드시 재배포 후 정상 동작

### 라벨 타입 변경 시 정답 자동 변환 + 보기 수 범위 제한
- **지시**: A~E↔1~5 전환 시 기존 정답값 자동 변환 (`3→C`, `C→3`). 보기 수에 따라 정답 입력 범위 제한.
- **수행**:
  - `convertAnswerOnLabelChange(itemId, newType)` 함수 추가: 라벨 타입 변경 시 정답값 자동 변환 후 `renderBuilderChoices` 호출
  - `renderBuilderChoices` 끝부분: 정답 입력 validation 갱신
    - number 모드: `type="number"`, `min=1`, `max=n`, placeholder `1~n`
    - alpha 모드: `type="text"`, `maxLength=1`, `oninput` 필터 (허용 외 입력 시 자동 클리어+빨간 테두리)
    - 보기 수 변경 시 기존 정답값이 범위 초과이면 자동 클리어

### 🔴 미해결 이슈 (다음 세션 계속)
- **시험화면 A~E 원문자(Ⓐ~Ⓔ) 미표시 문제**
  - 현상: 기존 저장 문항 불러올 때 시험화면에서 A~E 대신 ①②③으로 표시됨
  - 원인 후보:
    1. 기존 저장 데이터의 `answer`가 'C'가 아닌 '3'(숫자)로 저장됨 → 추론 로직 무효
    2. 또는 시험화면 문항 로드 시 `q.answer`/`q.labelType` 값이 비어있을 가능성
  - 시도한 수정: `getInputHtml`에 `answer` 값으로 labelType 추론 (`/^[A-Ea-e]$/`) 추가했으나 미동작
  - **다음 세션 할 일**:
    1. Console에서 `globalConfig.questions`의 `answer`, `labelType` 값 직접 확인
    2. 빌더에서 해당 문항 A~E로 바꾸고 **다시 저장** (answer='C', labelType='alpha' 재저장)
    3. 저장 후 시험화면 재확인
  - **참고**: `file:// URL Unsafe` 콘솔 오류는 별개 이슈 (file:// 프로토콜 iframe 보안 경고, 기능 무관)






## 2026-03-23 (저녁 세션)
### 객관식/학생DB/시험안내 개선 일괄 수정
- **지시**: 객관식 색깔 미변경 / 학생DB 레이아웃 / 시험안내 화면 / 오디오 프리로드
- **수행**:
  - `renderChoices` `<label>`에 `exam-choice-btn`, `data-qid`, `data-val`, `exam-circle-num` 추가 (선택지 색깔 버그 수정)
  - 학생DB: tr hover 제거, 내부 스크롤, thead sticky, 열 균등(table-fixed), 중앙정렬, 외부 스크롤바 제거
  - `renderExamInstructions`: `setCanvasId('02-3')` 추가, 박스 정 중앙 정렬(`height:100%`)
  - `preloadBundleAudios()` 함수 추가 — 안내화면 진입 시 오디오 백그라운드 fetch+blob URL 캐싱
  - `playBundleAudio()`: 캐시 히트 시 즉시 재생 (GAS 호출 생략)
  - Canvas 10 없음 확인
  - `[MD] CANVAS ID STANDARD.md`: 02-2(결과), 02-3(안내) 추가


- **지시**: 객관식 문항 선택지 클릭 시 답 저장은 되지만 색깔이 변하지 않는 문제 수정
- **원인**: 오후 세션(65eb18e)에서 `renderChoices`의 `<button>` → `<label>`로 변경하면서 `data-qid`, `data-val`, `exam-choice-btn`, `exam-circle-num` 속성/클래스를 누락함 → `selectObjAnswer`가 DOM에서 요소를 전혀 못 찾아 0건 반환
- **수행**: `renderChoices` (9599줄)의 `<label>` 태그에 `class="exam-choice-btn ..."`, `data-qid`, `data-val` 추가 / `<span>`에 `exam-circle-num` 클래스 추가 (`script.js`)


## 2026-03-23 (오후 세션)

### 객관형 선택지 UI 수정 및 번들 레이아웃 복원
- **지시**: 객관형 선택지 2열 레이아웃 미적용 및 선택 시 박스 전체 강조 → 원문자만 체크로 변경. 번들 시험화면을 원본 레이아웃으로 복원 (오디오 재생만 추가)
- **수행**:
  - `renderChoices`: `flex-col` → `isLong` 체크 기반 `grid-cols-2/1`, `<button>` 전체 하이라이트 → `<label>` + 원문자 원형만 파란색 채움
  - `renderBundleLeft`: return 부분을 `ec984de` 원본으로 복원 (h3 제목+범위, `border-black bg-white` 지문 박스). 오디오 구현부(재생횟수 추적/disabled)는 현재 버전 유지

## 2026-03-23 (세션 마무리)
### 오디오 업로드 기능 전체 구현
- GAS에 saveAudio 헬퍼 + Bundles 시트 오디오URL/파일ID/재생횟수 컬럼 추가
- 오디오 파일 저장 위치: 이미지창고와 같은 레벨 오디오창고 폴더
- 08-1(신규등록): newBundles에 audioData 포함
- 08-2(수정): bundleData.audioData 포함

### 시험화면 개선
- 객관식 선택지: radio버튼 → 원문자(①②③④⑤) 커스텀 버튼
- 듣기 플레이어: iframe → audio 태그 (일시정지/시크 없음)
- 듣기 버튼 클릭 시 confirm 경고창
- 페이지 이동 시 미답변 경고 + 오디오 재생중 이동 경고
- 창 닫기 시 오디오 재생중 경고 (onbeforeunload)
- 학년 표시 축약: 초등 5학년 → 초5, 중등 1학년 → 중1

### 시험 안내 화면 추가
- 로그인 버튼: 시험 안내보기 → → 안내화면
- 6가지 규칙 + 오디오 테스트(WebAudio 20초) + START EXAM
- 오디오 테스트 미실시 시 START EXAM 차단

### GAS 주의사항
- GAS 재배포 필요: saveAudio, 오디오창고 폴더, Bundles 8열 헤더 포함
# 작업 히스토리 (HISTORY.md)

> ⚠️ **AI 필독**: 새 대화 시작 시 이 파일을 반드시 먼저 읽고 맥락을 파악하십시오.
> 작업 완료 후 반드시 이 파일에 내용을 추가하십시오.

---

> [!CAUTION]
> # 🚨🚨🚨 절대 최우선 규칙 #0 — 한글 인코딩 보호 🚨🚨🚨
>
> ## ❌ 모든 각각의 아주 세세한 작업 후에 반드시 한글 깨짐 여부를 확인한다. ❌
>
> **무조건. 절대. 결코. 하늘이 두 쪽 나도. 항상. 반드시. 지킨다.**
>
> ### 왜?
> - **2026-03-22 대참사**: PowerShell의 인코딩 처리로 `script.js`의 한글이 전부 깨짐 (`?`로 대체)
> - Git 히스토리 전체가 오염되어 복구에 수시간 소요
> - **다시는 이런 일이 발생해서는 안 된다**
>
> ### 규칙
> 1. **파일 수정 후** → 즉시 한글 깨짐 확인 (바이트 레벨: `0x3F` 없는지)
> 2. **PowerShell로 파일 쓸 때** → `[System.Text.UTF8Encoding]($false)` 사용, `Out-File` 절대 금지
> 3. **Git 커밋 전** → 한글 포함 파일 인코딩 재확인
> 4. **Node.js 사용 시** → `readFileSync/writeFileSync`에 `'utf8'` 명시
> 5. **의심되면 멈추고** → 백업 후 진행
>
> ### 검증 명령어
> ```javascript
> // Node.js로 확인 (PowerShell 대신!)
> node -e "const c=require('fs').readFileSync('script.js','utf8'); console.log(c.includes('전역 설정') ? '✅ 한글 정상' : '🚨 한글 깨짐!!!')"
> ```
>
> **이 규칙은 다른 모든 규칙보다 우선한다. 예외 없음.**

---

### 학급평균 차트/레이더 개선 (2026-03-23)
- **총점 차트 버그**: 키 오류(종점→총점) 수정 → 학급평균 막대 정상 표시
- **레이더 학급평균**: 학급 평균 정답률(%) 데이터셋 추가, 꼭짓점 점 제거(pointRadius:0)
- **레이더 토글 연동**: 모두/전체/학급 토글 선택에 따라 레이더도 반응
- **토글 위치 변경**: 차트 아래에서 권장학급 좌측 (no-print 클래스 인쇄숨김)
- **레이더 레이아웃**: 개인정답률 테이블 우측→좌측, 컨테이너 100%, 범례 공백 최소화
- **Canvas06 정리**: 학생ID 필드 제거, grid-cols-4 균등배열, badge 텍스트 제거
- **AI 추천 실시간화**: calculateTotalScore에서 직접 호출(문항별/영역별 통합)
- **DB 우선 로직**: record.studentClass 우선, 없을 때만 AI 추천
- **미달 추가**: 최하반평균 60%미만→미달 추천, 드롭다운에 ⛔미달 옵션 추가

## 2026-03-23

### 등록학급 AI 자동 추천 기능
- **지시**: 시험지 학생DB 기반으로 학급별 평균점수 계산 후 학생 점수에 맞는 등록학급 자동 추천
- **수행**:
  - `recommendClassByScore(totalScore, grade)` 함수 추가
  - Canvas 06: `updateClassDropdown06`에 ⭐ 추천 옵션 및 badge div 추가, `calcAndRecommendClass06` q-score 변경 시 자동 추천
  - Canvas 05-1: report-student-class에 ⭐ 추천 옵션, `recCls05` 자동 선택, `warnClassChange05` 수동 변경 경고
  - 저장 함수에서 `__RECOMMEND__` 값을 실제 추천 학급명으로 치환
### script.js 손상 복구 및 4가지 버그 수정
- **지시**: 앱 비정상 종료로 script.js 3839줄에서 라인 잘림 손상 발생. Git HEAD로 복원 후 4가지 버그 수정 이어서 진행
- **수행**:
  - `git checkout HEAD -- script.js` 로 복원 (구문 오류 해소)
  - 권장학급 두 박스(라벨+드롭다운) gap-0으로 붙여서 하나처럼 보이도록 수정 (border-radius 분리)
  - 레이더 차트 범례 padding: `4` → `10` (bar chart와 동일)
  - AI 코멘트 경고 오탐지 수정: 전체 p태그 스캔 → `overall-comment-text` id 직접 체크
  - 인쇄(`printReport()`) 완료 시 선택된 등록학급 값을 `STUDENT_SAVE`로 DB에 자동 저장

---


### AI 코멘트 인라인 편집 및 품질 개선
- **지시**: 수작업으로 AI 코멘트(종합/영역)를 수정할 수 있게 하고, 생성 시 불필요한 인사말 제거 및 줄바꿈 공백(빈 줄) 축소
- **수행**:
  - `script.js` 프롬프트에서 인사말 금지 규칙 추가
  - 코멘트 텍스트 클릭 시, 좌측 묶음 편집 버튼(저장/취소)이 있는 `textarea`로 전환하는 `editComment()`, `saveCommentEdit()` 로직 구현
  - `<p class="mb-2">` 대신 `<br>`를 사용하여 문단 사이 공백 제거

### 기타사항 컬럼 추가 및 DB 완벽 연동
- **지시**: 종합분석 코멘트 아래/옆에 사용자가 메모할 수 있는 "기타사항" 필드 추가, 출력 시 반영 및 학생DB 저장
- **수행**:
  - `script.js`에 `notes` 컬럼 렌더링, 저장/토글 UI 구현 및 초기 로드 시 존재 여부에 따라 자동 열림 구현
  - `app script.gs` 수정: `SAVE_AI_COMMENT` 시 학생DB 시트에 "기타사항" 컬럼 자동 생성 및 저장 로직 추가, `GET_STUDENT_REPORT` 시 데이터 로딩 연동 완료

### 성적표 UI 공간 및 레이아웃 최적화
- **지시**: "기타사항 추가" 토글 버튼 위치를 문항 상세보기 옆 체트박스로 옮기고, 차트와 상세보기 체크박스 사이의 너무 넓은 간격을 좁힐 것
- **수행**:
  - `chk-notes-toggle` 체크박스로 UI 변경 및 체크 여부 동기화 함수(`toggleNotesBox()`) 수정
  - `#qdetail-checkbox-row`에 `-mt-6` 부여하여 레이더 차트 사이의 불필요한 공백 시각적 축소

### 성적표 레이더 차트 라벨 가시성 개선
- **지시**: 개인 정답률 수치를 영역 라벨과 겹치지 않게 바깥으로 선을 빼서 빨간색 퍼센트로 표시
- **수행**:
  - `app script.gs` 의존 없이, `script.js` 내 `renderRadarChart`에 전용 커스텀 플러그인(`radarOuterLabel`)을 직접 작성하여 선(line) 및 라벨(fill) 외부 렌더링

### 문항별 상세보기 버그 수정 및 레이아웃 복원
- **지시**: 문항별 상세보기 체크해도 안 나타나는 문제 수정 + 10열 그리드 레이아웃 복원
- **수행**:
  - 셀렉터 `[id^="qdetail-"]`가 체크박스 행까지 매칭하던 버그 수정 (`:not(#qdetail-checkbox-row)` 추가)
  - `loadStudentReport()`에서 해당 카테고리 문항 미로드 시 `GET_FULL_DB`로 자동 fetch 추가
  - 복구 시 누락된 10열 고정 그리드 레이아웃 복원 (번호→만점→난이도→개인점수→정오)
  - 난이도별 색상 구분 복원 (최상/상/중/하/기초)

### 히스토리 관리 시스템 구축
- **지시**: AI 기억 휘발 문제 해결을 위한 히스토리 관리 체계 구축
- **수행**: `[MD] HISTORY.md` 생성, `[MD] PROJECT RULES.md`에 8번(히스토리 관리), 9번(Git 커밋) 원칙 추가

### MD 파일 이름 변경
- **지시**: 모든 .md 파일에 `[MD]` 접두사 추가, 언더바 제거
- **수행**: 3개 파일 이름 변경 및 내부 참조 수정

### 사이드바 텍스트 변경 (Canvas 07)
- **지시**: 사이드바 "문항 통계" → "문항 및 학생 통계"로 변경
- **수행**: `script.js` 사이드바 버튼 텍스트 변경, `[MD] CANVAS ID STANDARD.md` 동기화

### 사이드바 전환 타이밍 수정
- **지시**: 사이드바 있는 화면 → 없는 화면 전환 시 로딩 중 사이드바가 먼저 사라지는 문제 수정
- **수행**: `changeMode()`에서 student 모드 시 즉시 제거 대신, `renderStudentLogin()` 내부에서 로딩 완료 후 제거하도록 변경

### 주관형 채점 로직 개선
- **지시**: 69번 문항 `'s` 정답인데 오답 처리 문제. AI가 묶음 지문을 못 보는 문제.
- **수행**:
  - `gradeWithAI` 프롬프트에 묶음 지문(`bundlePassageText`) + 개별 지문(`passage1`) 전달 추가
  - 채점 시 `globalConfig.bundles`에서 묶음 지문 데이터 주입 로직 추가
  - 키워드 매칭 정규식에 백틱(`` ` ``), 스마트 따옴표(`'`, `'`, `"`, `"`) 추가

---

## 2026-03-21
### 학생 학급 입력 필드 수정
- **지시**: 성적 수동 입력(Canvas 06)의 학생 학급 입력 필드 수정
  - placeholder 텍스트 변경 ("등록학급 (예정)" → 선택사항 표시)
  - 필수값 제거 (선택 입력으로 변경)
  - 입력 필드 위치를 같은 행 맨 오른쪽으로 이동
  - 입력 필드 색상 변경
- **수행**: `script.js`, `style.css` 수정 완료

### 전체 코드 무결성 검사
- **지시**: 4개 파일 전수 검사 요청
- **수행**: `app script.gs`, `index.html`, `style.css`, `script.js` 검사 완료
  - 중복 함수 3건 발견 (`fixDriveUrl`, `callGeminiAPI`, `updateAnswer`)
  - 치명적 오류 없음 확인

---

## 2026-03-19
### 차트 폰트 크기 수정
- **지시**: 차트 내 폰트 크기 14/15 → 16으로 통일
- **수행**: `fix_chart_fonts.ps1` 스크립트로 `script.js` 내 폰트 사이즈 일괄 변경

---

## 2026-03-16
### Canvas 정렬 확인
- **지시**: 모든 캔버스가 중앙 정렬되는 원인 조사
- **수행**: `style.css`에서 관련 CSS 코드 확인

### 시험 데이터 저장 버그 수정
- **지시**: 학생 "박지온" 데이터 저장 시 잘못된 데이터가 Google Sheets에 저장되는 문제 해결
- **수행**: payload 디버깅, GAS 데이터 매핑 수정, 주관식 문항 채점 처리 수정

---

## 2026-03-15
### 성적표 점수 표시 개선
- **지시**: 성적표(Canvas 05-1) 및 인쇄물의 폰트 크기/굵기/스타일 조정
- **수행**: 학생 이름, 리포트 제목, 섹션 라벨, 점수 표시, 추천 학급 선택 등의 시각적 일관성 확보

### 점수 계산 수정
- **지시**: 평균 점수 계산 오류 및 0점 처리 문제 해결
- **수행**: 데이터 필터링 로직 수정 (0점 포함), 백엔드-프론트엔드 계산 일관성 확보

---

## 2026-03-13
### 성적 수동 입력 화면 개편 (Canvas 06)
- **지시**: Canvas 06 UI/UX 대폭 개선
- **수행**:
  - 시험지 선택 후 동적 폼 표시
  - 문항별 점수 입력 구현 (최대 점수 검증)
  - 자동 총점 계산
  - 영역/난이도별 아코디언 UI
  - `questionScores` 포함한 저장 로직 수정

---

## 2026-03-12
### 시험 UI 레이아웃 개선
- **지시**: 시험 화면(Canvas 02-1) 문항 표시 및 2컬럼 분할 레이아웃 구현
- **수행**:
  - 고정 2컬럼 스플릿 스크린 구현
  - 반응형 이미지 표시
  - 사이드바 최적화
  - 묶음 문항/개별 문항 처리
  - 페이지 번호 추가

### 묶음 문항 이미지 버그 수정
- **지시**: Canvas 07-2에서 묶음 문항 수정 시 이미지 URL 삭제되는 버그 수정
- **수행**: Canvas 07-1의 로직을 참고하여 이미지 URL 보존 로직 수정

### 시험 UI 스타일 개선
- **지시**: 입력 박스, 카드, 선택 요소 등 시각적 개선
- **수행**: 그라디언트 배경, 상단 컬러 라인, 그림자 등 Canvas 03 스타일 적용

---

> **참고**: 이 히스토리는 2026-03-22 시점에서 소급 작성되었습니다.
> 이후 작업분은 각 작업 완료 시 실시간으로 추가됩니다.
