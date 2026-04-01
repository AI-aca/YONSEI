# DB 필드 매핑 표준 (DB Field Mapping Standard)

> 이 문서는 Google Sheets(통합DB, 학생DB) ↔ GAS(API script.gs) ↔ script.js 간 필드명 매핑을 정의합니다.
> AI 모델이 이 파일을 참조하면 혼동 없이 올바른 필드명을 사용할 수 있습니다.

---

## 🚨 핵심 주의사항 (절대 혼동 금지)

| 필드 | 시트 컬럼명 | script.js 사용 필드 | ❌ 과거 잘못된 사용 |
|------|------------|---------------------|---------------------|
| 문항 발문(질문 내용) | `질문 내용` | `q.title` | ~~`q.text`~~ |
| 문항 지문(개별) | `지문 내용` | `q.text` | ~~`q.passage1`~~ |
| 번들 발문 | `질문 내용` | `bundle.title` | — |
| 번들 지문 | `지문 내용` | `bundle.text` | — |
| 렌더링 시 번들 발문 | — | `q.commonTitle` (주입) | — |
| 렌더링 시 번들 지문 | — | `q.bundlePassageText` (주입) | — |

---

## 1. 통합DB — Questions 탭

**시트 열 순서 (1행):**
`문항번호 / 영역 / 세부영역 / 문항유형 / 난이도 / 배점 / 질문 내용 / 지문 내용 / 이미지URL / 보기(JSON) / 정답 / 모범답안 / 세트번호 / 라벨타입`

| 열 | 시트 컬럼명 | GAS 인덱스 | GAS 반환 필드명 | script.js 필드명 | 비고 |
|:--:|------------|:----------:|----------------|-----------------|------|
| A | 문항번호 | `r[0]` | `no` | `q.no` | 숫자 (행 식별자) |
| B | 영역 | `r[1]` | `section` | `q.section` | 한글→영문 자동변환 ※ |
| C | 세부영역 | `r[2]` | `subType` | `q.subType` | 자유 텍스트 |
| D | 문항유형 | `r[3]` | `type` | `q.type` | `객관형` / `주관형` |
| E | 난이도 | `r[4]` | `difficulty` | `q.difficulty` | `최상` / `상` / `중` / `하` / `기초` |
| F | 배점 | `r[5]` | `score` | `q.score` | 숫자 |
| G | **질문 내용** | `r[6]` | **`title`** | **`q.title`** | **발문 텍스트** ← 핵심 |
| H | **지문 내용** | `r[7]` | **`text`** | **`q.text`** | **개별 지문** ← 핵심 |
| I | 이미지URL | `r[8]` | `imgUrl` | `q.imgUrl` | Google Drive URL |
| J | 보기(JSON) | `r[9]` | `choices` | `q.choices` | JSON 배열 문자열 → 파싱됨 |
| K | 정답 | `r[10]` | `answer` | `q.answer` | 객관형: `1`~`5` 또는 `A`~`E`, 복수: 쉼표구분 |
| L | 모범답안 | `r[11]` | `modelAnswer` | `q.modelAnswer` | 주관형 참고 답안 |
| M | 세트번호 | `r[12]` | `setId` | `q.setId` | 번들 UUID / 단독형은 빈값 |
| N | 라벨타입 | `r[13]` | `labelType` | `q.labelType` | `number`(1~5) / `alpha`(A~E) |

**※ 영역 한글→영문 자동변환 (GAS 내 secCompat):**

| 시트 값 | JS 값 |
|--------|-------|
| 문법 | `Grammar` |
| 독해 | `Reading` |
| 어휘 | `Vocabulary` |
| 듣기 | `Listening` |
| 작문 | `Writing` |

---

## 2. 통합DB — Bundles 탭

**시트 열 순서 (1행):**
`세트번호 / 질문 내용 / 지문 내용 / 이미지URL / 연결문항번호 / 오디오URL / 오디오파일ID / 최대재생횟수`

| 열 | 시트 컬럼명 | GAS 인덱스 | GAS 반환 필드명 | script.js 필드명 | 비고 |
|:--:|------------|:----------:|----------------|-----------------|------|
| A | 세트번호 | `r[0]` | `id` | `bundle.id` | UUID |
| B | **질문 내용** | `r[1]` | **`title`** | **`bundle.title`** | **번들 공통 발문** ← 핵심 |
| C | **지문 내용** | `r[2]` | **`text`** | **`bundle.text`** | **번들 공통 지문** ← 핵심 |
| D | 이미지URL | `r[3]` | `imgUrl` | `bundle.imgUrl` | Google Drive URL |
| E | 연결문항번호 | `r[4]` | `questionIds` | `bundle.questionIds` | 쉼표 구분 문자열 예: `"1, 2, 3"` |
| F | 오디오URL | `r[5]` | `audioUrl` | `bundle.audioUrl` | Google Drive 스트리밍 URL |
| G | 오디오파일ID | `r[6]` | `audioFileId` | `bundle.audioFileId` | Drive 파일 ID |
| H | 최대재생횟수 | `r[7]` | `audioMaxPlay` | `bundle.audioMaxPlay` | 기본값 1 |

---

## 3. 학생DB

**시트 열 순서 (1행):**
`응시일 / 학생ID / 학생명 / 학년 / 문항별상세(JSON) / Grammar_점수 / Grammar_만점 / Writing_점수 / Writing_만점 / Reading_점수 / Reading_만점 / Listening_점수 / Listening_만점 / Vocabulary_점수 / Vocabulary_만점 / 최상_점수 / 최상_만점 / 상_점수 / 상_만점 / 중_점수 / 중_만점 / 하_점수 / 하_만점 / 기초_점수 / 기초_만점 / 총점 / 만점 / 정답률(%) / 등록학급 / AI_종합코멘트 / AI_영역코멘트(JSON) / 기타사항`

| 열 | 시트 컬럼명 | GAS 저장 변수 | script.js 제출 필드 | 비고 |
|:--:|------------|--------------|--------------------|-------|
| A | 응시일 | `data.testDate` | `testDate` | ISO 날짜 문자열 |
| B | 학생ID | `data.studentId` | `studentId` | |
| C | 학생명 | `data.studentName` | `studentName` | |
| D | 학년 | `data.grade` | `grade` | |
| E | 문항별상세(JSON) | `data.questionScores` | `questionScores` | `JSON.stringify()` 된 배열 |
| F | Grammar_점수 | `data.grammarScore` | `grammarScore` | |
| G | Grammar_만점 | `data.grammarMax` | `grammarMax` | |
| H | Writing_점수 | `data.writingScore` | `writingScore` | |
| I | Writing_만점 | `data.writingMax` | `writingMax` | |
| J | Reading_점수 | `data.readingScore` | `readingScore` | |
| K | Reading_만점 | `data.readingMax` | `readingMax` | |
| L | Listening_점수 | `data.listeningScore` | `listeningScore` | |
| M | Listening_만점 | `data.listeningMax` | `listeningMax` | |
| N | Vocabulary_점수 | `data.vocabScore` | `vocabScore` | |
| O | Vocabulary_만점 | `data.vocabMax` | `vocabMax` | |
| P | 최상_점수 | `data.difficulty_highest` | `difficulty_highest` | |
| Q | 최상_만점 | `data.difficulty_highest_max` | `difficulty_highest_max` | |
| R | 상_점수 | `data.difficulty_high` | `difficulty_high` | |
| S | 상_만점 | `data.difficulty_high_max` | `difficulty_high_max` | |
| T | 중_점수 | `data.difficulty_mid` | `difficulty_mid` | |
| U | 중_만점 | `data.difficulty_mid_max` | `difficulty_mid_max` | |
| V | 하_점수 | `data.difficulty_low` | `difficulty_low` | |
| W | 하_만점 | `data.difficulty_low_max` | `difficulty_low_max` | |
| X | 기초_점수 | `data.difficulty_basic` | `difficulty_basic` | |
| Y | 기초_만점 | `data.difficulty_basic_max` | `difficulty_basic_max` | |
| Z | 총점 | `totalScore` | `totalScore` | |
| AA | 만점 | `maxScore` | `maxScore` | |
| AB | 정답률(%) | `percentage` | (GAS에서 계산) | `(총점/만점*100).toFixed(2)` |
| AC | 등록학급 | `data.studentClass` | `studentClass` | 06에서만 전송, 02-1은 별도 SAVE_STUDENT_CLASS로 설정 |
| AD | AI_종합코멘트 | `data.overallComment` | `overallComment` | SAVE_AI_COMMENT 별도 경로 |
| AE | AI_영역코멘트(JSON) | `data.sectionComments` | `sectionComments` | SAVE_AI_COMMENT 별도 경로, JSON 문자열 |
| AF | 기타사항 | `data.notes` | `notes` | SAVE_AI_COMMENT 별도 경로 |

---

## 4. 저장/불러오기 경로별 매핑

### 4-1. 통합DB 저장 경로

#### 08-1 전체저장 (saveRegGroup → SAVE_FULL_TEST_DATA)

| script.js 변수 | DOM 출처 (parseQuestionBlock) | GAS 수신 필드 | 시트 열 |
|---------------|-------------------------------|--------------|---------|
| `q.title` | `[data-field="text"]` innerHTML | `q.title` | G열 |
| `q.passageText` | `[data-field="innerPassage"]` innerHTML | `q.text` | H열 |
| `q.answer` (obj) | `[data-role="answer-item"]` value 목록 → 쉼표 결합 | `q.answer` | K열 |
| `q.answer` (subj) | `[data-field="answer"]` textarea.value | `q.answer` | K열 |
| `q.modelAnswer` | `[data-field="modelAnswer"]` textarea.value | `q.modelAnswer` | L열 |
| `q.labelType` | `[data-field="labelType"]` select.value | `q.labelType` | N열 |
| `group.passage.title` | `[data-field="title"]` innerHTML (bundle 카드) | `b.title` | Bundles B열 |
| `group.passage.text` | `[data-field="html"]` innerHTML (bundle 카드) | `b.text` | Bundles C열 |

#### 08-2 부분수정 (updateBuilderQuestion → UPDATE_QUESTION)

| script.js 변수 | DOM 출처 (parseQuestionBlock) | GAS 수신 필드 | 시트 열 |
|---------------|-------------------------------|--------------|---------|
| `qInput.title` | `[data-field="text"]` innerHTML | `q.title` | G열 |
| `qInput.passageText` | `[data-field="innerPassage"]` innerHTML | `q.text` | H열 |
| `qInput.answer` (obj) | `[data-role="answer-item"]` value → 쉼표 결합 | `q.answer` | K열 |
| `qInput.answer` (subj) | `[data-field="answer"]` textarea.value | `q.answer` | K열 |
| `qInput.modelAnswer` | `[data-field="modelAnswer"]` textarea.value | `q.modelAnswer` | L열 |
| `qInput.labelType` | `[data-field="labelType"]` select.value | `q.labelType` | N열 |
| `passageData.title` | `[data-field="title"]` innerHTML (bundle 카드) | `b.title` | Bundles B열 |
| `passageData.text` | `[data-field="html"]` innerHTML (bundle 카드) | `b.text` | Bundles C열 |

#### 불러오기 (GET_FULL_DB → loadQuestionsFromCategory)

| GAS 반환 필드 | addComponent 전달 키 | DOM 표시 위치 |
|--------------|---------------------|--------------|
| `q.title` | `text: q.title` | `[data-field="text"]` div |
| `q.text` | `innerPassage: q.text` | `[data-field="innerPassage"]` div |
| `q.answer` | `answer: q.answer` | `[data-role="answer-item"]` (obj) / `[data-field="answer"]` (subj) |
| `q.modelAnswer` | `modelAnswer: q.modelAnswer` | `[data-field="modelAnswer"]` textarea |
| `q.labelType` | `labelType: q.labelType` | `[data-field="labelType"]` select |
| `bundle.title` | `title: bundleInfo.title \|\| ''` | `[data-field="title"]` div |
| `bundle.text` | `html: rawHtml` | `[data-field="html"]` div |

---

### 4-2. 학생DB 저장 경로

#### 06 수동입력 (수동성적저장 → STUDENT_SAVE)

- **문항별 점수 모드**: `[id^="q-score-"]` input에서 점수 수거 → section/difficulty 자동 집계
- **영역별 직접입력 모드**: `chk-no-qscore` 체크 시 → `input-grammar` 등 직접 입력값 사용
- `studentClass`: `input-student-class` input.value → AC열

#### 02-1 시험화면 (submitExam → STUDENT_SAVE)

- `examSession.answers[q.id]`로 학생 답안 수거
- 객관형: 정렬 후 문자열 비교 → 정오 판정 → 배점 전부 또는 0점
- 주관형: 키워드 매칭 → 실패 시 AI 채점(gradeWithAI)
- `studentClass` 미전송 → AC열 빈값 → 나중에 `SAVE_STUDENT_CLASS`로 별도 설정

#### AI 코멘트 (SAVE_AI_COMMENT)

- 학생 성적 저장 후 별도 호출
- 헤더명으로 컬럼 위치 자동 탐색 (순서 무관) → AD, AE, AF열 업데이트

---

## 5. 빌더 UI DOM ↔ 데이터 필드 매핑

### bundle 카드 (`data-type="bundle"`)

| DOM 속성 | 역할 | 데이터 흐름 |
|---------|------|-----------|
| `[data-field="title"]` div | 발문 입력 | → `group.passage.title` → DB Bundles B열 |
| `[data-field="html"]` div | 지문 입력 | → `group.passage.text` → DB Bundles C열 |
| `[data-field="audioMaxPlay"]` select | 최대재생횟수 | → `audioMaxPlay` → DB Bundles H열 |

### obj/subj 카드 (`data-type="obj"` / `data-type="subj"`)

| DOM 속성 | 역할 | 데이터 흐름 |
|---------|------|-----------|
| `[data-field="text"]` div | **발문 입력** | → `q.title` → DB Questions G열 |
| `[data-field="innerPassage"]` div | 지문 입력 | → `q.passageText` → DB Questions H열 |
| `[data-role="answer-item"]` input | 객관형 정답 | `.value` → 쉼표결합 → DB Questions K열 |
| `[data-field="answer"]` textarea | **주관형 정답** | `.value` → DB Questions K열 |
| `[data-field="modelAnswer"]` textarea | 모범답안 | `.value` → DB Questions L열 |
| `[data-field="labelType"]` select | 라벨타입 | `.value` → DB Questions N열 |
| `[data-field="difficulty"]` select | 난이도 | `.value` → DB Questions E열 |
| `[data-field="score"]` input | 배점 | `.value` → DB Questions F열 |
| `[data-field="section"]` select | 영역 | `.value` → DB Questions B열 |
| `[data-field="subtype"]` select | 세부영역 | `.value` → DB Questions C열 |
| `[data-field="choice"]` div/textarea | 보기 항목 | innerHTML/value → JSON → DB Questions J열 |

---

## 6. 렌더링 경로별 필드 사용 요약

### 단독형 문항 (`renderSingleQHtml`)

```
q.title      → <h4> 발문 텍스트
q.text       → 지문 박스 (있을 때만 표시)
q.imgUrl     → 이미지 (getMediaHtml)
q.choices    → 객관형 보기 배열 (getInputHtml)
q.displayIndex → 문항 번호 뱃지
```

### 묶음형 — 왼쪽 패널 (`renderBundleLeft`)

```
q.commonTitle        → 공통 발문 (bundle.title에서 주입)
q.bundlePassageText  → 공통 지문 (bundle.text에서 주입)
bundle.imgUrl        → 번들 이미지
bundle.audioFileId   → 오디오 버튼
```

### 묶음형 — 오른쪽 패널 (`renderSubQuestion` × n개)

```
q.title      → 하위 문항 발문
q.text       → 하위 문항 개별 지문 (있을 때만)
q.choices    → 객관형 보기
```

---

## 7. isLargeQuestion 판별 기준

```javascript
function isLargeQuestion(q) {
    if (q.imgUrl && q.imgUrl !== "" && q.imgUrl !== "undefined" && q.imgUrl !== "null") return true;
    const textLen = (q.title || "").length + (q.text || "").length;  // 발문 + 지문 합산
    if (textLen >= 1000) return true;
    return false;
}
```

→ `true`이면 해당 컬럼에 **1개 단독** 배치, `false`이면 **최대 2개** 배치

---

*최종 수정: 2026-04-02*
*관련 파일: `script.js`, `API script.gs`*
