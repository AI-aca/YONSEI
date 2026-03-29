// --- 전역 설정 및 상태 관리 ---
const DEFAULT_MASTER_URL = "https://script.google.com/macros/s/AKfycbw_wP7aQlfrUVyEZlORObmrQghbRBMz3qpmz7aMj18jTc4WkuZhRVlp2kFfYxPWH3jFmQ/exec";
// 중요: 본인의 Apps Script 배포 URL로 교체 필요 (설정 메뉴에서 입력 권장)
const DEFAULT_TEST_ROOT_URL = "https://drive.google.com/drive/folders/18dd5Gssjlw9jGZJHmES91HWNxKVqD32A";

// 로컬 스토리지 키
const STORAGE_KEY = "YONSEI_PREMIUM_CONFIG_V2";

// 전역 상태 변수
let authMode = 'initial'; // initial, student, admin, master
let curCatId = "";
let examSession = {
    studentName: "",
    grade: "",
    categoryId: "",
    date: "",
    answers: {}, // { qId: answerVal }
    startTime: null,
    isExamActive: false
};
let examTimer = null;
let fData1 = null;
let fData2 = null;

// 문제 유형/영역 상수
const SECTIONS = ["Grammar", "Writing", "Reading", "Listening", "Vocabulary"];
const SUB_TYPE_MAP = {
    "Grammar": ["가정법", "관계대명사", "관계부사", "관계사", "관계사/의문사", "관계사/접속사", "대명사", "명사", "병렬 구조", "분사", "분사구문", "비교급", "수동태", "수일치", "시제", "일치/화법", "접속사", "조동사", "준동사", "지칭 복합", "특수구문", "형식", "형용사", "형용사/부사", "화법", "to부정사", "to부정사/동명사", "기타"],
    "Writing": ["레벨1", "레벨2", "레벨3", "레벨4", "레벨5", "레벨6", "레벨7", "레벨8", "레벨9", "문장 완성", "글 요약", "작문", "기타"],
    "Reading": ["글 요약", "내용 일치", "대의 파악", "목적", "문장 연결성", "문장 완성", "문장 의미", "밑줄 추론", "심리/심경", "빈칸추론", "삽입", "세부사항", "순서", "어휘 추론", "어휘 활용", "연결사", "요약/요지", "장문 빈칸", "장문 제목", "제목", "주제", "지칭", "추론", "흐름", "기타"],
    "Listening": ["계산", "그림 묘사", "목적 파악", "묘사", "받아쓰기", "상황파악", "세부사항", "심리/심경", "응답", "정보 요약", "주제", "단어 입력", "기타"],
    "Vocabulary": ["레벨1", "레벨2", "레벨3", "레벨4", "레벨5", "레벨6", "레벨7", "레벨8", "레벨9", "숙어", "기타"]
};

// 기본 설정 객체 (로컬 스토리지 없을 시 사용)
let globalConfig = {
    adminCode: "1111", // 초기 관리자 비번
    masterCode: "0000", // [New] 마스터 비번
    masterUrl: "https://script.google.com/macros/s/AKfycbw_wP7aQlfrUVyEZlORObmrQghbRBMz3qpmz7aMj18jTc4WkuZhRVlp2kFfYxPWH3jFmQ/exec",
    mainServerLink: "https://drive.google.com/drive/folders/18dd5Gssjlw9jGZJHmES91HWNxKVqD32A", // [New] 연세국제 설정링크 중앙관리 시트 연동 링크
    geminiKey: "", // AI API Key
    categories: [], // { id, name, createdDate, targetFolderUrl }
    questions: [], // 로컬 캐싱된 문항 리스트
    classes: [], // 등록 학급 목록 예) ["중2A반", "중3B반"]
    logo: "https://drive.google.com/thumbnail?id=1-w2OQx2-M504_S7eEis0hF6nljhP3HwM&sz=w1000", // [Refactor] Flattened from assets
    banner: "https://drive.google.com/thumbnail?id=1-v3M4W_A3f5B-p9L75Bw3H5Z5kI7lJbX&sz=w1000", // [Refactor] Flattened from assets
};

// --- 초기화 및 로컬 저장소 함수 ---
function load() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
        try {
            const parsed = JSON.parse(data);
            // 병합 로직 (새로운 필드가 생길 수 있으므로)
            globalConfig = { ...globalConfig, ...parsed };
            // 중첩 객체 병합 보정
            if (parsed.assets) {
                // [Migration] 구버전 assets 객체가 있다면 평탄화하여 복구
                if (parsed.assets.logo) globalConfig.logo = parsed.assets.logo;
                if (parsed.assets.banner) globalConfig.banner = parsed.assets.banner;
            }
        } catch (e) {
            console.error("Local Load Error", e);
        }
    }
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(globalConfig));
}

// 초기 로드 실행
load();

// --- 로딩 인디케이터 제어 ---
function toggleLoading(show) {
    const el = document.getElementById("loading-overlay");
    if (el) el.style.display = show ? "flex" : "none";
}

// --- 클라우드 동기화 (설정값만) ---
async function saveConfigToCloud(silent = false) {
    if (!globalConfig.masterUrl) return; // URL 없으면 스킵

    // 필수 데이터만 전송 (questions는 별도 관리되므로 제외하거나 포함 여부 결정)
    // 여기서는 설정값(카테고리, 비번, 자산주소 등)만 백업
    const configToSave = {
        adminCode: globalConfig.adminCode,
        masterCode: globalConfig.masterCode, // [추가] Master Code 저장
        masterUrl: globalConfig.masterUrl, // [추가] Master Sync API URL 저장
        mainServerLink: globalConfig.mainServerLink, // [New] 메인 서버 링크 동기화
        geminiKey: globalConfig.geminiKey,
        categories: JSON.stringify(globalConfig.categories),
        questions: '[]', // Don't upload questions directly to unified config
        logo: globalConfig.logo,
        banner: globalConfig.banner,
        classes: JSON.stringify(globalConfig.classes || []),
    };

    if (!silent) toggleLoading(true);
    try {
        // [Single Root Policy] 모든 데이터는 mainServerLink(메인 폴더) 하위에 저장
        // mainServerLink 자체가 폴더 링크여야 함.
        const rootId = extractFolderId(globalConfig.mainServerLink);
        if (!rootId && !silent) {
            showToast("⚠️ 메인 서버 폴더 주소가 설정되지 않았습니다.");
            return;
        }

        const response = await fetch(globalConfig.masterUrl, {
            method: "POST",
            body: JSON.stringify({
                type: "SAVE_CONFIG",
                parentFolderId: rootId, // [Modified] 명시적 폴더 지정
                // Single Root Policy: assetFolderId는 이제 별도로 보내지 않거나 rootId와 동일하게 취급
                config: configToSave
            })
        });

        const text = await response.text();
        let json = {};
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.warn("Response Parse Error", text);
        }

        if (json.status === "Success") {
            if (!silent) showToast("☁️ 설정이 클라우드에 백업되었습니다. (파일 생성/갱신 완료)");
        } else {
            console.error("Cloud Save Error:", json);
            if (!silent) showToast(`❌ 백업 실패: ${json.message || "서버 응답 오류"}`);
        }
    } catch (e) {
        console.warn("Cloud Save Failed", e);
        if (!silent) showToast("⚠️ 클라우드 백업 실패 (네트워크 확인)");
    } finally {
        if (!silent) toggleLoading(false);
    }
}

async function loadConfigFromCloud(silent = false) {
    if (!globalConfig.masterUrl) {
        console.error("Load Config Failed: No Master URL");
        if (!silent) showToast("⚠️ Master URL이 없습니다.");
        return false;
    }

    if (!silent) toggleLoading(true);
    try {
        // [Single Root Policy] 메인 서버 폴더에서 설정 로드
        const rootId = extractFolderId(globalConfig.mainServerLink);
        if (!rootId) {
            if (!silent) showToast("⚠️ 메인 서버 폴더 설정을 먼저 해주세요.");
            return false;
        }



        console.log(`📡 Fetching Config... Root: ${rootId}, URL: ${globalConfig.masterUrl}`);
        // showToast(`📡 Loading... (${rootId ? 'Folder Set' : 'No Folder'})`);

        const res = await fetch(globalConfig.masterUrl, {
            method: "POST",
            body: JSON.stringify({
                type: "GET_CONFIG",
                parentFolderId: rootId
            })
        });

        const text = await res.text();
        console.log("📡 Raw Response:", text);

        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.error("JSON Parse Error", e);
            if (!silent) showToast("⚠️ 서버 응답 형식이 올바르지 않습니다.");
            return false;
        }

        if (json.status === "Success" && json.config) {
            console.log("✅ Config Loaded:", json.config);
            const c = json.config;
            if (c.adminCode) globalConfig.adminCode = c.adminCode;
            if (c.masterCode) globalConfig.masterCode = c.masterCode;
            // masterUrl은 덮어쓰지 않음 (현재 연결된 URL이 기준이므로)
            if (c.mainServerLink) globalConfig.mainServerLink = c.mainServerLink; // [New] Load Main Server Link
            if (c.geminiKey) globalConfig.geminiKey = c.geminiKey;

            if (c.categories) {
                try { globalConfig.categories = typeof c.categories === 'string' ? JSON.parse(c.categories) : c.categories; } catch (e) { console.warn("Categories Parse Error", e); }
            }
            if (c.logo) globalConfig.logo = c.logo;
            if (c.banner) globalConfig.banner = c.banner;
            if (c.classes) {
                try { globalConfig.classes = typeof c.classes === 'string' ? JSON.parse(c.classes) : c.classes; } catch(e) { console.warn('Classes Parse Error', e); }
            }

            // [Fix] 문항 데이터 로드 추가 (데이터 누락 방지)
            if (c.questions) {
                try {
                    const qData = typeof c.questions === 'string' ? JSON.parse(c.questions) : c.questions;
                    if (Array.isArray(qData)) {
                        globalConfig.questions = qData;
                        console.log(`✅ Loaded ${qData.length} questions from Config`);
                    }
                } catch (e) { console.warn("Questions Parse Error", e); }
            }

            save(); // 로컬 반영
            if (!silent) showToast("☁️ 설정 동기화 완료! (화면 갱신됨)");
            // [Fix] 중요: 설정 로드 후 즉시 화면 갱신 트리거
            applyBranding();
            return true;
        } else {
            console.warn("Server Error:", json);
            if (!silent) showToast(`⚠️ 서버 오류: ${json.message || "설정 없음"}`);
            return false;
        }
    } catch (e) {
        console.warn("Cloud Load Failed", e);
        if (!silent) showToast("⚠️ 네트워크/서버 통신 실패");
        return false;
    } finally {
        if (!silent) toggleLoading(false);
    }
}

// --- 유틸리티 함수 ---
function setCanvasId(id, layoutMode = 'standard') {
    const c = document.getElementById('dynamic-content');
    if (c) c.setAttribute('data-canvas-id', id);

    // [New] 레이아웃 모드 제어 (Scroll Fix)
    const parentCanvas = document.getElementById('app-canvas');
    if (parentCanvas) {
        if (layoutMode === 'full') {
            // 전체 화면 모드: 부모 패딩/스크롤 제거 -> 자식이 스크롤 전담
            parentCanvas.classList.add('!p-0', '!overflow-hidden');
        } else {
            // 기본 모드: 부모 패딩/스크롤 복원
            parentCanvas.classList.remove('!p-0', '!overflow-hidden');
            parentCanvas.style.removeProperty('padding');
            parentCanvas.style.removeProperty('overflow');
        }
    }
}

// [Emergency Fix] Force Toast Visibility - Absolute Centering
function showToast(m) {
    const el = document.getElementById("toast");
    if (el) {
        // 1. Reset Content & Base Style
        el.textContent = m;

        // 2. Force Visible State with CSS Centering (No Transform for X)
        el.style.position = 'fixed';
        el.style.left = '0';
        el.style.right = '0';
        el.style.margin = '0 auto'; // Magic Centering
        el.style.width = 'fit-content';
        el.style.textAlign = 'center';
        el.style.bottom = '40px';

        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)'; // Reset Y only
        el.style.zIndex = '99999999';

        // 3. Remove Hidden Class (Safety)
        el.classList.remove("hidden", "opacity-0", "translate-y-20");

        // 4. Set Timeout to Hide
        if (el.hideTimeout) clearTimeout(el.hideTimeout);
        el.hideTimeout = setTimeout(() => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(20px)'; // Slide down Y only
            setTimeout(() => {
                el.style.display = 'none';
            }, 300);
        }, 3000);
    } else {
        alert(m); // Fallback
    }
}

// [Utility] Standardized Empty State Renderer
function renderEmptyState(c, title) {
    c.innerHTML = `
        <div class="animate-fade-in-safe space-y-12 pb-20 mt-5">
            <h2 class="fs-32 text-[#013976] underline decoration-slate-200 decoration-8 underline-offset-8 leading-none font-black uppercase !border-none !pb-0">${title}</h2>
            
            <div class="card !bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center p-20 space-y-6">
                <div class="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-6xl shadow-inner mb-2">📭</div>
                <div class="text-center space-y-2">
                    <h3 class="fs-24 text-slate-600 font-bold uppercase">No Category Found</h3>
                    <p class="fs-17-reg text-slate-400 leading-relaxed">등록된 카테고리(시험지)가 없습니다.<br>먼저 카테고리(시험지)를 생성해 주세요.</p>
                </div>
            </div>
        </div>
    `;
}


// [중요] 절대 실패하지 않는 저장소: 재시도 로직 강화 (최대 10회)
async function sendReliableRequest(payload, silent = false) {
    console.log("🚀 sendReliableRequest started", payload);

    const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
    const MAX_RETRIES = 5;

    // 내부 헬퍼: 타임아웃 페치
    const fetchWithTimeout = (url, opts, time = 30000) => {
        return Promise.race([
            fetch(url, opts),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request Timeout (30s)')), time))
        ]);
    };

    for (let i = 1; i <= MAX_RETRIES; i++) {
        try {
            const t = document.getElementById("toast");
            if (t && !silent) {
                t.innerText = i > 1 ? `🛰️ 서버 응답 지연... 재시도 중 (${i}/${MAX_RETRIES})` : "🛰️ 클라우드 동기화 중...";
                t.className = "show";
            }

            console.log(`📡 Attempt ${i}/${MAX_RETRIES} sending...`);
            console.log(`📡 Attempt ${i}/${MAX_RETRIES} sending...`);
            // [Modified] Use custom timeout from opts or default 60s (Increased for large GET)
            const timeoutMs = (payload.timeout) ? payload.timeout : 60000;

            const response = await fetchWithTimeout(masterUrl, {
                method: 'POST',
                // [Revert] Use default fetch behavior (like loadConfigFromCloud) which works reliably
                // redirect: 'follow', 
                // headers: { "Content-Type": "text/plain;charset=utf-8" }, 
                body: JSON.stringify(payload)
            }, timeoutMs);

            const text = await response.text();
            let json = { status: "Error" };
            try {
                // [Fix] Sanitize JSON string (handle newlines, tabs, and unescaped characters in text fields from server)
                // 서버에서 내려온 텍스트에 줄바꿈이나 탭이 이스케이프되지 않고 들어있을 경우 파싱 에러 발생 방지
                let sanitizedText = text;
                try {
                    // 기본적인 제어 문자 이스케이프 (JSON 내 올바른 파싱을 위함)
                    sanitizedText = sanitizedText.replace(/[\n\r]/g, '\\n').replace(/\t/g, '\\t');
                    // 정규식으로 수정 후 다시 파싱 시도
                    json = JSON.parse(sanitizedText);
                } catch (e2) {
                    // 정규식으로도 해결 안 되면 원래 텍스트로 시도 (보수적 접근)
                    json = JSON.parse(text);
                }
            } catch (e) {
                // GAS 특성상 텍스트로 Success가 오는 경우 처리
                if (text.includes("Success")) json = { status: "Success", text: text };
                else json = { status: "Error", message: text };
            }

            if (json.status === "Success") {
                // 성공 시 즉시 리턴
                return json;
            } else {
                throw new Error(json.message || "Unknown Server Error");
            }
        } catch (e) {
            console.warn(`Sync Attempt ${i} Failed:`, e);
            if (i === MAX_RETRIES) {
                // If standard fetch fails (likely CORS or network), try no-cors as last resort
                // [Fix] Do NOT use no-cors for GET requests (we need the response data)
                if (payload.type && payload.type.startsWith('GET_')) {
                    throw new Error("Maximum retries reached. Network request failed.");
                }

                // This allows data to reach the server even if we can't read the response (Fire & Forget)
                try {
                    console.log("🛰️ Switching to no-cors mode...");
                    await fetch(masterUrl, {
                        method: 'POST',
                        mode: 'no-cors',
                        body: JSON.stringify(payload)
                    });
                    const t = document.getElementById("toast");
                    if (t) {
                        t.innerText = "⚠️ 저장 요청 전송됨 (응답 확인 불가 - 시트 확인 요망)";
                        t.className = "show";
                        setTimeout(() => t.className = t.className.replace("show", ""), 5000);
                    }
                    return { status: "Success", message: "Sent via no-cors (No Response)" };
                } catch (e2) {
                    throw e; // Throw original error if no-cors also fails
                }
            }
            // 점진적 대기 시간 증가 (1초, 2초, 4초, ...)
            await new Promise(r => setTimeout(r, 1000 * Math.pow(1.2, i)));
        }
    }
}
function extractFolderId(url) {
    if (!url) return "";
    const matches = url.match(/folders\/([a-zA-Z0-9-_]+)/);
    if (matches) return matches[1];
    if (url.includes('/d/')) return url.split('/d/')[1].split('/')[0];
    return url.length > 20 ? url : "";
}

function convertToDirectLink(url) {
    if (!url || typeof url !== 'string') return "";
    try {
        // 이미 변환된 링크인 경우
        if (url.includes('googleusercontent.com/')) return url;

        // 구글 드라이브 ID 추출 정규식 (file/d/, id=, folders/ 등 대응)
        const patterns = [
            /file\/d\/([a-zA-Z0-9-_]+)/,
            /id=([a-zA-Z0-9-_]+)/,
            /folders\/([a-zA-Z0-9-_]+)/,
            /file\/d\/([a-zA-Z0-9-_]+)/,
            /id=([a-zA-Z0-9-_]+)/,
            /open\?id=([a-zA-Z0-9-_]+)/,
            /folders\/([a-zA-Z0-9-_]+)/,
            /uc\?.*id=([a-zA-Z0-9-_]+)/
        ];

        for (let pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                // 썸네일 URL 사용 (CORB 우회)
                return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
            }
        }
    } catch (e) {
        console.error("Link conversion error:", e);
    }
    return url;
}

// 구글 드라이브 및 일반 이미지 URL에 안전하게 타임스탬프를 적용하는 헬퍼
function getSafeImageUrl(url) {
    if (!url || typeof url !== 'string') return "";
    const directUrl = convertToDirectLink(url);
    // 구글 드라이브 링크나 Data URI(base64)에는 타임스탬프를 붙이지 않음 (오류 유발 방지)
    if (directUrl.includes('drive.google.com') || directUrl.startsWith('data:')) {
        return directUrl;
    }
    // 일반 HTTP 링크에만 캐시 방지 타임스탬프 적용
    return directUrl.split('&t=')[0] + '&t=' + Date.now();
}

// 브랜딩 적용
function applyBranding() {
    const hL = document.getElementById('h-logo'), sR = document.getElementById('rank-text');
    if (globalConfig.logo && hL) {
        const url = getSafeImageUrl(globalConfig.logo);
        hL.innerHTML = `<img id="initial-logo" src="${url}" style="max-height: 56px; width: auto; object-fit: contain;" onerror="this.src=''; if(this.parentElement) this.parentElement.innerText='Academy Logo';">`;
        hL.classList.remove('opacity-20');
    }
    if (sR) { sR.innerText = "ADMIN"; sR.className = "fs-32 font-black admin-text"; }
}

// --- New Layout Control ---
function changeMode(mode) {
    checkUnsavedChanges(() => {
        const body = document.body;
        const c = document.getElementById('dynamic-content');

        // Reset layout state
        // [Fix] student 모드는 로딩 완료 후 사이드바 제거
        if (mode !== 'student') {
            body.classList.remove('has-sidebar');
        }

        if (mode === 'initial') {
            renderInitialScreen(); // Draw Initial Splash Screen (No Banner, No Start Button)
        }
        else if (mode === 'student') {
            renderStudentLogin(); // Draw Student Info Input Directly
        }
        else if (mode === 'auth_admin') {
            authMode = 'admin';
            renderAuthScreen(); // Draw Auth Form
        }
        else if (mode === 'auth_master') {
            authMode = 'master';
            renderAuthScreen(); // Draw Auth Form
        }
        else if (mode === 'admin_dashboard') {
            body.classList.add('has-sidebar');
            renderSidebarNav();
            changeTab('records'); // Default tab
        }
    });
}

function renderAuthScreen() {
    const c = document.getElementById('dynamic-content');
    setCanvasId(authMode === 'admin' ? '03' : '04');
    const isAdmin = authMode === 'admin';
    c.innerHTML = `
        <div class="animate-fade-in-safe flex flex-col items-center mt-5 space-y-10">
            <div class="canvas-premium-box !max-w-2xl w-full">
                <div class="flex flex-row items-start gap-10">

                    <!-- 좌측: 아이콘 + 제목 -->
                    <div class="flex flex-col items-center gap-4 flex-shrink-0 w-40 border-r border-slate-200 pr-10">
                        <div class="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-inner relative z-10 unified-animate">
                            🔐
                            <div class="absolute inset-0 bg-blue-100/30 rounded-full blur-2xl opacity-50 scale-150 -z-10"></div>
                        </div>
                        <h2 class="fs-18 ${isAdmin ? 'text-[#013976]' : 'text-sky-500'} uppercase text-center font-black tracking-tight leading-tight">
                            ${isAdmin ? 'ADMIN<br>ACCESS' : 'MASTER<br>CONSOLE'}
                        </h2>
                    </div>

                    <!-- 우측: 폼 -->
                    <div class="flex-1 space-y-4">
                        <input type="password" id="ac" class="ys-field text-center font-black" placeholder="Enter Access Code" autocomplete="off" onkeyup="if(event.key==='Enter') verifyAuth('${authMode}')">
                        <button onclick="verifyAuth('${authMode}')" class="btn-ys w-full !py-5 transition-all active:scale-95 fs-18 font-bold">🔑 ACCESS NOW</button>
                        <button onclick="goHome()" class="w-full text-slate-400 fs-14 underline hover:text-red-500 transition-all font-medium">CANCEL &amp; RETURN</button>
                    </div>

                </div>
            </div>
        </div>
    `;
    setTimeout(() => document.getElementById('ac')?.focus(), 100);
}

// [초기 화면] 배너 및 시작 버튼 제거됨
function renderInitialScreen() {
    // Restore Header/Footer/Sidebar visibility if needed
    const header = document.getElementById('app-header');
    const footer = document.getElementById('app-footer');
    const sidebar = document.getElementById('app-sidebar');
    const mainContainer = document.getElementById('main-container');

    if (header) header.style.display = ''; // [Fix] flex가 아니라 빈 문자열로 CSS 우선권 복원
    if (footer) footer.style.display = '';
    if (sidebar) sidebar.style.display = ''; // [Fix] 시험 모드 등에서 강제로 none 처리된 사이드바 복원!

    if (mainContainer) {
        mainContainer.style.height = ''; // Reset to CSS calc
        mainContainer.style.padding = ''; // Reset
        mainContainer.style.margin = '';
        mainContainer.style.maxWidth = '';
        mainContainer.style.display = '';
    }

    const c = document.getElementById('dynamic-content');
    setCanvasId('01');
    c.className = "w-full h-full"; // Reset class
    c.innerHTML = `
                <div class="animate-fade-in-safe flex flex-col items-center pb-20 mt-5 space-y-10">
                    <div class="canvas-premium-box !max-w-4xl hover:scale-[1.01]">
                        <div class="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-4xl shadow-inner relative z-10 unified-animate">
                            🎓
                            <div class="absolute inset-0 bg-blue-100/30 rounded-full blur-2xl opacity-50 scale-150 -z-10"></div>
                        </div>
                        
                        <h1 class="fs-32 text-[#013976] mb-4 tracking-tighter uppercase leading-none font-black text-center">
                            YONSEI INTERNATIONAL ENGLISH
                        </h1>
                        <p class="fs-14 text-slate-400 mb-12 tracking-[0.2em] font-medium text-center">AI POWERED ASSESSMENT ENGINE</p>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl mx-auto">
                            <button onclick="changeMode('student')" class="group p-10 bg-white border-2 border-slate-100 rounded-[2rem] hover:border-[#013976] hover:bg-slate-50 transition-all duration-500 text-center shadow-lg hover:shadow-2xl">
                                <span class="text-5xl block mb-4 group-hover:scale-110 transition-transform">📝</span>
                                <h3 class="fs-18 text-[#013976] font-black uppercase mb-2">Student Login</h3>
                                <p class="text-slate-400 fs-16 font-medium">온라인 레벨테스트 응시</p>
                            </button>
                            <button onclick="changeMode('auth_admin')" class="group p-10 bg-[#013976] border-2 border-transparent rounded-[2rem] hover:bg-[#002855] transition-all duration-500 text-center shadow-lg hover:shadow-2xl">
                                <span class="text-5xl block mb-4 group-hover:scale-110 transition-transform">⚙️</span>
                                <h3 class="fs-18 text-white font-black uppercase mb-2">Admin Panel</h3>
                                <p class="text-blue-200/60 fs-16 font-medium">관리자 전용 대시보드</p>
                            </button>
                        </div>
                    </div>
                </div>
            `;
}

function renderStudentView() {
    // Deprecated but kept for reference if needed, functionality moved to renderInitialScreen and renderStudentLogin
    renderInitialScreen();
}

function goHome() {
    // Reset Session
    examSession.isExamActive = false;
    // Go to initial view
    changeMode('initial');
}

// 시험 진행 중 확인 함수
function checkExamInProgress() {
    if (examSession.isExamActive) {
        alert("시험이 진행 중입니다. 시험 화면으로 이동하세요.");
        // 강제로 시험 화면 렌더링 (Student Mode 내에서 처리)
        return true;
    }
    return false;
}

// 시험 취소 함수
function cancelExam() {
    if (confirm("정말 시험을 취소하겠습니까?")) {
        if (examTimer) clearInterval(examTimer);
        examSession = { studentName: "", grade: "", date: "", categoryId: "", answers: {}, startTime: null, isExamActive: false };
        alert("시험이 취소되었습니다.");
        goHome();
    }
}


async function verifyAuth(mode) {
    const pw = document.getElementById('ac').value;
    if (!pw) return showToast("비밀번호를 입력하세요.");

    toggleLoading(true);

    // 1. 클라우드 최신 정보 동기화 (Strict Cloud-First)
    try {
        if (globalConfig.masterUrl) {
            // [Modified] Sync attempt
            const success = await loadConfigFromCloud(true);

            // [Deadlock Fix] 메인 서버 링크가 없어서 실패한 경우(초기 세팅 전)에는 
            // 로그인을 허용해야 설정이 가능함. 따라서 실패해도 로컬 코드로 검증 시도.
            if (!success) {
                if (!globalConfig.mainServerLink) {
                    console.log("⚠️ Main Server Link missing. Allowing offline auth for initial setup.");
                } else {
                    // 링크가 있는데 실패했다면 진짜 네트워크 오류이거나 권한 문제
                    console.warn("⚠️ Sync failed but link exists. Proceeding with caution.");
                    // throw new Error("Cloud Sync Failed"); // [Strict Mode Off] -> 사용성을 위해 오프라인 허용
                }
            }
        } else {
            // URL이 없는 최초 상태면 예외적으로 통과 (설정하러 들어가야 하므로)
            console.log("Master URL not set, skipping sync");
        }
    } catch (e) {
        // [Strict] 오프라인 진입 차단
        toggleLoading(false);
        console.warn("Auth Sync Failed");
        showToast("⛔ 네트워크 연결이 필요합니다. (보안 접속 불가)");
        return; // 진입 차단
    }

    toggleLoading(false);

    // 2. 검증 (동기화된 데이터로 대조) - [Fix] 타입 불일치(숫자/문자) 방지를 위해 문자열 변환 비교
    if (mode === 'admin' && String(pw) === String(globalConfig.adminCode)) {
        changeMode('admin_dashboard');
    } else if (mode === 'master' && String(pw) === String(globalConfig.masterCode || "0000")) {
        // [Refactor] master_dashboard 제거 - 인증 성공 시 직접 주요사항 설정으로 이동
        const c = document.getElementById('dynamic-content');
        renderMainConfig(c);
    } else {
        showToast("⛔ 비밀번호가 올바르지 않습니다.");
        const el = document.getElementById('ac');
        if (el) { el.value = ''; el.focus(); }
    }
}


// --- Student Mode Logic (Global) ---
function startStudentMode() {
    renderStudentLogin();
}




function renderSidebarNav() {
    let b = `<button onclick="changeTab('records')" id="btn-records" class="w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all">📊 학생 성적표 확인</button><button onclick="changeTab('score_input')" id="btn-score_input" class="w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all">✏️ 학생 성적 수동 입력</button><button onclick="changeTab('stats')" id="btn-stats" class="w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all">📈 문항 및 학생 통계</button><button onclick="changeTab('bank')" id="btn-bank" class="w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all">📋 문항 리스트 등록·수정</button>`;
    b += `<button onclick="changeTab('cat_manage')" id="btn-cat_manage" class="w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all">📂 시험지 관리</button>`;
    document.getElementById('sidebar-nav').innerHTML = b;
    applyBranding();
}

// --- 이탈 방지 로직 ---
function hasUnsavedChanges() {
    const c = document.getElementById('dynamic-content');
    if (!c) return false;
    const cid = c.getAttribute('data-canvas-id');

    // 06: 성적 수동 입력 — 학생명 또는 문항 점수 입력 시 경고
    if (cid === '06') {
        const nameVal = document.getElementById('input-student-name')?.value?.trim();
        if (nameVal) return true;
        const hasQScore = Array.from(document.querySelectorAll('[id^="q-score-"]')).some(inp => inp.value !== '');
        if (hasQScore) return true;
        return false;
    }
    // 08: 카테고리가 선택된 상태(리스트 조회 중)에서 이탈 시 경고
    if (cid === '08') {
        return !!curCatId;
    }
    // 07-2(부분 수정), 08-1(등록), 08-2(수정): 진입한 상태라면 무조건 경고
    if (cid === '08-2' || cid === '08-1' || cid === '08-2') {
        return true;
    }
    return false;
}

function checkUnsavedChanges(callback) {
    if (hasUnsavedChanges()) {
        if (confirm("작업 중인 정보를 저장하지 않았을 경우 정보가 손실됩니다.")) {
            callback();
        }
    } else {
        callback();
    }
}

function changeTab(tab) {
    checkUnsavedChanges(() => {
        // [Fix] 탭 전환 시 레이아웃 완전 복원 (어느 탭에서 와도 정상화)
        const _header = document.getElementById('app-header');
        const _footer = document.getElementById('app-footer');
        const _mc = document.getElementById('main-container');
        const _ac = document.getElementById('app-canvas');
        const _dc = document.getElementById('dynamic-content');
        if (_header) _header.style.display = '';
        if (_footer) _footer.style.display = '';
        if (_mc) { _mc.style.marginTop = ''; _mc.style.height = ''; }
        if (_ac) {
            _ac.style.padding = '';
            _ac.style.overflow = '';
            _ac.style.overflowY = '';
            _ac.classList.remove('!p-0', '!overflow-hidden');
        }
        if (_dc) _dc.className = 'w-full h-full';

        document.querySelectorAll('#sidebar-nav button').forEach(el => el.className = "w-full p-4 rounded-xl font-black text-slate-400 hover:text-white flex items-center gap-4 fs-18 text-left transition-all");
        const active = document.getElementById('btn-' + tab); if (active) active.className = "w-full p-4 rounded-xl font-black text-white bg-white/10 flex items-center gap-4 fs-18 text-left transition-all";
        const c = document.getElementById('dynamic-content');
        if (tab === 'records') renderRecords(c);
        if (tab === 'score_input') renderScoreInput(c);
        if (tab === 'bank') { curCatId = ''; renderBank(c); }
        if (tab === 'reg') renderRegForm();
        if (tab === 'main_config') renderMainConfig(c);
        if (tab === 'cat_manage') renderCatManage(c);
        if (tab === 'stats') renderStats(c);
    });
}

// --- 로고 및 자산 관리 (통합됨) ---


async function upAs(e, k) {
    const file = e.target.files[0];
    if (!file) {
        console.log("No file selected");
        return;
    }

    console.log("File selected:", file.name, "Type:", k);

    const masterUrl = globalConfig.masterUrl;
    if (!masterUrl) {
        console.error("Master URL not set");
        return showToast("마스터 싱크 주소를 먼저 저장해 주세요.");
    }

    const targetFolderId = extractFolderId(globalConfig.mainServerLink);

    if (!targetFolderId) {
        console.error("No Main Server Folder ID available");
        return showToast("메인 서버 폴더가 설정되지 않았습니다.");
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        const localData = ev.target.result;
        console.log("File loaded, size:", localData.length);

        // 1단계: 로컬 이미지 즉시 화면에 노출 (사용자 대기 방지)
        const previewEl = document.getElementById(`pv-${k}`);
        if (previewEl) {
            previewEl.innerHTML = `<img src="${localData}" class="max-h-full p-6 opacity-60 animate-pulse">`;
        }

        toggleLoading(true); // 로딩 시작
        showToast("🛰️ 클라우드 동기화 중...");

        try {
            const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
            const payload = {
                type: 'LOGO_SAVE',
                parentFolderId: targetFolderId, // [Single Root] Target Main Folder
                fileData: localData.split(',')[1],
                mimeType: file.type,
                assetName: k
            };

            console.log("Sending payload to server...");
            // [핵심] 10회 재시도 보장 전송
            const result = await sendReliableRequest(payload);

            if (result.status === "Success") {
                const finalUrl = result.url || (result.text ? result.text.match(/https?:\/\/[^\s]+/)?.[0] : "");
                if (finalUrl) {
                    console.log("Upload success! URL:", finalUrl);
                    const safeUrl = getSafeImageUrl(finalUrl);
                    globalConfig[k] = safeUrl; // [Refactor] Update flat config (logo/banner)
                    save();
                    await saveConfigToCloud();
                    applyBranding();
                    if (previewEl) previewEl.innerHTML = `<img src="${globalConfig[k]}" class="max-h-full p-6">`;
                    showToast(`✅ 클라우드 저장 성공!`);
                    changeTab('main_config'); // [Standardization] Reset view after action (Updated to main_config)
                } else { throw new Error("URL missing in response"); }
            } else {
                throw new Error("Upload failed: " + (result.message || "Unknown error"));
            }
        } catch (err) {
            console.error("Upload error:", err);
            showToast("❌ 전송 실패: " + err.message);
            // 로컬 임시 보관 로직 제거 (사용자 의도 반영: 서버 실패 시 확실히 실패 처리)
            if (previewEl) {
                // 실패 시 미리보기 제거 또는 에러 표시
                previewEl.innerHTML = '<span class="text-base text-red-500 font-bold">Upload Failed</span>';
            }
        } finally {
            toggleLoading(false); // 로딩 종료
        }
    };

    reader.onerror = (err) => {
        console.error("FileReader error:", err);
        showToast("❌ 파일 읽기 오류");
    };

    reader.readAsDataURL(file);
}



// 4. [기능] 유형별 UI 가이드 및 가시성 제어
function toggleTypeUI(type) {
    const choiceArea = document.getElementById('choice-area');
    const ansInput = document.getElementById('q-ans');
    const ansLabel = document.getElementById('ans-label');

    if (type === 'choice') {
        choiceArea.classList.remove('hidden');
        ansInput.placeholder = "정답 번호 (1-5)";
        ansLabel.innerText = "5. Answer (객관식 정답)";
        renderOptions(document.getElementById('opt-cnt').value);
    } else if (type === 'short') {
        choiceArea.classList.add('hidden');
        ansInput.placeholder = "단답형 키워드 입력";
        ansLabel.innerText = "5. Answer (주관식 정답)";
    } else if (type === 'essay') {
        choiceArea.classList.add('hidden');
        ansInput.placeholder = "서술형 모범 답안 혹은 가이드 입력";
        ansLabel.innerText = "5. Model Answer (작문형 모범답안)";
    }
}

// 5. [기능] 세부 유형 목록 업데이트
// 5. [기능] 세부 유형 목록 업데이트
function upDet(v) {
    const s = document.getElementById('q-subtype') || document.getElementById('q-det');
    if (!s) return;

    if (!v) {
        s.innerHTML = '<option value="" disabled selected hidden>주 영역을 먼저 선택하세요</option>';
        return;
    }

    const list = [...(SUB_TYPE_MAP[v] || [])];
    if (list.length === 0) {
        s.innerHTML = '<option value="" disabled selected hidden>해당 주 영역에 세부 항목이 없습니다</option>';
    } else {
        s.innerHTML = '<option value="" disabled selected hidden>세부 영역을 선택하세요</option>' + list.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

// 6. [기능] 이미지 파일 Base64 추출 (H열, I열)
function handleDualFile(e, idx) {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
        const obj = { base64: ev.target.result.split(',')[1], name: f.name, mime: f.type };
        if (idx === 1) fData1 = obj; else fData2 = obj;
        document.getElementById(`pv-${idx}`).innerHTML = `<img src="${ev.target.result}" class="max-h-full mx-auto object-contain rounded-xl">`;
    };
    r.readAsDataURL(f);
}

// 7. [기능] 객관식 보기 입력 박스 동적 생성
function renderOptions(cnt) {
    const g = document.getElementById('opt-grid'); g.innerHTML = '';
    for (let i = 0; i < cnt; i++) {
        g.innerHTML += `
                    <div class="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 focus-within:border-[#013976] transition-all hover:bg-white hover:shadow-md duration-300">
                        <span class="fs-18 text-[#013976] opacity-30">${i + 1}</span>
                        <input type="text" id="opt-${i}" class="bg-transparent border-none outline-none text-base flex-grow placeholder:text-slate-300" placeholder="보기 ${i + 1} 내용을 입력하세요">
                    </div>`;
    }
}

// 8. [기능] 최종 클라우드 전송 및 영구 저장
// 8. [기능] 최종 클라우드 전송 및 영구 저장
async function saveQ() {
    const btn = document.getElementById('save-btn');

    try {
        const txt = document.getElementById('q-text').value;
        const ans = document.getElementById('q-ans').value;
        const type = document.getElementById('q-type').value;

        if (!txt || !ans) throw new Error("문항 내용과 정답(답안)은 필수 입력 사항입니다.");

        btn.disabled = true;
        btn.innerText = "🛰️ CLOUD SYNCING...";

        // [수정] DOM에서 직접 값을 읽어와 신뢰성 확보
        const catSelect = document.getElementById('reg-cat-select');
        if (catSelect) curCatId = catSelect.value;

        const cat = globalConfig.categories.find(c => c.id === curCatId);
        if (!cat) throw new Error("선택된 카테고리가 유효하지 않습니다. 카테고리를 다시 선택해주세요.");

        // 폴더 ID 추출 및 검증
        let pId = "";
        try {
            pId = extractFolderId(cat.targetFolderUrl);
        } catch (e) { console.warn("Folder ID extraction failed", e); }

        if (!pId) throw new Error(`'${cat.name}' 카테고리의 폴더 주소가 올바르지 않습니다. 설정에서 확인해주세요.`);

        let options = [];
        if (type === 'choice') {
            const optCnt = document.getElementById('opt-cnt').value;
            for (let i = 0; i < optCnt; i++) {
                const val = document.getElementById(`opt-${i}`).value;
                if (val) options.push(val);
            }
        }

        const payload = {
            type: 'QUESTION_SAVE_INDEPENDENT',
            parentFolderId: pId,
            categoryName: cat.name,
            id: Date.now(),
            catId: curCatId,
            questionType: type,
            difficulty: document.getElementById('q-diff').value,
            section: document.getElementById('q-sec').value,
            subType: document.getElementById('q-det').value,
            passage1: document.getElementById('q-p1').value,
            questionTitle: txt,
            text: txt,
            answer: ans,
            score: document.getElementById('q-score').value,
            options: options,
            fileData1: fData1?.base64 || "", fileName1: fData1?.name || "", mimeType1: fData1?.mime || "",
            fileData2: fData2?.base64 || "", fileName2: fData2?.name || "", mimeType2: fData2?.mime || ""
        };

        const serverPayload = { ...payload, multipleChoiceConfig: JSON.stringify(options), options: JSON.stringify(options) };

        const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
        if (!masterUrl) throw new Error("Master URL (Apps Script URL)이 설정되지 않았습니다.");

        // [핵심] 10회 재시도 보장 전송
        const result = await sendReliableRequest(serverPayload);

        // 2. 성공 시 데이터 반영
        payload.fileUrl1 = result.fileUrl1 || payload.fileUrl1;
        payload.fileUrl2 = result.fileUrl2 || payload.fileUrl2;

        // 거대 데이터 정리
        delete payload.fileData1; delete payload.fileData2;
        delete payload.fileName1; delete payload.fileName2;
        delete payload.mimeType1; delete payload.mimeType2;

        globalConfig.questions.push(payload);
        save();
        saveConfigToCloud(); // [최적화] 백그라운드에서 동기화 진행 (UI 지연 방지)

        showToast("✅ 문항이 클라우드 DB에 안전하게 저장되었습니다.");

        // 초기화
        fData1 = null; fData2 = null;
        changeTab('bank');

    } catch (e) {
        console.error("SaveQ Error:", e);
        showToast("❌ 저장 실패: " + e.message);
        btn.disabled = false;
        btn.innerText = "Sync & Save to Academy DB (Retry)";
    }
}


// 8-2. [기능] 문항 수정 폼 렌더링 (08-1과 규격 동기화 - Category Select 제거) - OBSOLETE (구형 폼)
async function obsolete_renderEditForm(id) {
    const q = globalConfig.questions.find(item => String(item.id).trim() === String(id).trim());
    if (!q) return showToast("문항 정보를 찾을 수 없습니다.");

    const c = document.getElementById('dynamic-content');
    setCanvasId('08-2', 'full'); // Use full layout similar to 08-1
    document.getElementById('app-canvas').classList.add('!overflow-hidden');

    const attemptReturn = () => {
        if (confirm("수정을 취소하고 돌아가시겠습니까?")) {
            document.getElementById('app-canvas').classList.remove('!overflow-hidden');
            renderBank();
        }
    };

    c.innerHTML = `
        <div class="h-full flex flex-col p-6 animate-fade-in text-[14px] font-normal text-slate-700 bg-slate-50">
            <!-- Header -->
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
                 <div>
                    <h2 class="text-[18px] font-bold text-[#013976] flex items-center gap-2">
                        <span class="text-xl">✏️</span> Edit Question (문항 수정)
                    </h2>
                    <p class="text-slate-500 text-xs mt-1">ID: ${q.id}</p>
                </div>
                
                <div class="flex items-center gap-3">
                     <button onclick="updateQuestion('${q.id}')" class="btn-ys !bg-[#013976] !text-white !py-2.5 !px-5 !text-[14px] !font-bold shadow-md hover:brightness-110 flex items-center gap-2">
                        💾 Update
                    </button>
                    <div class="w-px h-6 bg-slate-300 mx-1"></div>
                    <button onclick="(${attemptReturn})()" class="btn-ys bg-white text-slate-500 border border-slate-200 hover:bg-slate-100 !py-2 !px-4 !text-[14px] !font-normal">
                        Cancel
                    </button>
                </div>
            </div>

            <div class="flex-1 flex flex-col lg:flex-row gap-6 min-h-0 overflow-hidden">
                <!-- [LEFT] Common Settings & Passage -->
                <div class="w-full lg:w-5/12 flex flex-col gap-4 min-h-0 overflow-y-auto custom-scrollbar pb-10">
                    
                    <!-- Common Settings (Read Only Category) -->
                    <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
                        <h3 class="text-[16px] font-bold text-[#013976] mb-3 flex items-center gap-2">
                            <span>⚙️ Common Settings</span>
                        </h3>
                         <div class="flex items-center gap-4">
                            <div class="flex-1">
                                <label class="block text-[14px] font-bold text-pink-600 mb-1">Category (시험지)</label>
                                <div class="w-full p-2 border rounded-lg text-[14px] font-bold bg-slate-100 text-slate-500">
                                    ${globalConfig.categories.find(c => c.id === q.catId)?.name || 'Unknown Category'}
                                </div>
                            </div>
                        </div>
                    </div>

                     <div class="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-[400px] relative group flex-shrink-0">
                        <!-- Toolbar -->
                        <div class="p-2 border-b bg-slate-50 flex gap-1 flex-wrap items-center sticky top-0 z-10 rounded-t-2xl">
                            <button onclick="execCmd('bold')" class="p-1.5 rounded hover:bg-slate-200 text-slate-600 font-bold text-[14px]" title="Bold">B</button>
                            <button onclick="execCmd('underline')" class="p-1.5 rounded hover:bg-slate-200 text-slate-600 underline text-[14px]" title="Underline">U</button>
                            <button onclick="execCmd('italic')" class="p-1.5 rounded hover:bg-slate-200 text-slate-600 italic text-[14px]" title="Italic">I</button>
                            <div class="w-px h-4 bg-slate-300 mx-1"></div>
                            
                            <!-- Symbols -->
                            <button onclick="insertSymbol('→')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">→ </button>
                            <button onclick="insertSymbol('↓')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">↓ </button>
                            <button onclick="insertSymbol('★')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">★ </button>
                            <button onclick="insertSymbol('※')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">※ </button>
                            <button onclick="insertSymbol('①')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">① </button>
                            <button onclick="insertSymbol('②')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">② </button>
                            <button onclick="insertSymbol('③')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">③ </button>
                            <button onclick="insertSymbol('④')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">④ </button>
                            <button onclick="insertSymbol('⑤')" class="p-1.5 rounded hover:bg-slate-200 text-[14px] text-slate-600">⑤ </button>
                        </div>
                        
                        <div class="p-4 pb-0">
                             <input type="text" id="edit-common-title" value="${q.commonTitle || ''}"
                                class="w-full py-2 pl-0 pr-2 text-[14px] font-normal border-b-2 border-indigo-100 focus:border-indigo-500 outline-none text-[#013976] placeholder-slate-300 transition-colors"
                                placeholder="[공통 발문]">
                        </div>

                        <div id="edit-passage-editor" class="flex-1 p-4 outline-none text-[14px] leading-relaxed text-slate-700 font-sans" contenteditable="true"></div>
                        
                        <!-- Image Upload (Hidden by default or similar to Reg form if needed, leaving layout compatible) -->
                     </div>
                </div>

                <!-- [RIGHT] Single Question Item -->
                <div class="w-full lg:w-7/12 flex flex-col gap-4 min-h-0 overflow-y-auto custom-scrollbar pb-20">
                     <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between items-center sticky top-0 z-20 shadow-sm backdrop-blur-sm bg-opacity-90">
                        <h3 class="text-[16px] font-bold text-indigo-800 flex items-center gap-2">
                            <span>📝 Question List</span>
                        </h3>
                    </div>
                    
                    <div id="edit-q-container"></div>
                </div>
            </div>
        </div>
    `;

    // Populate Passage
    let pContent = q.passage1 || "";
    if (q.commonTitle && pContent.includes(q.commonTitle)) {
        pContent = pContent.replace(new RegExp(`<p[^>]*>${q.commonTitle}</p>`), '');
    }
    document.getElementById('edit-passage-editor').innerHTML = pContent;

    // Render single item reusing renderRegItem logic
    // Note: renderRegItem is designed for list items. For edit form, we use it for a single item.
    // We treat it as index 1.
    renderRegItem('edit-q-container', 1, q, 'edit');
}

async function obsolete_updateQ(id) {
    const q = globalConfig.questions.find(item => String(item.id).trim() === String(id).trim());
    if (!q) return;

    if (!confirm('💾 수정된 문항 정보를 저장하시겠습니까?')) return;

    if (!globalConfig.masterUrl) {
        showToast('⚠️ 마스터 URL이 설정되지 않았습니다. 설정 탭에서 먼저 등록해 주세요.');
        return;
    }

    const cat = globalConfig.categories.find(c => c.id === q.catId);
    if (!cat) {
        showToast('⚠️ 문항의 카테고리 정보를 찾을 수 없습니다.');
        return;
    }

    // 08-1과 동일한 필드 ID 사용
    const sec = document.getElementById('q-section').value;
    const sub = document.getElementById('q-subtype').value.trim();
    const qType = document.getElementById('q-type').value;
    const diff = document.getElementById('q-difficulty').value;
    const title = document.getElementById('q-title').value.trim();
    const commonTitle = document.getElementById('q-common-title')?.value.trim() || '';
    const pass1 = document.getElementById('q-passage1').value.trim();
    const scr = parseInt(document.getElementById('q-score').value) || 0;
    let ans = document.getElementById('q-answer').value.trim();

    // [Validation] 영역, 유형, 배점, 발문 필수
    if (!sec) { showToast('⚠️ 주 영역을 선택해 주세요 (Section required)'); return; }
    if (!qType) { showToast('⚠️ 문항 유형을 선택해 주세요 (Type required)'); return; }
    if (scr <= 0) { showToast('⚠️ 배점은 1점 이상이어야 합니다 (Score > 0)'); return; }
    if (!title) {
        showToast('⚠️ 문항 발문은 필수입니다 (Title required)');
        document.getElementById('q-title').focus();
        return;
    }

    // [Validation] 유형별 정답/보기 체크
    if (qType !== '작문형' && !ans) {
        showToast('⚠️ 정답을 입력해 주세요 (Answer required)');
        document.getElementById('q-answer').focus();
        return;
    }
    if (qType === '객관형') {
        const checkChoices = Array.from(document.querySelectorAll('.q-choice-input')).map(i => i.value.trim());
        if (checkChoices.every(v => v === "")) {
            showToast('⚠️ 객관식 보기를 입력해 주세요 (Choices required)');
            return;
        }
    }

    // 이미지 처리 (새로 선택된 파일이 있으면 업로드 준비)
    const img1 = document.getElementById('q-img1').files[0];
    const img2 = document.getElementById('q-img2').files[0];

    let fd1 = null, mt1 = null, fn1 = null;
    let fd2 = null, mt2 = null, fn2 = null;

    if (img1) {
        const r1 = new FileReader();
        await new Promise(res => {
            r1.onload = e => {
                fd1 = e.target.result.split(',')[1];
                mt1 = img1.type;
                fn1 = img1.name;
                res();
            };
            r1.readAsDataURL(img1);
        });
    }

    if (img2) {
        const r2 = new FileReader();
        await new Promise(res => {
            r2.onload = e => {
                fd2 = e.target.result.split(',')[1];
                mt2 = img2.type;
                fn2 = img2.name;
                res();
            };
            r2.readAsDataURL(img2);
        });
    }

    let mc = '', model = '', options = [];
    ans = document.getElementById('q-answer').value.trim();
    if (qType === '객관형') {
        const count = parseInt(document.getElementById('q-choice-count').value);
        for (let i = 1; i <= count; i++) {
            const val = document.getElementById(`q - choice - ${i} `).value.trim();
            if (val) {
                options.push(val);
                mc += `${i}. ${val} \n`;
            }
        }
        ans = document.getElementById('q-answer').value.trim();
    } else if (qType === '주관형') {
        ans = document.getElementById('q-answer').value.trim();
    } else {
        model = document.getElementById('q-model').value.trim();
        ans = document.getElementById('q-answer').value.trim();
    }

    const payload = {
        type: 'QUESTION_UPDATE_INDEPENDENT',
        parentFolderId: extractFolderId(cat.targetFolderUrl),
        categoryName: cat.name,
        id: q.id,
        catId: q.catId,
        questionType: qType,
        difficulty: diff,
        section: sec,
        subType: sub,
        passage1: pass1,
        commonTitle: commonTitle,
        questionTitle: title,
        text: title,
        answer: ans,
        score: scr,
        multipleChoiceConfig: mc.trim(),
        options: options,
        modelAnswer: model,
        imgUrl1: q.fileUrl1 || q.imgUrl1 || "",
        imgUrl2: q.fileUrl2 || q.imgUrl2 || "",
        fileData1: fd1, fileName1: fn1, mimeType1: mt1,
        fileData2: fd2, fileName2: fn2, mimeType2: mt2,
        useAiGrading: document.getElementById('q-use-ai').checked
    };

    try {
        const result = await sendReliableRequest(payload);

        if (result.status === "Success") {
            payload.fileUrl1 = result.fileUrl1 || payload.fileUrl1;
            payload.fileUrl2 = result.fileUrl2 || payload.fileUrl2;
        }

        // 이미지 데이터 제거 (최적화)
        delete payload.fileData1; delete payload.fileData2;
        delete payload.fileName1; delete payload.fileName2;
        delete payload.mimeType1; delete payload.mimeType2;

        const idx = globalConfig.questions.findIndex(item => item.id == id);
        if (idx !== -1) globalConfig.questions[idx] = { ...globalConfig.questions[idx], ...payload };
        save();
        saveConfigToCloud(); // [최적화] 백그라운드 동기화

        showToast("✅ 수정 내용이 클라우드에 성공적으로 반영되었습니다.");
        fData1 = null; fData2 = null;
        changeTab('bank');
    } catch (e) {
        console.error("Critical Update Error:", e);
        showToast("❌ 수정 사항 전송 실패 (네트워크 확인)");
        btn.disabled = false;
        btn.innerText = "Update Question Info";
    }
}

// --- GEMINI AI INTEGRATION ---
async function callGeminiAPI(prompt, silent = false) {
    if (!globalConfig.geminiKey) { if (!silent) showToast("⚠️ 설정에서 Gemini API Key를 먼저 등록해주세요."); return null; }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${globalConfig.geminiKey}`;
    try {
        if (!silent) toggleLoading(true);
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        if (!silent) toggleLoading(false);

        if (data.error) {
            console.error("Gemini API Error:", data.error);
            throw new Error(data.error.message || "Unknown API Error");
        }

        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            console.warn("Gemini API returned no candidates (Safety filter?):", data);
            return "AI 분석을 생성할 수 없습니다. (내용이 안전 정책에 의해 필터링되었거나 응답이 비어있습니다.)";
        }

    } catch (e) {
        if (!silent) toggleLoading(false);
        console.error("Gemini Call Exception:", e);
        // Don't show toast for every AI error to avoid spamming user
        // if (!silent) showToast("AI 통신 오류: " + e.message);
        return "AI 서비스 연결 실패";
    }
}

// [New] AI 자동 채점 핵심 로직
async function gradeWithAI(q, userAns) {
    if (!userAns) return { score: 0, feedback: "답안이 입력되지 않았습니다." };
    if (!globalConfig.geminiKey) return null;

    // 묶음 지문 + 개별 지문 텍스트
    const bundleText = q.bundlePassageText || '';
    const passageText = q.passage1 || q.text || '';
    const fullContext = bundleText ? '[묶음 지문]\n' + bundleText + '\n\n[개별 문항 지문]\n' + passageText : passageText;

    // [Fix] 이미지 URL 수집 (문항 이미지 + 번들 이미지) — GAS에서 Drive 파일로 읽어 AI에 전달
    const imageUrls = [];
    if ((q.imgUrl || q.qImg) && (q.imgUrl || q.qImg).trim()) imageUrls.push((q.imgUrl || q.qImg).trim());
    if (q.bundleImgUrl && q.bundleImgUrl.trim()) imageUrls.push(q.bundleImgUrl.trim());

    const hasImages = imageUrls.length > 0;

    const prompt = `
[AI Online Grading Request]
 문항: ${q.questionTitle || q.text}
 유형: ${q.questionType}
 영역: ${q.section}
 정답/키워드: ${q.answer}
 모범 답안: ${q.modelAnswer || '없음'}
 학생 답안: ${userAns}
 배점: ${q.score}
${fullContext ? ' 지문(문맥):\n' + fullContext : ''}
${hasImages ? ' [이미지 첨부됨: 위 이미지들을 반드시 참고하여 채점하세요]' : ''}

[Instructions - 채점 기준 (반드시 준수)]
1. 위 지문(문맥)${hasImages ? '과 첨부 이미지' : ''}을 반드시 읽고, 학생의 답안이 빈칸/문맥에 알맞은지 판단하세요.
2. 학생의 답안이 정답/모범 답안과 의미적으로 일치하는지 분석하세요.

[주관형 관대한 채점 규칙 — 아래 모두 정답(만점) 처리]
- 대소문자 차이 무시 (예: "Mallet" = "mallet")
- 띄어쓰기 차이 무시 (예: "T Hudson" = "THudson")
- 하이픈(-), en dash(–), em dash(—) 혼용 허용 (예: "1815-1875" = "1815–1875")
- 정답에 포함된 핵심 단어를 포함하면, 추가 정보가 더 있어도 정답 (예: 정답="Mallet", 답안="(22) Mallet (street)" → 정답)
- 숫자↔한글 표기 혼용 허용 (예: "11.30" = "11시30분", "12 February" = "12월" = "2월12일")
- 아포스트로피(')와 백틱(\`)은 동일 문자로 간주
- 괄호 안의 선택적 표현이 포함되거나 생략되어도 정답 (예: "sandwich(es)" = "sandwich" = "sandwiches")
- 영어-한글 의미 동일 표현 허용 (예: "forty pounds" = "40 pounds")
- 동의어·유사 표현이 문맥상 동일 의미면 정답

[스펠링 엄격 규칙 — 아래는 오답 처리]
- 핵심 단어의 철자가 틀린 경우 오답 (예: "secratary" ≠ "secretary")
- 단, 단수/복수 차이, 관사(a/the) 추가/생략은 허용

[작문형]: 문맥, 문법, 핵심 단어 포함 여부를 종합 평가하여 0점에서 배점 사이의 점수를 부여하세요.

출력은 반드시 아래 JSON 형식으로만 하세요. (기타 텍스트 금지)

{"score": 점수숫자, "feedback": "간략한 채점 근거(한국어)"}
    `;

    try {
        const res = await callGeminiAPI(prompt, true, imageUrls); // 이미지 URL 전달
        if (!res) return null;
        const cleanRes = res.replace(/```json|```/g, "").trim();
        return JSON.parse(cleanRes);
    } catch (e) {
        console.error("AI Grading Error:", e);
        return null;
    }
}

async function handleAIAnalyze() {
    const p1 = document.getElementById('q-p1').value;
    const p2 = document.getElementById('q-p2').value;
    const text = p1 + "\n" + p2;
    if (!text.trim()) return showToast("분석할 지문 내용이 없습니다.");

    const prompt = `Analyze the following English text for an educational test item.
Text: "${text}"
Output ONLY a JSON object with these keys: "difficulty" (String one of: "최상", "상", "중", "하", "기초"), "keywords" (String comma separated), "category" (String best guess from "듣기(Listening)", "독해(Reading)", "어휘(Vocabulary)", "문법(Grammar)").`;

    const res = await callGeminiAPI(prompt);
    if (!res) return;

    try {
        const clean = res.replace(/```json|```/g, '');
        const json = JSON.parse(clean);

        if (json.difficulty) document.getElementById('q-diff').value = json.difficulty;
        showToast(`✅ 분석 완료! 난이도: ${json.difficulty}, 키워드: ${json.keywords}`);
    } catch (e) {
        showToast("AI 응답 해석 실패. 다시 시도해주세요.");
    }
}

async function handleAISuggest() {
    const type = document.getElementById('q-type').value;
    const p1 = document.getElementById('q-p1').value;
    if (!p1) return showToast("지문(Passage 1)을 먼저 입력해야 제안할 수 있습니다.");

    let prompt = "";
    if (type === 'choice') {
        prompt = `Based on the text below, create a multiple choice question.
Text: "${p1}"
Generate 1 correct answer and 4 plausible distractors.
Output ONLY a JSON object with keys: "answer" (String text of correct answer), "d1", "d2", "d3", "d4" (String texts of distractors).`;
    } else {
        prompt = `Based on the text below, suggest a model answer or key points for a ${type} question.
Text: "${p1}"
Output ONLY a JSON object with key: "answer" (String model answer).`;
    }

    const res = await callGeminiAPI(prompt);
    if (!res) return;

    try {
        const clean = res.replace(/```json|```/g, '');
        const json = JSON.parse(clean);

        if (type === 'choice') {
            // Randomize options
            const opts = [json.answer, json.d1, json.d2, json.d3, json.d4].sort(() => Math.random() - 0.5);
            const ansIdx = opts.indexOf(json.answer) + 1;

            // Fill UI
            document.getElementById('opt-cnt').value = 5;
            renderOptions(5);
            for (let i = 0; i < 5; i++) document.getElementById(`opt-${i}`).value = opts[i];
            document.getElementById('q-ans').value = ansIdx;
            showToast("✅ AI가 보기를 생성했습니다!");
        } else {
            document.getElementById('q-ans').value = json.answer;
            showToast("✅ AI가 예시 답안을 생성했습니다!");
        }
    } catch (e) {
        console.error(e);
        showToast("AI 응답 처리 실패");
    }
}

// --- V2 AI FUNCTIONS (Append) ---
async function handleAIAnalyzeV2() {
    const p1 = document.getElementById('q-p1').value;
    const p2 = document.getElementById('q-p2').value;
    const text = p1 + "\n" + p2;
    if (!text.trim()) return showToast("분석할 지문 내용이 없습니다.");

    const sec = document.getElementById('q-sec').value;
    const subTypes = SUB_TYPE_MAP[sec] ? SUB_TYPE_MAP[sec].join(", ") : "기타";

    const prompt = `Analyze the following English text for an educational test item.
Text: "${text}"
Context Section: "${sec}"
Available SubTypes: [${subTypes}]
Output ONLY a JSON object with these keys: 
"difficulty" (String one of: "최상", "상", "중", "하", "기초"), 
"keywords" (String comma separated), 
"subType" (String best match from Available SubTypes).`;

    const res = await callGeminiAPI(prompt);
    if (!res) return;

    try {
        const clean = res.replace(/```json|```/g, '');
        const json = JSON.parse(clean);

        if (json.difficulty) document.getElementById('q-diff').value = json.difficulty;
        if (json.keywords) document.getElementById('ai-keywords').value = json.keywords;
        if (json.subType) {
            const st = document.getElementById('q-det');
            const exists = Array.from(st.options).some(o => o.value === json.subType);
            if (exists) st.value = json.subType;
            else st.value = "(미분류)";
        }
        showToast(`✅ 분석 완료! 난이도: ${json.difficulty}`);
    } catch (e) {
        showToast("AI 응답 해석 실패. 다시 시도해주세요.");
    }
}

async function handleAIPassageRefine() {
    const p1 = document.getElementById('q-p1').value;
    if (!p1) return showToast("수정할 지문(Passage 1)을 입력해주세요.");

    const prompt = `Refine the following English text to be more natural and grammatically correct for an educational test.
Text: "${p1}"
Output ONLY the refined text. Do not add any introduction or quotes.`;

    const res = await callGeminiAPI(prompt);
    if (res) {
        document.getElementById('ai-passage-view').value = res.trim();
        showToast("✅ AI 지문 수정 완료! 제안 내용을 확인하세요.");
    }
}

async function handleAIAnswerSuggest() {
    const type = document.getElementById('q-type').value;
    const p1 = document.getElementById('q-p1').value;
    if (!p1) return showToast("지문(Passage 1)을 먼저 입력해야 제안할 수 있습니다.");

    let prompt = "";
    if (type === 'choice') {
        prompt = `Based on the text below, create a multiple choice question.
Text: "${p1}"
Generate 1 correct answer and 4 plausible distractors.
Output ONLY a JSON object with keys: "answer" (String text of correct answer), "d1", "d2", "d3", "d4" (String texts of distractors).`;
    } else {
        prompt = `Based on the text below, suggest a model answer or key points for a ${type} question.
Text: "${p1}"
Output ONLY a JSON object with key: "answer" (String model answer).`;
    }

    const res = await callGeminiAPI(prompt);
    if (!res) return;

    try {
        const clean = res.replace(/```json|```/g, '');
        const json = JSON.parse(clean);

        let displayText = "";

        if (type === 'choice') {
            const opts = [json.answer, json.d1, json.d2, json.d3, json.d4].sort(() => Math.random() - 0.5);
            const ansIdx = opts.indexOf(json.answer) + 1;

            document.getElementById('opt-cnt').value = 5;
            renderOptions(5);
            for (let i = 0; i < 5; i++) document.getElementById(`opt-${i}`).value = opts[i];
            document.getElementById('q-ans').value = ansIdx;

            displayText = `[정답: ${ansIdx}번 (${json.answer})]\n\n오답 보기:\n${opts.filter(o => o !== json.answer).join('\n')}`;
            showToast("✅ AI가 보기를 생성했습니다!");
        } else {
            document.getElementById('q-ans').value = json.answer;
            displayText = json.answer;
            showToast("✅ AI가 예시 답안을 생성했습니다!");
        }
        document.getElementById('ai-answer-view').value = displayText;

    } catch (e) {
        console.error(e);
        showToast("AI 응답 처리 실패");
    }
}

async function delQ(id) {
    const q = globalConfig.questions.find(item => item.id == id);
    if (!q) return;

    if (!confirm(`⚠️ [경고] 정말로 해당 문항을 삭제하시겠습니까?\n\n삭제 시 문항DB와 연동된 모든 정보(이미지 포함)가 복귀되지 않습니다. 똑같은 문항을 생성하려면 수동으로 다시 문항 생성을 해야 합니다.`)) return;

    toggleLoading(true);
    try {
        // [New] 이미지 파일 ID 추출 로직
        const getFileId = (url) => {
            if (!url) return null;
            let m = url.match(/id=([a-zA-Z0-9-_]+)/);
            if (m) return m[1];
            m = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (m) return m[1];
            return null;
        };

        const fileId1 = getFileId(q.fileUrl1);
        const fileId2 = getFileId(q.fileUrl2);

        // 1. 전용 문항DB 시트에서 행 삭제 (서버 확인 강제)
        const cat = globalConfig.categories.find(c => c.id === q.catId);
        const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
        if (cat && masterUrl) {
            const response = await fetch(masterUrl, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'QUESTION_DELETE_INDEPENDENT',
                    parentFolderId: extractFolderId(cat.targetFolderUrl),
                    categoryName: cat.name,
                    id: q.id,
                    // [New] 삭제할 이미지 파일 ID 전달
                    fileId1: fileId1,
                    fileId2: fileId2
                })
            });
            const resultText = await response.text();
            console.log("Delete Response:", resultText);
        }

        // 2. 로컬 메모리 및 설정 클라우드 갱신
        globalConfig.questions = globalConfig.questions.filter(item => item.id != id);
        save();
        await saveConfigToCloud();

        showToast("✅ 문항 및 관련 이미지가 클라우드 DB에서 영구 삭제되었습니다.");
        changeTab('bank');
    } catch (err) {
        console.error(err);
        showToast("⚠️ 삭제 처리 중 오류 발생");
    } finally {
        toggleLoading(false);
    }
}

// --- Drag & Drop Reordering Logic ---
let dragSrcEl = null;

function handleRowDragStart(e) {
    dragSrcEl = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
    e.currentTarget.classList.add('bg-blue-100', 'opacity-50');
}

function handleRowDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleRowDrop(e) {
    if (e.stopPropagation) e.stopPropagation();
    if (dragSrcEl !== e.currentTarget) {
        const target = e.currentTarget;
        const sourceDataId = dragSrcEl.getAttribute('data-id');
        const targetDataId = target.getAttribute('data-id');

        // DOM Swap (Simple approach: swap data and content)
        const sourceInnerHTML = dragSrcEl.innerHTML;
        dragSrcEl.innerHTML = target.innerHTML;
        target.innerHTML = sourceInnerHTML;

        dragSrcEl.setAttribute('data-id', targetDataId);
        target.setAttribute('data-id', sourceDataId);

        showToast("📍 순서가 변경되었습니다. '순서 저장' 버튼을 눌러 확정하세요.");
    }
    return false;
}

function handleRowDragEnd(e) {
    e.currentTarget.classList.remove('bg-blue-100', 'opacity-50');
    // Refresh visuals (No. update)
    const rows = document.querySelectorAll('#bank-table-body tr');
    rows.forEach((row, idx) => {
        const noEl = row.querySelector('.font-mono');
        if (noEl) noEl.innerHTML = `<div class="flex items-center justify-center gap-2"><span class="text-[10px] opacity-30">☰</span>${idx + 1}</div>`;
    });
}

// --- 마스터 설정창 (영구 보존 주소) ---
function renderMainConfig(c) {
    setCanvasId('10');
    c.innerHTML = `
        <div class="animate-fade-in-safe space-y-12 pb-20 text-left mt-5">

            <!-- ===== Row 1: Security & Identity + Server Infrastructure (2-col) ===== -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

                <!-- Security & Identity (Admin + Master in ONE card) -->
                <div>
                    <h3 class="fs-24 text-slate-800 font-black uppercase tracking-tight mb-4 flex items-center gap-3">
                        <span class="bg-slate-200 p-2 rounded-lg text-2xl">🔐</span> Security &amp; Identity
                    </h3>
                    <div class="card !bg-white border-2 border-slate-200 hover:border-blue-400 transition-all duration-300 shadow-sm hover:shadow-xl space-y-0 relative overflow-hidden group">
                        <!-- Admin Code -->
                        <div class="space-y-2 relative overflow-hidden">
                            <div class="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-7xl">🛡️</span></div>
                            <h4 class="fs-16 text-[#013976] font-bold uppercase">Admin Access Code</h4>
                            <p class="fs-14 text-slate-400">관리자 모드 접속 비밀번호</p>
                            <div class="flex gap-3 items-center">
                                <input type="password" id="admin-code-input" class="ys-field flex-grow fs-20 font-black text-[#013976] tracking-widest text-center" value="${globalConfig.adminCode || '1111'}" placeholder="CODE">
                                <button onclick="(async()=>{if(!confirm('💾 관리자 코드를 변경하시겠습니까?')) return; const v=document.getElementById('admin-code-input').value; if(v){globalConfig.adminCode=v; save(); await saveConfigToCloud(); showToast('✅ 관리자 코드가 변경되었습니다.');}else{showToast('⚠️ 유효한 코드를 입력하세요');}})()"
                                        class="bg-[#013976] text-white px-6 py-3 rounded-xl fs-14 font-bold hover:bg-blue-800 transition-all active:scale-95 whitespace-nowrap shadow-md flex-none">SAVE</button>
                            </div>
                        </div>
                        <div class="border-t border-slate-100"></div>
                        <!-- Master Code -->
                        <div class="space-y-2 relative overflow-hidden">
                            <div class="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-7xl">👑</span></div>
                            <h4 class="fs-16 text-indigo-700 font-bold uppercase">Master Access Code</h4>
                            <p class="fs-14 text-slate-400">최고 관리자 접속 비밀번호</p>
                            <div class="flex gap-3 items-center">
                                <input type="password" id="master-code-input" class="ys-field flex-grow fs-20 font-black text-indigo-700 tracking-widest text-center" value="${globalConfig.masterCode || '0000'}" placeholder="CODE">
                                <button onclick="(async()=>{if(!confirm('💾 마스터 코드를 변경하시겠습니까?')) return; const v=document.getElementById('master-code-input').value; if(v){globalConfig.masterCode=v; save(); await saveConfigToCloud(); showToast('✅ 마스터 코드가 변경되었습니다.');}else{showToast('⚠️ 유효한 코드를 입력하세요');}})()"
                                        class="bg-indigo-600 text-white px-6 py-3 rounded-xl fs-14 font-bold hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap shadow-md flex-none">SAVE</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Server Infrastructure (Apps Script + Main Folder in ONE card) -->
                <div>
                    <h3 class="fs-24 text-slate-800 font-black uppercase tracking-tight mb-4 flex items-center gap-3">
                        <span class="bg-blue-100 p-2 rounded-lg text-2xl">🌩️</span> Server Infrastructure
                    </h3>
                    <div class="card !bg-white border-2 border-blue-100 hover:border-blue-400 transition-all duration-300 shadow-sm hover:shadow-xl space-y-0 relative overflow-hidden group">
                        <!-- Apps Script Hub -->
                        <div class="space-y-2 relative overflow-hidden">
                            <div class="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-7xl">⚙️</span></div>
                            <h4 class="fs-16 text-indigo-700 font-bold uppercase">Apps Script Hub</h4>
                            <p class="fs-14 text-slate-500">Google Apps Script Web App URL</p>
                            <div class="flex gap-3 items-center">
                                <input type="text" id="m-url" autocomplete="off" class="ys-field flex-grow font-mono min-w-0" value="${globalConfig.masterUrl || ''}" placeholder="https://script.google.com/macros/s/...">
                                <button onclick="(async()=>{if(!confirm('💾 마스터 싱크 주소를 변경하시겠습니까?')) return; const mVal=document.getElementById('m-url').value; globalConfig.masterUrl=mVal; save(); await saveConfigToCloud(); showToast('✅ 마스터 주소가 업데이트되었습니다.');})()"
                                        class="bg-indigo-600 text-white px-6 py-3 rounded-xl fs-14 font-bold hover:bg-indigo-700 transition-all active:scale-95 whitespace-nowrap shadow-md flex-none">SAVE</button>
                            </div>
                        </div>
                        <div class="border-t border-slate-100"></div>
                        <!-- Main Server Folder -->
                        <div class="space-y-2 relative overflow-hidden">
                            <div class="absolute top-0 right-0 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-7xl">📂</span></div>
                            <h4 class="fs-16 text-blue-700 font-bold uppercase">Main Server Folder</h4>
                            <p class="fs-14 text-slate-500">Google Drive Root Folder URL</p>
                            <div class="flex gap-3 items-center">
                                <input type="text" id="main-server-folder" autocomplete="off" class="ys-field flex-grow font-mono min-w-0" value="${globalConfig.mainServerLink || ''}" placeholder="https://drive.google.com/drive/folders/...">
                                <button onclick="(async()=>{const val=document.getElementById('main-server-folder').value; globalConfig.mainServerLink=val; save(); await saveConfigToCloud(); showToast('✅ 메인 서버 폴더가 연결되었습니다.');})()"
                                        class="bg-blue-600 text-white px-6 py-3 rounded-xl fs-14 font-bold hover:bg-blue-700 transition-all active:scale-95 whitespace-nowrap shadow-md flex-none">SAVE</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ===== Row 2: Class Management + Intelligence Engine (2-col) ===== -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">

                <!-- Class Management -->
                <div>
                    <h3 class="fs-24 text-slate-800 font-black uppercase tracking-tight mb-4 flex items-center gap-3">
                        <span class="bg-green-100 p-2 rounded-lg text-2xl">🏫</span> Class Management
                    </h3>
                    <div class="card !bg-white border-2 border-green-200 hover:border-green-500 transition-all duration-300 shadow-sm hover:shadow-xl relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-9xl">🏫</span></div>
                        <div class="flex flex-col gap-4">
                            <!-- 제목 -->
                            <div>
                                <h4 class="fs-18 text-green-700 font-bold uppercase mb-1">Class Registration</h4>
                                <p class="fs-14 text-slate-500">학년별로 학급을 등록하세요. 학년 선택 시 해당 학급만 입력 화면에 표시됩니다.</p>
                            </div>
                            <!-- 입력 행: 학년 + 학급명 + 추가 + SAVE -->
                            <div class="flex gap-2 items-center">
                                <select id="new-class-grade" class="ys-field !w-32 flex-none">
                                    <option value="">선택</option>
                                    <option value="초1">초1</option><option value="초2">초2</option><option value="초3">초3</option>
                                    <option value="초4">초4</option><option value="초5">초5</option><option value="초6">초6</option>
                                    <option value="중1">중1</option><option value="중2">중2</option><option value="중3">중3</option>
                                    <option value="고1">고1</option><option value="고2">고2</option><option value="고3">고3</option><option value="고등">고등</option><option value="기타">기타</option>
                                </select>
                                <input type="text" id="new-class-input" class="ys-field !w-auto flex-grow min-w-0" placeholder="예) A반, 영어반" autocomplete="off" onkeydown="if(event.key==='Enter') addClassItem()">
                                <button onclick="addClassItem()" class="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl fs-14 font-bold shadow-md transition-all active:scale-95 whitespace-nowrap flex-none">+ 추가</button>
                                <button onclick="saveClassConfig()" class="bg-[#013976] hover:bg-[#002855] text-white px-6 py-3 rounded-xl fs-14 font-bold shadow-md transition-all active:scale-95 whitespace-nowrap flex-none">SAVE</button>
                            </div>
                            <!-- 등록 학급 목록 -->
                            <div id="class-list" class="space-y-2 min-h-[44px] bg-slate-50 rounded-xl p-3 border border-slate-200">
                                ${renderClassListHtml()}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Intelligence Engine -->
                <div>
                    <h3 class="fs-24 text-slate-800 font-black uppercase tracking-tight mb-4 flex items-center gap-3">
                        <span class="bg-purple-100 p-2 rounded-lg text-2xl">✨</span> Intelligence Engine
                    </h3>
                    <div class="card !bg-white border-2 border-purple-200 hover:border-purple-500 transition-all duration-300 shadow-sm hover:shadow-xl relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"><span class="text-9xl">✨</span></div>
                        <div class="flex flex-col gap-4 relative z-10">
                            <div>
                                <h4 class="fs-18 text-purple-700 font-bold uppercase mb-1">Gemini AI API Key</h4>
                                <p class="fs-14 text-slate-500">AI 문항 분석 및 자동 생성 기능을 위한 인증 키</p>
                            </div>
                            <div class="flex gap-3 items-center">
                                <input type="password" id="g-key" autocomplete="off" class="ys-field !bg-slate-50 !text-purple-900 border-slate-200 focus:border-purple-500 font-mono flex-grow" value="${globalConfig.geminiKey || ''}" placeholder="AI Studio Key">
                                <a href="https://aistudio.google.com/app/apikey" target="_blank"
                                   class="py-3 px-5 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center gap-2 hover:bg-purple-100 transition-all no-underline whitespace-nowrap flex-none">
                                    <span class="fs-14 font-bold text-purple-700">🔑 GET KEY</span>
                                </a>
                                <button onclick="(async()=>{if(!confirm('💾 API Key를 저장하시겠습니까?')) return; const gVal=document.getElementById('g-key').value; globalConfig.geminiKey=gVal; save(); await saveConfigToCloud(); showToast('✅ Gemini Key가 저장되었습니다.');})()"
                                        class="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-xl fs-14 font-bold shadow-md transition-all active:scale-95 whitespace-nowrap flex-none">SAVE</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ===== Row 3: Academy Branding (full width) ===== -->
            <div>
                <h3 class="fs-24 text-slate-800 font-black uppercase tracking-tight mb-4 flex items-center gap-3">
                    <span class="bg-pink-100 p-2 rounded-lg text-2xl">🎨</span> Academy Branding
                </h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <!-- Logo Config -->
                    <div class="space-y-3">
                        <label class="ys-label font-bold text-slate-600 block">School Logo (Main)</label>
                        <div id="pv-logo" class="h-48 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group hover:border-[#013976] transition-all">
                             ${getSafeImageUrl(globalConfig.logo) ? `<img src="${getSafeImageUrl(globalConfig.logo)}" class="max-h-full p-6 object-contain filter drop-shadow-sm">` : '<span class="text-slate-400 font-medium">No Logo Uploaded</span>'}
                             <div class="absolute inset-0 bg-[#013976]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <label for="l-in" class="cursor-pointer text-white font-bold border-2 border-white px-6 py-3 rounded-full hover:bg-white hover:text-[#013976] transition-all transform scale-90 group-hover:scale-100 duration-300">Upload Image</label>
                             </div>
                        </div>
                        <input type="file" onchange="upAs(event, 'logo')" class="hidden" id="l-in" accept="image/*">
                    </div>
                    <!-- Banner Config -->
                    <div class="space-y-3">
                        <label class="ys-label font-bold text-slate-600 block">Report Banner (Top)</label>
                        <div id="pv-banner" class="h-48 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center overflow-hidden relative group hover:border-[#013976] transition-all">
                             ${getSafeImageUrl(globalConfig.banner) ? `<img src="${getSafeImageUrl(globalConfig.banner)}" class="max-h-full p-2 object-contain">` : '<span class="text-slate-400 font-medium">No Banner Uploaded</span>'}
                             <div class="absolute inset-0 bg-[#013976]/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                <label for="b-in" class="cursor-pointer text-white font-bold border-2 border-white px-6 py-3 rounded-full hover:bg-white hover:text-[#013976] transition-all transform scale-90 group-hover:scale-100 duration-300">Upload Image</label>
                             </div>
                        </div>
                        <input type="file" onchange="upAs(event, 'banner')" class="hidden" id="b-in" accept="image/*">
                    </div>
                </div>
            </div>

        </div>`
}

// 학급 목록 HTML 렌더링 (학년별 그룹)
function renderClassListHtml() {
    const classes = (globalConfig.classes || []).filter(c => typeof c === 'object' && c.grade && c.name);
    if (classes.length === 0) return '<span class="text-slate-400 fs-14">등록된 학급이 없습니다.</span>';
    const GRADES = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3','고등','기타'];
    const groups = {};
    classes.forEach((c, i) => { if (!groups[c.grade]) groups[c.grade] = []; groups[c.grade].push({...c, idx: i}); });
    return GRADES.filter(g => groups[g])
        .map(g => `
        <div class="flex items-center gap-2 flex-wrap py-1">
            <span class="fs-14 font-bold text-slate-500 w-8">${g}</span>
            ${groups[g].map(c => `<span class="inline-flex items-center gap-1 bg-green-100 text-green-800 px-2.5 py-1 rounded-full fs-14 font-bold">${c.name}<button onclick="removeClassItem(${c.idx})" class="text-green-600 hover:text-red-500 font-black ml-1">×</button></span>`).join('')}
        </div>`).join('');
}

// getClassesForGrade: 해당 학년의 학급 목록 반환
function getClassesForGrade(grade) {
    if (!grade || !globalConfig.classes) return [];
    return (globalConfig.classes)
        .filter(c => typeof c === 'object' && c.grade === grade)
        .map(c => c.name);
}

// 학생 총점 기반 학급 추천 (cachedStudentRecords에서 학급별 평균 계산)
function recommendClassByScore(totalScore, grade) {
    if (totalScore == null || isNaN(totalScore)) return null;
    const records = window.cachedStudentRecords || [];
    const gradeRecs = records.filter(r => {
        const rGrade = r['학년'] || r.grade || '';
        const rClass = r.studentClass || r['등록학급'] || '';
        return rGrade === grade && rClass;
    });
    if (!gradeRecs.length) return null;
    const classMap = {};
    gradeRecs.forEach(r => {
        const cls = r.studentClass || r['등록학급'];
        const total = parseFloat(r['완스코어'] || r['총점'] || r.totalScore || r.score || 0);
        if (!classMap[cls]) classMap[cls] = { sum: 0, cnt: 0 };
        classMap[cls].sum += total;
        classMap[cls].cnt++;
    });
    let bestClass = null, bestDiff = Infinity, minAvg = Infinity;
    Object.entries(classMap).forEach(([cls, data]) => {
        const avg = data.sum / data.cnt;
        const diff = Math.abs(totalScore - avg);
        if (diff < bestDiff) { bestDiff = diff; bestClass = cls; }
        if (avg < minAvg) minAvg = avg;
    });
    // 최하반 평균의 60% 미만이면 미달 추천
    if (minAvg < Infinity && totalScore < minAvg * 0.6) return '달성미달';
    return bestClass;
}

// 선택 학급의 영역별 평균 계산
function computeClassAvg(className, grade, secMap) {
    if (!className || !grade) return null;
    const records = (window.cachedStudentRecords || []).filter(r => {
        const rGrade = r['학년'] || r.grade || '';
        const rClass = r.studentClass || r['등록학급'] || '';
        return rGrade === grade && rClass === className;
    });
    if (!records.length) return null;
    const avg = {};
    const totals = records.map(r => parseFloat(r['총점'] || r['완스코어'] || r.totalScore || r.total || 0)).filter(v => !isNaN(v) && v > 0);
    if (totals.length) avg['총점'] = totals.reduce((s,v)=>s+v,0)/totals.length;
    if (secMap) Object.keys(secMap).forEach(sec => {
        const vals = records.map(r => parseFloat(r[sec+'_점수'] || r[secMap[sec]] || 0)).filter(v => !isNaN(v) && v >= 0);
        if (vals.length) avg[sec+'_점수'] = vals.reduce((s,v)=>s+v,0)/vals.length;
    });
    return avg;
}


// 등록된 학급이 있는 학년만 반환 (순서: 초1~고3)
function getRegisteredGrades() {
    const ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'];
    if (!globalConfig.classes || !globalConfig.classes.length) return ORDER; // 미등록 시 전체 표시
    const registered = new Set(
        (globalConfig.classes)
            .filter(c => typeof c === 'object' && c.grade)
            .map(c => c.grade)
    );
    return ORDER.filter(g => registered.has(g));
}

// 학년 select 요소를 등록 학년으로 채우기
function populateGradeSelect(selectEl, opts = {}) {
    if (!selectEl) return;
    const { placeholder = '학년 선택', includeAll = false, labelFn = null } = opts;
    const grades = getRegisteredGrades();
    const placeholderOpt = includeAll
        ? `<option value="전체">전체</option>`
        : `<option value="" disabled selected hidden>${placeholder}</option>`;
    selectEl.innerHTML = placeholderOpt + grades.map(g => {
        const label = labelFn ? labelFn(g) : g;
        return `<option value="${g}">${label}</option>`;
    }).join('');
    selectEl.disabled = false;
}

function addClassItem() {
    const gradeEl = document.getElementById('new-class-grade');
    const inp = document.getElementById('new-class-input');
    const grade = gradeEl?.value;
    const name  = inp?.value.trim();
    if (!grade) { showToast('학년을 선택하세요'); return; }
    if (!name)  { showToast('학급명을 입력하세요'); return; }
    if (!globalConfig.classes) globalConfig.classes = [];
    // 중복 확인
    if (globalConfig.classes.some(c => typeof c === 'object' && c.grade === grade && c.name === name)) {
        showToast('이미 등록된 학급입니다'); return;
    }
    globalConfig.classes.push({ grade, name });
    inp.value = '';
    const listEl = document.getElementById('class-list');
    if (listEl) listEl.innerHTML = renderClassListHtml();
}

function removeClassItem(idx) {
    if (!globalConfig.classes) return;
    globalConfig.classes.splice(idx, 1);
    const listEl = document.getElementById('class-list');
    if (listEl) listEl.innerHTML = renderClassListHtml();
}

async function saveClassConfig() {
    save();
    await saveConfigToCloud();
    showToast('✅ 학급 목록이 저장되었습니다.');
}

// --- 카테고리 관리 별도 뷰 ---
// ─── 학생 DB 뷰어 (Canvas 09-3) ───────────────────────────────────────────
let _sdbSort  = { col: 'name', dir: 1 };  // col: name|grade|year|md|score
let _sdbCache = { catId: '', catName: '', records: [] };
let _sdbList  = [];   // 필터 적용된 현재 목록

async function showStudentDBViewer(catId, catName) {
    const cat = globalConfig.categories.find(c => c.id === catId);
    if (!cat) return;
    const c = document.getElementById('dynamic-content');
    setCanvasId('09-3');

    _sdbCache = { catId, catName, records: [] };
    _sdbSort  = { col: 'date', dir: -1 };
    _sdbList  = [];

    const bSty = `background:linear-gradient(135deg,#fff 0%,#eef4ff 100%);border:2px solid rgba(1,57,118,0.15);`;
    const tBar = `<div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#60a5fa,#6366f1,#a855f7);"></div>`;

    c.innerHTML = `
    <div class="animate-fade-in-safe" style="height:100%;display:flex;flex-direction:column;overflow:hidden;gap:16px;">
        <!-- 헤더: 제목만 -->
        <div class="flex justify-between items-center">
            <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">${catName} — 학생 DB</h2>
        </div>

        <!-- 필터 바 -->
        <div class="card !py-3.5 !px-6 flex flex-row items-center justify-between shadow-lg relative overflow-hidden flex-none gap-4 flex-nowrap" style="${bSty}">
            ${tBar}
            <div class="flex items-center gap-4 flex-grow">
                <span style="font-size:17px;font-weight:700;color:#013976;white-space:nowrap;">📅 응시년도</span>
                <select id="sdb-year" class="ys-field flex-grow !text-[16px] !font-normal !bg-white" onchange="applyStudentDBFilters()">
                    <option value="전체">전체</option>
                </select>
                <span style="font-size:17px;font-weight:700;color:#013976;white-space:nowrap;">🎓 학년</span>
                <select id="sdb-grade" class="ys-field flex-grow !text-[16px] !font-normal !bg-white" onchange="applyStudentDBFilters()">
                    <option value="전체">전체</option>
                </select>
            </div>
            <button onclick="applyStudentDBFilters()" class="btn-ys !bg-[#013976] !text-white !border-[#013976] hover:brightness-110 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl shadow-md whitespace-nowrap flex-shrink-0 flex items-center gap-2">🔍 확인</button>
            <span id="sdb-count" class="whitespace-nowrap" style="font-size:16px; font-weight:700; color:#a855f7;"></span>
        </div>

        <!-- 테이블 영역 -->
        <div class="card !p-0 overflow-hidden shadow-sm" style="flex:1;min-height:0;display:flex;flex-direction:column;">
            <div id="sdb-table-wrap" style="flex:1;min-height:0;overflow-y:auto;"><p class="text-slate-400 text-center py-10">불러오는 중...</p></div>
        </div>
    </div>`;

    toggleLoading(true);
    try {
        const folderId = extractFolderId(cat.targetFolderUrl);
        const res = await sendReliableRequest({ type: 'GET_STUDENT_LIST', parentFolderId: folderId, categoryName: cat.name });
        const rawList = res.data || [];
        _sdbCache.records = rawList;

        // 필터 드롭다운 채우기
        const years  = [...new Set(rawList.map(r => dateToYear(r['응시일']||r.date||'')).filter(y => /^\d{4}$/.test(y)))].sort((a,b) => b.localeCompare(a));
        const grades = [...new Set(rawList.map(r => String(r['학년']||r.grade||'')).filter(g => g))].sort((a,b) => a.localeCompare(b,'ko'));
        const ySel = document.getElementById('sdb-year');
        const gSel = document.getElementById('sdb-grade');
        if (ySel) ySel.innerHTML = '<option value="전체">전체</option>' + years.map(y  => `<option value="${y}">${y}년</option>`).join('');
        if (gSel) gSel.innerHTML = '<option value="전체">전체</option>' + grades.map(g => `<option value="${g}">${g}</option>`).join('');

        applyStudentDBFilters();
    } catch(e) {
        const w = document.getElementById('sdb-table-wrap');
        if (w) w.innerHTML = `<p class="text-red-400 text-center py-6">오류: ${e.message}</p>`;
    } finally { toggleLoading(false); }
}

// [Fix] UTC ISO 날짜 → 로컬(KST) 기준 연도 추출 (2024-01-01T15:00:00Z → 2024)
function dateToYear(raw) {
    const s = String(raw || '');
    if (!s) return '';
    if (s.includes('T')) return String(new Date(s).getFullYear());
    return s.substring(0, 4);
}

function applyStudentDBFilters() {
    const year  = document.getElementById('sdb-year')?.value  || '전체';
    const grade = document.getElementById('sdb-grade')?.value || '전체';
    let list = (_sdbCache.records || []).slice();
    if (year  !== '전체') list = list.filter(r => dateToYear(r['응시일']||r.date||'') === year);
    if (grade !== '전체') list = list.filter(r => String(r['학년']||r.grade||'') === grade);
    _sdbList = list;
    _renderStudentDBTable();
}

// 컬럼 헤더 클릭 정렬
function sortStudentDB(col) {
    _sdbSort.dir = (_sdbSort.col === col) ? _sdbSort.dir * -1 : 1;
    _sdbSort.col = col;
    _renderStudentDBTable();
}

// 테이블 렌더링
function _renderStudentDBTable() {
    const { col, dir } = _sdbSort;
    const catId = _sdbCache.catId;
    const sorted = _sdbList.slice().sort((a, b) => {
        const dA = String(a['응시일']||a.date||''), dB = String(b['응시일']||b.date||'');
        switch(col) {
            case 'name':  return dir * String(a['학생명']||a.name||'').localeCompare(String(b['학생명']||b.name||''), 'ko');
            case 'grade': return dir * String(a['학년']||a.grade||'').localeCompare(String(b['학년']||b.grade||''), 'ko');
            case 'date':  return dir * dA.localeCompare(dB);
            case 'score': return dir * ((parseFloat(a['총점']??a.totalScore??0)||0) - (parseFloat(b['총점']??b.totalScore??0)||0));
            default: return 0;
        }
    });

    const cnt = document.getElementById('sdb-count');
    if (cnt) cnt.textContent = `총 ${sorted.length}명`;
    const wrap = document.getElementById('sdb-table-wrap');
    if (!wrap) return;

    if (sorted.length === 0) {
        wrap.innerHTML = '<p class="text-slate-400 text-center py-10">해당 조건의 학생이 없습니다.</p>';
        return;
    }

    const arw = c => col === c ? (dir === 1 ? ' ▲' : ' ▼') : ' <span class="opacity-30">⇅</span>';
    const th = (c, lbl) => `<th class="cursor-pointer select-none hover:bg-[#012a5e] transition-colors text-center px-2 py-3 font-black text-white fs-15 bg-[#013976]" onclick="sortStudentDB('${c}')">${lbl}${arw(c)}</th>`;
    wrap.innerHTML = `
    <table class="w-full border-collapse" style="table-layout:fixed;">
        <thead style="position:sticky;top:0;z-index:10;">
            <tr class="bg-[#013976]">
                ${th('name','이름')}${th('grade','학년')}${th('date','응시년월일')}${th('score','점수')}
                <th class="px-2 py-3 text-white fs-15 font-black text-center bg-[#013976]">삭제</th>
            </tr>
        </thead>
        <tbody>
            ${sorted.map((s, i) => {
                const sid   = s['학생ID']||s.id||'';
                const name  = s['학생명']||s.name||'-';
                const grade = s['학년']||s.grade||'-';
                const _rawDate = String(s['응시일']||s.date||'-');
                const full = (() => {
                    if (!_rawDate || _rawDate === '-') return '-';
                    if (_rawDate.includes('T')) {
                        // GAS가 UTC ISO 형식으로 반환 시 로컬 timezone 기준으로 변환 (UTC→KST 날짜 불일치 방지)
                        const d = new Date(_rawDate);
                        const y = d.getFullYear();
                        const m = String(d.getMonth()+1).padStart(2,'0');
                        const dy = String(d.getDate()).padStart(2,'0');
                        return `${y}-${m}-${dy}`;
                    }
                    return _rawDate.substring(0,10);
                })();
                const yr    = full.length >= 4 ? full.substring(0,4) : '-';
                const md    = full.length >= 10 ? full.substring(5)   : '-';
                const score = s['총점'] ?? s.totalScore ?? '-';
                const max   = s['만점'] ?? s.maxScore ?? '';
                const row   = i % 2 === 0 ? 'bg-white' : 'bg-slate-50';
                return `<tr class="${row} border-b border-slate-100">
                    <td class="px-2 py-3 font-bold text-[#013976] fs-15 text-center">${name}</td>
                    <td class="px-2 py-3 text-slate-700 fs-15 text-center">${grade}</td>
                    <td class="px-2 py-3 text-slate-600 fs-15 text-center">${full}</td>
                    <td class="px-2 py-3 font-bold text-slate-800 fs-15 text-center">${score}${max?'/'+max:''}</td>
                    <td class="px-2 py-3 text-center">
                        <button onclick="deleteStudentRecord('${catId}','${sid}','${name}')" class="text-red-500 hover:text-red-700 fs-13 font-bold px-3 py-1 rounded-lg border border-red-200 hover:bg-red-50">🗑️ 삭제</button>
                    </td>
                </tr>`;
            }).join('')}
        </tbody>
    </table>`;
}

async function deleteStudentRecord(catId, studentId, studentName) {
    if (!confirm(`⚠️ [${studentName}] 학생의 성적 데이터를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    const cat = globalConfig.categories.find(c => c.id === catId);
    if (!cat) return;
    toggleLoading(true);
    try {
        const folderId = extractFolderId(cat.targetFolderUrl);
        await sendReliableRequest({ type: 'DELETE_STUDENT', parentFolderId: folderId, studentId });
        showToast(`✅ ${studentName} 데이터 삭제 완료`);
        showStudentDBViewer(catId, cat.name);
    } catch(e) { showToast('❌ 삭제 실패: ' + e.message); }
    finally { toggleLoading(false); }
}

function renderCatManage(c) {
    setCanvasId('09');
    c.innerHTML = `
        <div class="animate-fade-in-safe flex flex-col h-full space-y-6">
            <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">Exam Paper Management</h2>

            <!-- 상단 헤더 바 (캔버스08 스타일) -->
            <div class="card !p-6 flex flex-row items-center justify-between shadow-lg relative overflow-hidden flex-none gap-4 flex-nowrap" style="background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%); border: 2px solid rgba(1,57,118,0.15);">
                <div style="position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, #60a5fa, #6366f1, #a855f7);"></div>
                <div class="flex items-center gap-4 flex-grow">
                    <label class="ys-label !mb-0 whitespace-nowrap !text-[#013976] font-bold">📂 시험지 목록</label>
                </div>
                <button onclick="showCat()" class="btn-ys !bg-[#013976] !text-white !border-[#013976] hover:brightness-110 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl shadow-md whitespace-nowrap flex-shrink-0 flex items-center gap-2">
                    ➕ NEW EXAM PAPER
                </button>
            </div>

            <!-- 시험지 목록 컨테이너 (캔버스08 스타일) -->
            <div class="flex-grow overflow-auto bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm p-4 space-y-3">
                ${globalConfig.categories.length === 0
                    ? `<div class="p-20 text-center text-slate-400">📭 등록된 시험지가 없습니다. NEW 버튼으로 추가하세요.</div>`
                    : globalConfig.categories.map(cat => `
                        <div class="flex justify-between items-center bg-slate-50 px-6 py-4 rounded-xl border-2 border-slate-200 hover:shadow-md hover:bg-white hover:border-blue-300 transition-all">
                            <div class="text-[#013976] fs-18 font-bold">${cat.name}</div>
                                                    <div class="flex items-center gap-4">
                                <button onclick="editCat('${cat.id}')" class="fs-18 text-blue-600 hover:text-blue-800">✏️ 수정</button>
                                <span class="text-slate-300">|</span>
                                <button onclick="showStudentDBViewer('${cat.id}', '${cat.name}')" class="fs-18 text-purple-600 hover:text-purple-800">📋 학생 DB</button>
                                <span class="text-slate-300">|</span>
                                <button onclick="delCat('${cat.id}')" class="fs-18 text-red-500 underline hover:text-red-700">🗑️ 삭제</button>
                            </div>
                        </div>`).join('')}
            </div>
        </div>`;
}

function showCat(editId = null) {
    const c = document.getElementById('dynamic-content');
    setCanvasId(editId ? '09-2' : '09-1');
    const isEdit = !!editId;
    const cat = isEdit ? globalConfig.categories.find(c => c.id === editId) : null;
    const title = isEdit ? "EDIT EXAM PAPER" : "NEW EXAM PAPER";
    const btnText = isEdit ? "💾 변경사항 저장" : "🚀 신규 생성 및 저장";

    const classificationOptions = [
        { name: "레벨 테스트지 (A)", code: "A" },
        { name: "기타 테스트지 (B)", code: "B" }
    ].map(opt => `<option value="${opt.code}" ${cat?.classification === opt.code ? 'selected' : ''}>${opt.name}</option>`).join('');

    const classDisabled = isEdit ? 'disabled' : '';
    const classStyle = isEdit ? 'bg-slate-100 cursor-not-allowed opacity-75' : '';

    c.innerHTML = `
        <div class="animate-fade-in-safe flex flex-col items-center pb-10 mt-5">
            <div class="canvas-premium-box !max-w-3xl w-full">
                <div class="flex flex-row items-start gap-10">

                    <!-- 좌측: 아이콘 + 제목 -->
                    <div class="flex flex-col items-center gap-4 flex-shrink-0 w-40 border-r border-slate-200 pr-10">
                        <div class="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-inner relative z-10 unified-animate">
                            📂
                            <div class="absolute inset-0 bg-blue-100/30 rounded-full blur-2xl opacity-50 scale-150 -z-10"></div>
                        </div>
                        <h2 class="fs-18 text-[#013976] uppercase text-center font-black tracking-tight leading-tight">${title}</h2>
                    </div>

                    <!-- 우측: 폼 -->
                    <div class="flex-1 space-y-4 text-left">
                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="ys-label font-bold !mb-0">🏷️ 구분</label>
                                <select id="cc" class="ys-field !bg-slate-50/50 hover:border-blue-400 focus:bg-white transition-all shadow-sm ${classStyle}" ${classDisabled}>
                                    ${classificationOptions}
                                </select>
                            </div>
                            <div class="space-y-2">
                                <label class="ys-label font-bold !mb-0">🎓 권장 평가 학년 <span class="text-red-500">*</span></label>
                                <select id="cgr" class="ys-field !bg-slate-50/50 hover:border-blue-400 focus:bg-white transition-all shadow-sm" required>
                                    <option value="" disabled ${!cat?.targetGrade ? 'selected' : ''} hidden>학년 선택</option>
                                    ${getRegisteredGrades().map(g => `<option value="${g}" ${cat?.targetGrade === g ? 'selected' : ''}>${g}</option>`).join('')}
                                </select>
                            </div>
                        </div>

                        <div class="space-y-2">
                            <label class="ys-label font-bold !mb-0">⏱️ 권장 평가 시간 (분)</label>
                            <input type="number" id="ctm" class="ys-field !bg-slate-50/50 focus:bg-white transition-all shadow-sm" placeholder="0 = 무제한" value="${cat?.timeLimit || 0}" min="0">
                        </div>

                        <div class="space-y-2">
                            <label class="ys-label font-bold !mb-0">📝 시험지 이름</label>
                            <input type="text" id="cn" autocomplete="off" class="ys-field !bg-slate-50/50 focus:bg-white transition-all shadow-sm"
                                   placeholder="시험지 이름을 입력하세요." value="${cat?.name || ''}">
                        </div>

                        ${isEdit ? '<p class="text-xs text-slate-500 text-center font-medium mt-1">⚠️ 이름/시간/학년 정보만 수정 가능합니다.</p>' : ''}

                        <div>
                            <button onclick="saveCat('${editId || ''}')" class="btn-ys w-full !py-4 fs-16 font-bold transition-all active:scale-95 shadow-lg mt-2">
                                ${btnText}
                            </button>
                            <button onclick="changeTab('cat_manage')" class="w-full mt-4 text-slate-400 fs-14 underline hover:text-red-500 transition-all font-medium text-center">
                                CANCEL &amp; RETURN
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>`;
}
function editCat(id) { showCat(id); }

async function saveCat(editId = '') {
    const n = document.getElementById('cn').value.trim();
    const cCode = document.getElementById('cc')?.value || 'A';
    const tGrade = document.getElementById('cgr')?.value || '';
    const tLimit = document.getElementById('ctm')?.value || 0;
    let u = '';

    if (!n) return showToast("시험지 이름을 입력해 주세요.");
    if (!tGrade) return showToast("권장 평가 학년을 선택해 주세요.");

    if (editId) {
        if (!confirm('💾 수정된 시험지 정보를 저장하시겠습니까?')) return;
        const cat = globalConfig.categories.find(c => c.id === editId);
        if (cat) {
            const oldName = cat.name;
            const newName = n;

            if (oldName !== newName) {
                const folderId = extractFolderId(cat.targetFolderUrl);
                if (folderId && globalConfig.masterUrl) {
                    try {
                        toggleLoading(true);
                        showToast(`🛰️ 폴더명 변경 중: [${newName}]...`);
                        const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
                        const finalFolderName = `${cat.classification || 'A'}_${newName}`;
                        const res = await fetch(masterUrl, {
                            method: 'POST',
                            body: JSON.stringify({ type: 'RENAME_FOLDER', folderId: folderId, newName: finalFolderName })
                        });
                        const resultText = await res.text();
                        let result = { status: "Error" };
                        try { result = JSON.parse(resultText); } catch (pe) { if (resultText.includes("Success")) result = { status: "Success" }; }

                        if (result.status === "Success") {
                            showToast("✅ 드라이브 폴더명 변경 완료");
                        } else {
                            showToast(`⚠️ 폴더명 변경 실패: ${result.message || '알 수 없는 오류'}`);
                        }
                    } catch (err) {
                        console.error("Folder rename failed:", err);
                        showToast("⚠️ 폴더명 변경 실패 (설정만 수정됨)");
                    } finally {
                        toggleLoading(false);
                    }
                }
            }

            cat.name = n;
            cat.targetGrade = tGrade;
            cat.timeLimit = tLimit;
            save();
            await saveConfigToCloud();
            showToast(`[${n}] 시험지 정보가 업데이트되었습니다.`);
            changeTab('cat_manage');
            return;
        }
    } else {
        if (!globalConfig.mainServerLink) return showToast("❌ 폴더 생성을 위해선 [Main Server Folder] 설정이 필요합니다.");

        const finalFolderName = `${cCode}_${n}`;
        if (!confirm(`💾 [${finalFolderName}] 신규 시험지를 생성 및 저장하시겠습니까?\n(드라이브에 폴더가 자동 생성됩니다)`)) return;

        showToast("⏳ 구글 드라이브 폴더 생성 중...");
        try {
            const rootId = extractFolderId(globalConfig.mainServerLink);
            if (!rootId) return showToast("❌ 메인 서버 폴더 주소가 올바르지 않습니다.");

            const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
            const res = await fetch(masterUrl, {
                method: 'POST',
                body: JSON.stringify({ type: "CREATE_FOLDER", parentFolderId: rootId, folderName: finalFolderName })
            });

            const resultText = await res.text();
            let json = { status: "Error" };
            try { json = JSON.parse(resultText); } catch (pe) { if (resultText.includes("Success")) { json = { status: "Success", folderUrl: resultText.match(/https?:\/\/[^\s]+/)?.[0] }; } }

            if (json.status === "Success" && json.folderUrl) {
                u = json.folderUrl;
                showToast("✅ 폴더 생성 완료 및 적용됨!");
            } else {
                throw new Error(json.message || "서버에서 오류를 반환했습니다.");
            }
        } catch (e) {
            console.error(e);
            toggleLoading(false);
            return showToast("❌ 폴더 자동 생성 실패: " + e.message);
        }
    }

    globalConfig.categories.push({
        id: 'cat_' + Date.now(),
        name: n,
        targetFolderUrl: u,
        classification: cCode,
        targetGrade: tGrade,
        timeLimit: tLimit
    });
    save();
    await saveConfigToCloud();
    showToast(`✅ [${n}] 테스트 분류가 성공적으로 저장되었습니다.`);
    changeTab('cat_manage');
}
async function delCat(id) {
    const cat = globalConfig.categories.find(c => c.id === id);
    if (!cat) return;

    if (!confirm(`⚠️ 정말로 [${cat.name}] 카테고리를 삭제하시겠습니까?\n\n삭제 시 해당 폴더는 "백업" 폴더로 이동됩니다.`)) return;

    toggleLoading(true);
    let proceedWithDelete = false;

    const folderId = extractFolderId(cat.targetFolderUrl);
    if (folderId) {
        try {
            const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
            const res = await fetch(masterUrl, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'BACKUP_FOLDER',
                    folderId: folderId,
                    categoryName: cat.name
                })
            });
            const resultText = await res.text();
            let json = { status: "Error" };
            try { json = JSON.parse(resultText); } catch (pe) {
                if (resultText.includes("Success")) json = { status: "Success" };
            }

            if (json.status === "Success") {
                showToast(`📁 [${cat.name}] 폴더가 백업 폴더로 이동되었습니다.`);
                proceedWithDelete = true;
            } else {
                if (confirm(`⚠️ 폴더 백업 작업에 실패했습니다.\n(사유: ${json.message || 'ID 찾을 수 없음'})\n\n폴더 백업 없이 설정을 삭제할까요?`)) {
                    proceedWithDelete = true;
                }
            }
        } catch (err) {
            console.error(err);
            if (confirm(`⚠️ 백업 서버와 통신 중 오류가 발생했습니다.\n\n폴더 백업 없이 설정을 삭제하시겠습니까?`)) {
                proceedWithDelete = true;
            }
        }
    } else {
        if (confirm(`⚠️ 백업할 유효한 폴더 주소가 설정되어 있지 않습니다.\n\n해당 카테고리 설정만 삭제하시겠습니까?`)) {
            proceedWithDelete = true;
        }
    }

    if (proceedWithDelete) {
        try {
            globalConfig.categories = globalConfig.categories.filter(c => c.id !== id);
            if (curCatId === id) curCatId = globalConfig.categories[0]?.id || "";
            save();
            await saveConfigToCloud();
            showToast(`✅ [${cat.name}] 카테고리 정보가 삭제되었습니다.`);
            changeTab('cat_manage');
        } catch (saveErr) {
            console.error(saveErr);
            showToast('⚠️ 설정 삭제 중 오류 발생');
        }
    }
    toggleLoading(false);
}
async function resetCategoryDB(id, type) {
    const cat = globalConfig.categories.find(c => c.id === id);
    if (!cat) return;

    const dbName = type === 'student' ? '학생 DB' : '문항 DB';
    if (!confirm(`⚠️ 정말로 [${cat.name}]의 [${dbName}]를 초기화하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 시트의 모든 데이터가 영구 삭제됩니다.\n(폴더 파일은 유지됩니다)`)) return;

    toggleLoading(true);
    try {
        // Apps Script에 리셋 요청
        const folderId = extractFolderId(cat.targetFolderUrl);
        if (folderId) {
            const masterUrl = globalConfig.masterUrl || DEFAULT_MASTER_URL;
            const res = await fetch(masterUrl, {
                method: 'POST',
                body: JSON.stringify({
                    type: 'RESET_DB',
                    dbType: type, // 'student' or 'question'
                    parentFolderId: folderId, // [Fix] folderId -> parentFolderId (Backend requirement)
                    categoryName: cat.name
                })
            });
            const resultText = await res.text();
            console.log("Reset DB Response:", resultText);

            let json = { status: "Error", message: resultText };
            try {
                // Try parsing JSON
                json = JSON.parse(resultText);
            } catch (e) {
                // Handle plain text errors (GAS convention)
                if (resultText.includes("Error")) {
                    json = { status: "Error", message: resultText };
                } else if (resultText.includes("Success")) {
                    json = { status: "Success" };
                }
            }

            if (json.status === "Success") {
                showToast(`♻️ [${dbName}] 시트가 초기화되었습니다.`);
                // 문항 DB 리셋 시 로컬 데이터도 필터링
                if (type === 'question') {
                    showToast('⚠️ 로컬 데이터 동기화를 위해 페이지를 새로고침해주세요.');
                    // [Optional] Local clean up if needed immediately
                    // globalConfig.questions = globalConfig.questions.filter(q => q.catId !== id);
                    // save();
                }
            } else {
                throw new Error(json.message || "Unknown Server Error");
            }
        }
    } catch (err) {
        console.error(err);
        showToast('⚠️ DB 초기화 요청 실패 (Apps Script 업데이트 필요)');
    } finally {
        toggleLoading(false);
    }
}

async function generateUniqueStudentId(dateStr, gradeStr) {
    // 1. 날짜 포맷 (YYMMDD)
    const d = new Date(dateStr);
    const yy = d.getFullYear().toString().slice(2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    const dateCode = `${yy}${mm}${dd}`;

    // 2. 학년 코드 변환
    // 초4~초6: E4~E6, 중1~중3: M1~M3, 고1~고3: H1~H3
    let gradeCode = "E";
    if (gradeStr.includes('초')) gradeCode = "E" + gradeStr.replace('초', '');
    else if (gradeStr.includes('중')) gradeCode = "M" + gradeStr.replace('중', '');
    else if (gradeStr.includes('고')) gradeCode = "H" + gradeStr.replace('고', '');

    const groupKey = dateCode + gradeCode; // 예: 260129M2

    // 3. 무작위 4자리 등록번호 생성 (0000 ~ 9999)
    // 기존 idCounters 대신 시계열/랜덤성을 조합해 충돌 방지
    const randomSuffix = Math.floor(1000 + Math.random() * 9000).toString();
    const studentId = `${groupKey}${randomSuffix}`;

    return studentId;
}

// --- 관리자 코드 변경 ---
function renderAdminCode(c) {
    c.innerHTML = `
                <div class="animate-fade-in-safe space-y-4 pb-20 text-left">
                    <h2 class="fs-32 text-[#013976] underline decoration-slate-200 decoration-8 underline-offset-8 font-black mb-12  uppercase tracking-tighter">Admin Code Setting</h2>
                    <div class="card !bg-[#013976] !p-12 text-white border-none">
                        <h3 class="fs-32 text-white font-black uppercase tracking-tighter underline decoration-blue-400/30 decoration-8 underline-offset-8 mb-6 leading-none">Change Management Code</h3>
                        <p class="fs-18 text-blue-200 mb-8">관리자 모드(Admin) 접속에 사용할 새로운 액세스 코드를 설정하세요.</p>
                        <input type="text" id="new-admin-code" autocomplete="off" class="ys-field !bg-white/10 !text-white border-white/20" value="${globalConfig.adminCode}" placeholder="새 코드 입력">
                        <button onclick="(async()=>{const val=document.getElementById('new-admin-code').value; if(!val) return showToast('코드를 입력하세요'); globalConfig.adminCode=val; save(); await saveConfigToCloud(); showToast('관리자 코드가 성공적으로 변경 및 동기화되었습니다.'); changeTab('main_config');})()" 
                        class="bg-white text-[#013976] w-full py-6 rounded-2xl fs-18 mt-4 hover:bg-slate-100 transition-all uppercase">💾 Update & Sync Code</button>
                    </div>
                </div>`;
}

window.onload = () => {
    // Initialize adminCode if not present (e.g., first run)
    if (globalConfig.adminCode === undefined) {
        globalConfig.adminCode = "1111";
        save();
    }
    applyBranding();

    // [Fix] 앱 진입 시 무조건 백그라운드에서 최신 데이터를 동기화하도록 강제
    if (globalConfig.masterUrl) {
        console.log("🔄 Initializing background cloud sync for latest configuration...");
        loadConfigFromCloud(true).then((success) => {
            if (success) {
                console.log("✅ Auto-sync success!");
                applyBranding();

                // 학생 화면 등 선택 목록 UI 갱신 (이미 진입한 경우 대비)
                const c = document.getElementById('dynamic-content');
                if (c && c.getAttribute('data-canvas-id') === '02') {
                    renderStudentLogin(); // Reload student form if active
                }
            } else {
                console.log("⚠️ Auto-sync failed or no newer config found.");
            }
        });
    }
};

// ===== 학생 성적 관리 시스템 =====

// 학생 성적 입력 UI 렌더링
function renderScoreInput(c) {
    if (!globalConfig.categories || globalConfig.categories.length === 0) {
        renderEmptyState(c, 'Student Score Input');
        return;
    }

    setCanvasId('06');
    c.innerHTML = `
        <div class="animate-fade-in-safe space-y-6 pb-10">
            <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">Student Score Input</h2>

            <!-- 1. Category Selection -->
            <div class="card !py-3.5 !px-6 flex items-center justify-between shadow-lg relative overflow-hidden" style="background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%); border: 2px solid rgba(1,57,118,0.15);">
                <div style="position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, #60a5fa, #6366f1, #a855f7);"></div>
                <div class="flex items-center gap-4 w-full">
                    <label class="ys-label !mb-0 whitespace-nowrap !text-[#013976] font-bold">&#x1F4C2; &#xC2DC;&#xD5D8;&#xC9C0; &#xC120;&#xD0DD;</label>
                    <select id="input-category" class="ys-field flex-grow !font-normal !text-[#013976] !bg-white !text-[16px]"
                            onchange="handleScoreCategoryChange(this.value)">
                        <option value="" disabled selected hidden>&#xC2DC;&#xD5D8;&#xC9C0;&#xB97C; &#xC120;&#xD0DD;&#xD558;&#xC138;&#xC694;</option>
                        ${globalConfig.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
                    </select>
                </div>
            </div>

            <!-- 2. Form Area (hidden until category selected) -->
            <div id="score-form-area" class="hidden space-y-6">

                <!-- Student Info -->
                <div class="card space-y-4">
                    <div class="grid grid-cols-4 gap-4">
                        <div>
                            <label class="ys-label font-bold">&#x1F4DD; &#xD559;&#xC0DD;&#xBA85;</label>
                            <input type="text" id="input-student-name" class="ys-field" placeholder="&#xC774;&#xB984; &#xC785;&#xB825;" autocomplete="off">
                        </div>
                        <div>
                            <label class="ys-label font-bold">&#x1F393; &#xD559;&#xB144;</label>
                            <select id="input-grade" class="ys-field" onchange="updateClassDropdown06(this.value)">
                                <option value="" disabled selected hidden>&#xD559;&#xB144; &#xC120;&#xD0DD;</option>
                            </select>
                        </div>
                        <div>
                            <label class="ys-label font-bold">&#x1F4C5; &#xC751;&#xC2DC;&#xC77C;</label>
                            <input type="text" id="input-test-date" class="ys-field" placeholder="YYYY-MM-DD" autocomplete="off">
                        </div>
                        <div>
                            <label class="ys-label font-bold flex items-center gap-2" style="color:#6366f1;">
                                🏫 등록학급
                                <span id="class-recommend-badge06" class="font-bold" style="color:#6366f1;"></span>
                            </label>
                            <select id="input-student-class" class="ys-field" style="border-color:#a5b4fc;background:#f5f3ff;color:#4338ca;">
                                <option value="">선택</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- Question Score Input -->
                <div class="card space-y-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <h3 class="fs-18 text-[#013976] font-black uppercase">&#x1F4CB; &#xBB38;&#xD56D;&#xBCC4; &#xC810;&#xC218; &#xC785;&#xB825;</h3>
                            <div class="w-px h-5 bg-slate-300 mx-1"></div>
                            <label class="flex items-center gap-2 cursor-pointer select-none">
                                <input type="checkbox" id="chk-no-qscore" class="w-4 h-4 accent-[#013976]" onchange="toggleQScoreMode(this.checked)">
                                <span class="text-sm font-bold text-slate-400">&#xBB38;&#xD56D;&#xBCC4; &#xC810;&#xC218; &#xC815;&#xBCF4; &#xC5C6;&#xC74C;</span>
                            </label>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-bold text-slate-500">&#xCD1D;&#xC810;</span>
                            <div class="bg-[#013976] text-white rounded-2xl px-6 py-2 flex items-center gap-2">
                                <span id="score-total-display" class="text-2xl font-black">0</span>
                                <span class="text-blue-300 font-bold">/</span>
                                <span id="score-max-display" class="text-lg font-bold text-blue-200">0</span>
                            </div>
                        </div>
                    </div>
                    <div id="question-score-list" class="space-y-2"></div>
                </div>

                <!-- 아코디언 + 버튼 (같은 row) -->
                <div class="flex items-start gap-4">

                    <!-- 아코디언 (조건부 보임) -->
                    <div id="accordion-wrapper" class="hidden flex-1">
                        <div class="card !p-0 overflow-hidden">
                            <button onclick="toggleAccordion('accordion-section')" class="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 transition-all">
                                <span class="fs-17 font-bold text-[#013976]">&#x1F4DA; &#xC601;&#xC5ED;&#xBCC4; &#xC810;&#xC218; &#xC785;&#xB825;</span>
                                <span id="accordion-section-icon" class="text-slate-400 text-xl">&#x25B6;</span>
                            </button>
                            <div id="accordion-section" class="hidden px-6 pb-6 border-t border-slate-100">
                                <p class="text-sm text-slate-400 mt-3 mb-4">&#xBB38;&#xD56D;&#xBCC4; &#xC785;&#xB825;&#xC774; &#xC5C6;&#xC744; &#xACBD;&#xC6B0;&#xC5D0;&#xB9CC; &#xCD1D;&#xC810; &#xACC4;&#xC0B0;&#xC5D0; &#xBC18;&#xC601;&#xB429;&#xB2C8;&#xB2E4;.</p>
                                <div class="grid grid-cols-5 gap-4">
                                    <div><label class="text-sm font-bold text-slate-500 font-bold mb-0 block">Grammar</label><span id="max-grammar" class="font-normal text-slate-400 text-sm block mb-1"></span>
                                        <input type="number" id="input-grammar" oninput="calculateTotalScore()" data-max-id="max-grammar" class="ys-field text-center font-bold" placeholder="0" min="0" max="9999" oninput="clampAccordionScore(this); calculateTotalScore()"></div>
                                    <div><label class="text-sm font-bold text-slate-500 font-bold mb-0 block">Writing</label><span id="max-writing" class="font-normal text-slate-400 text-sm block mb-1"></span>
                                        <input type="number" id="input-writing" oninput="calculateTotalScore()" data-max-id="max-writing" class="ys-field text-center font-bold" placeholder="0" min="0" max="9999" oninput="clampAccordionScore(this); calculateTotalScore()"></div>
                                    <div><label class="text-sm font-bold text-slate-500 font-bold mb-0 block">Reading</label><span id="max-reading" class="font-normal text-slate-400 text-sm block mb-1"></span>
                                        <input type="number" id="input-reading" oninput="calculateTotalScore()" data-max-id="max-reading" class="ys-field text-center font-bold" placeholder="0" min="0" max="9999" oninput="clampAccordionScore(this); calculateTotalScore()"></div>
                                    <div><label class="text-sm font-bold text-slate-500 font-bold mb-0 block">Listening</label><span id="max-listening" class="font-normal text-slate-400 text-sm block mb-1"></span>
                                        <input type="number" id="input-listening" oninput="calculateTotalScore()" data-max-id="max-listening" class="ys-field text-center font-bold" placeholder="0" min="0" max="9999" oninput="clampAccordionScore(this); calculateTotalScore()"></div>
                                    <div><label class="text-sm font-bold text-slate-500 font-bold mb-0 block">Vocabulary</label><span id="max-vocab" class="font-normal text-slate-400 text-sm block mb-1"></span>
                                        <input type="number" id="input-vocab" oninput="calculateTotalScore()" data-max-id="max-vocab" class="ys-field text-center font-bold" placeholder="0" min="0" max="9999" oninput="clampAccordionScore(this); calculateTotalScore()"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 버튼들 (항상 우측, 아코디언 유무와 무관) -->
                    <div class="flex gap-4 items-center ml-auto flex-none">
                        <button onclick="clearScoreInputs()" class="px-8 py-4 rounded-2xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 hover:text-slate-700 transition-all">
                            &#x1F504; &#xCD08;&#xAE30;&#xD654; (Reset)
                        </button>
                        <button onclick="saveStudentScore()" class="btn-ys !px-12 !py-4 hover:scale-[1.02] active:scale-95 transition-all text-lg">
                            &#x1F4BE; &#xC131;&#xC801; &#xC800;&#xC7A5; (Save Record)
                        </button>
                    </div>

                </div><!-- /accordion+버튼 row -->

            </div><!-- /score-form-area -->

        </div>
    `;
    // 등록된 학년만 학년 드롭박스에 채우기
    populateGradeSelect(document.getElementById('input-grade'), { placeholder: '학년 선택' });
}

async function handleScoreCategoryChange(catId) {
    const formArea = document.getElementById('score-form-area');
    if (formArea) formArea.classList.remove('hidden');

    const category = globalConfig.categories.find(cat => cat.id === catId);
    if (!category) return;

    const folderId = extractFolderId(category.targetFolderUrl);
    if (!folderId) { showToast('⚠️ 폴더 ID 오류: 카테고리 설정을 확인하세요.'); return; }

    const listEl = document.getElementById('question-score-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="text-slate-400 text-sm text-center py-10">⏳ 문항 정보 불러오는 중...</p>';

    toggleLoading(true);
    let catQuestions = [];
    try {
        const result = await sendReliableRequest({ type: 'GET_FULL_DB', parentFolderId: folderId, categoryName: category.name });
        let newQuestions = (result.status === 'Success') ? (result.questions || []) : [];
        if (newQuestions.length === 0 && globalConfig.questions) {
            newQuestions = globalConfig.questions.filter(q => String(q.catId) === String(catId));
        }
        if (newQuestions.length > 0) {
            newQuestions = newQuestions.map(q => ({ ...q, catId: catId }));
            const others = (globalConfig.questions || []).filter(q => String(q.catId) !== String(catId));
            globalConfig.questions = [...others, ...newQuestions];
        }
        catQuestions = newQuestions.sort((a, b) => (parseInt(a.no) || 0) - (parseInt(b.no) || 0));

        // [Fix] 학생 DB 로드 완료 후 학급 추천 재계산
        try {
            const studentRes = await sendReliableRequest({ type: 'GET_STUDENT_LIST', parentFolderId: folderId, categoryName: category.name });
            window.cachedStudentRecords = studentRes.data || [];
            calcAndRecommendClass06(); // [Fix] 새 데이터 반영하여 재추천
        } catch(e2) {
            console.warn('[Canvas 06] 학생 DB 로드 실패 (학급 추천 비활성화):', e2.message);
        }

    } catch(e) {
        console.error(e);
        showToast('\u26a0\ufe0f \ubb38\ud56d \ubd88\ub7ec\uc624\uae30 \uc2e4\ud328: ' + e.message);
        catQuestions = (globalConfig.questions || [])
            .filter(q => String(q.catId) === String(catId))
            .sort((a, b) => (parseInt(a.no) || 0) - (parseInt(b.no) || 0));
    } finally {
        toggleLoading(false);
    }

    const maxScore = catQuestions.reduce((sum, q) => sum + (parseInt(q.score) || 0), 0);
    const totalDisp = document.getElementById('score-total-display');
    const maxDisp = document.getElementById('score-max-display');
    if (totalDisp) totalDisp.textContent = '0';
    if (maxDisp) maxDisp.textContent = maxScore;

    // 영역별/난이도별 만점 span 업데이트
    const setMax = (spanId, val) => {
        const el = document.getElementById(spanId);
        if (!el) return;
        if (val > 0) { el.textContent = '만점 ' + val + '점'; el.style.color = ''; }
        else { el.textContent = '영역 없음'; el.style.color = '#94a3b8'; }
        // 연결된 input의 max 속성도 갱신
        const inp = document.querySelector(`[data-max-id="${spanId}"]`);
        if (inp) {
            if (val > 0) {
                inp.max = val;
                inp.disabled = false;
                inp.placeholder = '0';
                inp.style.opacity = '';
                inp.style.cursor = '';
            } else {
                inp.max = 0;
                inp.value = '';
                inp.disabled = true;
                inp.placeholder = '-';
                inp.style.opacity = '0.4';
                inp.style.cursor = 'not-allowed';
            }
        }
    };
    const cqs = catQuestions;
    const sm = (sec) => cqs.filter(q => q.section === sec).reduce((s,q) => s+(parseInt(q.score)||0), 0);
    const dm = (dif) => cqs.filter(q => q.difficulty === dif).reduce((s,q) => s+(parseInt(q.score)||0), 0);
    setMax('max-grammar',       sm('Grammar'));
    setMax('max-writing',       sm('Writing'));
    setMax('max-reading',       sm('Reading'));
    setMax('max-listening',     sm('Listening'));
    setMax('max-vocab',         sm('Vocabulary'));

    if (catQuestions.length === 0) {
        listEl.innerHTML = '<p class="text-slate-400 text-sm text-center py-6">등록된 문항이 없습니다. 문항 리스트에서 먼저 문항을 등록해 주세요.</p>';
        return;
    }

    // 10개씩 청크로 나눠 전치 테이블 렌더링
    const CHUNK_SIZE = 10;
    const chunks = [];
    for (let i = 0; i < catQuestions.length; i += CHUNK_SIZE) {
        chunks.push(catQuestions.slice(i, i + CHUNK_SIZE));
    }

    listEl.innerHTML = chunks.map((chunk, chunkIdx) => {
        const startNo = chunkIdx * CHUNK_SIZE + 1;
        // 항상 10열 고정: 부족한 칸은 빈 셀로 채움
        const padLen = CHUNK_SIZE - chunk.length;
        const emptyTh = '<th class="text-center font-black text-white text-[15px] px-2 py-1.5" style="width:9%;"></th>';
        const emptyTd = '<td class="px-2 py-1.5"></td>';
        const headerCells = chunk.map(q => `<th class="text-center font-black text-white text-[15px] px-2 py-1.5" style="width:9%;">${q.no || '-'}</th>`).join('') + emptyTh.repeat(padLen);
        const typeCells = chunk.map(q => `<td class="text-center text-sm text-slate-500 px-2 py-1.5 truncate" title="${q.type || ''}">${q.type || '-'}</td>`).join('') + emptyTd.repeat(padLen);
        const subTypeCells = chunk.map(q => `<td class="text-center text-sm text-slate-500 px-2 py-1.5 truncate" title="${q.subType || ''}">${q.subType || '-'}</td>`).join('') + emptyTd.repeat(padLen);
        const difficultyCells = chunk.map(q => `<td class="text-center text-sm text-slate-500 px-2 py-1.5 truncate" title="${q.difficulty || ''}">${q.difficulty || '-'}</td>`).join('') + emptyTd.repeat(padLen);
        const maxCells = chunk.map(q => `<td class="text-center text-sm font-bold text-slate-600 px-2 py-1.5">${parseInt(q.score)||0}<span class="text-sm font-normal text-slate-400">점</span></td>`).join('') + emptyTd.repeat(padLen);
        const inputCells = chunk.map(q => {
            const maxQ = parseInt(q.score) || 0;
            return `<td class="px-1 py-1.5"><input type="number" id="q-score-${q.id}" data-qid="${q.id}" data-max="${maxQ}" class="w-full ys-field !py-0.5 text-center font-bold !text-[#013976] !text-[15px]" placeholder="0" min="0" max="${maxQ}" value="" oninput="clampQScore(this); calculateTotalScore();"></td>`;
        }).join('') + emptyTd.repeat(padLen);
        return `
        <div class="overflow-x-auto rounded-xl border border-slate-200 mb-2">
            <table class="w-full border-collapse text-sm">
                <thead>
                    <tr class="bg-[#013976]">
                        <th class="text-center text-sm text-blue-200 font-bold px-3 py-1.5 whitespace-nowrap">번호</th>
                        ${headerCells}
                    </tr>
                </thead>
                <tbody>
                    <tr class="border-b border-slate-100 bg-slate-50">
                        <td class="text-center text-sm font-bold text-slate-400 px-3 py-1.5 whitespace-nowrap">영역</td>
                        ${typeCells}
                    </tr>
                    <tr class="border-b border-slate-100">
                        <td class="text-center text-sm font-bold text-slate-400 px-3 py-1.5 whitespace-nowrap">세부영역</td>
                        ${subTypeCells}
                    </tr>
                    <tr class="border-b border-slate-100 bg-slate-50">
                        <td class="text-center text-sm font-bold text-slate-400 px-3 py-1.5 whitespace-nowrap">난이도</td>
                        ${difficultyCells}
                    </tr>
                    <tr class="border-b border-slate-100">
                        <td class="text-center text-sm font-bold text-slate-400 px-3 py-1.5 whitespace-nowrap">만점</td>
                        ${maxCells}
                    </tr>
                    <tr class="bg-blue-50/40">
                        <td class="text-center text-sm font-bold text-[#013976] px-3 py-1.5 whitespace-nowrap">점수입력</td>
                        ${inputCells}
                    </tr>
                </tbody>
            </table>
        </div>`;
    }).join('');


    showToast('\u2705 ' + catQuestions.length + '\uAC1C \uBB38\uD56D \uB85C\uB4DC \uC644\uB8CC (\uB9CC\uC810 ' + maxScore + '\uC810)');
    // Flatpickr 달력 적용
    setTimeout(() => applyYsDatePicker('#input-test-date'), 50);
}

// 공유 Flatpickr 달력 헬퍼 (수동 입력 허용)
function applyYsDatePicker(selector, extraOpts = {}) {
    if (typeof flatpickr === 'undefined') return;
    const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!el) return;
    const updateYear = (inst) => {
        const yi = inst.yearElements[0];
        if (!yi || yi.tagName === 'SELECT') { if (yi) yi.value = inst.currentYear; return; }
        const sel = document.createElement('select');
        sel.className = 'flatpickr-monthDropdown-months !w-auto !m-0';
        const cur = new Date().getFullYear();
        for (let y = cur - 10; y <= cur + 5; y++) {
            const o = document.createElement('option');
            o.value = y; o.text = y;
            if (y === inst.currentYear) o.selected = true;
            sel.appendChild(o);
        }
        sel.addEventListener('change', e => inst.changeYear(+e.target.value));
        if (!yi.parentNode) return;
        yi.parentNode.replaceChild(sel, yi);
    };
    flatpickr(el, Object.assign({
        locale: 'ko',
        dateFormat: 'Y-m-d',
        allowInput: true,
        disableMobile: true,
        altInput: true,
        altFormat: 'Y-m-d (D)',
        defaultDate: new Date(),
        monthSelectorType: 'dropdown',
        onReady:      (_, __, i) => updateYear(i),
        onMonthChange:(_, __, i) => setTimeout(() => updateYear(i), 0),
        onYearChange: (_, __, i) => setTimeout(() => updateYear(i), 10),
        onOpen:       (_, __, i) => setTimeout(() => updateYear(i), 0),
    }, extraOpts));
}

// Canvas 05-1: 등록학급 수동 변경 시 경고
function warnClassChange05(sel) {
    if (sel.value === '__RECOMMEND__') {
        const rec = sel.dataset.rec || '';
        if (rec) { sel.value = rec; }
        else { showToast('\ucd94\ucc9c \ud559\uae09\uc774 \uc5c6\uc2b5\ub2c8\ub2e4'); sel.value = ''; }
        rerenderReportCharts();
        window._dirtyClass = true;
        return;
    }
    const rec = sel.dataset.rec || '';
    if (rec && sel.value !== rec) {
        const ok = confirm('AI 추천 학급은 "' + rec + '"입니다.\n다른 학급("' + sel.value + '")을 선택하시겠습니까?');
        if (!ok) { sel.value = rec; }
    }
    rerenderReportCharts();
    window._dirtyClass = true;
}

// 성적표 평균 표시 모드 변경
function setReportAvgMode(mode) {
    window._reportAvgMode = mode;
    ['all','overall','class'].forEach(function(m) {
        const btn = document.getElementById('avg-btn-'+m);
        if (!btn) return;
        btn.style.background = m===mode ? '#013976' : '#e2e8f0';
        btn.style.color = m===mode ? 'white' : '#64748b';
    });
    rerenderReportCharts();
}

function rerenderReportCharts() {
    const d = window.currentReportData;
    if (!d || !d.secMap) return;
    const selCls = document.getElementById('report-student-class')?.value||'';
    const clsAvg = (selCls&&selCls!=='__RECOMMEND__') ? computeClassAvg(selCls, d.sGrade, d.secMap) : null;
    const mode = window._reportAvgMode||'all';
    renderTotalChart(d.record, d.averages, d.sTotal, d.sMax, clsAvg, mode);
    renderSectionsBarChart(d.record, d.averages, d.activeSections, d.secMap, d.maxMap, clsAvg, mode);
    renderRadarChart(d.record, d.averages, d.activeSections, d.secMap, d.maxMap, clsAvg, mode);
}

// Canvas 06: 학년 선택 시 해당 학년 학급만 dropdown에 표시
function updateClassBadge06(rec) {
    const badge = document.getElementById('class-recommend-badge06');
    if (!badge) return;
    if (rec) {
        badge.textContent = 'AI 추천: ' + rec;
        badge.style.color = '#6366f1';
        badge.style.fontWeight = '700';
    } else {
        badge.textContent = '';
        badge.style.color = '#94a3b8';
        badge.style.fontWeight = '400';
    }
}

function calcAndRecommendClass06() {
    const grade = document.getElementById('input-grade') ? document.getElementById('input-grade').value : '';
    if (!grade) return;
    const dispEl = document.getElementById('score-total-display');
    const total = parseInt(dispEl ? dispEl.textContent : '0') || 0;
    if (!total) { updateClassBadge06(); return; }
    const rec = recommendClassByScore(total, grade);
    const sel = document.getElementById('input-student-class');
    if (!sel) return;
    sel.dataset.recommendedClass = rec || '';
    const recOpt = sel.querySelector('option[value="__RECOMMEND__"]');
    if (recOpt) recOpt.textContent = rec ? ('⭐ 추천: ' + rec) : '⭐ 추천 (해당없음)';
    // 점수 변경 시 무조건 AI 추천으로 덮어씌움 (저장 시점 값이 DB로 감)
    if (rec) {
        sel.value = rec;
    }
    updateClassBadge06(rec);
}

function updateClassDropdown06(grade) {
    const sel = document.getElementById('input-student-class');
    if (!sel) return;
    const list = getClassesForGrade(grade);
    sel.innerHTML = '<option value="">' + (list.length ? '점수입력 시 자동 추천' : '등록된 학급 없음') + '</option>'
        + '<option value="__RECOMMEND__" style="font-weight:bold;color:#6366f1;">⭐ 추천</option>'
        + list.map(function(n) { return '<option value="' + n + '">' + n + '</option>'; }).join('')
        + '<option value="달성미달" style="color:#ef4444;font-weight:bold;">⛔ 달성미달</option>';
    sel.dataset.recommendedClass = '';
    sel.dataset.autoSelected = '0';
    sel.onchange = function() {
        const rec = this.dataset.recommendedClass || '';
        if (this.value === '__RECOMMEND__') {
            if (rec) { this.value = rec; }
            else { showToast('먼저 점수를 입력해주세요'); this.value = ''; }
            return;
        }
        if (rec && this.value !== rec && this.dataset.autoSelected === '1') {
            const ok = confirm('AI 추천 학급은 "' + rec + '"입니다.\n다른 학급("' + this.value + '")을 선택하시겠습니까?');
            if (!ok) { this.value = rec; }
            else { this.dataset.autoSelected = '0'; }
        }
    };
    updateClassBadge06();
}

// q-score 변경 시 추천 계산 (이벤트 위임 - 한 번만 등록)
// AI 추천: calculateTotalScore()에서 직접 호출하므로 별도 이벤트 불필요

function clampQScore(input) {
    const max = parseInt(input.dataset.max) || 0;
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) { input.value = ''; return; }
    if (val > max) { input.value = max; }
}

function clampAccordionScore(input) {
    const maxVal = parseInt(input.max);
    let val = parseInt(input.value);
    if (isNaN(val) || val < 0) { input.value = ''; return; }
    if (!isNaN(maxVal) && maxVal > 0 && val > maxVal) { input.value = maxVal; }
}

function toggleAccordion(id) {
    const panel = document.getElementById(id);
    const icon = document.getElementById(id + '-icon');
    if (!panel) return;
    const isHidden = panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !isHidden);
    if (icon) icon.textContent = isHidden ? '\u25BC' : '\u25B6';
}

function toggleQScoreMode(checked) {
    const wrapper = document.getElementById('accordion-wrapper');
    const qList   = document.getElementById('question-score-list');
    if (wrapper) wrapper.classList.toggle('hidden', !checked);
    if (qList)   qList.classList.toggle('hidden', checked);
    calculateTotalScore();
}

function calculateTotalScore() {
    const noQScore = document.getElementById('chk-no-qscore')?.checked;
    if (!noQScore) {
        // 문항별 모드: q-score 합산
        const qInputs = document.querySelectorAll('[id^="q-score-"]');
        let qSum = 0;
        qInputs.forEach(inp => {
            const v = parseInt(inp.value);
            if (!isNaN(v) && v > 0) qSum += v;
        });
        const d = document.getElementById('score-total-display');
        if (d) d.textContent = qSum;
        calcAndRecommendClass06();
        return;
    }

    const grammar   = parseInt(document.getElementById('input-grammar')?.value) || 0;
    const writing   = parseInt(document.getElementById('input-writing')?.value) || 0;
    const reading   = parseInt(document.getElementById('input-reading')?.value) || 0;
    const listening = parseInt(document.getElementById('input-listening')?.value) || 0;
    const vocab     = parseInt(document.getElementById('input-vocab')?.value) || 0;
    const sumSec    = grammar + writing + reading + listening + vocab;

    const finalTotal = sumSec;

    const d = document.getElementById('score-total-display');
    if (d) d.textContent = finalTotal;
    calcAndRecommendClass06();
}

function clearScoreInputs(resetCat = true, showMsg = true) {
    ['input-student-id','input-student-name',
     'input-grammar','input-writing','input-reading','input-listening','input-vocab',

    ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.querySelectorAll('[id^="q-score-"]').forEach(inp => inp.value = '');
    const d = document.getElementById('score-total-display');
    if (d) d.textContent = '0';
    if (showMsg) showToast('\u2728 \uC785\uB825 \uB0B4\uC6A9\uC774 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4');
}

async function saveStudentScore() {
    if (!confirm('\uD83D\uDCBE \uC785\uB825\uD55C \uC131\uC801 \uC815\uBCF4\uB97C \uC800\uC7A5\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?')) return;

    const categoryId = document.getElementById('input-category').value;
    if (!categoryId) { showToast('\u26A0\uFE0F \uCE74\uD14C\uACE0\uB9AC\uB97C \uC120\uD0DD\uD558\uC138\uC694'); return; }
    const category = globalConfig.categories.find(c => c.id === categoryId);

    const studentName  = document.getElementById('input-student-name').value.trim();
    const grade        = document.getElementById('input-grade').value;
    let studentClass = document.getElementById('input-student-class')?.value.trim() || '';
    if (studentClass === '__RECOMMEND__') { const sel=document.getElementById('input-student-class'); studentClass = sel?.dataset?.recommendedClass||''; }
    const testDate     = document.getElementById('input-test-date').value;

    if (!studentName) { showToast('\u26A0\uFE0F \uD559\uC0DD\uBA85\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694'); return; }
    if (!grade)       { showToast('\u26A0\uFE0F \uD559\uB144\uC744 \uC120\uD0DD\uD574\uC8FC\uC138\uC694'); return; }

    toggleLoading(true);
    try {
        const studentId = await generateUniqueStudentId(testDate, grade);
        const idEl = document.getElementById('input-student-id');
        if (idEl) idEl.value = studentId;

        const questionScores = [];
        let totalFromQ = 0, maxFromQ = 0;
        document.querySelectorAll('[id^="q-score-"]').forEach(inp => {
            const qid  = inp.dataset.qid;
            const maxQ = parseInt(inp.dataset.max) || 0;
            const sc   = parseInt(inp.value) || 0;
            totalFromQ += sc;
            maxFromQ   += maxQ;
            const q = (globalConfig.questions || []).find(q => String(q.id) === String(qid));
            questionScores.push({ no: q?.no||'', id: qid, type: q?.type||'',
                correct: null, studentAnswer: null, correctAnswer: null,
                score: sc, maxScore: maxQ });
        });

        // ── 영역별·난이도별 점수 계산 ──
        // 문항별 점수를 입력한 경우: 각 문항의 section/difficulty로 자동 합산
        // 아코디언만 입력한 경우: 해당 입력값 그대로 사용 (폴백)
        let grammarScore, writingScore, readingScore, listeningScore, vocabScore;

        // 체크박스 "문항별 점수 정보 없음" 여부로 분기
        const noQScoreMode = document.getElementById('chk-no-qscore')?.checked;

        if (!noQScoreMode) {
            // 문항별 입력 → section/difficulty 자동 집계
            const calcS = (sec) => questionScores.reduce((sum, qs) => {
                const q = (globalConfig.questions || []).find(q => String(q.id) === String(qs.id));
                return sum + (q?.section === sec ? (qs.score || 0) : 0);
            }, 0);
            grammarScore   = calcS('Grammar');
            writingScore   = calcS('Writing');
            readingScore   = calcS('Reading');
            listeningScore = calcS('Listening');
            vocabScore     = calcS('Vocabulary');
        } else {
            // 아코디언 직접 입력 → 해당 값 사용
            grammarScore   = parseInt(document.getElementById('input-grammar')?.value)       || 0;
            writingScore   = parseInt(document.getElementById('input-writing')?.value)        || 0;
            readingScore   = parseInt(document.getElementById('input-reading')?.value)        || 0;
            listeningScore = parseInt(document.getElementById('input-listening')?.value)      || 0;
            vocabScore     = parseInt(document.getElementById('input-vocab')?.value)          || 0;
        }

        // ── 영역별 만점: 문항 배점 합산 ──
        const catQs = (globalConfig.questions || []).filter(q => String(q.catId) === String(categoryId));
        const calcMax = (field, val) => catQs.filter(q => q[field] === val).reduce((s, q) => s + (parseInt(q.score) || 0), 0);
        const grammarMax   = calcMax('section', 'Grammar');
        const writingMax   = calcMax('section', 'Writing');
        const readingMax   = calcMax('section', 'Reading');
        const listeningMax = calcMax('section', 'Listening');
        const vocabMax     = calcMax('section', 'Vocabulary');

        const totalScore = !noQScoreMode
            ? totalFromQ
            : (grammarScore + writingScore + readingScore + listeningScore + vocabScore)
              || 0;
        const maxScore = !noQScoreMode
            ? maxFromQ
            : parseInt(document.getElementById('score-max-display')?.textContent) || 100;

        // ── 난이도별 점수 계산 (문항별 입력 모드에서만) ──
        const difficulties = { '최상':{score:0,max:0}, '상':{score:0,max:0}, '중':{score:0,max:0}, '하':{score:0,max:0}, '기초':{score:0,max:0} };
        if (!noQScoreMode) {
            questionScores.forEach(qs => {
                const q = catQs.find(q => String(q.id) === String(qs.id));
                const diff = q?.difficulty || '중';
                if (difficulties[diff]) {
                    difficulties[diff].score += (qs.score || 0);
                    difficulties[diff].max   += (parseInt(q?.score) || 0);
                }
            });
        }

        const payload = {
            type: 'STUDENT_SAVE',
            parentFolderId: extractFolderId(category.targetFolderUrl),
            categoryId, categoryName: category.name,
            studentId, studentName, grade, studentClass, testDate,
            questionScores: JSON.stringify(questionScores),
            grammarScore,   grammarMax,
            writingScore,   writingMax,
            readingScore,   readingMax,
            listeningScore, listeningMax,
            vocabScore,     vocabMax,
            difficulty_highest: difficulties['최상'].score, difficulty_highest_max: difficulties['최상'].max,
            difficulty_high:    difficulties['상'].score,   difficulty_high_max:    difficulties['상'].max,
            difficulty_mid:     difficulties['중'].score,   difficulty_mid_max:     difficulties['중'].max,
            difficulty_low:     difficulties['하'].score,   difficulty_low_max:     difficulties['하'].max,
            difficulty_basic:   difficulties['기초'].score, difficulty_basic_max:   difficulties['기초'].max,
            inputMode: noQScoreMode ? 'section' : 'question',
            totalScore, maxScore
        };

        await sendReliableRequest(payload);
        showToast('\u2705 \uD559\uC0DD \uC131\uC801\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4!');
        clearScoreInputs(false, false);
    } catch (err) {
        console.error(err);
        showToast('\u26A0\uFE0F \uC800\uC7A5 \uC911 \uC624\uB958 \uBC1C\uC0DD: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// --- ONLINE EXAM STUDENT SYSTEM ---


function startExamTimer() {
    if (examTimer) clearInterval(examTimer);

    const timerEl = document.getElementById('timer');
    const limitMin = examSession.timeLimit || 0;

    // 타이머 업데이트 함수
    const update = () => {
        if (!timerEl) return;
        const now = Date.now();
        const diffSec = Math.floor((now - examSession.startTime) / 1000); // 경과 시간(초)

        if (limitMin > 0) {
            // 카운트다운 모드
            const limitSec = limitMin * 60;
            const remainSec = limitSec - diffSec;

            if (remainSec <= 0) {
                timerEl.innerText = "00:00:00";
                timerEl.classList.add('text-red-600', 'animate-pulse');
                clearInterval(examTimer);
                examSession.isExamActive = false; // 입력 완전 차단

                // 모든 입력 비활성화 (라디오 버튼 포함 전체 입력/라벨 차단)
                const examContainer = document.getElementById('exam-container');
                if (examContainer) {
                    // 입력 필드 및 텍스트 영역 비활성화
                    examContainer.querySelectorAll('input, textarea, select').forEach(el => {
                        el.disabled = true;
                        el.style.opacity = '0.5';
                        el.style.cursor = 'not-allowed';
                    });
                    // 선택이 가능한 라벨(Label) 영역 클릭 방지
                    examContainer.querySelectorAll('label').forEach(lb => {
                        lb.style.pointerEvents = 'none';
                        lb.style.opacity = '0.5';
                        lb.style.cursor = 'not-allowed';
                    });
                }

                alert("시험 시간이 만료되었습니다. 이제 입력이 불가능합니다.\n하단의 제출 버튼을 눌러 시험을 종료하세요.");
                return;
            }

            const h = Math.floor(remainSec / 3600).toString().padStart(2, '0');
            const m = Math.floor((remainSec % 3600) / 60).toString().padStart(2, '0');
            const s = (remainSec % 60).toString().padStart(2, '0');
            timerEl.innerText = `${h}:${m}:${s}`;

            // 5분 미만 시 경고 효과
            if (remainSec < 300) timerEl.classList.add('text-red-600', 'animate-pulse');
            else timerEl.classList.remove('text-red-600', 'animate-pulse');

        } else {
            // 카운트업 모드 (기존 유지)
            const h = Math.floor(diffSec / 3600).toString().padStart(2, '0');
            const m = Math.floor((diffSec % 3600) / 60).toString().padStart(2, '0');
            const s = (diffSec % 60).toString().padStart(2, '0');
            timerEl.innerText = `${h}:${m}:${s}`;
        }
    };

    update(); // 즉시 1회 실행
    examTimer = setInterval(update, 1000);
}

function updateAnswer(qid, val) {
    if (!examSession.isExamActive) return; // 시험 종료(또는 타임업) 시 입력 무시
    examSession.answers[qid] = val;
    updateProgressUI(); // [New] Update Progress UI on change
}

// [Refactored] Student Exam View System
let currentExamGridCols = 1;
let examPageSize = 12; // Default items per page (adjustable)

// [Main Entry] Render Exam Paper (Refactored)


// [Sub-component] Sidebar


// [Sub-function] Update Page
function updatePage(delta) {
    const units = examSession.displayUnits;
    if (!units) return;

    const totalPages = units.length;
    let newPage = examSession.currentPage + delta;

    if (newPage < 0) newPage = 0;
    if (newPage >= totalPages) newPage = totalPages - 1;

    // [경고 1] 오디오 재생 중 이동 확인
    const _playingAudios = Array.from(document.querySelectorAll('audio')).filter(function(a){ return !a.paused && !a.ended; });
    if (_playingAudios.length > 0) {
        if (!confirm('듣기가 재생 중입니다. 페이지를 이동하면 재생이 중단됩니다. 계속하시겠습니까?')) return;
        _playingAudios.forEach(function(a){ a.pause(); });
    }

    // [경고 2] 미답변 문항 확인
    const _curUnit = units[examSession.currentPage];
    if (_curUnit) {
        const _qs = (_curUnit.type === 'bundle') ? (Array.isArray(_curUnit.data) ? _curUnit.data : [_curUnit.data]) : [_curUnit.data];
        const _unanswered = [];
        _qs.forEach(function(q){ if (!q) return; const _ans = examSession.answers ? examSession.answers[q.id] : null; if (_ans === undefined || _ans === null || _ans === '') _unanswered.push(q.no); });
        if (_unanswered.length > 0) {
            if (!confirm('이 페이지에 아직 답하지 않은 문항이 있습니다 (No. ' + _unanswered.join(', ') + '). 계속 이동하시겠습니까?')) return;
        }
    }

    if (newPage !== examSession.currentPage) {
        examSession.currentPage = newPage;
        renderExamContent();
        const scrollArea = document.getElementById('exam-scroll-area');
        if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// [Restored Feature] renderStudentSidebar
function renderStudentSidebar() {
    return `
        <div class="w-[300px] bg-white border-r border-black flex flex-col flex-shrink-0 z-50 shadow-sm relative transition-all duration-300 h-full">
            <div class="p-6 border-b border-slate-100 bg-slate-50/50">
                 <span class="text-[14px] text-[#013976] font-black tracking-[0.2em] uppercase block mb-1">PassporT Student</span>
                 <h1 class="text-2xl font-black text-slate-800 tracking-tight leading-none">EXAM VIEW</h1>
            </div>

            <div class="p-6 space-y-4">
                 <div>
                    <div class="flex items-center gap-2">
                        <span class="text-[14px] text-[#013976] font-bold uppercase tracking-wider">Candidate</span>
                        <span class="text-[14px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">${examSession.grade}</span>
                        <span class="text-lg font-bold text-[#013976]">${examSession.studentName}</span>
                    </div>
                </div>

                <div class="bg-slate-900 rounded-xl p-5 text-center relative overflow-hidden group shadow-lg">
                    <span class="block text-[14px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Time Remaining</span>
                    <div id="timer" class="text-3xl font-mono font-bold text-white tracking-wider relative z-10">00:00:00</div>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto px-6 py-4 space-y-8">
                <div>
                    <span class="text-[14px] text-[#013976] font-bold uppercase tracking-wider block mb-3">PAGE NAVIGATION</span>
                    <div class="text-center mb-3">
                        <span id="page-indicator" class="text-2xl font-black text-[#013976]">1 / 1</span>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="updatePage(-1)" class="flex-1 py-3 bg-[#013976] text-white rounded-xl font-bold shadow-md hover:bg-blue-900 active:scale-95 transition-all flex justify-center items-center gap-2">Prev</button>
                        <button onclick="updatePage(1)" class="flex-1 py-3 bg-[#013976] text-white rounded-xl font-bold shadow-md hover:bg-blue-900 active:scale-95 transition-all flex justify-center items-center gap-2">Next</button>
                    </div>
                </div>

                <div>
                     <span class="text-[14px] text-[#013976] font-bold uppercase tracking-wider block mb-3">Progress Status</span>
                     <div class="bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <div class="flex justify-between items-end mb-2">
                            <span class="text-2xl font-black text-[#013976]" id="progress-val">0%</span>
                            <span class="text-[14px] font-bold text-slate-500" id="progress-text">0 / 0</span>
                        </div>
                        <div class="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                            <div id="progress-bar" class="bg-blue-600 h-full rounded-full transition-all duration-500 w-0"></div>
                        </div>
                     </div>
                </div>
            </div>

            <div class="p-6 border-t border-slate-100 bg-slate-50/30">
                <button onclick="submitExam()" class="w-full py-4 bg-[#013976] text-white rounded-xl font-bold text-lg shadow-lg hover:bg-blue-900 active:scale-95 transition-all flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                    Submit Exam
                </button>
                <div class="text-center mt-3">
                     <button onclick="cancelExam()" class="text-[14px] text-slate-400 underline hover:text-red-500 transition-colors">Cancel Exam</button>
                </div>
            </div>
        </div>
    `;
}

// [Sub-function] Render Content Grid
// [Refactor] Render Exam Content (Column Distribution)
function renderExamContent() {
    const container = document.getElementById('exam-grid-container');
    const pageUnits = examSession.displayUnits;
    if (!container || !pageUnits) return;

    const totalPages = pageUnits.length;
    const currentUnit = pageUnits[examSession.currentPage];
    if (!currentUnit) return;

    // Update page indicator
    const indEl = document.getElementById('page-indicator');
    if (indEl) indEl.innerText = `${examSession.currentPage + 1} / ${totalPages}`;

    // Always 2-column grid
    container.className = 'w-full h-full grid grid-cols-2 divide-x divide-black bg-white';
    container.innerHTML = '';

    if (currentUnit.type === 'bundle') {
        // Left: passage + image (independent scroll)
        const leftCol = document.createElement('div');
        leftCol.className = 'h-full overflow-y-auto p-6 custom-scroll-wrapper';
        leftCol.innerHTML = renderBundleLeft(currentUnit.data);

        // Right: questions (independent scroll)
        const rightCol = document.createElement('div');
        rightCol.className = 'h-full overflow-y-auto p-6 custom-scroll-wrapper';
        rightCol.innerHTML = renderBundleRight(currentUnit.data);

        container.appendChild(leftCol);
        container.appendChild(rightCol);

    } else if (currentUnit.type === 'pair') {
        // Left: Q1, Right: Q2
        currentUnit.data.forEach(q => {
            const col = document.createElement('div');
            col.className = 'h-full overflow-y-auto p-6';
            col.innerHTML = `
                <div class="flex items-start gap-3 mb-2">
                    <div class="flex-shrink-0 w-7 h-7 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-[15px] pt-0.5 shadow-sm">${q.displayIndex}</div>
                    <h4 class="text-[15px] font-normal text-slate-800 leading-snug pt-0.5 break-keep select-text">${q.text || ''}</h4>
                </div>
                ${q.passage1 && q.passage1.trim() !== '' ? '<div class="mb-3 p-3 bg-slate-100/50 border border-black rounded-lg text-[14px] leading-relaxed font-serif text-slate-700">' + q.passage1 + '</div>' : ''}
                ${getMediaHtml(q)}
                <div class="text-[14px]">${getInputHtml(q)}</div>
            `;
            container.appendChild(col);
        });

    } else if (currentUnit.type === 'solo') {
        // Left: single question
        const q = currentUnit.data;
        const leftCol = document.createElement('div');
        leftCol.className = 'h-full overflow-y-auto p-6';
        leftCol.innerHTML = `
            <div class="flex items-start gap-3 mb-2">
                <div class="flex-shrink-0 w-7 h-7 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-[15px] pt-0.5 shadow-sm">${q.displayIndex}</div>
                <h4 class="text-[15px] font-normal text-slate-800 leading-snug pt-0.5 break-keep select-text">${q.text || ''}</h4>
            </div>
            ${q.passage1 && q.passage1.trim() !== '' ? '<div class="mb-3 p-3 bg-slate-100/50 border border-black rounded-lg text-[14px] leading-relaxed font-serif text-slate-700">' + q.passage1 + '</div>' : ''}
            ${getMediaHtml(q)}
            <div class="text-[14px]">${getInputHtml(q)}</div>
        `;

        // Right: continue message
        const rightCol = document.createElement('div');
        rightCol.className = 'h-full flex items-center justify-center bg-slate-50/30';
        rightCol.innerHTML = '<div class="text-center text-slate-400"><span class="text-4xl block mb-3">📄</span><span class="text-[16px] font-medium">\ub2e4\uc74c \ud654\uba74\uc5d0 \ubb38\ud56d\uc774 \uacc4\uc18d\ub429\ub2c8\ub2e4.</span></div>';

        container.appendChild(leftCol);
        container.appendChild(rightCol);
    }

    updateProgressUI();
    setTimeout(setupScrollArrows, 50);
}

// [Restored Feature] updateProgressUI
function updateProgressUI() {
    // Simple calc
    let total = 0;
    if (globalConfig.questions) {
        total = globalConfig.questions.filter(q => String(q.catId) === String(examSession.categoryId)).length;
    }
    const answered = Object.keys(examSession.answers || {}).length;
    const pct = total === 0 ? 0 : Math.round((answered / total) * 100);

    const bar = document.getElementById('progress-bar');
    const txt = document.getElementById('progress-text');
    const val = document.getElementById('progress-val');

    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.innerText = `${answered} / ${total} Questions`;
    if (val) val.innerText = `${pct}%`;
}

// [Duplicate definitions removed]


// Removing duplicate definitions completely.


function renderExamResult(results, earned, total) {
    const percentage = Math.round((earned / total) * 100) || 0;
    const c = document.getElementById('dynamic-content');
    setCanvasId('02-2');
    // [Fix] dynamic-content 자체 스타일 건드리지 않음 → 래퍼 div에 중앙정렬 적용
    c.style.cssText = '';

    c.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:center; width:100%; min-height:60vh;">
                    <div class="animate-fade-in-safe bg-white p-24 rounded-[2rem] border-2 border-[#013976]/20 flex flex-col items-center shadow-2xl">
                        <span class="text-6xl mb-8 font-black unified-animate">✅</span>
                        <h2 class="fs-32 text-[#013976] font-black uppercase mb-4 leading-none text-center">제출이 완료되었습니다</h2>
                        <p class="fs-18 text-slate-400 tracking-tight mb-8 font-medium">Exam Submitted Successfully</p>
                        <div class="bg-blue-50 px-10 py-6 rounded-3xl mb-10 border border-blue-100">
                             <p class="text-blue-900 fs-18 font-bold">수고하셨습니다!</p>
                        </div>
                        <button onclick="goHome()" class="btn-ys !px-16 !py-5 fs-18 shadow-lg">🏠 Back to Home</button>
                    </div>
                </div>
            `;
}

// 학생 성적표 UI 렌더링
// --- Missing Helper Functions Implementation ---

function getMediaHtml(q) {
    if (!q.imgUrl || q.imgUrl === "undefined" || q.imgUrl === "null") return "";

    // [Fix] Apply Google Drive URL Fixer
    const safeUrl = typeof fixDriveUrl === 'function' ? fixDriveUrl(q.imgUrl) : q.imgUrl;

    return `
        <div class="mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img src="${safeUrl}" 
                 class="w-full h-auto object-contain mx-auto" 
                 alt="Question Image" 
                 loading="lazy"
                 onerror="this.style.display='none'; if(this.parentElement) this.parentElement.style.display='none';">
        </div>
    `;
}

function getInputHtml(q) {
    const savedAns = examSession.answers[q.id] || "";

    if (q.type === '객관형' || !q.type) { // Default to Objective
        // Ensure options exists
        let options = q.choices;
        if (typeof options === 'string') {
            try { options = JSON.parse(options); } catch (e) { options = []; }
        }
        if (!options || options.length === 0) return '<div class="text-red-500">보기 데이터 없음</div>';

        return `
            <div class="flex flex-col gap-3">
                ${options.map((opt, idx) => {
            // [Fix] q.labelType 없으면 answer 값으로 추론
        const _inferredObjLT = (q.answer && /^[A-Ea-e]$/.test(String(q.answer).trim())) ? 'alpha' : 'number';
        const _lType = q.labelType || _inferredObjLT;
            const _alphaCircled = ['Ⓐ','Ⓑ','Ⓒ','Ⓓ','Ⓔ'];
            const _numCircled   = ['①','②','③','④','⑤','⑥'];
            const _v = _lType === 'alpha' ? ['A','B','C','D','E'][idx] : (idx + 1).toString();
            const _sel = savedAns === _v;
            const _cnum = _lType === 'alpha' ? (_alphaCircled[idx] || _v) : (_numCircled[idx] || _v);
            return `<button type="button" data-qid="${q.id}" data-val="${_v}"
                onclick="selectObjAnswer('${q.id}','${_v}')"
                class="exam-choice-btn flex items-center gap-3 p-2 rounded-xl border-2 cursor-pointer transition-all duration-200 text-left w-full"
                style="border-color:${_sel?'#4f46e5':'#e2e8f0'};background:${_sel?'#eef2ff':'#ffffff'}">
                <span class="exam-circle-num flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center text-[20px] font-bold transition-all"
                    style="background:${_sel?'#4f46e5':'#ffffff'};color:${_sel?'#ffffff':'#4f46e5'};border-color:${_sel?'#4f46e5':'#c7d2fe'}"
                >${_cnum}</span>
                <span class="text-[14px] font-medium" style="color:${_sel?'#3730a3':'#374151'}">${opt}</span>
            </button>`;
        }).join('')}
            </div>
        `;
    } else {
        // Subjective
        return `
            <textarea class="w-full p-4 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all fs-16 resize-none min-h-[120px]" 
                placeholder="답안을 입력하세요..." 
                oninput="updateAnswer('${q.id}', this.value)">${savedAns}</textarea>
        `;
    }
}

function selectObjAnswer(qId, val) {
    updateAnswer(qId, val);
    document.querySelectorAll('.exam-choice-btn').forEach(function(btn) {
        if (btn.dataset.qid !== qId) return;
        const isSel = btn.dataset.val === val;
        btn.style.borderColor = isSel ? '#4f46e5' : '#e2e8f0';
        btn.style.background = isSel ? '#eef2ff' : '#ffffff';
        const circle = btn.querySelector('.exam-circle-num');
        if (circle) {
            circle.style.background = isSel ? '#4f46e5' : '#ffffff';
            circle.style.color = isSel ? '#ffffff' : '#4f46e5';
            circle.style.borderColor = isSel ? '#4f46e5' : '#c7d2fe';
        }
        const txt = btn.querySelector('span:last-child');
        if (txt) txt.style.color = isSel ? '#3730a3' : '#374151';
    });
}

function updateAnswer(qId, value) {
    if (!examSession.answers) examSession.answers = {};
    examSession.answers[qId] = value;
    updateProgressUI();

    // Force UI refresh for the specific question's options if needed
    const inputs = document.getElementsByName(`q-${qId}`);
    if (inputs) {
        inputs.forEach(input => {
            const label = input.closest('label');
            if (label) {
                if (input.value === value) {
                    label.classList.add('border-indigo-500', 'bg-indigo-50', 'ring-1', 'ring-indigo-500');
                    label.classList.remove('border-slate-200', 'hover:bg-slate-50');
                    input.checked = true;
                } else {
                    label.classList.remove('border-indigo-500', 'bg-indigo-50', 'ring-1', 'ring-indigo-500');
                    label.classList.add('border-slate-200', 'hover:bg-slate-50');
                    input.checked = false;
                }
            }
        });
    }
}

async function submitExam() {
    if (!confirm("시험을 제출하시겠습니까?")) return;

    toggleLoading(true);

    try {
        // Calculate Scores
        let totalScore = 0;
        let maxScore = 0;

        // Define Sections
        const sections = {
            'Grammar': { score: 0, max: 0 },
            'Writing': { score: 0, max: 0 },
            'Reading': { score: 0, max: 0 },
            'Listening': { score: 0, max: 0 },
            'Vocabulary': { score: 0, max: 0 }
        };

        // Define Difficulties
        const difficulties = {
            '최상': { score: 0, max: 0 },
            '상': { score: 0, max: 0 },
            '중': { score: 0, max: 0 },
            '하': { score: 0, max: 0 },
            '기초': { score: 0, max: 0 }
        };

        const questionScores = [];
        const rawQuestions = globalConfig.questions.filter(q => String(q.catId) === String(examSession.categoryId));

        // [Fix] 묶음 지문 데이터 주입 (AI 채점 시 지문 문맥 전달)
        const questions = rawQuestions.map(q => {
            const copy = { ...q };
            if (copy.setId) {
                const bundle = globalConfig.bundles ? globalConfig.bundles.find(b => b.id === copy.setId) : null;
                if (bundle) {
                    copy.bundlePassageText = bundle.text;
                    copy.commonTitle = bundle.title;
                    copy.bundleImgUrl = bundle.imgUrl || ''; // [Fix] 번들 이미지 URL 주입
                }
            }
            return copy;
        });

        for (const q of questions) {
            const studentAns = examSession.answers[q.id] || "";
            let earnedScore = 0;
            let isCorrect = false;
            const maxQ = parseInt(q.score) || 0;
            const correctAns = String(q.answer || '').trim();

            if (q.type === '객관형') {
                // 객관형: 단순 문자열 비교
                isCorrect = String(studentAns).trim() === String(q.answer).trim();
                earnedScore = isCorrect ? maxQ : 0;
            } else {
                // 주관형 1단계: 키워드 매칭 (대소문자·띄어쓰기·구두점·en dash 무시)
                if (!studentAns.trim()) {
                    isCorrect = false;
                    earnedScore = 0;
                } else if (correctAns) {
                    const normalize = s => s.toLowerCase().replace(/[\s,.\-_'"!?;:()`\u2013\u2014\u2018\u2019\u201C\u201D]/g, '').trim();
                    const acceptableAnswers = correctAns.split(',').map(a => normalize(a));
                    const normalizedStudentAns = normalize(String(studentAns));
                    isCorrect = acceptableAnswers.some(a => a && normalizedStudentAns.includes(a)) || acceptableAnswers.includes(normalizedStudentAns);
                    earnedScore = isCorrect ? maxQ : 0;
                }

                // 주관형 2단계: 키워드 매칭 실패 시 AI 채점
                if (!isCorrect && studentAns.trim() && globalConfig.geminiKey) {
                    try {
                        const aiResult = await gradeWithAI(q, studentAns);
                        if (aiResult && aiResult.score !== undefined) {
                            earnedScore = Math.min(Math.max(0, Math.round(aiResult.score)), maxQ);
                            isCorrect = earnedScore >= maxQ;
                            console.log(`✅ AI 채점 [문항 ${q.no}]: ${earnedScore}/${maxQ} (${aiResult.feedback})`);
                        }
                    } catch (aiErr) {
                        console.warn(`⚠️ AI 채점 실패 [문항 ${q.no}]:`, aiErr.message);
                    }
                }
            }

            totalScore += earnedScore;
            maxScore += maxQ;

            // 영역별 집계
            const sec = q.section || 'Reading';
            if (sections[sec]) {
                sections[sec].score += earnedScore;
                sections[sec].max += maxQ;
            }

            // 난이도별 집계
            const diff = q.difficulty || '중';
            if (difficulties[diff]) {
                difficulties[diff].score += earnedScore;
                difficulties[diff].max += maxQ;
            }

            questionScores.push({
                no: q.no,
                id: q.id,
                type: q.type,
                section: sec,
                difficulty: diff,
                correct: isCorrect,
                studentAnswer: studentAns,
                correctAnswer: q.answer,
                score: earnedScore,
                maxScore: maxQ,
                _gradingV2: true
            });
        }


        // Prepare Payload
        const category = globalConfig.categories.find(c => String(c.id) === String(examSession.categoryId));
        const targetFolderId = category ? extractFolderId(category.targetFolderUrl) : "";

        const apiPayload = {
            type: 'STUDENT_SAVE',
            categoryId: examSession.categoryId,
            categoryName: category?.name || "Unknown",
            parentFolderId: targetFolderId,
            testDate: examSession.date,
            studentId: examSession.studentId,
            studentName: examSession.studentName,
            grade: examSession.grade,

            questionScores: JSON.stringify(questionScores),

            grammarScore: sections['Grammar'].score,   grammarMax: sections['Grammar'].max,
            writingScore: sections['Writing'].score,   writingMax: sections['Writing'].max,
            readingScore: sections['Reading'].score,   readingMax: sections['Reading'].max,
            listeningScore: sections['Listening'].score, listeningMax: sections['Listening'].max,
            vocabScore: sections['Vocabulary'].score,  vocabMax: sections['Vocabulary'].max,

            difficulty_highest: difficulties['최상'].score, difficulty_highest_max: difficulties['최상'].max,
            difficulty_high:    difficulties['상'].score,   difficulty_high_max:    difficulties['상'].max,
            difficulty_mid:     difficulties['중'].score,   difficulty_mid_max:     difficulties['중'].max,
            difficulty_low:     difficulties['하'].score,   difficulty_low_max:     difficulties['하'].max,
            difficulty_basic:   difficulties['기초'].score, difficulty_basic_max:   difficulties['기초'].max,

            totalScore: totalScore,
            maxScore: maxScore
        };

        // ── 진단용 로그 (F12 콘솔에서 확인) ──
        console.log("=== SUBMIT PAYLOAD 점검 ===");
        console.log("Fields:", Object.keys(apiPayload).join(', '));
        console.log("totalScore:", apiPayload.totalScore, "| maxScore:", apiPayload.maxScore);
        console.log("studentClass 존재여부:", 'studentClass' in apiPayload, "| inputMode 존재여부:", 'inputMode' in apiPayload);
        console.log("Full payload:", JSON.stringify(apiPayload, null, 2));

        // Send to Backend
        await sendReliableRequest(apiPayload);

        // Success UI
        renderExamResult(questionScores, totalScore, maxScore);

    } catch (e) {
        console.error(e);
        showToast("❌ 제출 실패: " + e.message);
        alert("제출 중 오류가 발생했습니다: " + e.message);
    } finally {
        toggleLoading(false);
    }
}

// 학생 성적표 UI 렌더링 (시험지→년도→학년→학생 계단식 필터)
function renderRecords(c) {
    if (!globalConfig.categories || globalConfig.categories.length === 0) {
        renderEmptyState(c, 'Individual Reports');
        return;
    }

    setCanvasId('05');
    const boxStyle = `background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%); border: 2px solid rgba(1,57,118,0.15);`;
    const topBar = `<div style="position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, #60a5fa, #6366f1, #a855f7);"></div>`;
    c.innerHTML = `
        <div class="animate-fade-in-safe space-y-6">
            <div class="relative no-print">
                <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">Individual Reports</h2>
                <div class="absolute right-0 flex items-center gap-2" style="top:50%; transform:translateY(-50%);">
                    <button onclick="saveReportData()" id="btn-save-report" class="flex items-center gap-2 px-5 py-2 rounded-xl bg-[#013976] text-white font-bold fs-15 hover:bg-[#012456] transition-all active:scale-95 shadow">💾 저장</button>
                    <button onclick="printReport()" class="flex items-center gap-2 px-5 py-2 rounded-xl bg-slate-700 text-white font-bold fs-15 hover:bg-slate-900 transition-all active:scale-95 shadow">🖨️ 인쇄</button>
                </div>
            </div>

            <!-- 시험지 · 년도 · 학년 · 학생 선택 (4단계 계단식) -->
            <div class="grid grid-cols-4 gap-4 no-print">
                <!-- Box 1: 시험지 -->
                <div class="card !p-6 flex flex-col justify-center shadow-lg relative overflow-hidden" style="${boxStyle}">
                    ${topBar}
                    <div class="space-y-3">
                        <label class="ys-label !mb-0 !text-[#013976] font-bold">📂 시험지 선택</label>
                        <select id="report-category" onchange="onReportCategoryChange();" class="ys-field w-full !font-normal !text-[#013976] !bg-white !text-[16px]">
                            <option value="" disabled selected hidden>시험지를 선택하세요</option>
                            ${globalConfig.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Box 2: 년도 -->
                <div class="card !p-6 flex flex-col justify-center shadow-lg relative overflow-hidden" style="${boxStyle}">
                    ${topBar}
                    <div class="space-y-3">
                        <label class="ys-label !mb-0 !text-[#013976] font-bold">📅 년도 선택</label>
                        <select id="report-year" onchange="onReportYearChange();" class="ys-field w-full !font-normal !text-[#013976] !bg-white !text-[16px]" disabled>
                            <option value="" disabled selected hidden>시험지 먼저 선택</option>
                        </select>
                    </div>
                </div>

                <!-- Box 3: 학년 -->
                <div class="card !p-6 flex flex-col justify-center shadow-lg relative overflow-hidden" style="${boxStyle}">
                    ${topBar}
                    <div class="space-y-3">
                        <label class="ys-label !mb-0 !text-[#013976] font-bold">🎓 학년 선택</label>
                        <select id="report-grade" onchange="onReportGradeChange();" class="ys-field w-full !font-normal !text-[#013976] !bg-white !text-[16px]" disabled>
                            <option value="" disabled selected hidden>년도 먼저 선택</option>
                        </select>
                    </div>
                </div>

                <!-- Box 4: 학생 -->
                <div class="card !p-6 flex flex-col justify-center shadow-lg relative overflow-hidden" style="${boxStyle}">
                    ${topBar}
                    <div class="space-y-3">
                        <label class="ys-label !mb-0 !text-[#013976] font-bold">👤 학생 선택</label>
                        <select id="report-student" onchange="loadStudentReport();" class="ys-field w-full !font-normal !text-[#013976] !bg-white !text-[16px]" disabled>
                            <option value="" disabled selected hidden>학생을 선택하세요</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- 성적표 표시 영역 -->
            <div id="report-display"></div>
        </div>
    `;
}

// 학생 목록 로드
async function loadStudentList() {
    const categoryId = document.getElementById('report-category')?.value;
    if (!categoryId) return;

    const category = globalConfig.categories.find(c => c.id === categoryId);
    if (!category) return;

    // Debugging: Log the category and folder ID
    console.log("Loading list for category:", category);
    const folderId = extractFolderId(category.targetFolderUrl);
    console.log("Extracted Folder ID:", folderId);

    if (!folderId || folderId.length < 5) {
        showToast("⚠️ 유효한 폴더 ID가 없습니다. 카테고리 설정을 확인해주세요.");
        return;
    }

    toggleLoading(true);
    try {
        // [Fix] Backend only supports GET_STUDENT_LIST, not RECORDS
        const payload = {
            type: 'GET_STUDENT_LIST',
            parentFolderId: folderId,
            categoryName: category.name
        };

        // Use Reliable Request
        const result = await sendReliableRequest(payload);

        if (result.status === "Success") {
            const records = result.data || result.records || [];
            window.cachedStudentRecords = records;

            if (!records || !Array.isArray(records) || records.length === 0) {
                showToast('⚠️ 학생 데이터가 없습니다.');
                const yearSel = document.getElementById('report-year');
                if (yearSel) { yearSel.innerHTML = '<option value="" disabled selected hidden>데이터 없음</option>'; yearSel.disabled = true; }
                return;
            }
            populateYearDropdown(records);
        } else {
            throw new Error(result.message || "Unknown Server Error");
        }
    } catch (err) {
        console.error("Load Error:", err);
        showToast(`❌ 로드 실패: ${err.message}`);
    } finally {
        toggleLoading(false);
    }
}

// ── 시험지 선택 시 호출 (reset + load)
async function onReportCategoryChange() {
    const yearSel  = document.getElementById('report-year');
    const gradeSel = document.getElementById('report-grade');
    const stuSel   = document.getElementById('report-student');
    if (yearSel)  { yearSel.innerHTML  = '<option value="" disabled selected hidden>불러오는 중...</option>'; yearSel.disabled  = true; }
    if (gradeSel) { gradeSel.innerHTML = '<option value="" disabled selected hidden>년도 먼저 선택</option>';  gradeSel.disabled = true; }
    if (stuSel)   { stuSel.innerHTML   = '<option value="" disabled selected hidden>학생을 선택하세요</option>'; stuSel.disabled   = true; }
    const rpt = document.getElementById('report-display');
    if (rpt) rpt.innerHTML = '';
    await loadStudentList();
}

// ── 로드된 레코드로 년도 드롭다운 채우기
function populateYearDropdown(records) {
    const yearSel = document.getElementById('report-year');
    if (!yearSel) return;
    const years = [...new Set(
        records.map(r => dateToYear(r['응시일'] || r.date || ''))
               .filter(y => /^\d{4}$/.test(y))
    )].sort((a, b) => b.localeCompare(a)); // 최신년도 먼저
    yearSel.innerHTML = '<option value="전체">전체</option>' +
        years.map(y => `<option value="${y}">${y}년</option>`).join('');
    yearSel.disabled = false;
    yearSel.value = '전체';
    onReportYearChange();
}

// ── 년도 선택 시 → 학년 드롭다운 채우기
function onReportYearChange() {
    const year    = document.getElementById('report-year')?.value;
    const records = window.cachedStudentRecords || [];
    const filtered = (!year || year === '전체') ? records
        : records.filter(r => dateToYear(r['응시일'] || r.date || '') === year);

    const gradeSel = document.getElementById('report-grade');
    const stuSel   = document.getElementById('report-student');
    if (!gradeSel) return;

    const grades = [...new Set(
        filtered.map(r => String(r['학년'] || r.grade || '')).filter(g => g)
    )].sort((a, b) => a.localeCompare(b, 'ko'));

    gradeSel.innerHTML = '<option value="전체">전체</option>' +
        grades.map(g => `<option value="${g}">${g}</option>`).join('');
    gradeSel.disabled = false;
    gradeSel.value = '전체';

    if (stuSel) { stuSel.innerHTML = '<option value="" disabled selected hidden>학생을 선택하세요</option>'; stuSel.disabled = true; }
    const rpt = document.getElementById('report-display');
    if (rpt) rpt.innerHTML = '';
    onReportGradeChange();
}

// ── 학년 선택 시 → 학생 드롭다운 채우기
function onReportGradeChange() {
    const year  = document.getElementById('report-year')?.value;
    const grade = document.getElementById('report-grade')?.value;
    const records = window.cachedStudentRecords || [];

    let filtered = records;
    if (year  && year  !== '전체') filtered = filtered.filter(r => dateToYear(r['응시일'] || r.date || '') === year);
    if (grade && grade !== '전체') filtered = filtered.filter(r => String(r['학년'] || r.grade || '') === grade);

    const stuSel = document.getElementById('report-student');
    if (!stuSel) return;

    const idKeys   = ['학생ID', 'studentId', 'id'];
    const nameKeys = ['학생명', 'studentName', 'name', '이름'];
    const getV = (rec, keys) => { for (const k of keys) { if (rec[k] !== undefined && rec[k] !== '') return rec[k]; } return null; };

    const studentMap = new Map();
    filtered.forEach(r => {
        const id = getV(r, idKeys), name = getV(r, nameKeys);
        if (id && name) studentMap.set(String(id), String(name));
    });

    if (studentMap.size === 0) {
        stuSel.innerHTML = '<option value="" disabled selected hidden>해당 조건의 학생 없음</option>';
        stuSel.disabled = true;
        return;
    }
    const sorted = Array.from(studentMap.entries()).sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'ko'));
    stuSel.innerHTML = '<option value="" disabled selected hidden>학생을 선택하세요</option>' +
        sorted.map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
    stuSel.disabled = false;
    const rpt = document.getElementById('report-display');
    if (rpt) rpt.innerHTML = '';
    showToast(`✅ ${studentMap.size}명 조회됨`);
}
// 학년별 AI 톤앤매너 정의
function getGradeTone(grade) {
    const g = String(grade || '').trim();
    const HONORIFIC = '\n[필수 규칙] 모든 문장은 반드시 ~ㅂ니다/~습니다 형식의 격식 존댓말로 작성하세요. ~요, ~네요, ~거예요 등 해요체는 절대 사용하지 마세요. 반말도 절대 금지입니다. 문단 사이에 빈 줄을 넣지 마세요.';
    // 초등: 초1~6
    if (/^초[1-6]$/.test(g) || /^초등/.test(g)) {
        return `당신은 초등학교 영어 학생을 위한 친절한 선생님입니다.
[톤앤매너] 따뜻하고 친근한 말투로 작성하세요. 어려운 용어는 쓰지 마세요. 칭찬을 먼저 충분히 하고, 개선점은 "다음엔 이렇게 해보면 어떨까요?" 같이 부드럽게 제안하세요. 항상 격려로 마무리하세요.${HONORIFIC}`;
    }
    // 고등: 고1~3
    if (/^고[1-3]$/.test(g) || /^고등/.test(g)) {
        return `당신은 고등학교 영어 학생을 위한 전문 강사입니다.
[톤앤매너] 전문적이고 간결한 어조로 작성하세요. 수능/내신을 감안한 실질적인 학습 전략을 제시하세요. 격려는 한 문장으로 간결하게 하고, 분석과 학습 방향 제시에 집중하세요.${HONORIFIC}`;
    }
    // 중등: 중1~3 (기본값)
    return `당신은 중학교 영어 학생을 위한 영어 강사입니다.
[톤앤매너] 직접적이되 존중하는 톤으로 작성하세요. 부족한 부분은 명확하게 지적하되, 도전 의욕을 불러일으키는 언어를 사용하세요. 학생 스스로 목표를 세울 수 있도록 구체적인 방향을 제시하세요.${HONORIFIC}`;
}

// AI 종합 코멘트 생성 (영역별 코멘트 기반 종합분석)
async function generateOverallComment(record, averages, activeSections, sectionComments = {}) {
    const secMap = {
        'Grammar': 'grammarScore', 'Writing': 'writingScore',
        'Reading': 'readingScore', 'Listening': 'listeningScore', 'Vocabulary': 'vocabScore'
    };
    const maxMap = {
        'Grammar': 'grammarMax', 'Writing': 'writingMax',
        'Reading': 'readingMax', 'Listening': 'listeningMax', 'Vocabulary': 'vocabMax'
    };

    const totalScore = parseFloat(record['총점'] || record.totalScore || 0);
    const totalMax   = parseFloat(record['만점'] || record.maxScore || 100);
    const totalAvg   = parseFloat(averages['총점'] || 0);
    const totalRate  = totalMax > 0 ? (totalScore / totalMax * 100).toFixed(1) : '?';
    const totalLevel = (totalScore / totalMax * 100) >= 90 ? '우수' : (totalScore / totalMax * 100) >= 70 ? '보통' : '부진';

    const gradeTone = getGradeTone(record.grade || record['학년']);

    const sectionSummary = activeSections.map(s => {
        const score = parseFloat(record[s + '_점수'] || record[secMap[s]] || 0);
        const max   = parseFloat(record[s + '_만점'] || record[maxMap[s]] || averages[maxMap[s]] || 0);
        const avg   = parseFloat(averages[s + '_점수'] || averages[secMap[s]] || 0);
        const cmt   = sectionComments[s] || '(코멘트 없음)';
        return `[영역: ${s}] 개인 ${score}점 / 만점 ${max > 0 ? max + '점' : '?'} / 평균 ${avg.toFixed(1)}점\n영역 코멘트: ${cmt}`;
    }).join('\n\n');

    const sName = record['이름'] || record.name || record.studentName || '';

    const prompt = `${gradeTone}

아래 학생의 영역별 코멘트를 참고해 종합 피드백을 작성해주세요.

[학생 정보]
이름: ${sName}

[영역별 분석 요약]
${sectionSummary}

[총점 현황]
개인 총점: ${totalScore}점 / 시험지 만점: ${totalMax}점 / 반 평균: ${totalAvg.toFixed(1)}점 / 정답률: ${totalRate}% / 성취레벨: ${totalLevel}

[작성 규칙]
1) 각 영역 코멘트에서 이미 언급된 세부 내용(특정 표현, 문법 항목, 단어 유형 등)은 그대로 반복하지 마세요.
2) 영역들을 가로질러 보이는 전체적 패턴이나 공통 특징만 종합적으로 언급하세요 (1~2문장)
3) 부족한 영역의 핵심 학습 방향을 종합 관점에서 간결하게 제안하세요 (1~2문장)
4) 전체적 격려 메시지로 마무리하세요 (1문장)

실제 총점/만점을 반드시 언급하세요. 호칭이 필요한 경우 "${sName} 학생은" 형식으로 실명을 사용하세요. "우리 OO 학생" 같은 가상 호칭은 절대 사용하지 마세요. 학원명, 교재명, 브랜드명은 절대 언급하지 마세요. 모든 답변은 순수 한국어로만 작성하세요. 인사말(안녕하세요, 반갑습니다 등)로 시작하지 마세요. 바로 내용으로 시작하세요.`;

    return await callGeminiAPI(prompt);
}

// 학생 성적표 로드 및 표시
async function loadStudentReport() {
    const studentId = document.getElementById('report-student')?.value;
    if (!studentId) {
        document.getElementById('report-display').innerHTML = '';
        return;
    }

    const categoryId = document.getElementById('report-category').value;
    const category = globalConfig.categories.find(c => c.id === categoryId);

    toggleLoading(true);
    try {
        const payload = {
            type: 'GET_STUDENT_REPORT', // [Fix] Use correct backend handler
            parentFolderId: extractFolderId(category.targetFolderUrl),
            categoryName: category.name,
            studentId: studentId // [Fix] Send studentId to backend
        };

        const result = await sendReliableRequest(payload);

        if (result.status === "Success" && result.data) {
            const report = result.data;

            // [Fix] 문항별 상세보기를 위해 해당 카테고리 문항 데이터 보장
            const existingCatQs = (globalConfig.questions || []).filter(q => String(q.catId) === String(categoryId));
            if (existingCatQs.length === 0) {
                try {
                    const folderId = extractFolderId(category.targetFolderUrl);
                    const qResult = await sendReliableRequest({ type: 'GET_FULL_DB', parentFolderId: folderId, categoryName: category.name });
                    let newQuestions = (qResult.status === 'Success') ? (qResult.questions || []) : [];
                    if (newQuestions.length > 0) {
                        newQuestions = newQuestions.map(q => ({ ...q, catId: categoryId }));
                        const others = (globalConfig.questions || []).filter(q => String(q.catId) !== String(categoryId));
                        globalConfig.questions = [...others, ...newQuestions];
                        console.log(`✅ 성적표용 문항 ${newQuestions.length}개 로드 완료`);
                    }
                } catch(qErr) { console.warn('문항 로드 실패 (상세보기 제한될 수 있음):', qErr); }
            }

            // 평균 계산 (캐시된 전체 학생 데이터 사용)
            const allRecords = window.cachedStudentRecords || [];
            const validRecs  = allRecords.filter(r => {
                const v = r['총점'] ?? r.totalScore;
                return v !== undefined && v !== '' && v !== null;
            });
            const cnt = validRecs.length || 1;
            const avgOf = (koKey, enKey) =>
                validRecs.reduce((sum, r) => sum + parseFloat(r[koKey] || r[enKey] || 0), 0) / cnt;

            const allSections = ['Grammar', 'Writing', 'Reading', 'Listening', 'Vocabulary'];
            const secMap = {
                'Grammar': 'grammarScore', 'Writing': 'writingScore',
                'Reading': 'readingScore', 'Listening': 'listeningScore', 'Vocabulary': 'vocabScore'
            };

            const averages = {
                '총점':           avgOf('총점', 'totalScore'),
                '만점':           parseFloat(report['만점'] || report.maxScore || 100),
                grammarScore:   avgOf('Grammar_점수',   'grammarScore'),
                writingScore:   avgOf('Writing_점수',   'writingScore'),
                readingScore:   avgOf('Reading_점수',   'readingScore'),
                listeningScore: avgOf('Listening_점수', 'listeningScore'),
                vocabScore:     avgOf('Vocabulary_점수','vocabScore'),
            };
            averages['Grammar_점수']   = averages.grammarScore;
            averages['Writing_점수']   = averages.writingScore;
            averages['Reading_점수']   = averages.readingScore;
            averages['Listening_점수'] = averages.listeningScore;
            averages['Vocabulary_점수']= averages.vocabScore;

            const activeSections = allSections.filter(section => {
                const score = report[section + '_점수'] !== undefined
                    ? parseFloat(report[section + '_점수'])
                    : parseFloat(report[secMap[section]] || 0);
                return score > 0;
            });

            const savedSections = report.aiSectionComments || {};
            const savedOverall  = report.aiOverallComment  || null;
            const savedNotes    = report.notes || null; // 수정: DB에서 기타사항 불러오기
            window.currentReportData = { record: report, averages, activeSections, sectionComments: savedSections, overallComment: savedOverall, notes: savedNotes };
            renderReportCard(report, averages, savedSections, savedOverall, activeSections, savedNotes);
            showToast(`✅ 성적표 로드 완료 (평균 ${validRecs.length}명 기준)`);

        } else {
            document.getElementById('report-display').innerHTML = '<div class="card text-center text-slate-500">성적 데이터를 찾을 수 없습니다.</div>';
        }

    } catch (err) {
        console.error("Load Error:", err);
        showToast(`❌ 로드 실패: ${err.message}`);
    } finally {
        toggleLoading(false);
    }
}

// 평균 계산 함수
function calculateAverages(records) {
    if (records.length === 0) return {};

    const sums = {
        '문법_점수': 0, '작문_점수': 0, '독해_점수': 0, '듣기_점수': 0, '어휘_점수': 0, '총점': 0
    };

    // 유효 레코드 수 계산 (각 영역별로 응시자가 다를 수 있으나 여기선 전체 기준)
    let count = 0;
    const scoreMap = {
        '문법_점수': ['문법_점수', 'grammarScore', 'Grammar'],
        '작문_점수': ['작문_점수', 'writingScore', 'Writing'],
        '독해_점수': ['독해_점수', 'readingScore', 'Reading'],
        '듣기_점수': ['듣기_점수', 'listeningScore', 'Listening'],
        '어휘_점수': ['어휘_점수', 'vocabScore', 'Vocab', 'Vocabulary'],
        '총점': ['총점', 'totalScore', 'Total']
    };

    const getScore = (rec, key) => {
        const keys = scoreMap[key] || [key];
        for (const k of keys) {
            if (rec[k] !== undefined && rec[k] !== "") return parseInt(rec[k]);
        }
        return 0;
    };

    records.forEach(record => {
        // 간단한 유효성 검사 (총점 관련 키가 있는 경우만)
        if (getScore(record, '총점') > 0 || record['총점'] !== undefined || record['totalScore'] !== undefined) {
            sums['문법_점수'] += getScore(record, '문법_점수');
            sums['작문_점수'] += getScore(record, '작문_점수');
            sums['독해_점수'] += getScore(record, '독해_점수');
            sums['듣기_점수'] += getScore(record, '듣기_점수');
            sums['어휘_점수'] += getScore(record, '어휘_점수');
            sums['총점'] += getScore(record, '총점');
            count++;
        }
    });

    if (count === 0) return sums;

    return {
        '문법_점수': sums['문법_점수'] / count,
        '작문_점수': sums['작문_점수'] / count,
        '독해_점수': sums['독해_점수'] / count,
        '듣기_점수': sums['듣기_점수'] / count,
        '어휘_점수': sums['어휘_점수'] / count,
        '총점': sums['총점'] / count
    };
}

// AI 영역별 코멘트 생성
async function generateSectionComments(record, averages, activeSections) {
    const comments = {};
    const secMap = {
        'Grammar': 'grammarScore', 'Writing': 'writingScore',
        'Reading': 'readingScore', 'Listening': 'listeningScore', 'Vocabulary': 'vocabScore'
    };
    const maxMap = {
        'Grammar': 'grammarMax', 'Writing': 'writingMax',
        'Reading': 'readingMax', 'Listening': 'listeningMax', 'Vocabulary': 'vocabMax'
    };

    // 문항별 세부 데이터 파싱
    let questionScores = [];
    try {
        const qRaw = record['문항별상세(JSON)'] || record.questionScores || '[]';
        questionScores = typeof qRaw === 'string' ? JSON.parse(qRaw) : (Array.isArray(qRaw) ? qRaw : []);
    } catch(e) { questionScores = []; }
    const catQs = globalConfig.questions || [];

    for (let section of activeSections) {
        const studentScore = parseFloat(record[section + '_점수'] || record[secMap[section]] || 0);
        const avgScore    = parseFloat(averages[section + '_점수'] || averages[secMap[section]] || 0);
        const maxScore    = parseFloat(record[section + '_만점'] || record[maxMap[section]] || averages[maxMap[section]] || 0);

        // 성취레벨 계산
        const rate = maxScore > 0 ? (studentScore / maxScore * 100) : 0;
        const level = rate >= 90 ? '우수' : rate >= 70 ? '보통' : '부진';

        // 세부영역(subType) + 정오답 문항 파싱
        let subTypeInfo = '';
        let wrongInfo = '';
        if (questionScores.length > 0) {
            const secItems = questionScores.filter(q => {
                const cq = catQs.find(cq => String(cq.id) === String(q.id));
                return cq?.section === section;
            });
            if (secItems.length > 0) {
                const subMap = {};
                const wrongItems = [];
                secItems.forEach(q => {
                    const cq = catQs.find(cq => String(cq.id) === String(q.id));
                    const sub = cq?.subType || '기타';
                    if (!subMap[sub]) subMap[sub] = { score: 0, max: 0 };
                    subMap[sub].score += parseFloat(q.score || 0);
                    subMap[sub].max   += parseFloat(q.maxScore || 0);
                    // 오답 문항 수집
                    const isWrong = (q.correct === false || q.correct === 'X') ||
                                    (parseFloat(q.score || 0) < parseFloat(q.maxScore || 0));
                    if (isWrong) wrongItems.push(`${q.no || '?'}번(${sub})`);
                });
                const subLines = Object.entries(subMap)
                    .map(([sub, v]) => `  - ${sub}: ${v.score}/${v.max}점`)
                    .join('\n');
                subTypeInfo = `\n세부 영역별 점수:\n${subLines}`;
                if (wrongItems.length > 0)
                    wrongInfo = `\n오답/감점 문항: ${wrongItems.join(', ')}`;
            }
        }

        const gradeTone = getGradeTone(record.grade || record['학년']);

        const sName = record['이름'] || record.name || record.studentName || '';

        const prompt = `${gradeTone}

아래 학생의 ${section} 영역 성적 데이터를 바탕으로 피드백을 작성해주세요.

[학생 정보]
이름: ${sName}

[성적 데이터]
개인 점수: ${studentScore}점 / 영역 만점: ${maxScore > 0 ? maxScore + '점' : '정보 없음'} / 반 평균: ${avgScore.toFixed(1)}점 / 성취레벨: ${level}(${rate.toFixed(0)}%)${subTypeInfo}${wrongInfo}

[작성 규칙]
1) 잘한 점 (2문장)
2) 미흡한 점 또는 약점 (1문장)
3) 구체적 학습 방향 제시 (1문장)

실제 점수와 만점을 반드시 언급하세요. 호칭이 필요한 경우 "${sName} 학생은" 형식으로 실명을 사용하세요. "우리 OO 학생" 같은 가상 호칭은 절대 사용하지 마세요. 학원명, 교재명, 브랜드명은 절대 언급하지 마세요. 모든 답변은 순수 한국어바탕으로 하세요. 인사말(안녕하세요, 반갑습니다 등)로 시작하지 마세요. 바로 내용으로 시작하세요.`;

        comments[section] = await callGeminiAPI(prompt);
    }
    return comments;
}


// Gemini API 호출
// Gemini API 호출 (Fixed Scope & Backend Proxy)
async function callGeminiAPI(prompt, silent = false, imageUrls = []) {
    if (!globalConfig.geminiKey) {
        if (!silent) showToast("⚠️ 설정에서 Gemini API Key를 먼저 등록해주세요.");
        return "AI 설정 필요";
    }

    // [Proxy] GAS 백엔드를 통해 호출 (CORS 방지)
    try {
        if (!silent) toggleLoading(true);

        const payload = {
            type: 'CALL_GEMINI',
            key: globalConfig.geminiKey,
            prompt: prompt,
            imageUrls: imageUrls.length > 0 ? imageUrls : undefined // [Fix] 이미지 URL 전달
        };

        const result = await sendReliableRequest(payload);

        if (!silent) toggleLoading(false);

        if (result.status === "Success" && result.data) {
            const data = result.data;
            if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            } else {
                console.warn("Gemini API (Proxy) returned no candidates:", data);
                return "AI 분석을 생성할 수 없습니다. (내용이 안전 정책에 의해 필터링됨)";
            }
        } else {
            console.error("Gemini Proxy Error:", result.message);
            return "AI 서비스 오류: " + (result.message || "Unknown Proxy Error");
        }

    } catch (e) {
        if (!silent) toggleLoading(false);
        console.error("Gemini Call Exception:", e);
        return "AI 서비스 연결 실패";
    }
}

// 성적표 렌더링 (Chart.js 포함)
function renderReportCard(record, averages, sectionComments, overallComment, activeSections, notes) {
    const display = document.getElementById('report-display');
    if (!display) return;
    window._dirtyClass = false; window._dirtyComment = false;

    setCanvasId('05-1'); // 개인 성적표 캔버스

    function getVal(obj, keys) {
        for (const k of keys) { if (obj[k] !== undefined && obj[k] !== '') return obj[k]; }
        return '';
    }

    const sName  = getVal(record, ['이름','name','studentName']);
    const sGrade = getVal(record, ['학년','grade']);
    const sDateRaw = getVal(record, ['응시일','testDate','date']);
    const sDate  = sDateRaw ? String(sDateRaw).split('T')[0] : '';
    const sTotal = parseFloat(getVal(record, ['총점','totalScore','total']) || 0);
    const sMax   = parseFloat(getVal(record, ['만점','maxScore','max']) || 100);
    let sRate    = getVal(record, ['정답률(%)','정답률','rate']);
    if (!sRate && sMax) sRate = ((sTotal / sMax) * 100).toFixed(1);
    const recCls05 = recommendClassByScore(sTotal, sGrade);
    const defaultCls05 = record.studentClass || record['등록학급'] || recCls05 || '';

    const secMap = { Grammar:'grammarScore', Writing:'writingScore', Reading:'readingScore', Listening:'listeningScore', Vocabulary:'vocabScore' };
    const maxMap  = { Grammar:'grammarMax',   Writing:'writingMax',   Reading:'readingMax',   Listening:'listeningMax',  Vocabulary:'vocabMax'   };

    display.innerHTML = `
    <div class="card space-y-8 animate-fade-in mt-5">

        <!-- 학생 기본 정보 -->
        <div class="border-b pb-6 flex items-start justify-between">
            <div>
                <h3 style="font-size:24px;font-weight:900;color:#013976;">${sName} 학생 성적표</h3>
                <p class="fs-18 text-slate-600 mt-2">${sGrade}학년 | 응시일: ${sDate}</p>
            </div>
            <!-- 우상단: 등록권장 학급 + 총점 -->
            <div class="flex items-stretch gap-6">

                <!-- 평균 표시 토글 no-print -->
                <div class="no-print" style="display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;margin-right:4px;">
                    <span style="font-size:14px;font-weight:700;color:#64748b;">평균 표시</span>
                    <div style="display:flex;gap:5px;">
                        <button id="avg-btn-all" onclick="setReportAvgMode('all')" style="padding:3px 10px;font-size:16px;font-weight:700;background:#013976;color:white;border:none;border-radius:7px;cursor:pointer;">모두</button>
                        <button id="avg-btn-overall" onclick="setReportAvgMode('overall')" style="padding:3px 10px;font-size:16px;font-weight:700;background:#e2e8f0;color:#64748b;border:none;border-radius:7px;cursor:pointer;">전체</button>
                        <button id="avg-btn-class" onclick="setReportAvgMode('class')" style="padding:3px 10px;font-size:16px;font-weight:700;background:#e2e8f0;color:#64748b;border:none;border-radius:7px;cursor:pointer;">학급</button>
                    </div>
                </div>

                <!-- 권장학급 라벨+드롭다운 (두 박스 gap-0으로 붙임) -->
                <div class="flex items-stretch" style="gap:0;">
                    <div style="background:#013976;border-radius:1rem 0 0 1rem;height:65px;width:70px;display:flex;align-items:center;justify-content:center;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                        <span style="color:white;font-size:15px;font-weight:800;white-space:nowrap;letter-spacing:0.5px;line-height:1.3;text-align:center;">권장<br>학급</span>
                    </div>
                    <!-- 드롭다운 박스 -->
                    <div style="border:2px solid #013976;border-left:none;border-radius:0 1rem 1rem 0;height:65px;min-width:100px;display:flex;align-items:center;justify-content:center;">
                        <select id="report-student-class"
                            data-rec="${recCls05||''}"
                            onchange="warnClassChange05(this)"
                            style="border:none;outline:none;font-size:20px;font-weight:900;color:#013976;background:transparent;text-align:center;text-align-last:center;cursor:pointer;-webkit-appearance:none;padding:0 12px;width:100%;">
                            <option value="" style="font-size:16px;">선택</option>
                            <option value="__RECOMMEND__" style="font-size:16px;font-weight:bold;color:#6366f1;">${recCls05 ? '⭐ 추천: '+recCls05 : '⭐ 추천 없음'}</option>
                            ${(getClassesForGrade(record['학년']||record.grade||'') || []).map(c =>
                                `<option value="${c}" style="font-size:16px;" ${defaultCls05===c?'selected':''}>${c}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>

                <!-- 세로 구분선 -->
                <div style="width:1px;background:#cbd5e1;align-self:stretch;margin:0 2px;"></div>

                <!-- 총점 -->
                <div style="background:#013976;border-radius:1rem;width:160px;height:65px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;" class="shadow-lg">
                    <div style="font-size:24px;font-weight:900;line-height:1;">${sTotal}</div>
                    <div style="font-size:14px;opacity:0.75;margin-top:5px;">/ ${sMax}점 (${sRate}%)</div>
                </div>
            </div>
        </div>

        <!-- 1. 총점 막대그래프 -->
        <div>
            <h4 style="font-size:18px;font-weight:900;color:#013976;margin-bottom:1rem;">📊 총점 비교</h4>
            <canvas id="chart-total" style="max-height:240px;"></canvas>
        </div>

        <!-- 2. 영역별 막대그래프 -->
        <div>
            <h4 style="font-size:18px;font-weight:900;color:#013976;margin-bottom:1rem;">📊 영역별 점수 비교</h4>
            <canvas id="chart-sections-bar" style="max-height:320px;"></canvas>
        </div>

        <!-- 3. 레이더 차트 -->
        <div id="radar-section">
            <h4 style="font-size:18px;font-weight:900;color:#013976;margin-bottom:0.4rem;">🕸 영역별 균형도</h4>
            <!-- 차트+범례+요약표가 단일 캔버스로 중앙 배치 -->
            <div class="flex justify-center" style="width:100%;margin-bottom:4px;">
                <div style="width:100%;height:340px;position:relative;">
                    <canvas id="chart-radar" style="width:100%;height:340px;display:block;"></canvas>
                </div>
            </div>
        </div>

        <!-- 4. 영역별 코멘트 -->
        <div id="qdetail-checkbox-row" class="flex items-center gap-6 py-3 px-4 bg-slate-100 rounded-2xl border !mt-4 relative z-10 w-fit">
            <div class="flex items-center gap-3">
                <input type="checkbox" id="chk-qdetail" onchange="toggleAllQuestionDetail(this.checked)"
                    class="w-5 h-5 cursor-pointer accent-[#013976]">
                <label for="chk-qdetail" class="cursor-pointer font-bold text-[#013976] fs-16 select-none">문항별 상세 보기</label>
            </div>
            <div class="w-px h-6 bg-slate-300 no-print"></div>
            <div class="flex items-center gap-3 no-print">
                <input type="checkbox" id="chk-notes-toggle" onchange="toggleNotesBox(this.checked)"
                    class="w-5 h-5 cursor-pointer accent-amber-600" ${notes ? 'checked' : ''}>
                <label for="chk-notes-toggle" class="cursor-pointer font-bold text-amber-700 fs-16 select-none">기타사항 추가</label>
            </div>
        </div>
        <div class="space-y-4 w-full !mt-4">
            <div class="space-y-4" id="sections-container">
            ${activeSections.map(section => {
                const sScore = parseFloat(record[section+'_점수'] || record[secMap[section]] || 0);
                const sMaxV  = parseFloat(record[section+'_만점'] || record[maxMap[section]] || averages[maxMap[section]] || 0);
                const aScore = parseFloat(averages[section+'_점수'] || averages[secMap[section]] || 0);
                const comment = sectionComments?.[section];
                return `<div class="bg-slate-50 rounded-2xl border overflow-hidden">
                    <div class="px-6 py-4 flex items-center justify-between">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h5 class="font-black text-[#013976] fs-18">${section} 영역</h5>
                            <span class="text-slate-500" style="font-size:15px;">개인: ${sScore}점 | 평균: ${aScore.toFixed(1)}점${sMaxV>0?' | 만점: '+sMaxV+'점':''}</span>
                        </div>
                        <button onclick="regenerateSectionComment('${section}')" class="no-print text-xl px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all" title="이 영역 코멘트 재생성">🔄</button>
                    </div>
                    ${comment
                        ? `<div class="px-6 pb-4 border-t border-slate-200 pt-3" id="sec-comment-wrap-${section}">
                            <p class="fs-15 text-slate-600 leading-relaxed" id="sec-comment-text-${section}" style="cursor:pointer;" onclick="editComment('section','${section}')" title="클릭하여 수정">${comment.split('\n').map(l=>l.trim()).filter(l=>l).join('<br>')}</p>
                           </div>`
                        : `<div class="px-6 pb-4 border-t border-slate-200 pt-3"><p class="text-slate-400 fs-14 italic text-center py-2">분석 대기 중...</p></div>`
                    }
                    <div id="qdetail-${section}" class="hidden px-6 pb-6 border-t border-slate-100">
                        <p class="text-slate-400 fs-14 text-center py-4">로딩 중...</p>
                    </div>
                </div>`;
            }).join('')}
        </div>

        <!-- 5. 종합분석 코멘트 -->
        <div class="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-3xl border-2 border-blue-200">
            <div class="flex items-center justify-between mb-3">
                <h4 class="ys-label text-blue-700 !mb-0">🤖 종합분석 코멘트</h4>
                <button onclick="regenerateOverallComment()" class="no-print text-xl px-2 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-500 transition-all border border-slate-200" title="종합 코멘트 재생성">🔄</button>
            </div>
            ${overallComment
                ? `<div id="overall-comment-wrap">
                    <p class="text-slate-700 leading-relaxed fs-15" id="overall-comment-text" style="cursor:pointer;" onclick="editComment('overall')" title="클릭하여 수정">${overallComment.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>
                   </div>`
                : `<div class="text-center py-4">
                    <p class="text-slate-500 mb-4 fs-15">AI 심층 분석을 통해 학생의 강점과 약점을 파악해보세요.</p>
                    <button onclick="triggerAIAnalysis()" class="btn-ys !bg-[#013976] !text-white !py-3 !px-8 shadow-lg hover:scale-105 transition-all fs-16 font-bold flex items-center gap-2 mx-auto">✨ AI 분석 생성하기</button>
                  </div>`
            }
        </div>

        <!-- 6. 기타사항 -->
        <div id="notes-section">
            <div id="notes-box" class="${notes ? '' : 'hidden '}bg-amber-50 border-2 border-amber-200 rounded-2xl p-5">
                <div class="flex items-center justify-between mb-2">
                    <h4 class="ys-label text-amber-700 !mb-0">📝 기타사항</h4>
                    <button onclick="toggleNotesBox()" class="no-print text-slate-400 hover:text-red-400 text-sm px-2" title="기타사항 닫기">✕ 제거</button>
                </div>
                <div id="notes-content-wrap">
                    ${notes
                        ? `<p class="text-amber-900 leading-relaxed fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">${notes.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`
                        : `<p class="text-amber-600/50 italic fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">내용이 없습니다. 클릭하여 새로 작성하세요.</p>`
                    }
                </div>
            </div>
            </div>
        </div>

        <!-- Logo -->
        <div class="mt-8 border-t pt-8 text-center">
            <img src="${globalConfig.logoUrl||''}" alt="Logo" class="inline-block max-h-16 object-contain" onerror="this.style.display='none'">
        </div>
    </div>`;

    // 차트 렌더링
    if (window.currentReportData) { window.currentReportData.secMap=secMap; window.currentReportData.maxMap=maxMap; window.currentReportData.sTotal=sTotal; window.currentReportData.sMax=sMax; window.currentReportData.sGrade=sGrade; }
    setTimeout(() => {
        const selCls = document.getElementById('report-student-class')?.value||'';
        const clsAvg = (selCls&&selCls!=='__RECOMMEND__') ? computeClassAvg(selCls,sGrade,secMap) : null;
        const mode = window._reportAvgMode||'all';
        renderTotalChart(record, averages, sTotal, sMax, clsAvg, mode);
        renderSectionsBarChart(record, averages, activeSections, secMap, maxMap, clsAvg, mode);
        renderRadarChart(record, averages, activeSections, secMap, maxMap, clsAvg, mode);
    }, 100);
}

function toggleAllQuestionDetail(checked) {
    const record = window.currentReportData?.record || {};
    const isSection = record.inputMode === 'section';

    if (isSection) {
        // section 모드: 체크 해제 후 안내 토스트
        document.getElementById('chk-qdetail').checked = false;
        showToast('⚠️ 영역별 점수만 입력된 학생으로, 문항별 정보가 입력되지 않아 불가합니다.');
        return;
    }

    const allQdetail = document.querySelectorAll('[id^="qdetail-"]:not(#qdetail-checkbox-row)');
    if (!checked) {
        allQdetail.forEach(el => el.classList.add('hidden'));
        return;
    }

    // 펼치기: 각 섹션 렌더링
    try {
        const qs = JSON.parse(record['문항별상세(JSON)'] || record.questionScores || '[]');
        const catQs = globalConfig.questions || [];
        const mark = (q) => {
            if (q.correct === true  || q.correct === 'O') return '<span class="text-green-600 font-black">O</span>';
            if (q.correct === false || q.correct === 'X') return '<span class="text-red-500 font-black">X</span>';
            if (q.score > 0 && q.maxScore > 0 && q.score === q.maxScore) return '<span class="text-green-600 font-black">O</span>';
            if (q.score === 0 && q.maxScore > 0) return '<span class="text-red-500 font-black">X</span>';
            return '<span class="text-slate-400">△</span>';
        };

        allQdetail.forEach(el => {
            const section = el.id.replace('qdetail-', '');
            el.classList.remove('hidden');
            // [Fix] questionScores 자체에 section 필드가 있으면 우선, 없으면 no(문항번호)로 catQs 매칭
            const secItems = qs.filter(q => {
                if (q.section) return q.section === section;
                const found = catQs.find(cq => String(cq.no) === String(q.no));
                return found?.section === section;
            });
            if (secItems.length === 0) { el.innerHTML = '<p class="text-slate-400 fs-14 text-center py-4">문항 정보 없음</p>'; return; }
            // [Redesign] 가로 10열 그리드 레이아웃 (10개씩 묶음)
            let gridHtml = '';
            for (let i = 0; i < secItems.length; i += 10) {
                const chunk = secItems.slice(i, i + 10);
                const cols = chunk.length;
                gridHtml += `<table class="w-full fs-14 mt-3 border-collapse" style="table-layout:fixed;">
                    <tr class="bg-[#013976] text-white">${chunk.map(q =>
                        `<th class="py-1 px-1 text-center font-bold border border-[#013976]" style="width:10%">${q.no||'-'}</th>`
                    ).join('')}${'<th class="py-1 border border-[#013976]" style="width:10%"></th>'.repeat(10 - cols)}</tr>
                    <tr class="bg-slate-50">${chunk.map(q =>
                        `<td class="py-1 px-1 text-center text-slate-500 border border-slate-200 text-[14px]">${q.maxScore||0}점</td>`
                    ).join('')}${'<td class="py-1 border border-slate-200"></td>'.repeat(10 - cols)}</tr>
                    <tr class="bg-white">${chunk.map(q => {
                        const cq = catQs.find(cq => String(cq.no) === String(q.no));
                        const diff = q.difficulty || cq?.difficulty || '-';
                        const diffColor = {'최상':'text-red-600','상':'text-orange-500','중':'text-blue-500','하':'text-green-500','기초':'text-slate-400'}[diff] || 'text-slate-500';
                        return `<td class="py-1 px-1 text-center border border-slate-200 text-[14px] ${diffColor}">${diff}</td>`;
                    }).join('')}${'<td class="py-1 border border-slate-200"></td>'.repeat(10 - cols)}</tr>
                    <tr class="bg-slate-50">${chunk.map(q =>
                        `<td class="py-1 px-1 text-center font-bold border border-slate-200 text-[14px]">${q.score||0}점</td>`
                    ).join('')}${'<td class="py-1 border border-slate-200"></td>'.repeat(10 - cols)}</tr>
                    <tr class="bg-white">${chunk.map(q =>
                        `<td class="py-1 px-1 text-center font-black border border-slate-200 text-[14px]">${mark(q)}</td>`
                    ).join('')}${'<td class="py-1 border border-slate-200"></td>'.repeat(10 - cols)}</tr>
                </table>`;
            }
            el.innerHTML = `<div class="mt-3 space-y-1">
                ${gridHtml}
            </div>`;
        });
    } catch(e) { showToast('❌ 문항 데이터 오류: ' + e.message); }
}

function renderTotalChart(record, averages, sTotal, sMax, classAvg, mode) {
    const ctx = document.getElementById('chart-total');
    if (!ctx) return;
    if (ctx._chartInstance) ctx._chartInstance.destroy();
    const avgTotal = averages['총점'] || 0;
    const DL = window.ChartDataLabels;
    if (DL && !Chart._dlRegistered) { Chart.register(DL); Chart._dlRegistered = true; }
    const clPlugin={id:'cl',afterDatasetsDraw(ch){const c=ch.ctx,FS=15;ch.data.datasets.forEach((ds,di)=>{ch.getDatasetMeta(di).data.forEach((bar,bi)=>{const v=ds.data[bi];if(!v||v<=0)return;const h=Math.abs(bar.base-bar.y),txt=parseFloat(v).toFixed(1);c.save();c.font=`bold ${FS}px sans-serif`;c.textAlign='center';if(h>=FS*2+4){c.textBaseline='middle';c.fillStyle='white';c.fillText(txt,bar.x,(bar.y+bar.base)/2);}else{c.textBaseline='bottom';c.fillStyle='#013976';c.fillText(txt,bar.x,bar.y-4);}c.restore();});});}};
    ctx._chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [clPlugin],
        data: {
            labels: ['총점'],
            datasets: (() => { const _ds=[{label:'개인 점수',data:[sTotal],backgroundColor:'#e74c3c',borderRadius:8}]; if((mode||'all')!=='class') _ds.push({label:'전체 평균',data:[avgTotal],backgroundColor:'#94a3b8',borderRadius:8}); if(classAvg&&(mode||'all')!=='overall') _ds.push({label:'학급 평균',data:[parseFloat((classAvg['총점']||0).toFixed(1))],backgroundColor:'#22c55e',borderRadius:8}); _ds.push({label:'만점',data:[sMax],backgroundColor:'#013976',borderRadius:8}); return _ds; })()
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            clip: false,
            layout: { padding: { top: 50 } },
            scales: { y: { beginAtZero:true, max:sMax, ticks:{font:{size:16}, callback: v => Number.isInteger(v) ? v : parseFloat(v).toFixed(1)} }, x:{ticks:{font:{size:16}}} },
            plugins: {
                legend: { position: 'right', labels:{font:{size:16}, padding:15} },
                tooltip: { bodyFont:{size:16}, titleFont:{size:16}, callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + parseFloat(ctx.raw).toFixed(1) } },
                datalabels: { display: false }
            }
        }
    });
}

// 영역별 막대 (그룹)
function renderSectionsBarChart(record, averages, activeSections, secMap, maxMap, classAvg, mode) {
    const ctx = document.getElementById('chart-sections-bar');
    if (!ctx) return;
    if (ctx._chartInstance) ctx._chartInstance.destroy();
    const DL = window.ChartDataLabels;
    const labels = activeSections.map(s => s);
    const personal = activeSections.map(s => parseFloat(record[s+'_점수'] || record[secMap[s]] || 0));
    const avg      = activeSections.map(s => parseFloat(averages[s+'_점수'] || averages[secMap[s]] || 0));
    const maxV     = activeSections.map(s => parseFloat(record[s+'_만점'] || record[maxMap[s]] || averages[maxMap[s]] || 0));
    const clPlugin2={id:'cl2',afterDatasetsDraw(ch){const c=ch.ctx,FS=15;ch.data.datasets.forEach((ds,di)=>{ch.getDatasetMeta(di).data.forEach((bar,bi)=>{const v=ds.data[bi];if(!v||v<=0)return;const h=Math.abs(bar.base-bar.y),txt=parseFloat(v).toFixed(1);c.save();c.font=`bold ${FS}px sans-serif`;c.textAlign='center';if(h>=FS*2+4){c.textBaseline='middle';c.fillStyle='white';c.fillText(txt,bar.x,(bar.y+bar.base)/2);}else{c.textBaseline='bottom';c.fillStyle='#013976';c.fillText(txt,bar.x,bar.y-4);}c.restore();});});}};
    ctx._chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        plugins: [clPlugin2],
        data: {
            labels,
            datasets: (() => { const _ds=[{label:'개인 점수',data:personal,backgroundColor:'#e74c3c',borderRadius:6}]; if((mode||'all')!=='class') _ds.push({label:'전체 평균',data:avg.map(v=>+parseFloat(v).toFixed(1)),backgroundColor:'#94a3b8',borderRadius:6}); if(classAvg&&(mode||'all')!=='overall') _ds.push({label:'학급 평균',data:activeSections.map(s=>parseFloat((classAvg[s+'_점수']||0).toFixed(1))),backgroundColor:'#22c55e',borderRadius:6}); _ds.push({label:'만점',data:maxV,backgroundColor:'#013976',borderRadius:6}); return _ds; })()
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            clip: false,
            layout: { padding: { top: 50 } },
            scales: { y:{beginAtZero:true, ticks:{font:{size:16}, callback: v => Number.isInteger(v) ? v : parseFloat(v).toFixed(1)}}, x:{ticks:{font:{size:16}}} },
            plugins: {
                legend: { position: 'right', labels:{font:{size:16}, padding:15} },
                tooltip: { bodyFont:{size:16}, titleFont:{size:16}, callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + parseFloat(ctx.raw).toFixed(1) } },
                datalabels: { display: false }
            }
        }
    });
}

// 인쇄 함수 — canvas를 이미지로 변환 후 새 창 출력
// 저장 버튼: 등록학급 + 코멘트 DB 저장
function saveReportData() {
    const catVal = document.getElementById('report-category')?.value;
    const stuVal = document.getElementById('report-student')?.value;
    if (!catVal || !stuVal) { showToast('⚠️ 시험지와 학생을 먼저 선택해주세요.'); return; }
    if (!window._dirtyClass && !window._dirtyComment) { showToast('✅ 변경사항이 없습니다.'); return; }
    const cat = globalConfig.categories?.find(c => c.id === catVal);
    const folderId = cat ? extractFolderId(cat.targetFolderUrl) : null;
    if (!folderId) { showToast('⚠️ 폴더 정보가 없습니다.'); return; }
    const clsVal = document.getElementById('report-student-class')?.value;
    const btn = document.getElementById('btn-save-report');
    if (btn) { btn.disabled = true; btn.textContent = '저장 중...'; }
    const promises = [];
    if (window._dirtyClass && clsVal && clsVal !== '__RECOMMEND__') {
        promises.push(sendReliableRequest({
            type: 'SAVE_STUDENT_CLASS',
            parentFolderId: folderId,
            studentId: stuVal,
            studentClass: clsVal
        }));
    }
    if (window._dirtyComment && window.currentReportData) {
        promises.push(sendReliableRequest({
            type: 'SAVE_AI_COMMENT',
            parentFolderId: folderId,
            studentId: stuVal,
            overallComment: window.currentReportData.overallComment,
            sectionComments: window.currentReportData.sectionComments,
            notes: window.currentReportData.notes
        }));
    }
    Promise.all(promises)
        .then(() => { window._dirtyClass = false; window._dirtyComment = false; showToast('💾 저장 완료!'); })
        .catch(e  => { console.warn('저장 실패:', e); showToast('❌ 저장 실패. 다시 시도해주세요.'); })
        .finally(() => { if (btn) { btn.disabled = false; btn.textContent = '💾 저장'; } });
}

function printReport() {
    const catVal = document.getElementById('report-category')?.value;
    const stuVal = document.getElementById('report-student')?.value;
    if (!catVal || !stuVal) {
        showToast('⚠️ 시험지와 학생을 먼저 선택해주세요.');
        return;
    }
    if (window._dirtyClass || window._dirtyComment) {
        const ok = confirm('변경사항이 감지되었습니다.\n저장 후 인쇄를 권장합니다.\n\n그래도 인쇄하시겠습니까?');
        if (!ok) return;
    }

    // 등록학급 필수 체크
    const clsEl  = document.getElementById('report-student-class');
    let   clsVal = clsEl?.value?.trim() || '';
    if (clsVal === '__RECOMMEND__') { clsVal = clsEl?.dataset?.rec || ''; if (clsEl) clsEl.value = clsVal; }
    if (!clsVal) {
        showToast('⚠️ 등록학급을 선택해야 출력할 수 있습니다.');
        clsEl?.focus();
        return;
    }

    // [Fix] AI 종합 코멘트가 없으면 경고 팝업
    const overallCommentEl = document.getElementById('overall-comment-text');
    const overallTxt = overallCommentEl?.textContent?.trim() || '';
    const aiNotReady = !overallTxt || overallTxt === '분석 대기 중...' || overallTxt === '로딩 중...' || overallTxt === '분석 중...';
    if (aiNotReady) {
        if (!confirm('⚠️ AI 분석 코멘트가 아직 생성되지 않았습니다.\n\n코멘트 없이 인쇄하시겠습니까?\n("취소"를 눌러 코멘트를 먼저 생성하세요)')) {
            return;
        }
    }

    const display = document.getElementById('report-display');
    if (!display) return;

    // 1. 현재 페이지의 CSS 수집
    const styles = Array.from(document.styleSheets).map(ss => {
        try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n'); }
        catch(e) { return ''; }
    }).join('\n');

    // 2. 모든 chart canvas를 PNG 이미지 데이터로 변환
    const canvasIds = ['chart-total', 'chart-sections-bar', 'chart-radar'];
    const imgDataMap = {};
    canvasIds.forEach(id => {
        const cvs = document.getElementById(id);
        if (cvs) {
            imgDataMap[id] = {
                dataUrl: cvs.toDataURL('image/png'),
                width: cvs.offsetWidth,
                height: cvs.offsetHeight
            };
        }
    });

    // 3. display 내부 HTML 클론 후 canvas → img 교체
    const clone = display.cloneNode(true);
    canvasIds.forEach(id => {
        const canvasEl = clone.querySelector('#' + id);
        if (canvasEl && imgDataMap[id]) {
            const img = document.createElement('img');
            img.src = imgDataMap[id].dataUrl;
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.maxHeight = (canvasEl.style.maxHeight || '400px');
            img.style.objectFit = 'contain';
            canvasEl.parentNode.replaceChild(img, canvasEl);
        }
    });

    // 3b. 인쇄 불필요 요소 제거
    const isDetailChecked = document.getElementById('chk-qdetail')?.checked || false;
    const chkRow = clone.querySelector('#qdetail-checkbox-row');
    if (chkRow) chkRow.remove();
    clone.querySelectorAll('[id^="qdetail-"]').forEach(el => {
        if (isDetailChecked) { el.classList.remove('hidden'); el.style.display = ''; }
        else { el.remove(); }
    });
    clone.querySelectorAll('p').forEach(p => {
        const txt = p.textContent.trim();
        if (txt === '분석 대기 중...' || txt === '로딩 중...' || txt === '분석 중...') {
            const parent = p.closest('div');
            if (parent) parent.remove(); else p.remove();
        }
    });

    // 3b-2. 등록권장 학급 <select> → span으로 교체
    const _clsSel = clone.querySelector('#report-student-class');
    if (_clsSel) {
        const _clsParent = _clsSel.parentNode;
        const _clsSpan = document.createElement('span');
        _clsSpan.style.cssText = 'font-size:20px;font-weight:900;color:#013976;background:white;display:inline-flex;align-items:center;justify-content:center;min-width:80px;padding:0 12px;height:61px;-webkit-print-color-adjust:exact;print-color-adjust:exact;';
        _clsSpan.textContent = clsVal || '미선택';
        _clsSel.parentNode.replaceChild(_clsSpan, _clsSel);
        if (_clsParent) {
            _clsParent.style.setProperty('border', '2px solid #013976', 'important');
            _clsParent.style.setProperty('border-left', 'none', 'important');
        }
    }

    // 3c. 영역별 코멘트 앞 페이지 강제 분리
    const sectionsWrapper = clone.querySelector('#sections-container')?.parentElement;
    if (sectionsWrapper) sectionsWrapper.style.cssText = (sectionsWrapper.style.cssText||'') + ';page-break-before:always;break-before:page;';

    // 3d. AI 종합 분석 섹션 앞 페이지 강제 분리
    const aiHeader = Array.from(clone.querySelectorAll('h4')).find(h => h.textContent.includes('종합분석'));
    if (aiHeader) {
        const aiSection = aiHeader.closest('div[class]');
        if (aiSection) aiSection.style.cssText += ';page-break-before:always;break-before:page;';
    }

    // 3e. 차트 컨테이너 페이지 분리 방지
    clone.querySelectorAll('canvas, img').forEach(el => {
        el.style.pageBreakInside = 'avoid';
        if (el.parentElement) el.parentElement.style.pageBreakInside = 'avoid';
    });

    // 4. 배너 HTML
    const bannerHtml = globalConfig.banner
        ? `<div style="position:fixed;bottom:0;right:0;width:50%;z-index:9999;">
               <img src="${getSafeImageUrl(globalConfig.banner)}" alt="Report Banner"
                    style="width:100%;max-height:120px;object-fit:cover;object-position:center;display:block;">
           </div>`
        : '';

    // 5. 팝업 열기
    const _dispW = display.offsetWidth || 900;
    const _popW  = 794;
    const win = window.open('', '_blank', `width=${_popW},height=1200`);
    if (!win) { showToast('⚠️ 팝업이 차단되었습니다. 브라우저 팝업 허용 후 다시 시도해주세요.'); return; }
    win.document.write(`<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>성적표 인쇄</title>
<script>
(function(){
  const _f=a=>a[0]&&typeof a[0]==='string'&&a[0].includes('cdn.tailwindcss.com');
  const _w=console.warn;console.warn=function(...a){if(_f(a))return;_w.apply(console,a);};
  const _l=console.log;console.log=function(...a){if(_f(a))return;_l.apply(console,a);};
})();
<\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap">
<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Noto Sans KR', sans-serif; background:#fff; margin:0; padding:24px 32px 160px; color:#1e293b; }
  img { max-width:100%; }
  .no-print { display:none !important; }
  .fs-15 { font-size: 13px !important; line-height: 1.6; }
  table.fs-14 td, table.fs-14 th { font-size: 13px !important; }
  @media print {
    @page { margin:12mm; }
    body { padding-bottom:140px; }
    .card, section, [class*='rounded'] { page-break-inside: avoid; }
    h4 { page-break-after: avoid; }
  }
  ${styles}
</style>
</head><body>
${clone.innerHTML}
${bannerHtml}
<script>
window.onload = function() { setTimeout(function(){ window.print(); }, 800); };
<\/script>
</body></html>`);
    win.document.close();

}


// 레이더 차트 — 정답률(%) 기준으로 정규화 (만점 다른 영역 공정 비교)
function renderRadarChart(record, averages, activeSections, secMap, maxMap, classAvg, mode) {
    const ctx = document.getElementById('chart-radar');
    if (!ctx || activeSections.length < 3) return;
    if (ctx._chartInstance) ctx._chartInstance.destroy();

    // 각 영역 만점 구하기 (record 우선, 없으면 globalConfig.questions 합산)
    const getSectionMax = (s) => {
        const fromRecord = parseFloat(record[s+'_만점'] || record[maxMap?.[s]] || 0);
        if (fromRecord > 0) return fromRecord;
        // globalConfig에서 해당 영역 문항 배점 합산
        const catQs = globalConfig?.questions || [];
        return catQs.filter(q => q.section === s).reduce((sum, q) => sum + (parseInt(q.score)||0), 0) || 100;
    };

    const rawPersonal = activeSections.map(s => parseFloat(record[s+'_점수'] || record[secMap[s]] || 0));
    const rawAvg      = activeSections.map(s => parseFloat(averages[s+'_점수'] || averages[secMap[s]] || 0));
    const maxScores   = activeSections.map(s => getSectionMax(s));

    // 정답률(%) 변환
    const pctPersonal = rawPersonal.map((v, i) => maxScores[i] > 0 ? +((v / maxScores[i]) * 100).toFixed(1) : 0);
    const pctAvg      = rawAvg.map((v, i)      => maxScores[i] > 0 ? +((v / maxScores[i]) * 100).toFixed(1) : 0);
    const rawClass    = classAvg ? activeSections.map(s => parseFloat(classAvg[s+'_점수'] || 0)) : null;
    const pctClass    = rawClass ? rawClass.map((v, i) => maxScores[i] > 0 ? +((v / maxScores[i]) * 100).toFixed(1) : 0) : null;

    const DL = window.ChartDataLabels;
    if (DL && !Chart._dlRegistered) { Chart.register(DL); Chart._dlRegistered = true; }

    // 요약표를 캔버스 우측 패딩 영역에만 그림 (범례는 Chart.js 내장 것 사용)
    const radarTablePlugin = {
        id: 'radarTablePlugin',
        afterDraw(chart) {
            const c2 = chart.ctx;
            const w = chart.width, h = chart.height;
            const pW = 240, pX = w - pW - 4;
            const rowH = 30;
            const N = activeSections.length;
            const pH = 44 + N * rowH + 8;
            const pY = (h - pH) / 2;

            const rr = (x, y, rw, rh, r) => {
                c2.beginPath();
                c2.moveTo(x+r, y); c2.arcTo(x+rw, y, x+rw, y+rh, r);
                c2.arcTo(x+rw, y+rh, x, y+rh, r); c2.arcTo(x, y+rh, x, y, r);
                c2.arcTo(x, y, x+r, y, r); c2.closePath();
            };

            c2.save();
            // 패널 배경
            c2.fillStyle = '#f8fafc';
            c2.shadowColor = 'rgba(0,0,0,0.06)'; c2.shadowBlur = 8; c2.shadowOffsetY = 3;
            rr(pX, pY, pW, pH, 14); c2.fill();
            c2.shadowColor = 'transparent';
            c2.strokeStyle = '#e2e8f0'; c2.lineWidth = 1;
            rr(pX, pY, pW, pH, 14); c2.stroke();

            // 타이틀
            c2.textAlign = 'center'; c2.textBaseline = 'middle';
            c2.fillStyle = '#013976'; c2.font = 'bold 16px sans-serif';
            c2.fillText('개인 정답률', pX + pW/2, pY + 22);
            c2.beginPath(); c2.moveTo(pX+14, pY+40); c2.lineTo(pX+pW-14, pY+40);
            c2.strokeStyle = '#e2e8f0'; c2.stroke();

            // 행 목록
            let cy = pY + 56;
            activeSections.forEach(s => {
                const score = parseFloat(record[s+'_점수'] || record[secMap[s]] || 0);
                let maxS = parseFloat(record[s+'_만점'] || record[maxMap?.[s]] || 0);
                if (!maxS) {
                    maxS = (globalConfig?.questions||[]).filter(q=>q.section===s)
                           .reduce((a,q)=>a+(parseInt(q.score)||0),0) || 100;
                }
                const pct = maxS > 0 ? (score/maxS*100).toFixed(1)+'%' : '0%';

                c2.font = '600 16px sans-serif';
                c2.fillStyle = '#334155'; c2.textAlign = 'left';
                c2.fillText(s, pX+14, cy);

                const tw = c2.measureText(pct).width;
                c2.fillStyle = '#fef2f2';
                rr(pX+pW-14-tw-10, cy-9, tw+20, 18, 5); c2.fill();
                c2.fillStyle = '#e74c3c'; c2.textAlign = 'right';
                c2.fillText(pct, pX+pW-14, cy);
                cy += rowH;
            });
            c2.restore();
        }
    };

    ctx._chartInstance = new Chart(ctx.getContext('2d'), {
        type: 'radar',
        plugins: [radarTablePlugin],
        data: {
            labels: activeSections,
            datasets: (() => { const _rds=[{ label:'개인 정답률(%)', data:pctPersonal, borderColor:'#e74c3c', backgroundColor:'transparent', borderWidth:2.5, pointRadius:0 }]; if((mode||'all')!=='class') _rds.push({ label:'평균 정답률(%)', data:pctAvg, borderColor:'#94a3b8', backgroundColor:'transparent', borderWidth:2, pointRadius:0 }); if(pctClass&&(mode||'all')!=='overall') _rds.push({ label:'학급 평균 정답률(%)', data:pctClass, borderColor:'#22c55e', backgroundColor:'transparent', borderWidth:2, pointRadius:0 }); return _rds; })()
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            // padding.top:2 제목과 차트 간격 최소화 / right:280 범례-표 간격 확보 / bottom:2 이하 간격 최소화
            layout: { padding: { right: 430, left: 10, top: 2, bottom: 2 } },
            scales: {
                r: {
                    min: 0, max: 100,
                    ticks: { stepSize: 20, font:{size:16}, backdropColor:'transparent', callback: v => v+'%' },
                    pointLabels: { font:{size:16}, padding: 10 }
                }
            },
            plugins: {
                datalabels: { display: false },
                legend: { position: 'right', labels: { font:{size:16}, padding:15 } },
                tooltip: {
                    bodyFont:{size:16}, titleFont:{size:16},
                    callbacks: {
                        label: (ctx) => {
                            const i = ctx.dataIndex, ds = ctx.datasetIndex;
                            const raw = ds === 0 ? rawPersonal[i] : rawAvg[i];
                            const mx  = maxScores[i];
                            return ` ${ctx.dataset.label}: ${parseFloat(ctx.raw).toFixed(1)}% (${parseFloat(raw).toFixed(1)}/${mx}점)`;
                        }
                    }
                }
            }
        }
    });
}


// 영역별 개별 AI 코멘트 재생성
async function regenerateSectionComment(section) {
    if (!window.currentReportData) { showToast('⚠️ 성적 데이터가 없습니다.'); return; }
    const { record, averages, activeSections, sectionComments, overallComment } = window.currentReportData;

    // 버튼 로딩 표시
    const btn = document.querySelector(`button[onclick="regenerateSectionComment('${section}')"]`);
    if (btn) { btn.disabled = true; btn.textContent = '⏳ 생성 중...'; }

    try {
        // 해당 섹션만 재생성
        const newComments = await generateSectionComments(record, averages, [section]);
        const updated = { ...(sectionComments || {}), ...newComments };

        // currentReportData 업데이트
        window.currentReportData.sectionComments = updated;

        // 카드 코멘트 영역만 직접 업데이트 (전체 리렌더 없이)
        const secItems = activeSections.map(s => [s, updated[s]]);
        renderReportCard(record, averages, updated, overallComment, activeSections);
        showToast(`✅ ${section} 코멘트 재생성 완료!`);
    } catch(e) {
        showToast('❌ 재생성 실패: ' + e.message);
        if (btn) { btn.disabled = false; btn.textContent = '🔄 재생성'; }
    }
}

// AI 코멘트 인라인 편집
function editComment(type, section) {
    window._dirtyComment = true;
    if (type === 'overall') {
        const el = document.getElementById('overall-comment-text');
        if (!el) return;
        const cur = el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g,'').trim();
        const wrap = document.getElementById('overall-comment-wrap');
        const overallRows = Math.max(5, cur.split('\n').length + 1);
        wrap.innerHTML = `<div class="flex gap-3 items-start no-print">
                <textarea id="overall-comment-edit" class="flex-1 ys-field !bg-white resize-none fs-15" rows="${overallRows}">${cur}</textarea>
                <div class="flex flex-col gap-2 flex-shrink-0">
                    <button onclick="saveCommentEdit('overall')" class="btn-ys !py-1.5 !px-4 !text-sm !bg-[#013976] !text-white">저장</button>
                    <button onclick="cancelCommentEdit('overall')" class="btn-ys !py-1.5 !px-4 !text-sm">취소</button>
                </div>
            </div>`;
    } else if (type === 'section' && section) {
        const el = document.getElementById('sec-comment-text-' + section);
        if (!el) return;
        const cur = el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g,'').trim();
        const wrap = document.getElementById('sec-comment-wrap-' + section);
        const sectionRows = Math.max(4, cur.split('\n').length + 1);
        wrap.innerHTML = `<div class="flex gap-3 items-start no-print">
                <textarea id="sec-comment-edit-${section}" class="flex-1 ys-field !bg-white resize-none fs-15" rows="${sectionRows}">${cur}</textarea>
                <div class="flex flex-col gap-2 flex-shrink-0">
                    <button onclick="saveCommentEdit('section','${section}')" class="btn-ys !py-1.5 !px-4 !text-sm !bg-[#013976] !text-white">저장</button>
                    <button onclick="cancelCommentEdit('section','${section}')" class="btn-ys !py-1.5 !px-4 !text-sm">취소</button>
                </div>
            </div>`;
    } else if (type === 'notes') {
        const el = document.getElementById('notes-text');
        const cur = el ? el.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g,'').trim() : (window.currentReportData?.notes || '');
        const wrap = document.getElementById('notes-content-wrap');
        wrap.innerHTML = `<div class="flex gap-3 items-start no-print">
                <textarea id="notes-edit" class="flex-1 ys-field !bg-white resize-none fs-15 border-amber-300" rows="3" placeholder="담당 교사 메모, 특이사항 등 자유롭게 입력하세요.">${cur}</textarea>
                <div class="flex flex-col gap-2 flex-shrink-0">
                    <button onclick="saveCommentEdit('notes')" class="btn-ys !py-1.5 !px-4 !text-sm !bg-amber-600 !text-white border-amber-700">저장</button>
                    <button onclick="cancelCommentEdit('notes')" class="btn-ys !py-1.5 !px-4 !text-sm border-amber-300 text-amber-800 bg-white">취소</button>
                </div>
            </div>`;
    }
}
function saveCommentEdit(type, section) {
    if (type === 'overall') {
        const ta = document.getElementById('overall-comment-edit');
        if (!ta) return;
        const newText = ta.value.trim();
        if (window.currentReportData) window.currentReportData.overallComment = newText;
        const wrap = document.getElementById('overall-comment-wrap');
        wrap.innerHTML = `<p class="text-slate-700 leading-relaxed fs-15" id="overall-comment-text" style="cursor:pointer;" onclick="editComment('overall')" title="클릭하여 수정">${newText.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
    } else if (type === 'section' && section) {
        const ta = document.getElementById('sec-comment-edit-' + section);
        if (!ta) return;
        const newText = ta.value.trim();
        if (window.currentReportData && window.currentReportData.sectionComments) window.currentReportData.sectionComments[section] = newText;
        const wrap = document.getElementById('sec-comment-wrap-' + section);
        wrap.innerHTML = `<p class="fs-15 text-slate-600 leading-relaxed" id="sec-comment-text-${section}" style="cursor:pointer;" onclick="editComment('section','${section}')" title="클릭하여 수정">${newText.split('\n').map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
    } else if (type === 'notes') {
        const ta = document.getElementById('notes-edit');
        if (!ta) return;
        const newText = ta.value.trim();
        if (window.currentReportData) window.currentReportData.notes = newText;
        const wrap = document.getElementById('notes-content-wrap');
        if (newText) {
            wrap.innerHTML = `<p class="text-amber-900 leading-relaxed fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">${newText.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
        } else {
            wrap.innerHTML = `<p class="text-amber-600/50 italic fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">내용이 없습니다. 클릭하여 새로 작성하세요.</p>`;
        }
    }
    showToast('✅ 코멘트가 임시 적용되었습니다.');

    // 서버에 즉시 자동 저장 연동 (GAS)
    const catVal = document.getElementById('report-category')?.value;
    const stuVal = document.getElementById('report-student')?.value;
    if (catVal && stuVal && window.currentReportData) {
        const _aiCat = globalConfig.categories?.find(c => c.id === catVal);
        const _aiFolId = _aiCat ? extractFolderId(_aiCat.targetFolderUrl) : null;
        if (_aiFolId) {
            sendReliableRequest({
                type: 'SAVE_AI_COMMENT',
                parentFolderId: _aiFolId,
                studentId: stuVal,
                overallComment: window.currentReportData.overallComment,
                sectionComments: window.currentReportData.sectionComments,
                notes: window.currentReportData.notes // 비고란 추가
            }).then(() => { window._dirtyComment = false; showToast('💾 서버에 저장되었습니다.'); })
              .catch(e => console.warn('개별 저장 중 GAS 통신 실패:', e));
        }
    }
}
function cancelCommentEdit(type, section) {
    window._dirtyComment = false;
    if (type === 'overall') {
        const txt = window.currentReportData && window.currentReportData.overallComment || '';
        const wrap = document.getElementById('overall-comment-wrap');
        if (wrap) wrap.innerHTML = `<p class="text-slate-700 leading-relaxed fs-15" id="overall-comment-text" style="cursor:pointer;" onclick="editComment('overall')" title="클릭하여 수정">${txt.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
    } else if (type === 'section' && section) {
        const txt = (window.currentReportData && window.currentReportData.sectionComments && window.currentReportData.sectionComments[section]) || '';
        const wrap = document.getElementById('sec-comment-wrap-' + section);
        if (wrap) wrap.innerHTML = `<p class="fs-15 text-slate-600 leading-relaxed" id="sec-comment-text-${section}" style="cursor:pointer;" onclick="editComment('section','${section}')" title="클릭하여 수정">${txt.split('\n').map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
    } else if (type === 'notes') {
        const txt = window.currentReportData?.notes || '';
        const wrap = document.getElementById('notes-content-wrap');
        if (wrap) {
            if (txt) wrap.innerHTML = `<p class="text-amber-900 leading-relaxed fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">${txt.split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
            else wrap.innerHTML = `<p class="text-amber-600/50 italic fs-15" id="notes-text" style="cursor:pointer;" onclick="editComment('notes')" title="클릭하여 수정">내용이 없습니다. 클릭하여 새로 작성하세요.</p>`;
        }
    }
}

// 종합 코멘트 재생성
async function regenerateOverallComment() {
    if (!window.currentReportData) { showToast('⚠️ 성적 데이터가 없습니다.'); return; }
    const { record, averages, activeSections, sectionComments } = window.currentReportData;
    const btn = document.querySelector('button[onclick="regenerateOverallComment()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
    try {
        const newComment = await generateOverallComment(record, averages, activeSections, sectionComments || {});
        window.currentReportData.overallComment = newComment;
        const wrap = document.getElementById('overall-comment-wrap');
        if (wrap) wrap.innerHTML = `<p class="text-slate-700 leading-relaxed fs-15" id="overall-comment-text" style="cursor:pointer;" onclick="editComment('overall')" title="클릭하여 수정">${(newComment||'').split(/\n+/).map(l=>l.trim()).filter(l=>l).join('<br>')}</p>`;
        showToast('✅ 종합 코멘트가 재생성되었습니다.');
    } catch(e) { showToast('❌ 재생성 실패: ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🔄'; } }
}

// 기타사항 토글
function toggleNotesBox(checked) {
    const box = document.getElementById('notes-box');
    const chk = document.getElementById('chk-notes-toggle');
    if (!box) return;

    if (typeof checked === 'boolean') {
        box.classList.toggle('hidden', !checked);
    } else {
        const isHidden = box.classList.contains('hidden');
        box.classList.toggle('hidden', !isHidden);
        if (chk) chk.checked = isHidden;
    }
}

async function triggerAIAnalysis() {
    if (!window.currentReportData) return;
    const { record, averages, activeSections } = window.currentReportData;
    toggleLoading(true);
    try {
        showToast('🤖 AI 영역별 코멘트 생성 중...');

        // 1단계: 영역별 코멘트 먼저 생성
        const sectionComments = await generateSectionComments(record, averages, activeSections);

        showToast('🤖 영역별 코멘트 완료! 종합 코멘트 생성 중...');

        // 2단계: 영역별 코멘트를 기반으로 종합 코멘트 생성
        const overallComment = await generateOverallComment(record, averages, activeSections, sectionComments);

        // 코멘트 저장
        window.currentReportData.sectionComments = sectionComments;
        window.currentReportData.overallComment   = overallComment;
        renderReportCard(record, averages, sectionComments, overallComment, activeSections);
        showToast('✅ AI 분석 완료!');

        // GAS 자동 저장 (비동기 실행으로 UI 블로킹 없음)
        const catVal2 = document.getElementById('report-category')?.value;
        const stuVal2 = document.getElementById('report-student')?.value;
        if (catVal2 && stuVal2) {
            const _aiCat   = globalConfig.categories?.find(c => c.id === catVal2);
            const _aiFolId = _aiCat ? extractFolderId(_aiCat.targetFolderUrl) : null;
            if (_aiFolId) {
                sendReliableRequest({
                    type: 'SAVE_AI_COMMENT',
                    parentFolderId: _aiFolId,
                    studentId: stuVal2,
                    overallComment,
                    sectionComments,
                    notes: window.currentReportData?.notes
                }).then(() => showToast('💾 AI 코멘트 및 기타사항 저장 완료'))
                  .catch(e => console.warn('AI 코멘트 GAS 저장 실패:', e));
            }
        }
    } catch (e) {
        console.error(e);
        showToast('❌ AI 분석 실패: ' + e.message);
    } finally {
        toggleLoading(false);
    }
}

// ===== 문항 통계 시스템 =====

// 문항 통계 대시보드 UI 렌더링
function renderStats(c) {
    if (!globalConfig.categories || globalConfig.categories.length === 0) {
        renderEmptyState(c, 'Question Statistics');
        return;
    }

    setCanvasId('07');
    c.innerHTML = `
                <div class="animate-fade-in-safe space-y-6 pb-10">
                    <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">Statistics</h2>

                    <!-- 헤더의 요소 선택 + 통계 모드 버튼 -->
                    <div class="card !py-3.5 !px-6 !flex-row !flex-nowrap items-center justify-between shadow-lg relative overflow-hidden flex-none gap-4" style="background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%); border: 2px solid rgba(1,57,118,0.15);">
                        <div style="position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, #60a5fa, #6366f1, #a855f7);"></div>
                        <div class="flex items-center gap-4 flex-grow">
                            <span style="font-size:17px;font-weight:700;color:#013976;white-space:nowrap;">📂 시험지 선택</span>
                            <select id="stats-category" onchange="onStatsCategoryChange()" class="ys-field flex-grow !font-normal !text-[#013976] !bg-white !text-[16px]">
                                <option value="" disabled selected hidden>시험지를 선택하세요</option>
                                ${globalConfig.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            <button id="btn-q-stats" onclick="switchStatsMode('question')" class="btn-ys !bg-white !text-slate-500 !border-2 !border-slate-300 hover:!border-[#013976] hover:!text-[#013976] !px-5 !py-2.5 !text-[15px] !font-black rounded-xl whitespace-nowrap flex items-center gap-2">📊 문항 통계</button>
                            <button id="btn-s-stats" onclick="switchStatsMode('student')" class="btn-ys !bg-white !text-slate-500 !border-2 !border-slate-300 hover:!border-purple-500 hover:!text-purple-700 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl whitespace-nowrap flex items-center gap-2">🎓 학생 통계</button>
                        </div>
                    </div>

                    <!-- 통계 표시 영역 -->
                    <div id="stats-display"></div>
                </div>
            `;

    // 기본 상태: 아무것도 로드 안 함 (버튼 클릭 시 로드)
    window._statsMode = null;
    document.getElementById('stats-display').innerHTML = '<p class="text-slate-400 text-center py-10" style="font-size:15px;">📊 버튼을 눌러 통계를 확인하세요</p>';
}

// ===================== 통계 모드 전환 =====================
function switchStatsMode(mode) {
    const categoryId = document.getElementById('stats-category')?.value;
    if (!categoryId) { showToast('⚠️ 시험지를 먼저 선택하세요.'); return; }
    window._statsMode = mode;
    const qBtn = document.getElementById('btn-q-stats');
    const sBtn = document.getElementById('btn-s-stats');
    const ON  = 'btn-ys !bg-[#013976] !text-white hover:brightness-110 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl shadow-md whitespace-nowrap flex items-center gap-2';
    const OFF = 'btn-ys !bg-white !text-slate-500 !border-2 !border-slate-300 hover:!border-purple-500 hover:!text-purple-700 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl whitespace-nowrap flex items-center gap-2';
    if (qBtn) qBtn.className = mode === 'question' ? ON : OFF;
    if (sBtn) sBtn.className = mode === 'student'  ? ON : OFF;
    if (mode === 'question') { setCanvasId('07-1'); loadQuestionStats(); }
    else { setCanvasId('07-2'); loadStudentStats(); }
}

function onStatsCategoryChange() {
    // 시험지 변경 시 화면 초기화만 — 버튼 클릭 시 로드
    document.getElementById('stats-display').innerHTML = '<p class="text-slate-400 text-center py-10" style="font-size:15px;">📊 버튼을 눌러 통계를 확인하세요</p>';
}

// ===================== 학생 통계 =====================
async function loadStudentStats() {
    const categoryId = document.getElementById('stats-category')?.value;
    if (!categoryId) return;
    const category = globalConfig.categories.find(c => c.id === categoryId);
    if (!category) return;
    const folderId = extractFolderId(category.targetFolderUrl);

    toggleLoading(true);
    try {
        const result = await sendReliableRequest({
            type: 'GET_STUDENT_LIST',
            parentFolderId: folderId,
            categoryName: category.name
        });
        window._allStudentStatsData = result.data || [];
        renderStudentStatsUI(window._allStudentStatsData, '');
    } catch(e) {
        document.getElementById('stats-display').innerHTML =
            `<div class="card text-center text-red-400">오류: ${e.message}</div>`;
    } finally { toggleLoading(false); }
}

// 년도 필터 변경 시 로컬 재필터링
function onStudentStatsYearChange(sel) {
    const year = sel.value;
    const all  = window._allStudentStatsData || [];
    const filtered = year ? all.filter(s => dateToYear(s['응시일']||s.testDate||s.date||'') === year) : all;
    renderStudentStatsUI(filtered, year);
    const newSel = document.getElementById('stats-year-inline');
    if (newSel) newSel.value = year;
}

function renderStudentStatsUI(students, _unused) {
    const display = document.getElementById('stats-display');
    const all = window._allStudentStatsData || students;
    const SECTIONS = ['Grammar', 'Writing', 'Reading', 'Listening', 'Vocabulary'];
    const scoreKey = { Grammar:'grammarScore', Writing:'writingScore', Reading:'readingScore', Listening:'listeningScore', Vocabulary:'vocabScore' };
    const maxKey   = { Grammar:'grammarMax',   Writing:'writingMax',   Reading:'readingMax',   Listening:'listeningMax',  Vocabulary:'vocabMax' };

    const calcAvg = (list, sec) => {
        const vals = list.map(s => { const v = parseFloat(s[scoreKey[sec]] ?? s[sec+'_점수'] ?? ''); return isNaN(v) ? null : v; }).filter(v => v !== null);
        return vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '-';
    };
    const calcMax = (list, sec) => {
        const vals = list.map(s => { const v = parseFloat(s[maxKey[sec]] ?? s[sec+'_만점'] ?? ''); return isNaN(v) ? null : v; }).filter(v => v !== null && v > 0);
        if (!vals.length) return '-';
        const freq = {}; vals.forEach(v => freq[v] = (freq[v]||0)+1);
        return String(Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0]);
    };
    const calcTotalMax = (list) => SECTIONS.reduce((sum, s) => { const mx = calcMax(list, s); return sum + (mx !== '-' ? parseFloat(mx) : 0); }, 0);

    // 년도 목록 (실제 데이터 기반)
    const years = [...new Set(all.map(s => dateToYear(s['응시일']||s.testDate||s.date||'')).filter(y => /^\d{4}$/.test(y)))].sort((a,b)=>b-a);
    const yearSelect = (id, onChange) => `
        <select id="${id}" onchange="${onChange}" class="ys-field !w-36 !py-0.5 !text-[14px] !font-normal !bg-white ml-3" style="height:32px;">
            <option value="">전체</option>
            ${years.map(y => `<option value="${y}">${y}\ub144</option>`).join('')}
        </select>`;

    // 섹션 헤더 (공통 함수)
    const makeHeader = (list, bgClass, labelTh) => {
        const mx = calcTotalMax(list);
        const mxStr = mx > 0 ? `(만점 ${mx}점)` : '-';
        const colW = 'style="width:12.5%;font-size:16px;"';
        const sub14 = 'style="font-size:14px;font-weight:400;opacity:0.8;"';
        return `<thead class="${bgClass} text-white"><tr>
            <th class="px-2 py-2.5 text-center" ${colW}>${labelTh}</th>
            <th class="px-2 py-2.5 text-center" ${colW}>응시자수<br><span ${sub14}>(명)</span></th>
            <th class="px-2 py-2.5 text-center" ${colW}>점수<br><span ${sub14}>${mxStr}</span></th>
            ${SECTIONS.map(s => {
                const smx = calcMax(list, s);
                const sub = smx !== '-' ? `(${smx}\uc810)` : '(\uc601\uc5ed \uc5c6\uc74c)';
                return `<th class="px-2 py-2.5 text-center" ${colW}>${s}<br><span ${sub14}>${sub}</span></th>`;
            }).join('')}
        </tr></thead>`;
    };

    const dataRow = (label, count, list, extraClass='') => {
        const totalScore = SECTIONS.reduce((sum, s) => { const a = calcAvg(list, s); return sum + (a !== '-' ? parseFloat(a) : 0); }, 0);
        const scoreStr = totalScore > 0 ? totalScore.toFixed(1) : '-';
        const colW = 'style="width:12.5%;font-size:16px;"';
        return `<tr class="${extraClass} border-b border-slate-100">
            <td class="px-2 py-3 font-bold text-center" ${colW}>${label}</td>
            <td class="px-2 py-3 text-center font-bold text-[#013976]" ${colW}>${count}</td>
            <td class="px-2 py-3 text-center font-bold text-orange-600" ${colW}>${scoreStr}</td>
            ${SECTIONS.map(s => { const avg = calcAvg(list, s); const noData = calcMax(list, s) === '-'; return `<td class="px-2 py-3 text-center" ${colW}>${(avg === '-' || noData) ? '<span class="text-slate-300">-</span>' : `<span class="font-bold">${avg}</span>`}</td>`; }).join('')}
        </tr>`;
    };

    // 전체 통계 렌더 함수
    const renderOverall = (yrVal) => {
        const filtered = yrVal ? all.filter(s => dateToYear(s['응시일']||s.testDate||s.date||'') === yrVal) : all;
        const mx = calcTotalMax(filtered);
        return filtered.length === 0
            ? `<p class="text-slate-400 text-center py-6" style="font-size:14px;">해당 년도의 학생 데이터가 없습니다.</p>`
            : `<div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full" style="font-size:14px;">
                    ${makeHeader(filtered, 'bg-[#013976]', '구분')}
                    <tbody>${dataRow('전체 평균', filtered.length, filtered, 'bg-blue-50/40')}</tbody>
                </table></div>`;
    };

    // 학급별 통계 렌더 함수
    const renderClass = (yrVal) => {
        const filtered = yrVal ? all.filter(s => dateToYear(s['응시일']||s.testDate||s.date||'') === yrVal) : all;
        const mx = calcTotalMax(filtered);
        const groups = {};
        filtered.forEach(s => { const cls = s.studentClass || s['등록학급'] || '(미입력)'; if (!groups[cls]) groups[cls] = []; groups[cls].push(s); });
        if (Object.keys(groups).length === 0) return `<p class="text-slate-400 text-center py-6" style="font-size:14px;">등록학급 정보가 없습니다.</p>`;
        const rows = Object.entries(groups).sort(([a],[b])=>a.localeCompare(b))
            .map(([cls, list], i) => dataRow(`<span class="text-purple-700">${cls}</span>`, list.length, list, i%2===0?'bg-purple-50/30':'')).join('');
        return `<div class="overflow-x-auto rounded-xl border border-slate-200">
            <table class="w-full table-fixed" style="font-size:16px;">
                ${makeHeader(filtered, 'bg-purple-700', '학급')}
                <tbody>${rows}</tbody>
            </table></div>`;
    };

    display.innerHTML = `
        <div class="space-y-6 animate-fade-in" id="student-stats-wrap">
            <div class="card">
                <div class="flex items-center mb-1">
                    <h3 class="fs-18 font-black text-[#013976]">📊 전체 통계</h3>
                    ${yearSelect('stats-year-overall', "document.getElementById('stats-overall-body').innerHTML=window._renderOverall(this.value); window._drawStudentChart(this.value);")}
                </div>
                <div id="stats-overall-body">${renderOverall('')}</div>
                <div class="mt-4" style="height:230px;"><canvas id="student-bar-chart"></canvas></div>
            </div>
            <div class="card">
                <div class="flex items-center mb-1">
                    <h3 class="fs-18 font-black text-[#013976]">🏫 학급별 통계</h3>
                    ${yearSelect('stats-year-class', "document.getElementById('stats-class-body').innerHTML=window._renderClassStats(this.value); window._drawClassCharts(this.value);")}
                </div>
                <div id="stats-class-body">${renderClass('')}</div>
                <div id="stats-class-charts" class="mt-4 space-y-8"></div>
            </div>
        </div>`;

    window._renderOverall    = renderOverall;
    window._renderClassStats = renderClass;

    // === 영역별 평균+없는영역제외 바차트 ===
    window._drawStudentChart = (yrVal) => {
        const DL = window.ChartDataLabels;
        if (DL && !Chart._dlRegistered) { Chart.register(DL); Chart._dlRegistered = true; }
        const filtered = yrVal ? all.filter(s => dateToYear(s['응시일']||s.testDate||s.date||'') === yrVal) : all;
        // 데이터 있는 영역만
        const validSecs = SECTIONS.filter(s => calcMax(filtered, s) !== '-');
        const avgs     = validSecs.map(s => { const v = parseFloat(calcAvg(filtered, s)); return isNaN(v) ? 0 : v; });
        const maxes    = validSecs.map(s => parseFloat(calcMax(filtered, s)));
        const totalAvg = avgs.reduce((a,b)=>a+b, 0);
        const totalMax2 = maxes.reduce((a,b)=>a+b, 0);
        const allLabels = ['점수 (합산)', ...validSecs];
        const allAvgs   = [totalAvg, ...avgs].map(Number);
        const allMaxes  = [totalMax2, ...maxes].map(Number);
        const ctx = document.getElementById('student-bar-chart');
        if (!ctx) return;
        if (ctx._chartInstance) ctx._chartInstance.destroy();
        const clPlugin3={id:'cl3',afterDatasetsDraw(ch){const c=ch.ctx,FS=14;ch.data.datasets.forEach((ds,di)=>{ch.getDatasetMeta(di).data.forEach((bar,bi)=>{const v=ds.data[bi];if(!v||v<=0)return;const h=Math.abs(bar.base-bar.y),txt=parseFloat(v).toFixed(1);c.save();c.font=`bold ${FS}px sans-serif`;c.textAlign='center';if(h>=FS*2+4){c.textBaseline='middle';c.fillStyle='white';c.fillText(txt,bar.x,(bar.y+bar.base)/2);}else{c.textBaseline='bottom';c.fillStyle='#013976';c.fillText(txt,bar.x,bar.y-4);}c.restore();});});}};
        ctx._chartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            plugins: [clPlugin3],
            data: {
                labels: allLabels,
                datasets: [
                    { label: '\ud3c9\uade0 \uc810\uc218', data: allAvgs, backgroundColor: allLabels.map((_,i)=>i===0?'rgba(1,57,118,0.9)':'rgba(1,57,118,0.65)'), borderRadius: 6 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                clip: false,
                layout: { padding: { top: 20 } },
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { callbacks: { afterLabel: (ctx) => `만점: ${allMaxes[ctx.dataIndex]}점` } }
                },
                scales: {
                    x: { ticks: { font: { size: 14 } } },
                    y: { beginAtZero: true, ticks: { font: { size: 14 } } }
                }
            }
        });
    };

    // === 학급별 평균점수 + 학생수 도닛 — 학년별 그룹 ===
    window._drawClassCharts = (yrVal) => {
        const filtered = yrVal ? all.filter(s => dateToYear(s['응시일']||s.testDate||s.date||'') === yrVal) : all;
        const groups = {};
        filtered.forEach(s => { const cls = s.studentClass || s['등록학급'] || '(미입력)'; if(!groups[cls]) groups[cls]=[]; groups[cls].push(s); });

        // 학년별 그룹uc218 (학급명 앞 숫자 = 학년)
        const gradeMap = {};
        Object.keys(groups).forEach(cls => {
            const m = cls.match(/^(\d+)/);
            const grade = m ? m[1] + '학년' : '기타';
            if (!gradeMap[grade]) gradeMap[grade] = [];
            gradeMap[grade].push(cls);
        });
        const grades = Object.keys(gradeMap).sort();

        const container = document.getElementById('stats-class-charts');
        if (!container) return;

        // 이전 차트 인스턴스 정리
        container.querySelectorAll('canvas').forEach(c => { if(c._chartInstance) c._chartInstance.destroy(); });

        let html = '';
        const ts = Date.now();
        grades.forEach(grade => {
            const clsInGrade = gradeMap[grade];
            const barId = `cls-bar-${grade}-${ts}`;
            const dntId = `cls-dnt-${grade}-${ts}`;
            html += `
            <div>
                <h4 class="ys-label mb-4">🎓 ${grade}</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="card">
                        <h3 class="ys-label mb-0">📊 학급별 평균 점수</h3>
                        <div style="height:300px;"><canvas id="${barId}"></canvas></div>
                    </div>
                    <div class="card">
                        <h3 class="ys-label mb-0">👥 학생수 비율</h3>
                        <div style="height:300px;"><canvas id="${dntId}"></canvas></div>
                    </div>
                </div>
            </div>`;
        });
        container.innerHTML = html;

        // 실제 차트 그리기 (DOM 삽입 후)
        setTimeout(() => {
            grades.forEach(grade => {
                const clsInGrade = gradeMap[grade];
                const barId = `cls-bar-${grade}-${ts}`;
                const dntId = `cls-dnt-${grade}-${ts}`;

                // 평균점수 내림차순 정렬
                const clsScores = clsInGrade.map(cls => ({
                    cls,
                    avg: parseFloat(SECTIONS.reduce((sum,s)=>{ const a=parseFloat(calcAvg(groups[cls],s)); return sum+(isNaN(a)?0:a); },0).toFixed(1))
                })).sort((a,b) => b.avg - a.avg);

                // 바차트 (가로 막대)
                const DL = window.ChartDataLabels;
                if (DL && !Chart._dlRegistered) { Chart.register(DL); Chart._dlRegistered = true; }
                const ctxBar = document.getElementById(barId);
                if (ctxBar) {
                    const PALETTE = ['#4A90E2','#50C878','#FFB84D','#FF6B6B','#9B59B6','#1ABC9C','#E74C3C','#3498DB'];
                    const clPluginH={id:'clH'+barId,afterDatasetsDraw(ch){const c=ch.ctx,FS=14;ch.data.datasets.forEach((ds,di)=>{ch.getDatasetMeta(di).data.forEach((bar,bi)=>{const v=ds.data[bi];if(!v||v<=0)return;const txt=parseFloat(v).toFixed(1)+'점';const bw=Math.abs(bar.x-bar.base);c.save();c.font=`bold ${FS}px sans-serif`;c.textBaseline='middle';const tw=c.measureText(txt).width;if(bw>=tw+20){c.fillStyle='white';c.textAlign='center';c.fillText(txt,(bar.x+bar.base)/2,bar.y);}else{c.fillStyle='#013976';c.textAlign='left';c.fillText(txt,bar.x+4,bar.y);}c.restore();});});}};
                    ctxBar._chartInstance = new Chart(ctxBar.getContext('2d'), {
                        type: 'bar',
                        plugins: [clPluginH],
                        data: {
                            labels: clsScores.map(x=>x.cls),
                            datasets: [{ label: '평균 점수', data: clsScores.map(x=>x.avg), backgroundColor: clsScores.map((_,i)=>PALETTE[i%PALETTE.length]), borderRadius: 6 }]
                        },
                        options: {
                            responsive: true, maintainAspectRatio: false,
                            clip: false,
                            layout: { padding: { right: 10 } },
                            indexAxis: 'y',
                            plugins: {
                                legend: { display: false },
                                datalabels: { display: false },
                                tooltip: { callbacks: { label: (ctx) => ` 평균: ${ctx.parsed.x}점` } }
                            },
                            scales: {
                                x: { beginAtZero: true, ticks: { font: { size: 14 } } },
                                y: { ticks: { font: { size: 14 } } }
                            }
                        }
                    });
                }

                // 도닛 (학생수)
                const countObj = {};
                clsInGrade.forEach(cls => { countObj[cls] = groups[cls].length; });
                renderStatDoughnut(dntId, countObj, clsInGrade.reduce((s,c)=>s+groups[c].length,0), '학급', '명');
            });
        }, 80);
    };

    window._drawStudentChart('');
    window._drawClassCharts('');
}

// 문항 통계 데이터 로드
async function loadQuestionStats() {
    const categoryId = document.getElementById('stats-category').value;
    if (!categoryId) return; // 시험지 선택 전에는 동작하지 않음
    const category = globalConfig.categories.find(c => c.id === categoryId);
    if (!category) return;

    const folderId = extractFolderId(category.targetFolderUrl);
    if (!folderId) {
        showToast("⚠️ 폴더 ID를 찾을 수 없습니다.");
        return;
    }

    toggleLoading(true);
    try {
        const payload = {
            type: 'GET_FULL_DB', // [Modified] Use Integrated DB for stats too
            parentFolderId: folderId,
            categoryName: category.name
        };

        const result = await sendReliableRequest(payload);

        let questionsToUse = [];
        if (result.status === "Success") {
            questionsToUse = result.questions || [];
        } else {
            console.warn("Stats Fetch Failed, checking local cache...");
        }

        // [Fallback] Check Local Cache if Fetch Empty
        if (questionsToUse.length === 0) {
            if (globalConfig.questions && globalConfig.questions.length > 0) {
                // Try to filter by category if we track it, or just use if it matches current context
                // Since we don't strictly track categoryId in questions, we verify if they look relevant?
                // Simple approach: data-collection uses globalConfig.questions for current session.
                // Let's assume globalConfig.questions might be relevant if Bank loaded it.
                console.log("Using cached questions for stats");
                questionsToUse = globalConfig.questions;
            }
        }

        if (questionsToUse.length === 0) {
            document.getElementById('stats-display').innerHTML = '<div class="card text-center text-slate-500">문항 데이터가 없습니다. (서버/로컬)</div>';
            return;
        }

        const stats = calculateQuestionStats(questionsToUse);
        renderStatsCharts(stats);
        showToast('✅ 통계 로드 완료!');

    } catch (err) {
        console.error(err);
        showToast("⚠️ 통계 로드 실패: " + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 통계 데이터 계산
function calculateQuestionStats(questions) {
    const total = questions.length;

    // 영역별 집계
    const sections = {};
    const sectionScores = {}; // [NEW] 영역별 배점 합계
    const types = {};
    const difficulties = {};
    const scores = {};

    questions.forEach(q => {
        const section = q.section || q['영역'] || '미분류';
        sections[section] = (sections[section] || 0) + 1;
        const sc = parseFloat(q.score || q['배점'] || 1);
        sectionScores[section] = (sectionScores[section] || 0) + sc; // [NEW]

        const type = q.type || q['문항유형'] || '객관형';
        types[type] = (types[type] || 0) + 1;

        const difficulty = q.difficulty || q['난이도'] || '중';
        difficulties[difficulty] = (difficulties[difficulty] || 0) + 1;

        const score = q.score || q['배점'] || 1;
        scores[score] = (scores[score] || 0) + 1;
    });

    return { total, sections, sectionScores, types, difficulties, scores };
}

// 통계 차트 렌더링
function renderStatsCharts(stats) {
    const display = document.getElementById('stats-display');

    display.innerHTML = `
                <div class="space-y-8 animate-fade-in-safe">
                    <!-- 요약 정보 바 (한 줄 컴팩트) -->
                    ${(() => {
                        const totalScore = Object.entries(stats.scores).reduce((sum, [pt, cnt]) => sum + parseFloat(pt) * cnt, 0);
                        const scoreBreakdown = Object.entries(stats.scores).sort((a,b) => parseFloat(a[0]) - parseFloat(b[0])).map(([pt, cnt]) => `${pt}점×${cnt}`).join(' / ');
                        const sectionBreakdown = Object.entries(stats.sections).map(([sec, cnt]) => {
                            const secScore = Math.round(stats.sectionScores?.[sec] || 0);
                            return `<span style="font-size:14px;"><span class="font-bold text-[#013976]">${sec}</span> ${cnt}개<span class="text-slate-400">(${secScore}점)</span></span>`;
                        }).join('<span class="text-slate-300 mx-2" style="font-size:14px;">|</span>');
                        return `
                        <div class="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-slate-500 font-bold" style="font-size:17px;">📋 총 문항</span>
                                <span class="text-[#013976] font-black" style="font-size:26px;">${stats.total}<span class="text-slate-400 font-bold" style="font-size:14px;">개</span></span>
                            </div>
                            <div class="w-px h-7 bg-blue-200 shrink-0 hidden md:block"></div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="text-slate-500 font-bold" style="font-size:17px;">💯 총 배점</span>
                                <span class="text-[#013976] font-black" style="font-size:26px;">${totalScore}<span class="text-slate-400 font-bold" style="font-size:14px;">점</span></span>
                            </div>
                            <div class="w-px h-7 bg-blue-200 shrink-0 hidden md:block"></div>
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="text-slate-500 font-bold shrink-0" style="font-size:17px;">📚 영역별 문항과 배점</span>
                                <span class="text-slate-600">${sectionBreakdown}</span>
                            </div>
                        </div>`;
                    })()}
                    
                    <!-- 차트 그리드 -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <!-- 영역별 -->
                        <div class="card">
                            <h3 class="ys-label mb-0">📚 영역별 분포</h3>
                            <div style="height: 300px;">
                                <canvas id="chart-sections-stat"></canvas>
                            </div>
                        </div>
                        
                        <!-- 유형별 -->
                        <div class="card">
                            <h3 class="ys-label mb-0">📝 유형별 분포</h3>
                            <div style="height: 300px;">
                                <canvas id="chart-types-stat"></canvas>
                            </div>
                        </div>
                        
                        <!-- 난이도별 -->
                        <div class="card">
                            <h3 class="ys-label mb-0">⭐ 난이도별 분포</h3>
                            <div style="height: 300px;">
                                <canvas id="chart-difficulties-stat"></canvas>
                            </div>
                        </div>
                        
                        <!-- 배점별 -->
                        <div class="card">
                            <h3 class="ys-label mb-0">🎯 배점별 분포</h3>
                            <div style="height: 300px;">
                                <canvas id="chart-scores-stat"></canvas>
                            </div>
                        </div>
                </div>
            `;

    // 차트 렌더링
    setTimeout(() => {
        renderStatDoughnut('chart-sections-stat', stats.sections, stats.total, '영역');
        renderStatDoughnut('chart-types-stat', stats.types, stats.total, '유형');
        renderStatDoughnut('chart-difficulties-stat', stats.difficulties, stats.total, '난이도');
        renderStatBar('chart-scores-stat', stats.scores);
    }, 100);
}

// 도넛 차트 렌더링 (통계용)
function renderStatDoughnut(canvasId, data, total, label, unit) {
    unit = unit || '개';
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(data);
    const values = Object.values(data);

    // [Plugin] 슬라이스 내부 숫자 표시
    const innerLabelPlugin = {
        id: 'innerLabel_' + canvasId,
        afterDatasetsDraw(chart) {
            const { ctx: c, data } = chart;
            const dataset = data.datasets[0];
            const meta = chart.getDatasetMeta(0);
            const dataTotal = dataset.data.reduce((a, b) => a + b, 0);

            meta.data.forEach((arc, index) => {
                const value = dataset.data[index];
                if (!value || value === 0) return;
                const pct = (value / dataTotal) * 100;
                if (pct < 5) return; // 너무 작은 슬라이스는 생략

                const midAngle = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
                const radius = (arc.innerRadius + arc.outerRadius) / 2;
                const x = arc.x + radius * Math.cos(midAngle);
                const y = arc.y + radius * Math.sin(midAngle);

                c.save();
                c.textAlign = 'center';
                c.textBaseline = 'middle';
                c.fillStyle = 'white';
                c.font = 'bold 14px sans-serif';
                c.shadowColor = 'rgba(0,0,0,0.3)';
                c.shadowBlur = 3;
                c.fillText(`${value}${unit}`, x, y - 9);
                c.font = '14px sans-serif';
                c.fillText(`${pct.toFixed(0)}%`, x, y + 9);
                c.restore();
            });
        }
    };

    new Chart(ctx.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#4A90E2',
                    '#50C878',
                    '#FFB84D',
                    '#FF6B6B',
                    '#9B59B6',
                    '#1ABC9C',
                    '#E74C3C',
                    '#3498DB'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: { top: -20, bottom: 0 }
            },
            plugins: {
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const itemLabel = context.label || '';
                            const value = context.parsed;
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${itemLabel}: ${value}명 (${percentage}%)`;
                        }
                    }
                },
                legend: {
                    position: 'right',
                    labels: {
                        padding: 12,
                        font: { size: 14 }
                    }
                }
            }
        },
        plugins: [innerLabelPlugin]
    });
}

// 바 차트 렌더링 (통계용)
function renderStatBar(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    const labels = Object.keys(data).sort((a, b) => parseFloat(a) - parseFloat(b));
    const values = labels.map(l => data[l]);

    new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels.map(l => l + '점'),
            datasets: [{
                label: '문항 수',
                data: values,
                backgroundColor: '#4A90E2'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.parsed.y}개`;
                        }
                    }
                },
                legend: { display: false }
            },
            scales: {
                x: { ticks: { font: { size: 14 } } },
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 14 } } }
            }
        }
    });
}



// --- 문항 뱅크 시스템 (List View) ---
// [New] 그룹 색상 생성기 (10가지 고정 팔레트)
function getGroupColor(index) {
    const palette = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500',
        'bg-lime-500', 'bg-green-500', 'bg-emerald-500', 'bg-teal-500',
        'bg-cyan-500', 'bg-sky-500'
    ];
    return palette[index % palette.length];
}

// [Refactor] 문항 뱅크 렌더링 (Canvas 08)
// [New] Bank Category Change Handler
function handleBankCategoryChange(catId) {
    curCatId = catId;
    loadBankQuestions(catId);
}

// [New] Load Bank Questions
// [New] Load Bank Questions
async function loadBankQuestions(catId) {
    const category = globalConfig.categories.find(c => c.id === catId);
    if (!category) return;

    const folderId = extractFolderId(category.targetFolderUrl);
    if (!folderId) {
        showToast("⚠️ 폴더 ID 오류: 카테고리 설정을 확인하세요.");
        return;
    }

    toggleLoading(true);
    try {
        const payload = {
            type: 'GET_FULL_DB', // [Modified] Use Integrated DB
            parentFolderId: folderId,
            categoryName: category.name
        };

        const result = await sendReliableRequest(payload);

        // [Robustness] Handle Data
        let newQuestions = [];
        let newBundles = [];

        if (result.status === "Success") {
            newQuestions = result.questions || [];
            newBundles = result.bundles || [];
        } else {
            console.warn("Bank Fetch Failed/Empty. Checking cache...");
        }

        // [Fallback] Local Cache
        if (newQuestions.length === 0 && globalConfig.questions) {
            console.log("Using cached questions for Bank Master");
            // Filter by category? globalConfig.questions might be mixed or current.
            // Best effort: usage current cache.
            newQuestions = globalConfig.questions;
            // bundles?
            if (globalConfig.bundles) newBundles = globalConfig.bundles;
        }

        if (newQuestions.length === 0) {
            showToast("⚠️ 문항 데이터가 없습니다.");
        } else {
            // [Fix] Inject catId mapping since the server response does not contain it directly for independent fetching
            newQuestions = newQuestions.map(q => ({ ...q, catId: catId }));

            // Update Global Config
            // 기존 문항 중 다른 카테고리의 문항은 유지하고 현재 카테고리 문항만 덮어쓰기
            if (globalConfig.questions) {
                const otherCategoryQuestions = globalConfig.questions.filter(q => String(q.catId) !== String(catId));
                globalConfig.questions = [...otherCategoryQuestions, ...newQuestions];
            } else {
                globalConfig.questions = newQuestions;
            }

            // Merge Bundles (Don't overwrite if empty?)
            if (newBundles.length > 0) {
                if (!globalConfig.bundles) globalConfig.bundles = [];
                const incomingIds = new Set(newBundles.map(b => b.id));
                globalConfig.bundles = globalConfig.bundles.filter(b => !incomingIds.has(b.id));
                globalConfig.bundles.push(...newBundles);
            }

            save(); // Save to local storage
            renderBankRows();
            showToast(`✅ 문항 ${newQuestions.length}개 로드 완료`);
        }

    } catch (e) {
        console.error(e);
        showToast("❌ 문항 로드 실패: " + e.message);
    } finally {
        toggleLoading(false);
    }
}
function renderBank(c) {
    if (!c) c = document.getElementById('dynamic-content');

    // [Fix] 진입 시 app-canvas 레이아웃 완전 복원 (어느 탭에서 와도 정상화)
    const _ac = document.getElementById('app-canvas');
    if (_ac) {
        _ac.style.padding = '';
        _ac.style.overflow = '';
        _ac.style.overflowY = '';
        _ac.classList.remove('!p-0', '!overflow-hidden');
    }
    c.className = 'w-full h-full';

    // [Fix] curCatId 유지: 07-2 복귀 등 직전 선택 카테고리가 있으면 그대로 유지
    // (신규 진입 시에는 curCatId가 이미 "" 이어서 자동으로 placeholder 선택)
    if (!globalConfig.categories || globalConfig.categories.length === 0) {
        renderEmptyState(c, 'Question Bank Master');
        return;
    }
    setCanvasId('08');

    c.innerHTML = `
        <div class="animate-fade-in-safe flex flex-col h-full space-y-6">
            <div class="flex justify-between items-center">
                <h2 class="fs-32 text-[#013976] leading-none font-black uppercase !border-none !pb-0">Question List</h2>
            </div>

            <!-- 카테고리 선택 -->
            <div class="card !py-3.5 !px-6 flex flex-row items-center justify-between shadow-lg relative overflow-hidden flex-none gap-4 flex-nowrap" style="background: linear-gradient(135deg, #ffffff 0%, #eef4ff 100%); border: 2px solid rgba(1,57,118,0.15);">
                <div style="position:absolute; top:0; left:0; right:0; height:3px; background: linear-gradient(90deg, #60a5fa, #6366f1, #a855f7);"></div>
                <div class="flex items-center gap-4 flex-grow">
                    <label class="ys-label !mb-0 whitespace-nowrap !text-[#013976] font-bold">📂 시험지 선택</label>
                    <select onchange="handleBankCategoryChange(this.value)" 
                            class="ys-field flex-grow !font-normal !text-[#013976] !bg-white !text-[16px]">
                        <option value="" disabled ${!curCatId ? 'selected' : ''} hidden>시험지를 선택하세요</option>
                        ${globalConfig.categories.map(cat => `<option value="${cat.id}" ${curCatId === cat.id ? 'selected' : ''} class="text-[#013976] !text-[16px] !font-normal">${cat.name}</option>`).join('')}
                    </select>
                </div>
                <button onclick="changeTab('reg')" class="btn-ys !bg-[#013976] !text-white !border-[#013976] hover:brightness-110 !px-5 !py-2.5 !text-[15px] !font-black rounded-xl shadow-md whitespace-nowrap flex-shrink-0 flex items-center gap-2">
                    ✨ 문항 등록
                </button>
            </div>

            <div class="flex-grow overflow-hidden bg-white rounded-2xl border border-slate-200 flex flex-col shadow-sm">
                <!-- 헤더 (Grid Layout) -->
                <div class="grid grid-cols-[60px_100px_120px_1fr_80px_80px] bg-slate-100 border-b border-slate-200 p-4 font-bold text-[#013976] text-center fs-16 uppercase tracking-wider sticky top-0 z-10">
                    <div>GRP</div>
                    <div>SEC</div>
                    <div>TYPE</div>
                    <div>QUESTION TITLE (발문)</div>
                    <div>PTS</div>
                    <div>EDIT</div>
                </div>
                
                <!-- 리스트 영역 -->
                <div id="bank-list-container" class="overflow-y-auto flex-grow p-2 space-y-2 bg-slate-50/50">
                     <div class="p-20 text-center text-slate-400">👈 카테고리를 선택하세요</div>
                </div>
            </div>
        </div>
    `;
}

// [Refactor] Bank Rows Rendering
function renderBankRows() {
    const container = document.getElementById('bank-list-container');
    if (!container) return; // 호출 시점에 컨테이너가 없을 수 있음 (e.g. 탭 전환 직후)

    const list = globalConfig.questions.filter(q => q.catId === curCatId);

    if (list.length === 0) {
        container.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-400 p-10">
                    <span class="text-4xl mb-4">📭</span>
                    <p class="fs-18">등록된 문항이 없습니다.</p>
                </div>`;
        return;
    }

    // 그룹 인덱스 매핑 (Passage ID + Common Title 기준)
    const groupMap = new Map(); // Key: ID -> ColorIdx
    let groupMapCounter = 0;

    list.forEach((q, i) => {
        // 그룹 키: passageId가 있으면 최우선, 없으면 commonTitle (단, commonTitle이 있어야 함)
        let key = q.passageId || (q.commonTitle ? `CT_${q.commonTitle}` : null);
        const prev = list[i - 1];

        // 연속성 체크: 이전 항목과 같은 키를 공유하는가?
        const isConnected = prev && (
            (q.passageId && q.passageId === prev.passageId) ||
            (q.commonTitle && q.commonTitle === prev.commonTitle)
        );

        if (!isConnected) {
            if (key) groupMapCounter++;
        }

        if (key) {
            groupMap.set(q.id, groupMapCounter);
        }
    });

    let html = '';

    list.forEach((q, idx) => {
        let groupColorClass = 'bg-slate-200'; // Default: Single
        let isBundle = false;

        let key = q.passageId || (q.commonTitle ? `CT_${q.commonTitle}` : null);
        if (key && groupMap.has(q.id)) {
            const cIdx = groupMap.get(q.id);
            groupColorClass = getGroupColor(cIdx);
            isBundle = true;
        }

        const groupKeyEncoded = key ? encodeURIComponent(key) : '';

        html += `
            <div class="bank-row grid grid-cols-[60px_100px_120px_1fr_80px_80px] items-center p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all group select-none hover:bg-blue-50"
                 data-id="${q.id}"
            >
                <!-- Group Indicator -->
                <div class="flex justify-center">
                    <div class="w-9 h-9 rounded-lg ${isBundle ? groupColorClass : 'bg-[#013976]'} flex items-center justify-center text-white font-bold text-sm shadow-sm transform transition-transform group-hover:scale-110">
                        ${idx + 1}
                    </div>
                </div>
                
                <!-- Section -->
                <div class="text-center">
                    <span class="px-2.5 py-1 rounded-md fs-16 font-bold border ${
                        q.section === 'Reading' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                        q.section === 'Grammar' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                        q.section === 'Vocabulary' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                        q.section === 'Listening' ? 'bg-orange-100 text-orange-700 border-orange-200' :
                        q.section === 'Writing' ? 'bg-pink-100 text-pink-700 border-pink-200' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                    }">
                        ${q.section || '-'}
                    </span>
                </div>
                
                <!-- Type -->
                <div class="text-center fs-16 truncate px-2 font-bold ${
                    (q.questionType || q.type || '').includes('객관') ? 'text-blue-600' : 'text-rose-600'
                }">
                    ${q.questionType || q.type || '-'}
                </div>
                
                <!-- Content -->
                <div class="px-4 text-slate-700 font-medium truncate fs-16 leading-snug">
                    ${q.title || q.text || q.questionTitle || '-'}
                </div>
                
                <!-- Score -->
                <div class="text-center text-blue-600 font-bold fs-16">
                    ${q.score}
                </div>

                <!-- Edit -->
                <div class="text-center">
                    <button onclick="renderEditForm('${q.id}')" class="btn-ys !bg-white !text-indigo-600 !border-indigo-200 hover:bg-indigo-50 !py-1 !px-3 font-bold text-xs shadow-sm" onmousedown="event.stopPropagation()">
                        ✏️
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// 5. [기능] 세부 유형 목록 업데이트 (Universal)
// 5. [기능] 세부 유형 목록 업데이트
function upDet(v) {
    const s = document.getElementById('q-subtype') || document.getElementById('q-det');
    if (!s) return;

    if (!v) {
        s.innerHTML = '<option value="" disabled selected hidden>주 영역을 먼저 선택하세요</option>';
        return;
    }

    const list = [...(SUB_TYPE_MAP[v] || [])];
    if (list.length === 0) {
        s.innerHTML = '<option value="" disabled selected hidden>해당 영역에 세부 항목이 없습니다</option>';
    } else {
        s.innerHTML = '<option value="" disabled selected hidden>세부 영역을 선택하세요</option>' + list.map(t => `<option value="${t}">${t}</option>`).join('');
    }
}

// 6. [기능] 객관식 보기 입력창 렌더링 (Dynamic Inputs)
function renderChoiceInputs(n, initialValues = null) {
    const container = document.getElementById('q-choices-container');
    if (!container) return;

    // 기존 값 백업 (값이 있으면 유지)
    const oldValues = [];
    const existingInputs = container.querySelectorAll('input');
    existingInputs.forEach(input => oldValues.push(input.value));

    let html = '';
    for (let i = 1; i <= n; i++) {
        // 우선순위: initialValues > 기존 입력값 > 빈 문자열
        let val = '';
        if (initialValues && initialValues[i - 1]) {
            val = initialValues[i - 1]; // "1. Apple"
        } else if (oldValues[i - 1]) {
            val = oldValues[i - 1];
        }
        // 번호 프리픽스 제거 (Ex: "1. Apple" -> "Apple")
        val = val.replace(/^\d+\.\s*/, '');
        html += `
                    <div class="flex items-center gap-3 animate-fade-in-safe">
                        <span class="text-slate-400 font-bold text-lg w-6 text-right">${i}.</span>
                        <input type="text" id="q-choice-${i}" class="ys-field !h-12 !text-base bg-white focus:bg-blue-50 transition-colors" 
                               placeholder="보기 ${i} 내용을 입력하세요 (Option ${i})" value="${val}">
                    </div>`;
    }
    container.innerHTML = html;
}

// --- 문항 등록 폼 (NEW UI) ---
// --- REFACTORED REGISTRATION & EDIT FORM (PROTOTYPE SPLIT VIEW) ---

// 공통 Sub-Area 데이터
const REG_SUB_AREAS = {
    'Listening': ["계산", "그림 묘사", "목적 파악", "묘사", "받아쓰기", "상황파악", "세부사항", "심리/심경", "응답", "정보 요약", "주제", "단어 입력", "기타"],
    'Reading': ["글 요약", "내용 일치", "대의 파악", "목적", "문장 연결성", "문장 완성", "문장 의미", "밑줄 추론", "심리/심경", "빈칸추론", "삽입", "세부사항", "순서", "어휘 추론", "어휘 활용", "연결사", "요약/요지", "장문 빈칸", "장문 제목", "제목", "주제", "지칭", "추론", "흐름", "기타"],
    'Vocabulary': ["레벨1", "레벨2", "레벨3", "레벨4", "레벨5", "레벨6", "레벨7", "레벨8", "레벨9", "숙어", "기타"],
    'Writing': ["레벨1", "레벨2", "레벨3", "레벨4", "레벨5", "레벨6", "레벨7", "레벨8", "레벨9", "문장 완성", "글 요약", "작문", "기타"],
    'Grammar': ["가정법", "관계대명사", "관계부사", "관계사", "관계사/의문사", "관계사/접속사", "대명사", "명사", "병렬 구조", "분사", "분사구문", "비교급", "수동태", "수일치", "시제", "일치/화법", "접속사", "조동사", "준동사", "지칭 복합", "특수구문", "형식", "형용사", "형용사/부사", "화법", "to부정사", "to부정사/동명사", "기타"]
};

// Canvas 08-1: 문항 등록 (Set Creation, Split View)
// [New] Exit Builder Mode Logic (Back Button & Exit Button)
function exitBuilderMode(force = false) {
    if (!force && !confirm("작성 중인 내용은 저장되지 않습니다. 나가시겠습니까?")) {
        // If triggered by back button (popstate), we need to push state back to stay
        history.pushState({ page: 'builder' }, '', '#builder');
        return;
    }

    // Cleanup History Listener
    window.onpopstate = null;
    window.removeEventListener('beforeunload', handleBeforeUnload);

    // Restore Layout
    document.body.classList.add('has-sidebar'); // Restore sidebar helper if needed, or just let CSS handle it
    // Actually, 'has-sidebar' removal was just for background color or specific overrides.
    // The critical part is restoring display:

    const globalHeader = document.getElementById('app-header');
    if (globalHeader) globalHeader.style.display = 'flex'; // Was flex

    const globalFooter = document.getElementById('app-footer');
    if (globalFooter) globalFooter.style.display = ''; // [Fix] CSS default(flex) 복원

    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        mainContainer.style.marginTop = ''; // Reset to CSS default
        mainContainer.style.height = '';    // Reset to CSS default
    }

    // Restore URL
    history.replaceState(null, '', ' '); // Clear #builder

    // Render Bank (Canvas 08)
    const content = document.getElementById('dynamic-content');
    content.classList.remove('h-full'); // Remove full height override
    renderBank(content);
}

// Map this to global scope if needed for button onclick
window.exitBuilderMode = exitBuilderMode;

// --- Drag & Drop Form Builder (New 08-1) ---

// [New] BeforeUnload Handler (Shared)
function handleBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = '작성 중인 내용이 저장되지 않았습니다. 정말 나가시겠습니까?'; // Chrome/Edge requirement (Text ignored but required to set)
    return e.returnValue; // Legacy
}

function renderRegForm() {
    // [Request] Hide Sidebar AND Header for Full Screen
    document.body.classList.remove('has-sidebar');

    // [History API] Push State for Back Button Protection
    history.pushState({ page: 'builder' }, '', '#builder');

    // [History API] Handle Back Button
    window.onpopstate = function (event) {
        exitBuilderMode();
    };
    // [Event] Prevent accidental tab close/reload
    window.addEventListener('beforeunload', handleBeforeUnload);

    // [Global Layout Override]
    const globalHeader = document.getElementById('app-header');
    if (globalHeader) globalHeader.style.display = 'none';

    const globalFooter = document.getElementById('app-footer');
    if (globalFooter) globalFooter.style.display = 'none';

    const mainContainer = document.getElementById('main-container');
    if (mainContainer) {
        mainContainer.style.marginTop = '0';
        mainContainer.style.height = '100vh';
    }

    setCanvasId('08-1', 'full'); // Full width
    const c = document.getElementById('dynamic-content');

    // Layout: Split View Container
    c.classList.add('h-full');
    c.innerHTML = `
        <!-- [Full Screen Layout] 100vh height since global header is hidden -->
        <div style="width: 100%; height: 100vh; background-color: #f8fafc; position: relative; overflow: hidden;">
            
            <!-- Builder Header (Block Element, Fixed Height) -->
            <div id="builder-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 60px; background-color: white; border-bottom: 1px solid #e2e8f0; z-index: 500; position: relative; padding: 0 24px;">
                 <!-- Left: Title -->
                 <div class="flex items-center gap-4">
                    <h2 class="font-bold bg-[#013976] text-white px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2" style="font-size: 17px;">
                        <span class="text-xl">📝</span> Quiz Builder
                    </h2>
                    
                    <!-- Category Selection (Clean) -->
                    <div class="flex items-center gap-2">
                        <select id="reg-target-cat" class="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-sm font-bold text-[#013976] outline-none focus:border-blue-500 min-w-[200px] shadow-sm">
                            <option value="" disabled selected>카테고리(시험지) 선택</option>
                            ${globalConfig.categories ? globalConfig.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('') : ''}
                        </select>
                        <button onclick="loadQuestionsFromCategory()" class="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm font-bold shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-1">
                            <span>📂</span> 불러오기
                        </button>
                    </div>
                </div>

                 <!-- Center: Toolbar Controls -->
                 <div class="flex items-center gap-2">
                    <button onclick="addComponent('bundle')" class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors font-bold text-sm shadow-sm hover:shadow active:scale-95">
                        <span>📦</span> 묶음형
                    </button>
                    <button onclick="addComponent('obj')" class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors font-bold text-sm shadow-sm hover:shadow active:scale-95">
                        <span>✅</span> 객관형
                    </button>
                    <button onclick="addComponent('subj')" class="flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors font-bold text-sm shadow-sm hover:shadow active:scale-95">
                        <span>✍️</span> 주관형
                    </button>
                 </div>
                
                <!-- Right: Actions -->
                <div class="flex items-center gap-2">


                    <button onclick="saveRegGroup()" class="btn-ys shadow-md hover:brightness-110 !px-4 !py-1.5 !text-sm !h-auto !rounded shrink-0">
                        🚀 등록
                    </button>
                    
                    <button onclick="exitBuilderMode()" class="btn-ys !bg-slate-100 !text-slate-500 !border-slate-200 hover:bg-slate-200 hover:text-slate-700 shadow-none !px-3 !py-1.5 !text-sm !h-auto !rounded shrink-0">
                        ✖ 나가기
                    </button>
                </div>
            </div>
    
            <!-- Builder Body (Calc Height based on 60px header) -->
            <div style="display: flex; width: 100%; height: calc(100% - 60px); overflow: hidden; background-color: #f8fafc; position: relative;">
                


                <!-- [Right] Form Builder 3:6:1 Layout -->
                <div id="builder-main-area" class="flex-1 w-full relative px-6 pb-6 pt-3 h-full overflow-hidden">
                    <div class="h-full grid grid-cols-[3fr_5.5fr_1.5fr] gap-6">
                        
                        <!-- Zone A: Bundle (30%) -->
                        <div class="flex flex-col h-full overflow-hidden">
                            <!-- [Refine] Center Header: pt-3 (parent) vs mb-3 (here) = Balanced -->
                            <div class="mb-3 font-bold text-sm flex items-center gap-2 flex-none h-8">
                                <span class="text-[17px] text-[#013976]">📦 Bundles</span>
                                <span class="bg-gray-100 text-gray-600 text-[14px] font-bold px-2 py-0.5 rounded shadow-sm" id="count-bundle">총 0개</span>
                            </div>
                            <!-- Added h-full and min-h-0 to force scrolling in flex child -->
                            <div id="zone-bundle" class="flex-1 min-h-0 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl p-4 space-y-4 scroll-smooth overflow-y-auto">
                                <!-- Bundle Cards Go Here -->
                                <div id="placeholder-bundle" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <span class="text-3xl mb-2">📦</span>
                                    <span class="text-[14px]">지문 묶음 추가</span>
                                </div>
                            </div>
                        </div>

                        <!-- Zone B: Questions (60%) -->
                        <div class="flex flex-col h-full overflow-hidden">
                           <!-- [Refine] Center Header: pt-3 (parent) vs mb-3 (here) = Balanced -->
                           <div class="mb-3 font-bold text-sm flex items-center gap-2 flex-none h-8">
                                <span class="text-[17px] text-[#013976]">📝 Questions</span>
                                <div id="section-stats" class="flex items-center gap-2 ml-2 overflow-x-auto no-scrollbar"></div>
                            </div>
                            <!-- Added h-full and min-h-0 to force scrolling in flex child -->
                            <div id="zone-question" class="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-inner relative scroll-smooth overflow-y-auto">
                                <!-- Question Cards Go Here -->
                                <div id="placeholder-question" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                    <span class="text-3xl mb-2">📝</span>
                                    <span class="text-[14px]">문항 카드 추가</span>
                                </div>
                            </div>
                        </div>

                        <!-- Zone C: Navigator (10%) -->
                        <div class="flex flex-col h-full overflow-hidden">
                           <div class="mb-3 font-bold text-sm flex items-center gap-2 flex-none h-8">
                                <span class="text-[17px] text-[#013976]">🧭 Nav</span>
                            </div>
                            <!-- Added h-full and min-h-0 to force scrolling in flex child -->
                            <div id="zone-navigator" class="flex-1 min-h-0 bg-slate-100 border border-slate-200 rounded-xl p-2 space-y-2 scroll-smooth overflow-y-auto">
                                <!-- Navigator Items Go Here -->
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Palette Removed (Integrated into Header) -->
        </div>
    `;
}

// Split View Helpers
function toggleSplitView(forceState) {
    const panel = document.getElementById('source-panel');
    const btn = document.getElementById('btn-split-toggle');
    const isHidden = panel.classList.contains('hidden');

    if (forceState === true || (forceState === undefined && isHidden)) {
        panel.classList.remove('hidden');
        btn.classList.add('bg-indigo-50', 'text-indigo-600', 'border-indigo-200');
        btn.innerHTML = `<span>📖</span> 원문 숨기기`;
    } else {
        panel.classList.add('hidden');
        btn.classList.remove('bg-indigo-50', 'text-indigo-600', 'border-indigo-200');
        btn.innerHTML = `<span>📖</span> 원문 대조`;
    }
}

function copySourceText() {
    const text = document.getElementById('source-text-area').value;
    navigator.clipboard.writeText(text).then(() => showToast("📋 Copied to clipboard!"));
}

// Toast Notification Helper
// [Duplicate showToast removed - using robust version at line 242]

// --- Builder Helpers ---

function renderDraggableBtn(type, label, sub) {
    return `
        <div draggable="true" ondragstart="handleDragStart(event, '${type}')" onclick="addComponent('${type}')"
             class="group flex flex-col gap-0.5 p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-400 hover:bg-blue-50 hover:shadow-md cursor-grab active:cursor-grabbing transition-all select-none">
            <span class="font-bold text-slate-700 group-hover:text-blue-700 flex items-center gap-2">
                ${label}
            </span>
            <span class="text-[11px] text-slate-400 font-normal group-hover:text-blue-400">${sub}</span>
        </div>
    `;
}

let draggedType = null;

function handleDragStart(e, type) {
    draggedType = type;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', type);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const canvas = document.getElementById('reg-canvas');
    canvas.classList.add('bg-blue-50/30', 'border-blue-300');
}

function handleDragLeave(e) {
    const canvas = document.getElementById('reg-canvas');
    canvas.classList.remove('bg-blue-50/30', 'border-blue-300');
}

function handleDrop(e) {
    e.preventDefault();
    const canvas = document.getElementById('reg-canvas');
    canvas.classList.remove('bg-blue-50/30', 'border-blue-300');

    // Check valid type
    const type = e.dataTransfer.getData('text/plain') || draggedType;
    if (type) addComponent(type);

    draggedType = null;
}

// --- Palette Drag Logic ---
window.startDragPalette = function (e, el) {
    e.preventDefault();
    let startX = e.clientX;
    let startY = e.clientY;
    let startLeft = el.offsetLeft;
    let startTop = el.offsetTop;

    function onMouseMove(e) {
        let dx = e.clientX - startX;
        let dy = e.clientY - startY;
        el.style.left = (startLeft + dx) + 'px';
        el.style.top = (startTop + dy) + 'px';
        el.style.right = 'auto'; // Clear right if set
        el.style.bottom = 'auto'; // Clear bottom if set
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

const GLOBAL_STATE = {
    components: [] // Store data model for sync
};

function addComponent(type, data = null) {
    const isBundle = type === 'bundle';
    const targetZoneId = isBundle ? 'zone-bundle' : 'zone-question';
    const placeholderId = isBundle ? 'placeholder-bundle' : 'placeholder-question';

    const zone = document.getElementById(targetZoneId);
    const placeholder = document.getElementById(placeholderId);
    if (placeholder) placeholder.style.display = 'none';

    const id = data?.id || 'comp-' + Date.now() + Math.random().toString(36).substr(2, 5);
    const div = document.createElement('div');
    div.id = id;

    // UI: Card Styling
    div.className = 'builder-item bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 transition-all relative group';
    div.setAttribute('data-type', type);
    // [Fix] bundle UUID 보존 — collectBuilderData가 data-group-id를 우선 읽으므로 반드시 세팅
    if (type === 'bundle' || type === 'passage') {
        div.setAttribute('data-group-id', id);
    }

    // Render Content
    div.innerHTML = getComponentHtml(type, id, data || {});

    // Delete Button
    // Delete Button Logic (Moved to clean header button)
    const delBtn = div.querySelector('.delete-comp-btn');
    if (delBtn) {
        delBtn.onclick = () => {
            if (!confirm("정말 삭제하시겠습니까?")) return;

            // [Fix] Cleanup orphaned links if deleting a Bundle
            if (type === 'bundle') {
                const bundleId = div.id;
                const zoneB = document.getElementById('zone-question');
                if (zoneB) {
                    const linkedQuestions = Array.from(zoneB.querySelectorAll(`.builder-item[data-bundle-id="${bundleId}"]`));
                    linkedQuestions.forEach(q => {
                        q.removeAttribute('data-bundle-id');
                        q.removeAttribute('data-set-num');

                        // Remove Badge from Title
                        const badge = q.querySelector('.bundle-badge');
                        if (badge) badge.remove();
                    });
                }
            }

            div.remove();
            if (zone.children.length === 1) { // Only placeholder hidden
                if (placeholder) placeholder.style.display = 'flex';
            }
            updateQuestionNumbers();
        };
    }


    zone.appendChild(div);

    // [Fix v2] 이중 RAF: 첫 로드 시 flex 레이아웃이 완전히 정착된 후 scrollHeight 계산
    // 단일 RAF는 레이아웃이 아직 미완성 상태일 수 있어 높이가 부정확함
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            div.querySelectorAll('textarea').forEach(ta => autoResize(ta));
        });
    });

    // Initial Focus logic
    if (type === 'passage' || type === 'bundle') {
        // Focus logic
    }

    updateQuestionNumbers(); // This will trigger renderNavigator
}

// --- 3:6:1 Core Logic ---
function updateQuestionNumbers() {
    const zoneB = document.getElementById('zone-question');
    const zoneA = document.getElementById('zone-bundle');
    const zoneC = document.getElementById('zone-navigator');
    if (!zoneB || !zoneA) return;

    // 0. Use querySelectorAll to get ALL items in Zone B, including newly added ones
    // IMPORTANT: newly added element might not be in DOM if called synchronously after append? 
    // No, standard appendChild is synchronous. 
    const questions = Array.from(zoneB.querySelectorAll('.builder-item'));
    let qCount = 0;

    // 1. Assign Question Numbers (01, 02...)
    questions.forEach((q, idx) => {
        qCount++;
        // [Fix] 편집 모드에서 원본 번호 우선 사용 (항상 Q.01이 되는 버그 방지)
        const header = q.querySelector('[data-original-no]');
        const originalNo = header ? header.getAttribute('data-original-no') : '';
        const num = originalNo ? String(originalNo).padStart(2, '0') : String(qCount).padStart(2, '0');
        q.setAttribute('data-q-num', num);

        // Update UI Label
        const label = q.querySelector('.q-number-label');
        if (label) label.textContent = `Q.${num}`;
    });

    // Update Counts
    // Update Counts
    // document.getElementById('count-question').textContent = qCount; // [Removed as redundant]

    // Update Bundle Count
    const bundleCount = zoneA.querySelectorAll('.builder-item').length;
    const bundleCountEl = document.getElementById('count-bundle');
    if (bundleCountEl) bundleCountEl.textContent = `총 ${bundleCount}개`;

    // [New] Render Section Stats (Count & Score)
    const statsContainer = document.getElementById('section-stats');
    if (statsContainer) {
        // Calculate Stats
        const stats = {};
        questions.forEach(q => {
            const secInput = q.querySelector('[data-field="section"]');
            const scoreInput = q.querySelector('[data-field="score"]');

            let sec = secInput ? secInput.value : '';
            if (!sec) sec = '미분류';

            const score = scoreInput ? parseInt(scoreInput.value || 0) : 0;

            if (!stats[sec]) stats[sec] = { count: 0, score: 0 };
            stats[sec].count++;
            stats[sec].score += score;
        });

        // [New] Calculate Total
        let totalCount = 0;
        let totalScore = 0;
        Object.values(stats).forEach(s => {
            totalCount += s.count;
            totalScore += s.score;
        });

        // Render Badges
        const totalBadge = `
             <span class="bg-slate-700 text-white border border-slate-700 px-2 py-0.5 rounded text-[14px] font-bold whitespace-nowrap shadow-sm mr-2">
                 총 ${totalCount}개 / ${totalScore}점
             </span>
        `;

        // Order: Define preferred order or alphabetical?
        // Let's iterate keys.
        // Let's iterate keys.
        statsContainer.innerHTML = totalBadge + Object.keys(stats).map(sec => {
            if (sec === '미분류' && stats[sec].count === 0) return '';
            // [Refine] Abbreviate Section: 독해->[독], 문법->[문]
            const mapper = { 'Reading': 'R', 'Grammar': 'G', 'Vocabulary': 'V', 'Listening': 'L', 'Writing': 'W', '미분류': '?' };
            const shortSec = mapper[sec] || sec[0] || '?'; // fallback to first char if unknown

            return `
                <span class="bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded text-[14px] font-bold whitespace-nowrap shadow-sm">
                    [${shortSec}] ${stats[sec].count}개 / ${stats[sec].score}점
                </span>
            `;
        }).join('');
    }

    // 2. Render Navigator (Zone C)
    if (zoneC) {
        renderNavigator(questions);
    }

    // 3. Bi-directional Bundle Sync
    syncBundles(questions);
}

function renderNavigator(questions) {
    let zoneC = document.getElementById('zone-navigator');
    if (!zoneC) {
        // Fallback: If for some reason global replacement failed, try to find it within builder-main-area
        console.warn("Zone C not found by ID, searching deeper...");
        zoneC = document.querySelector('#builder-main-area #zone-navigator');
        if (!zoneC) return;
    }
    zoneC.innerHTML = '';

    if (questions.length === 0) {
        zoneC.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                <span class="text-3xl mb-2">🧭</span>
                <span class="text-[14px]">문항 카드 추가</span>
            </div>
        `;
        return;
    }

    // zoneC.style.border = "2px solid red"; // DEBUG (Removed)

    questions.forEach(q => {
        const id = q.id;
        const num = q.getAttribute('data-q-num');
        const type = q.getAttribute('data-type');

        // [Custom Label Logic]
        const typeLabel = type === 'obj' ? '객' : '주';
        const typeColor = type === 'obj' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600';

        // Retrieve Section & Score
        // Since 'q' is the DOM element, we query inputs
        const secInput = q.querySelector('[data-field="section"]');
        const scoreInput = q.querySelector('[data-field="score"]');
        const secVal = secInput ? secInput.value : '';
        const scoreVal = scoreInput ? scoreInput.value : '';
        const shortSec = secVal ? secVal[0] : ''; // '독', '문' ...

        // Check Linked Bundle
        const linkedBundleId = q.getAttribute('data-bundle-id');

        const navItem = document.createElement('div');
        navItem.className = 'bg-white border border-slate-200 rounded p-1.5 text-[14px] flex items-center justify-between cursor-move hover:border-blue-400 select-none shadow-sm gap-2';
        navItem.setAttribute('draggable', 'true');
        navItem.setAttribute('data-target-id', id); // Link back to Zone B item

        // Layout: [Num] [Type] [Sec] [Score] [SetBadge]
        navItem.innerHTML = `
            <div class="flex items-center gap-1.5 overflow-hidden">
                <span class="font-bold text-slate-700 w-5 text-center shrink-0 text-[14px]">${num}</span>
                <div class="flex items-center gap-1 shrink-0">
                    <span class="${typeColor} px-1 rounded text-[14px] font-bold min-w-[20px] text-center">${typeLabel}</span>
                    ${shortSec ? `<span class="bg-slate-100 text-slate-600 px-1 rounded text-[14px] font-bold min-w-[20px] text-center">${shortSec}</span>` : ''}
                    ${scoreVal ? `<span class="bg-yellow-50 text-yellow-700 border border-yellow-100 px-1 rounded text-[14px] font-bold min-w-[20px] text-center">${scoreVal}</span>` : ''}
                </div>
            </div>
            ${linkedBundleId ? `<span class="text-[14px] font-bold set-badge shrink-0 ml-auto">#Set</span>` : ''} 
        `;
        // Note: #Set number will be populated by syncBundles via direct DOM manipulation or we rely on re-render?
        // Actually syncBundles calls renderNavigator? No, updateQuestionNumbers calls renderNavigator THEN syncBundles.
        // So syncBundles needs to update Nav items too? Or we store data-set-num BEFORE renderNavigator.

        // Better: Let syncBundles update the DOM of existing Nav items? 
        // Or updateQuestionNumbers stores the set-num on Q items first?
        // But Q items don't know their set number until syncBundles runs (which iterates bundles).

        // Revised flow: syncBundles should Run First? No, bundles depend on Q IDs?
        // Let's modify syncBundles to ALSO update the Navigator Items' set badges.

        // Nav Drag Events
        navItem.addEventListener('dragstart', handleNavDragStart);
        navItem.addEventListener('dragover', handleNavDragOver);
        navItem.addEventListener('drop', handleNavDrop);
        navItem.addEventListener('dragend', handleNavDragEnd);

        // [New] Nav Click → Scroll to Question in Zone B
        navItem.addEventListener('click', () => {
            const targetId = navItem.getAttribute('data-target-id');
            const targetEl = document.getElementById(targetId);
            const zoneQ = document.getElementById('zone-question');
            if (targetEl && zoneQ) {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // 하이라이트 효과
                targetEl.style.outline = '2px solid #3b82f6';
                targetEl.style.borderRadius = '12px';
                setTimeout(() => { targetEl.style.outline = ''; }, 1200);
            }
        });

        zoneC.appendChild(navItem);
    });
}

// --- Sync Logic ---

// --- Sync Logic ---

// [New] Distinct Color Palette for Sets (23 variations)
const SET_COLOR_PALETTE = [
    'text-red-600 bg-red-100', 'text-amber-600 bg-amber-100', 'text-lime-600 bg-lime-100',
    'text-emerald-600 bg-emerald-100', 'text-teal-600 bg-teal-100', 'text-cyan-600 bg-cyan-100',
    'text-sky-600 bg-sky-100', 'text-blue-600 bg-blue-100', 'text-indigo-600 bg-indigo-100',
    'text-violet-600 bg-violet-100', 'text-purple-600 bg-purple-100', 'text-fuchsia-600 bg-fuchsia-100',
    'text-pink-600 bg-pink-100', 'text-rose-600 bg-rose-100',
    'text-red-700 bg-red-200', 'text-green-700 bg-green-200', 'text-blue-700 bg-blue-200',
    'text-orange-700 bg-orange-200', 'text-purple-700 bg-purple-200', 'text-cyan-700 bg-cyan-200',
    'text-slate-600 bg-slate-200', 'text-stone-600 bg-stone-200', 'text-zinc-600 bg-zinc-200'
];

function syncBundles(questions) {
    const zoneA = document.getElementById('zone-bundle');
    const bundles = Array.from(zoneA.querySelectorAll('.builder-item'));

    // Map: Q_ID -> Q_Number (e.g. 'comp-123' -> '01')
    const idToNumMap = {};
    questions.forEach(q => {
        idToNumMap[q.id] = parseInt(q.getAttribute('data-q-num'));
    });

    bundles.forEach((bundle, idx) => {
        const input = document.getElementById(`${bundle.id}-link-input`);
        const setNum = idx + 1;

        // Pick Color (Cycle through palette)
        const colorClass = SET_COLOR_PALETTE[idx % SET_COLOR_PALETTE.length];

        // Read stored links first to check if badge should be shown
        let linkedIds = [];
        try {
            linkedIds = JSON.parse(bundle.getAttribute('data-linked-ids') || '[]');
        } catch (e) {
            linkedIds = [];
        }

        // [Refine] Update Bundle Card Title
        const bundleTitleH4 = bundle.querySelector('h4');
        if (bundleTitleH4) {
            let setBadge = bundleTitleH4.querySelector('.bundle-set-num');

            // Only show #Set if linked
            if (linkedIds.length > 0) {
                if (!setBadge) {
                    setBadge = document.createElement('span');
                    bundleTitleH4.appendChild(setBadge);
                }
                setBadge.className = `bundle-set-num ml-2 px-1.5 py-0.5 rounded-md font-bold text-[14px] ${colorClass}`;
                setBadge.innerText = `#Set ${setNum}`;
            } else {
                if (setBadge) setBadge.remove();
            }
        }


        if (linkedIds.length > 0) {
            // Find current numbers for these IDs
            const currentNums = linkedIds
                .map(id => idToNumMap[id])
                .filter(n => !isNaN(n))
                .sort((a, b) => a - b);

            // Auto-update Input
            if (input) {
                // Only update if focused to avoid fighting typing?
                // Or update always for "Bi-directional" truth.
                // We update it. Sync is truth.
                input.value = currentNums.join(', ');
            }

            // Update Zone B Badges (Visual Feedback)
            linkedIds.forEach(qId => {
                const qEl = document.getElementById(qId);
                if (qEl) {
                    qEl.setAttribute('data-bundle-id', bundle.id);
                    qEl.setAttribute('data-set-num', setNum); // Store for ref

                    // Ensure badge exists in Title
                    const header = qEl.querySelector('div.flex.items-center.gap-3');
                    if (header) { // The header containing Icon & Title
                        // Check if badge exists
                        let badge = header.querySelector('.bundle-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            // Insert after H4
                            const h4 = header.querySelector('h4');
                            if (h4) {
                                h4.appendChild(badge);
                            }
                        }
                        badge.innerText = `#Set ${setNum}`;
                        badge.className = `bundle-badge text-[14px] px-1.5 py-0.5 rounded-md font-bold ml-2 ${colorClass} cursor-pointer hover:brightness-110 transition-all select-none`; // Dynamic Color
                        badge.title = '묶음형 카드로 이동';
                        badge.setAttribute('data-target-bundle', bundle.id);
                        // [New] 클릭 시 zone-bundle의 해당 카드로 스크롤
                        badge.onclick = function(e) {
                            e.stopPropagation();
                            const bundleId = this.getAttribute('data-target-bundle');
                            const bundleEl = document.getElementById(bundleId);
                            if (bundleEl) {
                                bundleEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                // 강조 효과
                                bundleEl.style.outline = '2px solid #4f46e5';
                                bundleEl.style.boxShadow = '0 0 0 4px rgba(79,70,229,0.2)';
                                setTimeout(() => {
                                    bundleEl.style.outline = '';
                                    bundleEl.style.boxShadow = '';
                                }, 1500);
                            }
                        };
                    }

                    // [New] Update Navigator Badges (Zone C)
                    // We find the nav item by data-target-id
                    const zoneC = document.getElementById('zone-navigator');
                    if (zoneC) {
                        const navItem = zoneC.querySelector(`[data-target-id="${qId}"]`);
                        if (navItem) {
                            let navBadge = navItem.querySelector('.set-badge');
                            if (!navBadge) {
                                // Create if missing (e.g. if renderNavigator didn't make it)
                                navBadge = document.createElement('span');
                                navItem.appendChild(navBadge);
                            }
                            navBadge.innerText = `#Set ${setNum}`;
                            navBadge.className = `set-badge text-[14px] px-1 rounded font-bold ml-auto ${colorClass}`; // Apply same color scheme
                        }
                    }
                }
            });
        }
    });
}

// --- Nav Drag Handlers ---
let navDragSrc = null;

function handleNavDragStart(e) {
    navDragSrc = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-target-id'));
    this.classList.add('opacity-50', 'bg-blue-50');
}

function handleNavDragOver(e) {
    e.preventDefault();
    return false;
}

function handleNavDrop(e) {
    e.stopPropagation();
    if (navDragSrc !== this) {
        const container = this.parentNode;
        const allItems = Array.from(container.children);

        // 1. Identify Source & Target Context
        const srcId = navDragSrc.getAttribute('data-target-id');
        const tgtId = this.getAttribute('data-target-id');

        const srcQ = document.getElementById(srcId);
        const tgtQ = document.getElementById(tgtId);

        const srcBundleId = srcQ ? srcQ.getAttribute('data-bundle-id') : null;
        const tgtBundleId = tgtQ ? tgtQ.getAttribute('data-bundle-id') : null;

        // 2. Identify Moving Block (Source)
        let movingItems = [navDragSrc];
        if (srcBundleId) {
            // If dragging item is part of a bundle, move ALL items of that bundle
            movingItems = allItems.filter(item => {
                const qId = item.getAttribute('data-target-id');
                const q = document.getElementById(qId);
                return q && q.getAttribute('data-bundle-id') === srcBundleId;
            });
        }

        // 3. Identify Reference Block (Target)
        // We need to decide insertion point: Before First or After Last of Target Group
        // Base decision on: Is the *first item* of Moving Group above or below the Target?
        // Or simpler: Compare index of navDragSrc vs this.

        const srcIndex = allItems.indexOf(navDragSrc);
        const tgtIndex = allItems.indexOf(this);
        const isMovingDown = srcIndex < tgtIndex;

        // Find Target Anchor
        let anchorItem = this;

        if (tgtBundleId) {
            const tgtGroupItems = allItems.filter(item => {
                const qId = item.getAttribute('data-target-id');
                const q = document.getElementById(qId);
                return q && q.getAttribute('data-bundle-id') === tgtBundleId;
            });

            // If conflict: attempting to drop INSIDE a different bundle?
            // Rule: Escape the bundle.
            // If moving down, anchor is the LAST item of target bundle.
            // If moving up, anchor is the FIRST item of target bundle.

            if (isMovingDown) {
                anchorItem = tgtGroupItems[tgtGroupItems.length - 1]; // Insert after this
            } else {
                anchorItem = tgtGroupItems[0]; // Insert before this
            }
        }

        // 4. Perform Move
        // We move all movingItems sequentially
        movingItems.forEach(item => {
            if (isMovingDown) {
                // Insert After Anchor
                // Careful: as we append, the anchor position might shift if we use nextSibling? 
                // Actually, insertBefore(item, anchor.nextSibling) works.
                // We update anchor to be the just-moved item to maintain order of moving block?
                // Yes, if moving a block A,B,C after D:
                // Move A after D. Anchor becomes A.
                // Move B after A. Anchor becomes B.
                container.insertBefore(item, anchorItem.nextSibling);
                anchorItem = item;
            } else {
                // Insert Before Anchor
                // Move A,B,C before D:
                // Move A before D.
                // Move B before D (Wait, B should be after A?).
                // No, we iterate movingItems (A, B, C).
                // Insert A before D.
                // Insert B before D? No, that reverses order (B, A, C -> D).
                // We should keep the block order.
                // So we insert A before D. Then we need to insert B after A?
                // Or just insert the whole block at the target index?
                container.insertBefore(item, anchorItem);
                // No, for "Before", we don't update anchor if we just keep inserting before the original Anchor. 
                // EXCEPT if movingItems includes the anchor itself (impossible usually).
            }
        });

        // Sync Zone B
        syncZoneBOrder(container);
    }
    return false;
}

function handleNavDragEnd(e) {
    this.classList.remove('opacity-50', 'bg-blue-50');
    // Finalize numbers
    updateQuestionNumbers();
}

function syncZoneBOrder(navContainer) {
    const zoneB = document.getElementById('zone-question');
    const navItems = Array.from(navContainer.children);

    // Re-append Zone B items in the order of Nav Items
    navItems.forEach(nav => {
        const targetId = nav.getAttribute('data-target-id');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            zoneB.appendChild(targetEl); // Moves it to the end, effectively sorting
        }
    });
}

// --- Re-Numbering Logic ---
// [Legacy updateQuestionNumbers removed to prevent conflict]

// [Fix #3] All Font Sizes to 14px (text-sm, fs-14)
// [Robust Fix] getComponentHtml with data-field attributes
function getComponentHtml(type, id, data) {
    const d = data || {};
    const inputClass = "w-full p-2.5 text-[14px] font-medium border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none bg-slate-50 focus:bg-white transition-all";

    switch (type) {
        case 'cat':
            return `<input type="hidden" id="${id}-val" data-field="catId" value="${d.catId || ''}">
                    <!-- Legacy UI for cat if needed, but usually hidden or handled by top bar -->`;

        case 'bundle':
            const isEditMode = !!document.querySelector('[data-canvas-id="07-2"]');
            return `
                <div class="flex items-center justify-between gap-3 mb-4 bg-orange-50 p-3 rounded-xl border border-orange-100" data-group-id="${d.groupId || generateUUID()}">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">📦</span>
                        <div>
                            <h4 class="font-bold text-orange-800 text-[15px]">Group Bundle</h4>
                        </div>
                    </div>
                    <button class="delete-comp-btn p-1 w-[28px] h-[28px] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-bold text-[15px]" title="삭제" ${isEditMode ? 'style="display:none;"' : ''}>✕</button>
                </div>
                <div class="mb-4">
                    <label class="text-[14px] font-bold text-slate-600 mb-1.5 block">질문 내용 (Question)</label>
                    <textarea id="${id}-title" data-field="title" rows="1" oninput="autoResize(this)" class="${inputClass} resize-none overflow-hidden" placeholder="질문을 입력하세요">${d.title || d.text || ''}</textarea>
                </div>
                <!-- 연결 문항 관련 영역은 수정 모드가 아닐 때만 표시 (수정 모드에서는 새끼 변경 금지) -->
                <div class="mb-4" ${isEditMode ? 'style="display:none;"' : ''}>
                     <label class="text-[14px] font-bold text-slate-600 mb-1.5 block">연결 문항 (Linked Questions)</label>
                     <div class="flex items-center gap-2 overflow-hidden">
                        <input type="text" id="${id}-link-input" 
                                class="flex-1 min-w-0 p-2 text-[14px] font-bold text-orange-600 border-2 border-orange-200 rounded-lg outline-none focus:border-orange-400 placeholder:text-orange-300 placeholder:font-normal" 
                                placeholder="예: 1, 2, 3 (번호 입력)"
                                onkeydown="if(event.key==='Enter'){ event.preventDefault(); handleBundleLinkInput('${id}', this.value); }"
                                value="">
                        <div class="flex flex-row gap-1 flex-shrink-0">
                            <button onclick="handleBundleLinkInput('${id}', document.getElementById('${id}-link-input').value)" 
                                    class="btn-ys !bg-orange-600 !text-white !border-orange-600 hover:brightness-110 !px-3 !py-1 !text-[14px] !font-bold rounded shadow-sm whitespace-nowrap">
                                연결
                            </button>
                            <button onclick="handleBundleDisconnect('${id}')" 
                                    class="btn-ys !bg-white !text-red-500 !border-red-200 hover:bg-red-50 !px-3 !py-1 !text-[14px] !font-bold rounded shadow-sm whitespace-nowrap">
                                해제
                            </button>
                        </div>
                     </div>
                     <!-- Value will be populated by sync logic if data-linked-ids exists -->
                </div>
                
                <!-- Toggle Controls -->
                <div class="flex items-center gap-3 mb-4">
                    <button onclick="document.getElementById('${id}-ctx-box').classList.toggle('hidden')" class="text-[14px] font-bold text-slate-500 hover:text-orange-600 flex items-center gap-1.5 py-1 px-2 hover:bg-orange-50 rounded-lg transition-colors">
                        <span>➕</span> 지문 추가
                    </button>
                    <button onclick="document.getElementById('${id}-img-box').classList.toggle('hidden')" class="text-[14px] font-bold text-slate-500 hover:text-orange-600 flex items-center gap-1.5 py-1 px-2 hover:bg-orange-50 rounded-lg transition-colors">
                        <span>📷</span> 이미지 추가
                    </button>
                    <button onclick="document.getElementById('${id}-audio-box').classList.toggle('hidden')" class="text-[14px] font-bold text-slate-500 hover:text-green-600 flex items-center gap-1.5 py-1 px-2 hover:bg-green-50 rounded-lg transition-colors">
                        <span>🎵</span> 듣기 추가
                    </button>
                    <select id="${id}-audio-plays" data-field="audioMaxPlay" class="h-[28px] px-2 text-[13px] border border-slate-300 rounded-lg outline-none">
                        <option value="1" ${(d.audioMaxPlay||1)==1?'selected':''}>1회</option>
                        <option value="2" ${(d.audioMaxPlay||1)==2?'selected':''}>2회</option>
                        <option value="3" ${(d.audioMaxPlay||1)==3?'selected':''}>3회</option>
                    </select>
                </div>

                <!-- Context (Hidden by default) -->
                <div id="${id}-ctx-box" class="mb-4 ${d.html ? '' : 'hidden'}">
                     <div class="flex justify-between items-center mb-1.5">
                        <label class="text-[14px] font-bold text-slate-600">지문 내용</label>
                        ${renderMiniToolbar(id + '-editor')}
                     </div>
                     <div id="${id}-editor" data-field="html" class="min-h-[40px] p-2 border border-slate-200 rounded-xl outline-none text-[14px] leading-relaxed focus:border-orange-300 transition-colors bg-white shadow-inner" contenteditable="true">
                        ${d.html || ''}
                     </div>
                </div>
                <!-- Image (Hidden by default) -->
                <!-- Image (Hidden by default) -->
                <div id="${id}-img-box" class="mb-4 ${d.imgUrl ? '' : 'hidden'}">
                     ${renderImageUploader(id, d)}
                </div>
                 <div id="${id}-audio-box" class="mb-4 ${d.audioUrl ? '' : 'hidden'}">
                     ${renderAudioUploader(id, d)}
                 </div>

                <!-- Nested Zone -->
                <!-- Nested Zone Removed -->
             `;

        case 'obj':
        case 'subj':
            const isObj = type === 'obj';
            const icon = isObj ? '✅' : '✍️';
            const typeName = isObj ? '객관형 (Choice)' : '주관형 (Essay)';
            const headerBg = isObj ? 'bg-blue-50' : 'bg-rose-50';
            const borderColor = isObj ? 'border-blue-100' : 'border-rose-100';
            const optCount = (d.options && d.options.length >= 2 && d.options.length <= 5) ? d.options.length : 5;
            const optArr = Array.from({ length: optCount }, (_, i) => i + 1);
            // [Fix] d.labelType 없으면 answer 값으로 추론 (GAS 구버전 대응)
        const _inferredLT = (d.answer && /^[A-Ea-e]$/.test(String(d.answer).trim())) ? 'alpha' : 'number';
        const labelType = d.labelType || _inferredLT; // 'number' | 'alpha'
            const _alphaLabels = ['A','B','C','D','E'];
            const _numLabels   = ['1','2','3','4','5'];

            return `
                 <div class="flex items-center justify-between mb-4 ${headerBg} p-3 rounded-xl border ${borderColor}" data-bundle-id="${d.linkedGroupId || ''}" data-original-no="${d.no || ''}">
                    <!-- Left: Icon & Q.번호 -->
                    <div class="flex items-center gap-3 min-w-0">
                        <span class="text-2xl flex-shrink-0">${icon}</span>
                        <h4 class="font-bold text-slate-800 text-[15px] flex items-center gap-2 whitespace-nowrap">
                            <span class="q-number-label bg-[#013976] text-white px-2 py-0.5 rounded-lg shadow-sm" style="font-size: 17px;">Q.</span>
                        </h4>
                    </div>

                    <!-- Right: Compact Controls (Single Line) -->
                    <div class="flex items-center gap-2 flex-shrink-0">
                         <!-- Section -->
                         <select id="${id}-sec" data-field="section" 
                                 onchange="updateSubTypes('${id}', this.value); updateQuestionNumbers(); this.classList.toggle('bg-amber-50', !this.value); this.classList.toggle('bg-white', !!this.value);" 
                                 class="h-[34px] px-1 text-[14px] font-bold border border-slate-300 rounded-lg outline-none focus:border-blue-500 text-rose-700 ${!d.sec ? 'bg-amber-50' : 'bg-white'}">
                            <option value="" disabled ${!d.sec ? 'selected' : ''}>영역</option>
                            <option value="Reading" ${d.sec === 'Reading' ? 'selected' : ''}>Reading</option>
                            <option value="Grammar" ${d.sec === 'Grammar' ? 'selected' : ''}>Grammar</option>
                            <option value="Vocabulary" ${d.sec === 'Vocabulary' ? 'selected' : ''}>Vocabulary</option>
                            <option value="Listening" ${d.sec === 'Listening' ? 'selected' : ''}>Listening</option>
                            <option value="Writing" ${d.sec === 'Writing' ? 'selected' : ''}>Writing</option>
                         </select>

                         <!-- SubType -->
                         <select id="${id}-subtype" data-field="subtype" 
                                 onchange="this.classList.toggle('bg-amber-50', !this.value); this.classList.toggle('bg-white', !!this.value);"
                                 class="h-[34px] px-1 text-[14px] font-bold border border-slate-300 rounded-lg outline-none focus:border-blue-500 ${!d.sub ? 'bg-amber-50' : 'bg-white'}">
                             ${renderSubTypeOptions(d.sec, d.sub)}
                         </select>

                         <!-- Difficulty -->
                         <select id="${id}-diff" data-field="difficulty" class="h-[34px] px-2 text-[14px] border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white cursor-pointer">
                             ${['최상', '상', '중', '하', '기초'].map(lvl => `
                                <option value="${lvl}" ${(d.diff === lvl || (!d.diff && lvl === '중')) ? 'selected' : ''}>${lvl}</option>
                             `).join('')}
                         </select>

                         <!-- Score -->
                         <div class="flex items-center gap-1 h-[34px]">
                            <span class="text-[14px] font-bold text-slate-500">배점</span>
                            <input type="number" id="${id}-score" data-field="score" value="${d.score ?? 0}" min="0" max="99" oninput="if(this.value>99) this.value=99; if(this.value<0) this.value=0; updateQuestionNumbers();" class="w-[40px] h-full text-center text-[14px] font-bold border border-slate-300 rounded-lg outline-none focus:border-blue-500" placeholder="0">
                         </div>
                         <!-- Delete Button (X) -->
                         <button class="delete-comp-btn p-1 w-[28px] h-[28px] flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors font-bold text-[15px]" title="삭제">✕</button>
                    </div>
                 </div>

                 
                 <!-- Question Content -->
                 <div class="space-y-4">
                     <div>
                        <label class="text-[14px] font-bold text-slate-600 mb-1.5 block">질문 내용 (Question)</label>
                        <textarea id="${id}-text" data-field="text" rows="1" oninput="autoResize(this)" class="${inputClass} resize-none overflow-hidden" placeholder="질문을 입력하세요">${d.text || d.title || ''}</textarea>
                     </div>

                     <!-- Toggles -->
                     <div class="flex items-center gap-3">
                        <button onclick="document.getElementById('${id}-inner-ctx').classList.toggle('hidden')" class="text-[14px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 py-1 px-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span>➕</span> 지문 추가
                        </button>
                        <button onclick="document.getElementById('${id}-img-u').classList.toggle('hidden')" class="text-[14px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 py-1 px-2 hover:bg-blue-50 rounded-lg transition-colors">
                            <span>📷</span> 이미지 추가
                        </button>
                     </div>

                     <!-- Inner Context (Hidden) -->
                     <div id="${id}-inner-ctx" class="${d.innerPassage ? '' : 'hidden'}">
                        <div class="flex justify-between items-center mb-1.5">
                            <label class="text-[14px] font-bold text-slate-600">지문 내용</label>
                            ${renderMiniToolbar(id + '-inner-ctx-editor')}
                        </div>
                        <div id="${id}-inner-ctx-editor" data-field="innerPassage" class="min-h-[40px] p-2 border border-slate-200 rounded-xl outline-none text-[14px] leading-relaxed focus:border-blue-300 transition-colors bg-white shadow-inner" contenteditable="true">
                            ${d.innerPassage || ''}
                        </div>
                     </div>

                     <!-- Image (Hidden) -->
                     <div id="${id}-img-u" class="${d.imgUrl ? '' : 'hidden'} mt-2">
                          ${renderImageUploader(id, d)} 
                     </div>
                 </div>

                 <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 mt-4">
                    ${isObj
                    ? `<div class="flex justify-between items-center mb-3">
                               <label class="text-[14px] font-bold text-slate-700">보기 및 정답</label>
                               <div class="flex items-center gap-2">
                                   <select id="${id}-label-type" data-field="labelType" onchange="convertAnswerOnLabelChange('${id}', this.value)" class="p-1 px-2 text-[14px] border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white">
                                       <option value="number" ${labelType === 'number' ? 'selected' : ''}>1~5</option>
                                       <option value="alpha"  ${labelType === 'alpha'  ? 'selected' : ''}>A~E</option>
                                   </select>
                                   <select id="${id}-choice-count" onchange="renderBuilderChoices('${id}', this.value)" class="p-1 px-2 text-[14px] border border-slate-300 rounded-lg outline-none focus:border-blue-500">
                                       <option value="2" ${optCount === 2 ? 'selected' : ''}>2개</option>
                                       <option value="3" ${optCount === 3 ? 'selected' : ''}>3개</option>
                                       <option value="4" ${optCount === 4 ? 'selected' : ''}>4개</option>
                                       <option value="5" ${optCount === 5 ? 'selected' : ''}>5개</option>
                                   </select>
                               </div>
                           </div>
                           <div id="${id}-choices" class="grid grid-cols-2 gap-2 mb-4">
                                ${optArr.map(n => {
                                    const _lbl = labelType === 'alpha' ? _alphaLabels[n-1] : String(n);
                                    return `<div class="flex items-center gap-2 group">
                                       <span class="text-[14px] w-5 font-bold text-slate-400">${_lbl}.</span>
                                       <textarea id="${id}-choice-${n}" data-field="choice" data-index="${n}" rows="1" oninput="autoResize(this)"
                                              class="flex-1 p-2 text-[14px] bg-slate-50 border border-slate-200 rounded-lg overflow-hidden resize-none" style="min-height: 40px;">${(d.options && d.options[n - 1]) || ''}</textarea>
                                    </div>`;
                                }).join('')}
                           </div>
                           <div class="flex items-center gap-3">
                               <label class="text-[14px] font-bold text-blue-600">정답 ${labelType === 'alpha' ? '알파벳' : '번호'}:</label>
                               <input type="text" id="${id}-answer" data-field="answer" value="${d.answer || ''}" placeholder="${labelType === 'alpha' ? 'A/B/C/D/E' : '1~5'}" class="w-20 p-2 text-center text-[14px] font-bold border border-blue-200 rounded-lg">
                           </div>
`
                    : `<label class="text-[14px] font-bold text-slate-700 mb-2 block">정답 (채점용 핵심 키워드)</label>
                           <textarea id="${id}-answer" data-field="answer" rows="1" oninput="autoResize(this)" class="${inputClass} overflow-hidden resize-none mb-4" style="min-height: 42px;" placeholder="키워드 정답을 입력하세요.">${d.answer || ''}</textarea>
                       <label class="text-[14px] font-bold text-slate-700 mb-2 block">모범 답안 (서술형 전체 풀이)</label>
                           <textarea id="${id}-modelAnswer" data-field="modelAnswer" rows="1" oninput="autoResize(this)" class="${inputClass} overflow-hidden resize-none" style="min-height: 42px;" placeholder="상세 풀이 및 모범 답안을 입력하세요.">${d.modelAnswer || ''}</textarea>`
                }
                 </div>
            `;

        default: return '';
    }
}

// [Robust Fix] Helper for Image Uploader to include data-field (if accessed via querySelector)
// But wait, renderImageUploader is inside getComponentHtml mostly.
// We should update it too.

// --- Revised Serialization Logic using data-fields ---

function serializeBuilderState() {
    console.group("serializeBuilderState Debug");
    const blocks = document.querySelectorAll('.builder-item');
    const state = [];

    blocks.forEach(block => {
        const type = block.getAttribute('data-type');
        const id = block.id;
        let val = {};

        try {
            if (type === 'cat') {
                val = { catId: block.querySelector('[data-field="catId"]')?.value || '' };
            } else if (type === 'bundle' || type === 'passage') {
                val = {
                    title: block.querySelector('[data-field="title"]')?.value || '',
                    html: stripTwStyles(block.querySelector('[data-field="html"]')?.innerHTML || '')
                };
            } else if (type === 'obj' || type === 'subj') {
                val = {
                    sec: block.querySelector('[data-field="section"]')?.value || 'Reading',
                    sub: block.querySelector('[data-field="subtype"]')?.value || '기타', // SubType Fixed
                    diff: block.querySelector('[data-field="difficulty"]')?.value || '중',
                    score: block.querySelector('[data-field="score"]')?.value || 3,
                    text: block.querySelector('[data-field="text"]')?.value || '', // Storing as 'text' directly
                    answer: block.querySelector('[data-field="answer"]')?.value || '',
                    modelAnswer: block.querySelector('[data-field="modelAnswer"]')?.value || '', // Collect Model Answer
                    options: []
                };

                if (type === 'obj') {
                    // Query all choices in order
                    const choices = block.querySelectorAll('[data-field="choice"]');
                    choices.forEach(ch => val.options.push(ch.value));
                    // labelType 수집 ('number' | 'alpha')
                    const ltSel = block.querySelector('[data-field="labelType"]');
                    val.labelType = ltSel ? ltSel.value : 'number';
                }
            }
            // Log found data
            console.log(`Block[${type}]ID: ${id} `, val);
            if (!val.text && (type === 'obj' || type === 'subj')) console.warn(`⚠️ Empty text for question ${id}`);

            state.push({ type, data: val });
        } catch (e) {
            console.error("Serialize Error on block", id, e);
        }
    });
    console.groupEnd();
    return state;
}



// Helpers for Component Rendering
// [Fix] 라벨 타입 변경 시 정답 자동 변환 (1→A, 2→B ... / A→1, B→2 ...)
function convertAnswerOnLabelChange(itemId, newType) {
    const ansInput = document.getElementById(itemId + '-answer');
    if (ansInput) {
        const cur = ansInput.value.trim();
        const numToAlpha = { '1':'A','2':'B','3':'C','4':'D','5':'E' };
        const alphaToNum = { 'A':'1','B':'2','C':'3','D':'4','E':'5' };
        if (newType === 'alpha' && numToAlpha[cur]) {
            ansInput.value = numToAlpha[cur]; // 숫자 → 알파벳
        } else if (newType === 'number' && alphaToNum[cur.toUpperCase()]) {
            ansInput.value = alphaToNum[cur.toUpperCase()]; // 알파벳 → 숫자
        }
    }
    // 보기 라벨 재렌더
    const countSel = document.getElementById(itemId + '-choice-count');
    renderBuilderChoices(itemId, countSel ? countSel.value : 5);
}

function renderBuilderChoices(itemId, n) {
    const container = document.getElementById(itemId + '-choices');
    if (!container) return;

    const _alphaLabels = ['A','B','C','D','E'];
    const labelTypeSel = document.getElementById(itemId + '-label-type');
    const lType = labelTypeSel ? labelTypeSel.value : 'number';

    let html = '';
    for (let i = 1; i <= n; i++) {
        const inputId = `${itemId}-choice-${i}`;
        const existing = document.getElementById(inputId);
        const val = existing ? existing.value : '';
        const lbl = lType === 'alpha' ? _alphaLabels[i - 1] : String(i);

        html += `
                <div class="flex items-center gap-2 group">
                <span class="text-[14px] text-slate-400 font-bold w-5 group-hover:text-blue-500 transition-colors">${lbl}.</span>
                <textarea id="${inputId}" data-field="choice" data-index="${i}" rows="1" oninput="autoResize(this)"
                       class="flex-1 p-2 text-[14px] bg-slate-50 border border-slate-200 rounded-lg focus:border-blue-500 outline-none transition-all overflow-hidden resize-none" style="min-height: 40px;">${val}</textarea>
             </div>
                `;
    }
    container.innerHTML = html;

    // 정답 입력 validation 갱신 (보기 수 기반)
    const ansInput = document.getElementById(itemId + '-answer');
    if (ansInput) {
        const alphaLabels = ['A','B','C','D','E'];
        const maxAlpha = alphaLabels[Number(n) - 1] || 'E';

        if (lType === 'alpha') {
            ansInput.type = 'text';
            ansInput.maxLength = 1;
            ansInput.placeholder = 'A~' + maxAlpha;
            // 허용 알파벳 목록 저장 (oninput에서 참조)
            ansInput.setAttribute('data-allowed', alphaLabels.slice(0, Number(n)).join(''));
            ansInput.oninput = function() {
                const allowed = this.getAttribute('data-allowed') || 'ABCDE';
                const v = this.value.toUpperCase();
                if (v && !allowed.includes(v)) {
                    this.value = '';
                    this.classList.add('border-red-400', 'bg-red-50');
                    setTimeout(() => this.classList.remove('border-red-400', 'bg-red-50'), 800);
                } else {
                    this.value = v; // 항상 대문자 유지
                }
            };
        } else {
            ansInput.type = 'number';
            ansInput.min = 1;
            ansInput.max = Number(n);
            ansInput.placeholder = '1~' + n;
            ansInput.removeAttribute('data-allowed');
            ansInput.oninput = null;
        }

        // 기존 값이 범위를 벗어나면 초기화
        const cur = ansInput.value;
        if (lType === 'alpha') {
            const allowed = alphaLabels.slice(0, Number(n));
            if (cur && !allowed.includes(cur.toUpperCase())) ansInput.value = '';
        } else {
            if (cur && (Number(cur) < 1 || Number(cur) > Number(n))) ansInput.value = '';
        }
    }
}
function renderMiniToolbar(targetId) {
    return `
                <div class="flex gap-1 flex-wrap" onmousedown="event.preventDefault()">
             <button onclick="execCmd('bold')" class="p-1 hover:bg-slate-200 rounded text-[14px] font-bold w-6 h-6 flex items-center justify-center">B</button>
             <button onclick="execCmd('underline')" class="p-1 hover:bg-slate-200 rounded text-[14px] underline w-6 h-6 flex items-center justify-center">U</button>
             <div class="w-px h-4 bg-slate-300 mx-1 self-center"></div>
             <button onclick="insertSymbol('★')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">★</button>
             <button onclick="insertSymbol('→')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">→</button>
             <button onclick="insertSymbol('※')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">※</button>
             <div class="w-px h-4 bg-slate-300 mx-1 self-center"></div>
             <button onclick="insertSymbol('①')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">①</button>
             <button onclick="insertSymbol('②')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">②</button>
             <button onclick="insertSymbol('③')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">③</button>
             <button onclick="insertSymbol('④')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">④</button>
             <button onclick="insertSymbol('⑤')" class="p-1 hover:bg-slate-200 rounded text-[14px] w-6 h-6 flex items-center justify-center">⑤</button>
        </div>
                `;
}

function renderSubTypeOptions(section, selected) {
    const list = SUB_TYPE_MAP[section] || [];
    let html = `<option value="" disabled ${!selected ? 'selected' : ''}>세부영역</option>`;
    if (list.length === 0 && !section) return html; // Return just default if no section
    return html + (list.length ? list : ["기타"]).map(item => `<option value="${item}" ${item === selected ? 'selected' : ''}>${item}</option>`).join('');
}

function handleBundleLinkInput(bundleId, value) {
    const zoneB = document.getElementById('zone-question');
    const questions = Array.from(zoneB.querySelectorAll('.builder-item'));

    // Parse input "1, 2, 3" -> [1, 2, 3]
    const targetNums = value.split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);

    // [New] Conflict Validation & Invalid ID Check
    let validCount = 0;
    for (const num of targetNums) {
        if (num > 0 && num <= questions.length) {
            validCount++;
            const q = questions[num - 1]; // 0-based
            const existingBundleId = q.getAttribute('data-bundle-id');
            // If linked to a DIFFERENT bundle
            if (existingBundleId && existingBundleId !== bundleId) {
                alert("이미 연결된 묶음카드가 있습니다.");
                return; // Abort entirely
            }
        }
    }

    if (validCount === 0 && targetNums.length > 0) {
        alert("문항이 없습니다.");
        return;
    }

    const linkedIds = [];

    // Reset previous links for this bundle
    questions.forEach(q => {
        if (q.getAttribute('data-bundle-id') === bundleId) {
            q.removeAttribute('data-bundle-id');
            // Remove Badge
            const titleH4 = q.querySelector('h4');
            if (titleH4) {
                const badge = titleH4.querySelector('.linked-badge');
                if (badge) badge.remove();
            }
        }
    });

    // Link new targets
    targetNums.forEach(num => {
        // Find question with this number (1-based index)
        if (num > 0 && num <= questions.length) {
            const targetQ = questions[num - 1]; // num is 1-based, index is 0-based
            if (targetQ) {
                targetQ.setAttribute('data-bundle-id', bundleId);
                linkedIds.push(targetQ.id);
            }
        }
    });

    // Store state on Bundle Element
    const bundleEl = document.getElementById(bundleId);
    if (bundleEl) {
        bundleEl.setAttribute('data-linked-ids', JSON.stringify(linkedIds));
    }

    // Trigger Update to Refresh UI (Nav, counts, link badges)
    updateQuestionNumbers();
}

// [New] Handle Disconnect
function handleBundleDisconnect(bundleId) {
    if (!confirm("이 묶음에 연결된 모든 문항의 연결을 해제하시겠습니까?")) return;

    const zoneB = document.getElementById('zone-question');
    const questions = Array.from(zoneB.querySelectorAll('.builder-item'));

    questions.forEach(q => {
        if (q.getAttribute('data-bundle-id') === bundleId) {
            q.removeAttribute('data-bundle-id');
            q.removeAttribute('data-set-num'); // Clear set num ref
            // Remove Badge from Title
            const header = q.querySelector('div.flex.items-center.gap-3');
            if (header) {
                const badge = header.querySelector('.bundle-badge');
                if (badge) badge.remove();
            }
        }
    });

    // Clear Bundle Data
    const bundleEl = document.getElementById(bundleId);
    if (bundleEl) {
        bundleEl.setAttribute('data-linked-ids', '[]');

        // Remove #Set Badge from Bundle Header if exists
        const h4 = bundleEl.querySelector('h4');
        const setBadge = h4 ? h4.querySelector('.bundle-set-num') : null;
        if (setBadge) setBadge.remove(); // Or text empty? If we remove, syncBundles recreates it if needed. 
        // Actually syncBundles will recreate it because it iterates ALL bundles.
        // But since data-linked-ids is empty, syncBundles won't find questions for it?
        // Wait, syncBundles assigns Set # regardless of linking?
        // Yes, "bundles.forEach((bundle, idx) => setNum = idx+1".
        // So the Set # badge on the bundle itself should PERSIST even if empty?
        // "묶음카드를 지우면 연결된 문항의 Set이 안사라지고..." was the previous issue.
        // Now we are just unlinking. The Bundle still exists. So it IS "Set 1". It just has 0 questions.
        // So we do NOT remove the set badge from the bundle title. It stays "Set 1" (Empty).
    }

    // Clear Input
    const input = document.getElementById(bundleId + '-link-input');
    if (input) input.value = '';

    updateQuestionNumbers();
    // alert("연결이 해제되었습니다."); // Removed
}

function updateSubTypes(id, section) {
    const el = document.getElementById(id + '-subtype');
    if (el) {
        el.innerHTML = renderSubTypeOptions(section, '');
        // [New] Reset background to empty state (amber-50) since value is reset
        el.className = el.className.replace('bg-white', '').replace('bg-amber-50', '') + ' bg-amber-50';
    }
}

function renderAudioUploader(id, d) {
    return `
        <div class="flex flex-col gap-2">
            <label class="flex items-center gap-2 cursor-pointer bg-white border border-dashed border-green-300 rounded p-2 hover:bg-green-50 transition-all justify-center">
                <span class="text-sm">📂 Upload Audio</span>
                <input type="file" id="${id}-audio-file" data-field="audio-file" class="hidden" accept="audio/*" onchange="previewBuilderAudio(this, '${id}')">
            </label>
            <!-- [Fix] 기존 오디오 URL/FileId를 DOM에 보존 (이미지 방식과 동일) -->
            <input type="hidden" data-field="audioUrl"    value="${d.audioUrl    || ''}">
            <input type="hidden" data-field="audioFileId" value="${d.audioFileId || ''}">
            <div id="${id}-audio-preview" data-field="audio-preview" class="${d.audioUrl ? '' : 'hidden'} flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded">
                <span class="text-green-600 text-sm">🎵</span>
                <span id="${id}-audio-name" class="text-sm font-bold text-green-700 truncate">${d.audioFileName || (d.audioUrl ? '업로드됨' : '')}</span>
                <button type="button" onclick="clearBuilderAudio('${id}')" class="ml-auto text-slate-400 hover:text-red-500 text-sm font-bold">✕</button>
            </div>
        </div>
    `;
}

function previewBuilderAudio(input, id) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 60 * 1024 * 1024) { showToast('⚠️ 60MB 초과 파일은 업로드 불가'); input.value=''; return; }
    const nameEl = document.getElementById(id+'-audio-name');
    const prev = document.getElementById(id+'-audio-preview');
    if (nameEl) nameEl.textContent = file.name;
    if (prev) prev.classList.remove('hidden');
}

function clearBuilderAudio(id) {
    const inp = document.getElementById(id+'-audio-file'); if(inp) inp.value='';
    const prev = document.getElementById(id+'-audio-preview'); if(prev) prev.classList.add('hidden');
    const n = document.getElementById(id+'-audio-name'); if(n) n.textContent='';
    // [Fix] hidden input도 초기화 (✕ 클릭 시 기존 URL 삭제)
    const urlInp  = prev ? prev.parentElement.querySelector('[data-field="audioUrl"]')    : null;
    const fidInp  = prev ? prev.parentElement.querySelector('[data-field="audioFileId"]') : null;
    if(urlInp)  urlInp.value  = '';
    if(fidInp)  fidInp.value  = '';
}

function playBundleAudio(btn, bundleId) {
    window._audioPlaysUsed = window._audioPlaysUsed || {};
    const maxPlay = parseInt(btn.dataset.maxPlay) || 1;
    const used = window._audioPlaysUsed[bundleId] || 0;
    const left = maxPlay - used;
    if (left <= 0) { showToast('⚠️ 재생 횟수를 모두 사용했습니다.'); return; }
    if (!confirm('지정된 횟수만큼만 재생할 수 있으며, 일시정지, 빨리감기, 뒤로감기 등의 기능은 할 수가 없습니다.')) return;
    window._audioPlaysUsed[bundleId] = used + 1;
    const newLeft = left - 1;
    const sp = btn.querySelector('.plays-left'); if (sp) sp.textContent = newLeft;
    if (newLeft <= 0) { btn.disabled = true; btn.classList.add('opacity-50', 'cursor-not-allowed'); }
    const audio = document.getElementById('audio-elem-' + bundleId);
    const playerDiv = document.getElementById('audio-player-' + bundleId);
    const progressBar = document.getElementById('audio-progress-' + bundleId);
    const timeEl = document.getElementById('audio-time-' + bundleId);
    const statusEl = document.getElementById('audio-status-' + bundleId);
    if (!audio) { showToast('오디오 요소를 찾을 수 없습니다.'); return; }
    if (playerDiv) playerDiv.classList.remove('hidden');
    if (statusEl) statusEl.textContent = '⏳ 로딩중...';
    const fileId = btn.dataset.fileId || '';
    if (!fileId) { showToast('오디오 파일 ID 없음'); return; }
    if (!audio._audInit) {
        audio._audInit = true;
        audio.addEventListener('timeupdate', function() {
            if (audio.duration && progressBar) {
                progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
                if (timeEl) { const m=Math.floor(audio.currentTime/60),s=Math.floor(audio.currentTime%60); timeEl.textContent=m+':'+(s<10?'0':'')+s; }
            }
        });
        audio.addEventListener('ended', function() {
            if (statusEl) { statusEl.textContent = '✅ 완료'; statusEl.style.color = '#94a3b8'; }
            if (progressBar) progressBar.style.width = '100%';
            window.onbeforeunload = null;
        });
    }
    // 프리로드 캐시 확인 → 히트 시 즉시 재생
    const _cached = window._preloadedAudioCache && window._preloadedAudioCache[bundleId];
    if (_cached) {
        if (statusEl) statusEl.textContent = '▶ 재생중';
        audio.src = _cached;
        audio.currentTime = 0;
        const pp = audio.play();
        if (pp !== undefined) pp.catch(function(e) { showToast('재생 실패: ' + e.message); });
        window.onbeforeunload = function(e) { e.preventDefault(); return '듣기가 재생 중입니다.'; };
        return;
    }
    // 캐시 미스 → GAS 프록시로 base64 가져와 blob URL 생성
    sendReliableRequest({ type: 'GET_AUDIO_B64', fileId: fileId })
        .then(function(res) {
            if (!res || res.status !== 'Success' || !res.data) {
                showToast('오디오 로드 실패: ' + (res && res.message || '알 수 없음'));
                if (statusEl) statusEl.textContent = '⚠️ 오류';
                return;
            }
            const byteStr = atob(res.data);
            const ab = new ArrayBuffer(byteStr.length);
            const ia = new Uint8Array(ab);
            for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
            const blob = new Blob([ab], { type: res.mimeType || 'audio/mpeg' });
            const blobUrl = URL.createObjectURL(blob);
            audio.src = blobUrl;
            audio.currentTime = 0;
            if (statusEl) statusEl.textContent = '▶ 재생중';
            const pp = audio.play();
            if (pp !== undefined) pp.catch(function(e) { showToast('재생 실패: ' + e.message); });
            window.onbeforeunload = function(e) { e.preventDefault(); return '듣기가 재생 중입니다.'; };
        })
        .catch(function(err) {
            showToast('오디오 요청 오류: ' + err.message);
            if (statusEl) statusEl.textContent = '⚠️ 오류';
        });
}

function renderImageUploader(id, d, size = 'normal') {
    const height = size === 'small' ? 'h-24' : 'h-40';
    return `
                <div class="flex flex-col gap-2">
             <label class="flex items-center gap-2 cursor-pointer bg-white border border-dashed border-slate-300 rounded p-2 hover:bg-blue-50 transition-all justify-center">
                 <span class="text-sm">📂 Upload</span>
                 <input type="file" id="${id}-file" data-field="file" class="hidden" accept="image/*" onchange="previewBuilderImg(this, '${id}')">
             </label>
             <div id="${id}-preview" data-field="preview" class="${(d.imgUrl && d.imgUrl !== 'undefined' && d.imgUrl !== 'null') ? '' : 'hidden'} relative mt-1 border rounded bg-slate-100 overflow-hidden">
                 <img src="${(d.imgUrl && d.imgUrl !== 'undefined' && d.imgUrl !== 'null') ? fixDriveUrl(d.imgUrl) : ''}" class="${height} object-contain mx-auto" referrerpolicy="no-referrer">
                 <button onclick="clearBuilderImg('${id}')" class="absolute top-1 right-1 bg-white rounded-full p-1 text-red-500 shadow hover:bg-red-50 text-xs">❌</button>
             </div>
        </div>
                `;
}


// [Sanitizer] contenteditable innerHTML 저장 시 Tailwind --tw-* CSS 변수 제거
// 이유: 브라우저가 DOM 요소에 자동 주입하는 --tw-* 변수들이 innerHTML에 포함돼
//       구글 시트 저장 시 셀이 비대해지는 문제 방지. 사용자 서식(볼드 등)은 보존.
function stripTwStyles(html) {
    if (!html) return html;
    // 1. style 속성 내 --tw-로 시작하는 선언들만 제거 (다른 인라인 스타일은 보존)
    let cleaned = html.replace(/style="([^"]*)"/gi, function(match, styleContent) {
        const filtered = styleContent
            .split(';')
            .filter(function(decl) { return decl.trim() && !decl.trim().startsWith('--tw-'); })
            .join(';')
            .replace(/;+$/, '')
            .trim();
        return filtered ? 'style="' + filtered + '"' : '';
    });
    // 2. 줄바꿈 제거 (구글 시트에서 셀이 거대해지는 원인)
    cleaned = cleaned.replace(/\r?\n/g, '');
    // 3. 선행/후행 빈 태그 제거 (셀 시작 공란 원인: <div></div>, <br>, <p></p> 등)
    cleaned = cleaned.replace(/^(\s*<(div|p|span|br)\s*\/?\s*>\s*<\/(div|p|span)>\s*|<br\s*\/?\s*>\s*)+/gi, '');
    cleaned = cleaned.replace(/(\s*<(div|p|span|br)\s*\/?\s*>\s*<\/(div|p|span)>\s*|<br\s*\/?\s*>\s*)+$/gi, '');
    return cleaned.trim();
}
// Utility
function autoResize(el) {
    // [Fix v3] scroll-behavior:smooth 차단 + 모든 스크롤 부모 일괄 저장/복원
    // 원인: obj/subj 카드가 zone-question 뷰포트를 초과할 때, height:auto 로 순간 축소 시
    //       브라우저가 scrollTop을 0으로 클램핑하고, scroll-smooth 로 인해 복귀 애니메이션 발동
    //       → "위로 갔다가 돌아오는" 현상
    // 해결: height 변경 전 모든 스크롤 부모의 scrollBehavior를 auto로 즉시 강제 → 즉시 scrollTop 복원
    const scrollParents = [];
    let p = el.parentElement;
    while (p) {
        const ov = getComputedStyle(p).overflowY;
        if (ov === 'auto' || ov === 'scroll') {
            const savedBehavior = p.style.scrollBehavior;
            p.style.scrollBehavior = 'auto'; // smooth 애니메이션 즉시 차단
            scrollParents.push({ el: p, top: p.scrollTop, behavior: savedBehavior });
        }
        p = p.parentElement;
    }

    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';

    // scrollTop 즉시 복원 후 scrollBehavior 원상복구
    scrollParents.forEach(sp => {
        sp.el.scrollTop = sp.top;
        sp.el.style.scrollBehavior = sp.behavior;
    });
}

// [New] Google Drive URL Fixer
// [New] Google Drive URL Fixer
function fixDriveUrl(url) {
    if (!url || typeof url !== 'string') return "";

    // [Student View Sync] 썸네일 엔드포인트 사용 (보안 우회)
    // script.js Line 423 getSafeImageUrl -> convertToDirectLink 로직과 동일화
    const patterns = [
        /file\/d\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /folders\/([a-zA-Z0-9-_]+)/,
        /open\?id=([a-zA-Z0-9-_]+)/,
        /uc\?.*id=([a-zA-Z0-9-_]+)/
    ];

    for (let pattern of patterns) {
        let match = url.match(pattern);
        if (match && match[1]) {
            // sz=w1000 은 고해상도 요청
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
        }
    }
    return url;
}

// Builder Image Helpers
function previewBuilderImg(input, id) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const MAX_MB = 1;
        const MAX_BYTES = MAX_MB * 1024 * 1024;

        // [이미지 용량 제한] 1MB 초과 시 즉시 차단
        if (file.size > MAX_BYTES) {
            showToast(`⚠️ 이미지 용량 초과! 1MB 이하 파일만 등록 가능합니다.\n(현재 파일: ${(file.size / 1024 / 1024).toFixed(1)}MB)`);
            input.value = ''; // 파일 선택 초기화
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById(`${id}-preview`);
            const img = preview.querySelector('img');
            img.src = e.target.result;
            preview.classList.remove('hidden');
        }
        reader.readAsDataURL(file);
    }
}

function clearBuilderImg(id) {
    const input = document.getElementById(`${id}-file`);
    if (input) input.value = '';
    const preview = document.getElementById(`${id}-preview`);
    if (preview) {
        preview.classList.add('hidden');
        preview.querySelector('img').src = '';
    }
}


// --- Edit Form Builder (New 08-2) ---
// --- Edit Form Builder (New 07-2) ---
function renderEditForm(qId) {
    const q = globalConfig.questions.find(item => item.id === qId);
    if (!q) return showToast("⚠️ 문항 정보를 찾을 수 없습니다.");

    // [Fix] 직전 카테고리 ID 보존 (Cancel 복귀용)
    window._editReturnCatId = q.catId || curCatId || '';

    setCanvasId('08-2');
    const c = document.getElementById('dynamic-content');

    // [Fix] app-canvas 패딩 제거 (07-2 콘텐츠 영역 최대화, 사이드바는 유지)
    const ac = document.getElementById('app-canvas');
    if (ac) ac.style.padding = '0';
    document.getElementById('app-canvas').classList.add('!overflow-hidden');

    // Make layout structurally identical to 07-1 (Split View 3:6:1) for builder compatibility
    c.classList.add('h-full');
    c.innerHTML = `
        <!-- [Edit Mode Layout] 100% height to fit within header/footer -->
        <div style="width: 100%; height: 100%; background-color: #f8fafc; position: relative; overflow: hidden;">
            
            <!-- Builder Header (Block Element, Fixed Height) -->
            <div id="builder-header" style="display: flex; align-items: center; justify-content: space-between; width: 100%; height: 60px; background-color: white; border-bottom: 1px solid #e2e8f0; z-index: 500; position: relative; padding: 0 24px;">
                 <!-- Left: Title -->
                 <div class="flex items-center gap-4">
                    <h2 class="font-bold bg-[#013976] text-white px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2" style="font-size: 17px;">
                        <span class="text-xl">✏️</span> Edit Mode
                    </h2>
                    <div class="flex items-center gap-2">
                        <span class="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded text-sm font-bold shadow-sm border border-indigo-100">
                            ID: ${qId}
                        </span>
                    </div>
                </div>

                 <!-- Center: Hidden Toolbar -->
                 <div class="flex items-center gap-2 flex-1 justify-center opacity-50 pointer-events-none select-none">
                     <span class="text-sm font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200">
                         ℹ️ 수정 모드에서는 해당 문항 및 소속 지문만 수정 가능합니다.
                     </span>
                 </div>
                
                <!-- Right: Actions -->
                <div class="flex items-center gap-2">
                    <button onclick="updateBuilderQuestion('${qId}')" class="btn-ys !bg-teal-600 !text-white shadow-md hover:brightness-110 !px-4 !py-1.5 !text-sm !h-auto !rounded shrink-0 flex items-center gap-2 font-bold">
                        💾 Update
                    </button>
                    
                    <button onclick="exitEditMode()" class="btn-ys !bg-slate-100 !text-slate-500 !border-slate-200 hover:bg-slate-200 hover:text-slate-700 shadow-none !px-3 !py-1.5 !text-sm !h-auto !rounded shrink-0">
                        ✖ Cancel
                    </button>
                </div>
            </div>
    
              <!-- Builder Body (Calc Height based on 60px header) -->
              <div style="display: flex; width: 100%; height: calc(100% - 60px); background-color: #f8fafc; position: relative;">
                  
                  <!-- [Right] Form Builder 2-Column Split Layout for Edit Mode -->
                  <div id="builder-main-area" class="flex-1 w-full relative px-6 pb-6 pt-3 h-full">
                      <input type="hidden" data-field="catId" value="${q.catId || ''}">
                      <div class="h-full grid grid-cols-[3.5fr_6.5fr] gap-6">
                          
                          <!-- Zone A: Bundle (35%) -->
                          <div class="flex flex-col h-full overflow-hidden">
                              <div class="mb-3 font-bold text-sm flex items-center gap-2 flex-none h-8">
                                  <span class="text-[17px] text-[#013976]">📦 Bundles</span>
                              </div>
                              <div id="zone-bundle" class="flex-1 min-h-0 bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl p-4 space-y-4 scroll-smooth overflow-y-auto">
                                  <div id="placeholder-bundle" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                                      <span class="text-3xl mb-2">📦</span>
                                      <span class="text-[14px]">연결된 지문이 없습니다</span>
                                  </div>
                              </div>
                          </div>

                          <!-- Zone B: Questions (65%) -->
                          <div class="flex flex-col h-full overflow-hidden">
                             <div class="mb-3 font-bold text-sm flex items-center gap-2 flex-none h-8">
                                  <span class="text-[17px] text-[#013976]">📝 Questions</span>
                                  <div id="section-stats" class="flex items-center gap-2 ml-2 overflow-x-auto no-scrollbar"></div>
                              </div>
                              <div id="zone-question" class="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl p-4 space-y-4 shadow-inner relative scroll-smooth overflow-y-auto">
                                  <div id="placeholder-question" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60" style="display:none;">
                                      <span class="text-3xl mb-2">📝</span>
                                      <span class="text-[14px]">문항 렌더링 중...</span>
                                  </div>
                              </div>
                          </div>

                      </div>
                  </div>

              </div>
          </div>
      `;

    // [Fix] DOM 렌더링 완료 후 컴포넌트 초기화 (초기 렌더링 지연 방지)
    setTimeout(() => {

    // 1. If part of a Bundle, load Bundle into Zone A
    let bundleIdToLoad = q.setId;
    if (bundleIdToLoad && bundleIdToLoad !== "") {
        const bundleInfo = (globalConfig.bundles || []).find(b => b.id === bundleIdToLoad);
        if (bundleInfo) {
            // [Fix] Sanitize Passage (Empty HTML Check) — 07-1과 동일
            let rawHtml = bundleInfo.text || "";
            if (rawHtml.replace(/<[^>]*>/g, '').trim() === '' && !rawHtml.includes('<img')) {
                rawHtml = "";
            }

            addComponent('bundle', {
                id: bundleInfo.id,
                groupId: bundleInfo.id, // [Fix] Preserve Original UUID as Group ID — 07-1과 동일
                title: bundleInfo.title || '지문 묶음',
                html: rawHtml,
                imgUrl: (bundleInfo.imgUrl && bundleInfo.imgUrl !== 'undefined' && bundleInfo.imgUrl !== 'null') ? fixDriveUrl(bundleInfo.imgUrl) : "",
                audioUrl: bundleInfo.audioUrl || "",       // [Fix] 오디오 표시 복원
                audioFileId: bundleInfo.audioFileId || "", // [Fix] 오디오 표시 복원
                audioMaxPlay: bundleInfo.audioMaxPlay || 1  // [Fix] 오디오 표시 복원
            });
        }
    }

    // 2. Load Question into Zone B
    // [ROOT CAUSE FIX] DB(GET_FULL_DB)가 반환하는 필드: type, choices, title, text, imgUrl
    // 07-1 패턴: q.type === '객관형' ? 'obj' : 'subj'
    const qType = q.type || q.questionType || '';
    let type = (qType.includes('객관') || qType === 'obj') ? 'obj' : 'subj';
    // fallback: choices 존재 시 무조건 obj
    if (type === 'subj' && q.choices && Array.isArray(q.choices) && q.choices.length > 0) {
        type = 'obj';
    }
    console.log('[07-2 Debug] q.type:', q.type, '→ resolved:', type);

    addComponent(type, {
        id: q.id,
        no: q.no,        // [Fix] 원본 문항번호 전달 (편집 모드 Q번호 표시용)
        sec: q.section,
        sub: q.subType,
        diff: q.difficulty,
        score: q.score,
        text: q.title,
        innerPassage: (q.text && q.text.replace(/<[^>]*>/g, '').trim() === '' && !q.text.includes('<img')) ? "" : q.text,
        answer: q.answer,
        modelAnswer: q.modelAnswer,
        options: q.choices,
        imgUrl: (q.imgUrl && q.imgUrl !== 'undefined' && q.imgUrl !== 'null') ? fixDriveUrl(q.imgUrl) : "",
        labelType: q.labelType || 'number',
        isLinked: bundleIdToLoad ? true : false,
        linkedGroupId: bundleIdToLoad || ''
    });

    // Link in DOM (07-1과 동일)
    if (bundleIdToLoad) {
        const qEl = document.getElementById(q.id);
        if (qEl) qEl.setAttribute('data-bundle-id', bundleIdToLoad);
    }

    }, 100); // DOM 안정화 대기
}

// [New] Exit Edit Mode → Return to previous bank view with category selected
function exitEditMode(skipConfirm = false) {
    // [Fix] 저장 완료 후 호출 시(skipConfirm=true)에는 확인 팝업 생략
    if (!skipConfirm && !confirm("작성 중인 내용은 저장되지 않습니다. 나가시겠습니까?")) return;

    // Restore app-canvas padding
    const ac = document.getElementById('app-canvas');
    if (ac) ac.style.padding = '';

    // Restore layout
    document.getElementById('app-canvas').classList.remove('!overflow-hidden');
    document.body.classList.add('has-sidebar');

    // Return to Bank with previous category auto-selected
    const returnCatId = window._editReturnCatId || '';

    // Set curCatId BEFORE renderBank so the select renders with correct selection
    if (returnCatId) curCatId = returnCatId;
    renderBank();

    if (returnCatId) {
        // Trigger category load to show question list
        setTimeout(() => {
            handleBankCategoryChange(returnCatId);
        }, 200);
    }
}

// [SAFE] Partial Update Logic — Only modifies the specific row in the sheet
async function updateBuilderQuestion(originalId) {
    try {
        if (!originalId) throw new Error("수정할 문항 ID가 없습니다.");

        const result = await collectBuilderData(); // From UI
        if (!result.groups || result.groups.length === 0) throw new Error("수정 내용을 읽어올 수 없습니다.");

        const firstGroup = result.groups[0];
        if (!firstGroup || firstGroup.questions.length === 0) throw new Error("문항이 존재하지 않습니다.");

        // [Fix] origQ를 targetBundleId보다 먼저 선언 (순서 보장)
        const origQ = globalConfig.questions.find(q => q.id === originalId);
        if (!origQ) throw new Error("원본 문항을 로컬 저장소에서 찾을 수 없습니다.");

        const qInput = firstGroup.questions[0];
        const passageData = firstGroup.passage;
        const isGeneral = passageData.title === 'General';
        // [Fix] 07-1 setId 직접 참조 방식과 동일하게: origQ.setId(DB 원본 UUID) 우선 사용
        const targetBundleId = isGeneral ? "" : (origQ.setId || passageData.id || "");

        // [New] 변경사항 감지: 수정된 내용이 없으면 저장 불필요
        const choicesChanged = JSON.stringify(origQ.choices || []) !== JSON.stringify(qInput.choices || []);
        const questionChanged =
            String(origQ.section || '') !== String(qInput.sec || '') ||
            String(origQ.subType || '') !== String(qInput.sub || '') ||
            String(origQ.difficulty || '') !== String(qInput.diff || '') ||
            String(origQ.score || 0) !== String(qInput.score || 0) ||
            (origQ.title || '') !== (qInput.title || '') ||
            (origQ.answer || '') !== (qInput.answer || '') ||
            (origQ.modelAnswer || '') !== (qInput.modelAnswer || '') ||
            choicesChanged;

        // 번들이 있는 경우 지문 변경사항도 확인
        let bundleChanged = false;
        if (!isGeneral && targetBundleId) {
            const existingBundle = (globalConfig.bundles || []).find(b => b.id === targetBundleId);
            if (existingBundle) {
                bundleChanged =
                    (existingBundle.title || '') !== (passageData.title || '') ||
                    (existingBundle.text || '') !== (passageData.text || '');
            }
        }

        if (!questionChanged && !bundleChanged) {
            showToast("⚠️ 수정된 사항이 없습니다.");
            return;
        }

        if (!confirm("수정 내용을 저장하시겠습니까?")) return;

        toggleLoading(true);

        const category = globalConfig.categories.find(c => c.id === result.catId);
        if (!category) throw new Error("카테고리를 찾을 수 없습니다.");
        const parentFolderId = extractFolderId(category.targetFolderUrl);
        const categoryName = category.name;

        // --- Build question row data (same format as SAVE_FULL_TEST_DATA) ---
        const questionData = {
            no: origQ.no,           // 문항번호 (행 식별자)
            id: originalId,         // 프론트 ID (행 식별자 백업)
            section: qInput.sec || '',
            subType: qInput.sub || '',
            type: qInput.type || '객관식',
            difficulty: qInput.diff || '중',
            score: qInput.score || 0,
            title: qInput.title || '',           // 질문 내용 (발문)
            text: qInput.passageText || '',      // [Fix] innerPassage→passageText (parseQuestionBlock 키 일치)
            answer: qInput.answer || '',
            modelAnswer: qInput.modelAnswer || '',
            choices: qInput.choices || [],
            setId: targetBundleId,
            labelType: qInput.labelType || 'number'  // [Fix] 라벨타입 추가
        };

        // Image handling
        if (qInput.qImgData && qInput.qImgData.base64) {
            questionData.imgData = qInput.qImgData;
        } else if (qInput.qImg) {
            questionData.imgUrl = qInput.qImg;
        }

        // --- Build bundle data (if applicable) ---
        let bundleData = null;
        if (!isGeneral && targetBundleId) {
            bundleData = {
                id: targetBundleId,
                title: passageData.title || '',
                text: stripTwStyles(passageData.text || '')
            };
            if (passageData.imgData && passageData.imgData.base64) {
                bundleData.imgData = passageData.imgData;
            } else if (passageData.img) {
                bundleData.imgUrl = passageData.img;
            } else {
                const existingBundle = (globalConfig.bundles || []).find(b => b.id === targetBundleId);
                if (existingBundle && existingBundle.imgUrl) bundleData.imgUrl = existingBundle.imgUrl;
            }
            // 오디오 처리
            if (passageData.audioData && passageData.audioData.base64) {
                bundleData.audioData = passageData.audioData;
                bundleData.audioMaxPlay = passageData.audioMaxPlay || 1;
            } else {
                const existingBundleA = (globalConfig.bundles || []).find(b => b.id === targetBundleId);
                if (existingBundleA) {
                    if (existingBundleA.audioUrl) bundleData.audioUrl = existingBundleA.audioUrl;
                    if (existingBundleA.audioFileId) bundleData.audioFileId = existingBundleA.audioFileId;
                    bundleData.audioMaxPlay = passageData.audioMaxPlay || existingBundleA.audioMaxPlay || 1;
                }
            }
        }

        // --- Send to backend (Partial Update API) ---
        const payload = {
            type: 'UPDATE_QUESTION',
            parentFolderId: parentFolderId,
            categoryName: categoryName,
            question: questionData,
            bundle: bundleData  // null if no bundle
        };

        const resData = await sendReliableRequest(payload);

        if (resData.status === "Success") {
            // Clear local cache for this category (will re-fetch fresh data)
            globalConfig.questions = globalConfig.questions.filter(q => q.catId !== result.catId);
            globalConfig.bundles = (globalConfig.bundles || []).filter(b => b.catId !== result.catId);
            save();

            showToast("✅ 해당 문항만 안전하게 수정 완료! (다른 데이터 영향 없음)");
            exitEditMode(true); // [Fix] 저장 완료 후이므로 확인 팝업 생략
        } else {
            throw new Error(resData.message || "서버 부분 업데이트 실패");
        }

    } catch (e) {
        console.error(e);
        showToast("❌ 수정 실패: " + e.message);
    } finally {
        toggleLoading(false);
    }
}

// [New] Load Questions for Builder
async function loadQuestionsFromCategory(catId) {
    // If called from button without arg, get value
    if (!catId) {
        const sel = document.getElementById('reg-target-cat');
        if (sel) catId = sel.value;
    }

    if (!catId) {
        showToast("⚠️ 불러올 시험지(카테고리)를 선택해주세요.");
        return;
    }

    if (!confirm("⚠️ 새로운 시험지를 불러오면 현재 작성 중인 내용은 초기화됩니다. 계속하시겠습니까?")) {
        return;
    }

    toggleLoading(true);

    try {
        // 1. Fetch Data from Backend (Integrated DB)
        const category = globalConfig.categories.find(c => c.id === catId);
        if (!category) throw new Error("Category Not Found");

        const parentFolderId = extractFolderId(category.targetFolderUrl);
        const categoryName = category.name;

        const response = await sendReliableRequest({
            type: 'GET_FULL_DB',
            parentFolderId: parentFolderId,
            categoryName: categoryName
        });

        // 2. Parse & Update Global Config
        const fetchedQuestions = response.questions || [];
        const fetchedBundles = response.bundles || [];

        // Update Global State (Replace for this category)
        // Remove old questions/bundles for this category
        globalConfig.questions = globalConfig.questions.filter(q => q.catId !== catId);
        globalConfig.bundles = (globalConfig.bundles || []).filter(b => b.catId !== catId);

        fetchedQuestions.forEach(q => q.catId = catId);
        fetchedBundles.forEach(b => b.catId = catId);

        globalConfig.questions.push(...fetchedQuestions);
        globalConfig.bundles.push(...fetchedBundles);

        save(); // Persist to LocalStorage

        // 3. Clear Workspace
        const zoneB = document.getElementById('zone-question');
        const zoneA = document.getElementById('zone-bundle');
        const zoneC = document.getElementById('zone-navigator');
        if (zoneB) zoneB.innerHTML = '<div id="placeholder-question" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60"><span class="text-3xl mb-2">📝</span><span class="text-[14px]">문항 카드 추가</span></div>';
        if (zoneA) zoneA.innerHTML = '<div id="placeholder-bundle" class="h-full flex flex-col items-center justify-center text-slate-400 opacity-60"><span class="text-3xl mb-2">📦</span><span class="text-[14px]">지문 묶음 추가</span></div>';
        if (zoneC) zoneC.innerHTML = '';

        // 4. Render
        if (fetchedQuestions.length === 0) {
            showToast("📭 해당 카테고리에 저장된 문항이 없습니다.");
            return;
        }

        // Sort by Index/Number
        fetchedQuestions.sort((a, b) => (a.no || 0) - (b.no || 0));

        // Group by Bundle (SetID)
        const bundleMap = new Map();
        const orphans = [];

        fetchedQuestions.forEach(q => {
            if (q.setId && q.setId !== "") {
                if (!bundleMap.has(q.setId)) {
                    // Find Bundle Info
                    const bundleInfo = fetchedBundles.find(b => b.id === q.setId);

                    // [Fix] Sanitize Passage (Empty HTML Check)
                    // [Fix] imgUrl이 HTML이면 text로 교정 (컬럼 오염 복구)
                    if (bundleInfo?.imgUrl && bundleInfo.imgUrl.trim().startsWith('<')) {
                        if (!bundleInfo.text) bundleInfo = { ...bundleInfo, text: bundleInfo.imgUrl };
                        bundleInfo = { ...bundleInfo, imgUrl: '' };
                    }
                    let rawHtml = bundleInfo?.text || "";
                    // If text only contains tags/whitespace and no images, treat as empty
                    if (rawHtml.replace(/<[^>]*>/g, '').trim() === '' && !rawHtml.includes('<img')) {
                        rawHtml = "";
                    }

                    bundleMap.set(q.setId, {
                        id: q.setId,
                        title: bundleInfo?.title || "지문 묶음",
                        html: rawHtml,
                        imgUrl: (bundleInfo?.imgUrl && bundleInfo.imgUrl !== 'undefined' && bundleInfo.imgUrl !== 'null') ? fixDriveUrl(bundleInfo.imgUrl) : "",
                        audioUrl:    bundleInfo?.audioUrl    || "",  // [Fix] 오디오 필드 추가
                        audioFileId: bundleInfo?.audioFileId || "",  // [Fix] 오디오 필드 추가
                        audioMaxPlay: bundleInfo?.audioMaxPlay || 1,  // [Fix] 오디오 필드 추가
                        questions: []
                    });
                }
                bundleMap.get(q.setId).questions.push(q);
            } else {
                orphans.push(q);
            }
        });

        // [Fix] DOM 안정화 후 컴포넌트 렌더링 (에디터 초기화 지연 방지)
        setTimeout(() => {
        // Render Bundles & Linked Questions
        bundleMap.forEach((bundleData, setId) => {
            // Zone A: Bundle
            addComponent('bundle', {
                id: setId,
                groupId: setId, // [Fix] Preserve Original UUID as Group ID
                title: bundleData.title,
                html: bundleData.html,
                imgUrl: bundleData.imgUrl,
                audioUrl: bundleData.audioUrl || "",       // [Fix] 오디오 표시 복원
                audioFileId: bundleData.audioFileId || "", // [Fix] 오디오 표시 복원
                audioMaxPlay: bundleData.audioMaxPlay || 1  // [Fix] 오디오 표시 복원
            });

            // Zone B: Questions
            bundleData.questions.forEach(q => {
                const type = q.type === '객관형' ? 'obj' : 'subj';
                addComponent(type, {
                    id: q.id,
                    sec: q.section,
                    sub: q.subType,
                    diff: q.difficulty,
                    score: q.score,
                    text: q.title, // Fixed: Title
                    // [Fix] Sanitize Inner Passage
                    innerPassage: (q.text && q.text.replace(/<[^>]*>/g, '').trim() === '' && !q.text.includes('<img')) ? "" : q.text,
                    answer: q.answer,
                    modelAnswer: q.modelAnswer,
                    options: q.choices, // Fixed: 'options' for UI, 'choices' from DB
                    imgUrl: (q.imgUrl && q.imgUrl !== 'undefined' && q.imgUrl !== 'null') ? fixDriveUrl(q.imgUrl) : "", // [Fix] Sanitize on Load
                    labelType: q.labelType || 'number', // [Fix] 라벨타입 첨가
                    isLinked: true,
                    linkedGroupId: setId
                });
                // Link in DOM
                const qEl = document.getElementById(q.id);
                if (qEl) qEl.setAttribute('data-bundle-id', setId);
            });
        });

        // Render Orphans
        orphans.forEach(q => {
            const type = q.type === '객관형' ? 'obj' : 'subj';
            addComponent(type, {
                id: q.id,
                sec: q.section,
                sub: q.subType,
                diff: q.difficulty,
                score: q.score,
                text: q.title,
                // [Fix] Sanitize Inner Passage
                innerPassage: (q.text && q.text.replace(/<[^>]*>/g, '').trim() === '' && !q.text.includes('<img')) ? "" : q.text,
                answer: q.answer,
                modelAnswer: q.modelAnswer,
                options: q.choices,
                imgUrl: (q.imgUrl && q.imgUrl !== 'undefined' && q.imgUrl !== 'null') ? fixDriveUrl(q.imgUrl) : "",
                labelType: q.labelType || 'number' // [Fix] 라벨타입 추가
            });
        });

        // Finalize
        updateQuestionNumbers();

        // Sync Bundle Link UI
        bundleMap.forEach((_, setId) => {
            const bundleEl = document.getElementById(setId);
            if (bundleEl) {
                const linkedQs = document.querySelectorAll(`.builder-item[data-bundle-id="${setId}"]`);
                const nums = Array.from(linkedQs).map(q => q.getAttribute('data-q-num')).filter(n => n).map(Number).sort((a, b) => a - b);
                const input = document.getElementById(`${setId}-link-input`);
                if (input) input.value = nums.join(', ');

                const ids = Array.from(linkedQs).map(q => q.id);
                bundleEl.setAttribute('data-linked-ids', JSON.stringify(ids));
            }
        });

        // Re-sync UI styles
        const allQs = Array.from(document.querySelectorAll('#zone-question .builder-item'));
        syncBundles(allQs);

        showToast(`✅ ${fetchedQuestions.length}개 문항을 불러왔습니다.`);

        }, 100); // setTimeout end (DOM 안정화 대기)

    } catch (e) {
        console.error(e);
        showToast("❌ 불러오기 실패: " + e.message);
    } finally {
        toggleLoading(false);
    }
}




// [New] Save Reg Group (Integrated Full Save)
async function saveRegGroup() {
    try {
        const result = await collectBuilderData(); // Returns { catId, groups: [{passage, questions}, ...] }
        if (!result.catId) throw new Error("카테고리가 선택되지 않았습니다.");

        // 1. Prepare Data for Save
        // We will OVERWRITE the Global Config for this Category with the Builder State
        // WARN: If user filtered logic in `load`, they might be overwriting unseen questions?
        // `loadQuestionsFromCategory` loads ALL questions of that category.
        // So Builder State = Full State of Category.
        // Thus, SAFE to overwrite.

        const newQuestions = [];
        const newBundles = [];

        let qCounter = 0;

        result.groups.forEach((group, gIdx) => {
            const isGeneral = group.passage.title === 'General';

            // Bundle Data (Skip if General holder)
            let setId = "";
            if (!isGeneral) {
                setId = group.passage.id; // Use existing ID if available (passed from load)
                if (!setId || setId.length < 5) setId = generateUUID();

                // 연결 문항 번호 계산 (qCounter + 1부터 시작)
                const linkedNums = group.questions.map((_, i) => qCounter + i + 1).join(', ');

                // [Fix] 이미지 방식와 동일: DOM hidden input에서 직접 읽은 기존 URL 사용 (_existBnd 개입 불필요)
                newBundles.push({
                    id: setId,
                    title: group.passage.title,
                    text: group.passage.text,
                    imgUrl: group.passage.img || "",
                    imgData: group.passage.imgData,
                    audioData: group.passage.audioData || null,
                    audioUrl:    group.passage.audioData ? "" : (group.passage.audioUrl    || ""),
                    audioFileId: group.passage.audioData ? "" : (group.passage.audioFileId || ""),
                    audioMaxPlay: group.passage.audioMaxPlay || 1,
                    questionIds: linkedNums
                });
            }

            // Question Data
            group.questions.forEach(q => {
                qCounter++;
                newQuestions.push({
                    no: qCounter, // Assign Number based on Order
                    id: q.id,
                    catId: result.catId, // Ensure CatID
                    section: q.sec,
                    subType: q.sub,
                    type: q.type, // Fixed
                    difficulty: q.diff || '중',
                    score: q.score,
                    title: q.title, // Fixed: GS Use 'title' column
                    text: q.passageText || "", // Fixed: Passage content for Q from Q card

                    // New Schema:
                    setId: isGeneral ? "" : setId,

                    // Images
                    imgUrl: q.qImg || "", // Fixed: GS Use 'imgUrl'
                    imgData: q.qImgData,

                    choices: q.options || q.choices, // Use options from serializeBuilderState or fallback
                    answer: q.answer || '', // Both types use answer field now
                    modelAnswer: q.modelAnswer || '', // Both types use modelAnswer
                    labelType: q.labelType || 'number' // [Fix] 라벨 타입 저장
                });
            });
        });

        if (newQuestions.length === 0) throw new Error("저장할 문항이 없습니다.");

        const category = globalConfig.categories.find(c => c.id === result.catId);

        // [User Request] 2-Step Confirmation
        if (!confirm(`${category.name} 시험지에 저장이 맞습니까 ? `)) return;
        if (!confirm("기존 DB가 모두 삭제되고, 현 DB로 덮어쓰기가 됩니다. 또한 저장 완료 후 문항등록 화면이 초기화 됩니다.")) return;

        toggleLoading(true);

        // Payload
        const payload = {
            type: 'SAVE_FULL_TEST_DATA',
            parentFolderId: extractFolderId(category.targetFolderUrl),
            categoryName: category.name,
            questions: newQuestions,
            bundles: newBundles
        };

        const resData = await sendReliableRequest(payload);

        if (resData.status === "Success") {
            showToast("✅ 성공적으로 저장되었습니다!");

            // [Fix] Do NOT update Global Config with strictly local data (missing URLs)
            // Just clear cache for this category so next load fetches fresh
            globalConfig.questions = globalConfig.questions.filter(q => q.catId !== result.catId);
            if (globalConfig.bundles) globalConfig.bundles = globalConfig.bundles.filter(b => b.catId !== result.catId);
            // We do NOT push newQuestions here because they lack the server-generated image URLs
            // The user will re-fetch data on next load.

            save(); // Local Storage

            // Reload/Reset Builder View (Stay on Screen)
            window.removeEventListener('beforeunload', handleBeforeUnload);
            renderRegForm();
        } else {
            throw new Error(resData.message || "저장 실패");
        }

    } catch (e) {
        console.error(e);
        showToast("❌ 저장 중 오류: " + e.message);
    } finally {
        toggleLoading(false);
    }
}




// [Robust Fix] collectBuilderData using data-fields
// This ensures reliable data collection by avoiding dynamic ID queries
async function collectBuilderData() {
    // 1st Pass: Scope Scanned to relevant Area
    const container = document.getElementById('builder-main-area') || document.getElementById('reg-canvas');
    if (!container) throw new Error("빌더 영역을 찾을 수 없습니다.");

    const blocks = container.querySelectorAll('.builder-item');
    if (blocks.length === 0) throw new Error("저장할 문항이 없습니다. 문항을 추가해 주세요.");

    let catId = '';
    let commonTitle = '';

    // 1. Get Category from Top Bar (Direct Link)
    const catSelect = document.getElementById('reg-target-cat');
    if (catSelect) catId = catSelect.value;
    else {
        // Fallback for Edit Mode or other
        const catInput = container.querySelector('[data-field="catId"]');
        if (catInput) catId = catInput.value;
    }

    if (!catId) throw new Error("⚠️ 시험지(카테고리)를 상단 메뉴에서 선택해주세요.");

    let groups = [];

    // Helper to Extract Image Data (Base64) [1MB 초과 이중 방어]
    async function extractImg(fileInput, imgPreviewEl) {
        if (fileInput && fileInput.files[0]) {
            const file = fileInput.files[0];
            const MAX_BYTES = 1 * 1024 * 1024; // 1MB

            // [안전망] 선택 단계에서 차단되었어야 하지만 혹시 모를 경우 대비
            if (file.size > MAX_BYTES) {
                throw new Error(`이미지 용량 초과! 1MB 이하 파일만 등록 가능합니다. (현재: ${(file.size/1024/1024).toFixed(1)}MB)`);
            }

            const base64 = await new Promise(r => {
                const reader = new FileReader();
                reader.onload = e => r(e.target.result);
                reader.readAsDataURL(file);
            });
            return { base64: base64.split(',')[1], mimeType: file.type, fileName: file.name };
        }

        // If no new file, check if there's an existing image URL
        const currentImgUrl = (imgPreviewEl && !imgPreviewEl.classList.contains('hidden')) ? imgPreviewEl.querySelector('img')?.src : '';
        // [Fix] Prevent saving of "undefined" string
        if (currentImgUrl === 'undefined' || currentImgUrl === 'null') return null;
        // [Fix] HTML 내용이 이미지 URL로 오인되는 것 방지
        if (currentImgUrl && currentImgUrl.trim().startsWith('<')) return null;
        return currentImgUrl ? { url: currentImgUrl } : null;
    }

    let orphanQuestions = [];

    for (const block of blocks) {
        // [Safety check] Skip nested items if we are iterating the parent
        // Just kidding, querySelectorAll returns flat list. 
        // We need to handle hierarchy. We iterate roots, then find children?
        // Actually, existing logic iterates ALL blocks.
        // We need to distinguish root vs nested.
        // Or cleaner: Iterate Roots, then children.

        // REVISED Loop: only loop root items
        // Wait, 'blocks' contains ALL items.
        // If an item is inside .group-questions-container, it will be processed twice if we are not careful?
        // No, current logic checks type.
        // If type is bundle, it processes nested inside it.
        // If loop hits a nested item, we should SKIP it (because it was handled by parent bundle).

        if (block.closest('.group-questions-container')) continue; // Skip nested items in main loop

        const type = block.getAttribute('data-type');
        const id = block.id;

        if (type === 'bundle' || type === 'passage') {
            const groupId = block.getAttribute('data-group-id') || block.id || generateUUID(); // [Fix] block.id = 원본 UUID 우선
            // Use data-field selectors
            const title = block.querySelector('[data-field="title"]')?.value || '';
            const html = stripTwStyles(block.querySelector('[data-field="html"]')?.innerHTML || '');

            const fileInput = block.querySelector('[data-field="file"]');
            const previewEl = block.querySelector('[data-field="preview"]');
            const imgData = await extractImg(fileInput, previewEl);

            // Audio 추출 — 이미지와 동일하게 DOM hidden input에서 기존 URL/FileId 직접 읽기
            const audioFileInput = block.querySelector('[data-field="audio-file"]');
            let audioData = null;
            if (audioFileInput && audioFileInput.files && audioFileInput.files[0]) {
                const aFile = audioFileInput.files[0];
                const aBase64 = await new Promise(r => { const reader = new FileReader(); reader.onload = e => r(e.target.result); reader.readAsDataURL(aFile); });
                audioData = { base64: aBase64.split(',')[1], mimeType: aFile.type, fileName: aFile.name };
            }
            const existingAudioUrl    = block.querySelector('[data-field="audioUrl"]')?.value    || '';
            const existingAudioFileId = block.querySelector('[data-field="audioFileId"]')?.value  || '';
            const audioMaxPlayEl = block.querySelector('[data-field="audioMaxPlay"]');
            const audioMaxPlay = parseInt(audioMaxPlayEl?.value) || 1;

            // Nested Questions
            const nestedContainer = block.querySelector('.group-questions-container');
            const nestedQuestions = [];
            if (nestedContainer) {
                const qBlocks = nestedContainer.querySelectorAll('.builder-item');
                for (const qBlock of qBlocks) {
                    const qData = await parseQuestionBlock(qBlock);
                    if (qData) nestedQuestions.push(qData);
                }
            }

            groups.push({
                passage: {
                    id: groupId,
                    title: title,
                    text: html,
                    img: imgData?.url || '',
                    imgData: imgData,
                    audioData: audioData,
                    audioUrl: existingAudioUrl,       // [Fix] DOM hidden input에서 직접 읽은 기존 URL
                    audioFileId: existingAudioFileId, // [Fix] DOM hidden input에서 직접 읽은 기존 FileId
                    audioMaxPlay: audioMaxPlay
                },
                questions: nestedQuestions,
                domId: block.id // [Fix] Store DOM ID for linking
            });
        }
        else if (type === 'obj' || type === 'subj') { // Orphan Question
            const qData = await parseQuestionBlock(block);
            if (qData) orphanQuestions.push(qData);
        }
        else if (type === 'img') { // Standalone Image
            const imgId = 'IMG_' + generateUUID();
            const fInput = block.querySelector('[data-field="file"]');
            const previewEl = block.querySelector('[data-field="preview"]');
            const imgData = await extractImg(fInput, previewEl);

            groups.push({
                passage: { id: imgId, title: 'Image Only', text: '', img: imgData?.url || '', imgData: imgData },
                questions: []
            });
        }
    }

    // [Fix] Distribute Linked Orphans to their Bundles
    const trueOrphans = []; // Really orphan questions

    orphanQuestions.forEach(q => {
        // Debug Log
        // console.log(`Checking Orphan ${q.id} linked to ${q.linkedBundleId}`);

        // Find matching bundle group
        // [Fix] Match against domId because linkedBundleId is the DOM Component ID
        // [Fix] Explicit String Conversion for Safety
        const targetGroup = q.linkedBundleId ? groups.find(g => String(g.domId) === String(q.linkedBundleId)) : null;

        if (targetGroup) {
            // console.log(`-> Linked to Group ${targetGroup.passage.id}`);
            targetGroup.questions.push(q);
        } else {
            // console.warn(`-> Orphan (Target Group Not Found)`);
            trueOrphans.push(q);
        }
    });

    // Attach True Orphans to a "General Group"
    if (trueOrphans.length > 0) {
        groups.push({
            passage: { id: generateUUID(), title: 'General', text: '', img: '', imgData: null },
            questions: trueOrphans
        });
    }

    return { catId, commonTitle, groups };

    // --- Helper (Robust) ---
    async function parseQuestionBlock(block) {
        const type = block.getAttribute('data-type');
        if (type !== 'obj' && type !== 'subj') return null;

        const secInput = block.querySelector('[data-field="section"]');
        const subInput = block.querySelector('[data-field="subtype"]'); // Add capture for subtype
        const diffInput = block.querySelector('[data-field="difficulty"]');
        const scoreInput = block.querySelector('[data-field="score"]');
        const titleInput = block.querySelector('[data-field="text"]'); // Question Title
        const contentInput = block.querySelector('[data-field="innerPassage"]'); // Passage Content (Fixed: innerPassage)
        const answerInput = block.querySelector('[data-field="answer"]');
        const modelInput = block.querySelector('[data-field="modelAnswer"]'); // New Field

        // Question Image
        const qFileInput = block.querySelector('[data-field="file"]');
        const qImgPreviewEl = block.querySelector('[data-field="preview"]');
        const qImgData = await extractImg(qFileInput, qImgPreviewEl);

        const labelTypeInput = block.querySelector('[data-field="labelType"]');

        const q = {
            linkedBundleId: block.getAttribute('data-bundle-id'), // Capture manual link
            id: generateUUID(),
            sec: secInput ? secInput.value : '기타',
            sub: subInput ? subInput.value : '기타', // Use subInput value
            diff: diffInput ? diffInput.value : '중',
            type: type === 'obj' ? '객관형' : '주관형',
            title: titleInput ? titleInput.value : '',
            passageText: contentInput ? stripTwStyles(contentInput.innerHTML) : '', // Collect Passage
            score: scoreInput ? scoreInput.value : 3,
            answer: answerInput ? answerInput.value : '',
            modelAnswer: modelInput ? modelInput.value : '', // Collect Model Answer
            useAiGrading: false,
            choices: [],
            labelType: labelTypeInput ? labelTypeInput.value : 'number', // [Fix] 라벨 타입 수집
            qImg: qImgData?.url || '',
            qImgData: qImgData
        };

        if (type === 'obj') {
            const choices = block.querySelectorAll('[data-field="choice"]');
            choices.forEach(ch => q.choices.push(ch.value));
        }

        return q;
    }
}

// ----------------------------------------------------
// Group Linking & Utility Functions
// ----------------------------------------------------

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

let isLinkingMode = false;
let linkingSourceId = null;

function startGroupLinking(sourceId) {
    if (isLinkingMode) return;

    isLinkingMode = true;
    linkingSourceId = sourceId;
    const sourceGroup = document.getElementById(sourceId);
    const groupId = sourceGroup.getAttribute('data-group-id');

    showToast("🔗 연결 모드: 연결할 문항들을 클릭하세요. (ESC to Finish)");

    // Visual Indicators
    sourceGroup.classList.add('ring-4', 'ring-orange-400', 'bg-orange-50');
    sourceGroup.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Add Click Listeners to all Question Items
    const items = document.querySelectorAll('.builder-item[data-type="obj"], .builder-item[data-type="subj"]');
    items.forEach(item => {
        item.classList.add('cursor-alias', 'hover:ring-2', 'hover:ring-blue-400', 'transition-all');

        // Save original onclick to restore later? 
        // Actually, we can attach a special click handler that stops propagation
        item.addEventListener('click', handleLinkClick, true); // Capture phase
    });

    // Global Key Listener
    document.addEventListener('keydown', exitLinkingMode);

    // Create Floating Button
    const btn = document.createElement('button');
    btn.id = 'finish-link-btn';
    btn.innerText = "✅ Linking Done";
    btn.className = "fixed bottom-10 right-10 bg-orange-600 text-white px-6 py-3 rounded-full shadow-lg font-bold animate-bounce z-50 hover:bg-orange-700 transition-colors";
    btn.onclick = () => exitLinkingMode();
    document.body.appendChild(btn);
}

function handleLinkClick(e) {
    if (!isLinkingMode) return;
    e.preventDefault();
    e.stopPropagation();

    const item = e.currentTarget;
    const sourceGroup = document.getElementById(linkingSourceId);
    const groupId = sourceGroup.getAttribute('data-group-id');

    // Update Attribute
    item.setAttribute('data-linked-group', groupId);

    // UI Feedback
    let badge = item.querySelector('.linked-badge');
    if (!badge) {
        // Find header to insert badge
        const header = item.querySelector('h4').parentNode;
        const badgeHtml = document.createElement('span');
        badgeHtml.className = "linked-badge text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded border border-orange-200 ml-2 animate-fade-in";
        badgeHtml.innerText = "🔗 Linked";
        header.appendChild(badgeHtml);
    } else {
        // If already linked, maybe flash it
        badge.innerText = "🔗 Linked (Updated)";
    }

    // Flash Item
    const originalBg = item.style.backgroundColor;
    item.style.backgroundColor = '#fff7ed'; // orange-50
    setTimeout(() => {
        item.style.backgroundColor = originalBg;
    }, 300);
}

function exitLinkingMode(e) {
    if (e && e.key && e.key !== 'Escape') return;

    isLinkingMode = false;
    linkingSourceId = null;

    // Cleanup Visuals
    document.querySelectorAll('.builder-item').forEach(item => {
        item.classList.remove('ring-4', 'ring-orange-400', 'bg-orange-50', 'cursor-alias', 'hover:ring-2', 'hover:ring-blue-400');
        item.removeEventListener('click', handleLinkClick, true);
    });

    const btn = document.getElementById('finish-link-btn');
    if (btn) btn.remove();

    document.removeEventListener('keydown', exitLinkingMode);
    showToast("✅ 연결 모드 종료");
}

// [Legacy saveRegGroup Removed - Replaced by Integrated Save]



// [Revised] serializeBuilderState using data-fields



// PDF 가져오기 기능 제거됨 (2026-03-26)

function parseAndPopulateBuilder(text) {
    // Advanced State Machine Parser (Rev. 3 - Robust)
    const rawLines = text.replace(/[\uFEFF\x00]/g, "").split('\n').map(l => l.trimEnd());

    let blocks = [];
    // State: 0=Passage/None, 1=QuestionTitle, 2=QuestionPassage(Inner), 3=Choices
    let state = 0;

    let currentBlock = { type: 'passage', lines: [] };

    // Pattern: "1.", "Q1", "문항 1"
    const qStartRegex = /^(?:Q|Question|문항)?\s*(\d{1,3})[\.\)]\s*(.*)/i;

    // Pattern: Choices start with (1), ①, [A], 1)
    const choiceRegex = /^[\(\[①②③④⑤ⓐⓑⓒⓓⓔ]\s*(\d+|[A-E])?[\)\]\.]?\s+|^\d+[\)]\s+/;

    function flushBlock() {
        if (!currentBlock) return;
        if (currentBlock.type === 'passage') {
            if (currentBlock.lines.join('').trim().length > 0) blocks.push(currentBlock);
        }
        else if (currentBlock.type === 'question') {
            blocks.push(currentBlock);
        }
        currentBlock = null;
    }

    rawLines.forEach((line) => {
        const trLine = line.trim();
        if (!trLine) return;

        const qMatch = trLine.match(qStartRegex);

        // [A] New Question Start
        if (qMatch) {
            flushBlock();
            state = 1; // Title Mode
            currentBlock = {
                type: 'question',
                number: qMatch[1],
                title: qMatch[2] || "",
                innerLines: [],
                rawChoices: []
            };
            return;
        }

        // [B] Choices Start (Transition to state 3)
        if (state >= 1 && (choiceRegex.test(trLine) || trLine.includes('①'))) {
            state = 3;
            currentBlock.rawChoices.push(trLine);
            return;
        }

        // [C] Content Handling
        if (state === 0) {
            currentBlock.lines.push(trLine);
        }
        else if (state === 1) {
            // Heuristic: If title gets too long, it's likely an inner passage
            if (currentBlock.title.length > 80 || currentBlock.title.endsWith('?') || currentBlock.title.endsWith(':')) {
                state = 2; // Move to Inner Passage
                currentBlock.innerLines.push(trLine);
            } else {
                currentBlock.title += " " + trLine;
            }
        }
        else if (state === 2) {
            currentBlock.innerLines.push(trLine);
        }
        else if (state === 3) {
            currentBlock.rawChoices.push(trLine);
        }
    });
    flushBlock();

    // --- Render ---
    let processCount = 0;
    blocks.forEach(b => {
        if (b.type === 'passage') {
            const html = b.lines.join('<br>');
            if (html.length > 5) addComponent('bundle', { html }); // Changed to 'bundle'
        }
        else if (b.type === 'question') {
            processCount++;
            const fullChoiceText = b.rawChoices.join(' ');
            const options = parseChoicesSmart(fullChoiceText);
            const isObj = options.length >= 2;

            const data = {
                title: b.title,
                innerPassage: b.innerLines.join('\n'), // New Field
                score: 3, diff: '중',
                options: options
            };
            addComponent(isObj ? 'obj' : 'subj', data);
        }
    });

    if (processCount === 0) showToast("⚠️ 문제를 찾지 못했습니다. 텍스트 형식을 확인하세요.");
}

function parseChoicesSmart(text) {
    let clean = text;
    // Replace markers with delimiter
    clean = clean.replace(/[\(①②③④⑤ⓐⓑⓒⓓⓔ\d]+[\)\.]?/g, (match) => {
        if (match.match(/^[①-⑤]/)) return "|||";
        if (match.match(/^\(\d+\)/)) return "|||";
        if (match.match(/^\d+\)/)) return "|||";
        return match;
    });
    const opts = clean.split('|||').map(s => s.trim()).filter(s => s);
    return opts.slice(0, 5);
}



function mapChoices(rawLines) {
    // rawLines might be ["① Apple", "② Banana"] 
    // or ["① Apple ② Banana ..."] mixed?
    // Current parser loop pushed line-by-line.
    // If multiple choices on one line, we missed splitting them.
    // MVP: Just take first 5 if exists.

    // Normalize: remove ① etc.
    return rawLines.slice(0, 5).map(l => l.replace(/^[①②③④⑤\(\)\d\.]+\s*/, ''));
}



// --- Global Error Handler ---
// --- GLOBAL INITIALIZATION ---
// 앱이 로드되면 실행됨
// 1. 설정 로드 (옵션)
// 2. 초기 모드 설정 (학생 모드)


// --- Rich Text & Image Helpers (Shared) ---
// [Updated for Split View Forms]

// --- Image Helper Refactoring (Context Aware) ---
function execCmd(command) {
    document.execCommand(command, false, null);
    const reg = document.getElementById('reg-passage-editor');
    const edit = document.getElementById('edit-passage-editor');
    // Determine which is visible or focused? simpler check:
    // Actually execCmd works on selection, focusing back might lose selection.
    // Let's just focus if nothing is focused.
    if (document.activeElement === reg || document.activeElement === edit) return;

    // Fallback focus
    if (reg && reg.offsetParent) reg.focus();
    else if (edit && edit.offsetParent) edit.focus();
}

function insertSymbol(char) {
    // Check active element first to insert at cursor
    const active = document.activeElement;
    if (active && (active.id === 'reg-passage-editor' || active.id === 'edit-passage-editor' || active.isContentEditable)) {
        document.execCommand('insertText', false, char);
        return;
    }

    // Fallback: append or focus
    const reg = document.getElementById('reg-passage-editor');
    const edit = document.getElementById('edit-passage-editor');
    if (reg && reg.offsetParent) {
        reg.focus();
        document.execCommand('insertText', false, char);
    }
    else if (edit && edit.offsetParent) {
        edit.focus();
        document.execCommand('insertText', false, char);
    }
}

function previewTestImg(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            // Determine context based on input ID
            const isEdit = input.id.includes('edit');
            // FIX: Ensure we target the PREVIEW box inside the same container
            // Hardcoding ID is risky if duplicated in DOM (which they shouldn't be, but safer to traverse)
            const parent = input.closest('.group') || input.parentElement.parentElement;
            // .group is on the wrapper div. 
            // Let's use ID selector assuming unique IDs for 08-1 and 08-2 logic separation
            // Actually, renderRegForm and renderEditForm might overwrite dynamic-content, so IDs are unique at runtime.

            // But wait! in `renderEditForm`, the preview ID is `test - img - preview`. 
            // In `renderRegForm`, the preview ID is `test - img - preview`.
            // THIS IS OKAY since only one exists at a time.

            const container = document.getElementById('test-img-preview');
            if (container) {
                container.classList.remove('hidden');
                const img = container.querySelector('img');
                if (img) img.src = e.target.result;
            }
        }
        reader.readAsDataURL(input.files[0]);
    }
}

function clearTestImg() {
    const regInput = document.getElementById('reg-passage-img');
    const editInput = document.getElementById('edit-passage-img');

    // Clear both just in case
    if (regInput) regInput.value = '';
    if (editInput) editInput.value = '';

    const container = document.getElementById('test-img-preview');
    if (container) {
        container.classList.add('hidden');
        const img = container.querySelector('img');
        if (img) img.src = ''; // Reset src
    }

    // Crucial: For Edit Mode, we must also clear the internal state if we want to delete image on server.
    // But `updateQuestion` uses `fileData1` or `imgUrl1`. 
    // If we clear preview, does user imply 'Delete Image on Save'?
    // Currently UI just hides it. 
    // We should probably explicitly set a flag or just let `imgUrl1` remaining be handled?
    // If user clears image, we should probably wipe `imgUrl1` in the payload?
    // Let's handle that in `updateQuestion`.
}

/* Legacy Test Canvas & Helpers Removed */



// [Modified] Actual Local Storage Save
// [Old tempSaveReg removed]




function confirmRegCancel() {
    if (confirm("작성 중인 내용은 저장되지 않습니다. 나가시겠습니까?")) {
        document.getElementById('app-canvas').classList.remove('!overflow-hidden');
        renderBank();
    }
}


// ============================================================================
// 페이지 로드 시 초기화 및 클라우드 동기화
// ============================================================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('🚀 Application Initializing...');

    // 1. 클라우드 설정 동기화 시도 (silent mode)
    if (globalConfig.masterUrl) {
        console.log('☁️ Attempting cloud sync from:', globalConfig.masterUrl);
        try {
            const syncSuccess = await loadConfigFromCloud(true);
            if (syncSuccess) {
                console.log('✅ Cloud sync successful');
                applyBranding(); // 로고 적용
            } else {
                console.log('⚠️ Cloud sync failed, using local config');
            }
        } catch (error) {
            console.error('❌ Cloud sync error:', error);
        }
    } else {
        console.log('⚠️ Master URL not set, skipping cloud sync');
    }

    // 2. 초기 화면 렌더링
    changeMode('initial');

    console.log('✅ Application Ready');
});


// [Restored Feature] renderStudentLogin
async function renderStudentLogin() {
    const c = document.getElementById('dynamic-content');

    // UI에 진입하자마자 로딩 표시 후 서버에서 최신 설정(카테고리 목록 등) 자동 동기화
    toggleLoading(true);
    await loadConfigFromCloud(true);
    toggleLoading(false);

    // [Fix] 로딩 완료 후 사이드바 제거
    document.body.classList.remove('has-sidebar');

    setCanvasId('02');

    // [Debug] Student Mode Exam List
    console.log("📝 Student Mode Init. Categories:", globalConfig.categories);

    // 카테고리가 없어도 화면은 렌더링하되, 선택박스에 안내 표시
    const catOptions = (globalConfig.categories && globalConfig.categories.length > 0)
        ? globalConfig.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
        : `<option value="" disabled selected>⚠️ 등록된 시험지가 없습니다 (${globalConfig.categories ? globalConfig.categories.length : '0'}개)</option>`;

    c.innerHTML = `
        <div class="animate-fade-in-safe flex flex-col items-center pb-10 mt-5">
            <div class="canvas-premium-box !max-w-3xl w-full">
                <div class="flex flex-row items-start gap-10">

                    <!-- 좌측: 아이콘 + 제목 -->
                    <div class="flex flex-col items-center gap-4 flex-shrink-0 w-40 border-r border-slate-200 pr-10">
                        <div class="w-20 h-20 bg-slate-50 rounded-2xl flex items-center justify-center text-4xl shadow-inner relative z-10 unified-animate">
                            📝
                            <div class="absolute inset-0 bg-blue-100/30 rounded-full blur-2xl opacity-50 scale-150 -z-10"></div>
                        </div>
                        <h2 class="fs-18 text-[#013976] uppercase text-center font-black tracking-tight leading-tight">STUDENT LOGIN</h2>
                    </div>

                    <!-- 우측: 폼 -->
                    <div class="flex-1 space-y-4 text-left">
                        <!-- [1] 시험지 선택 -->
                        <div>
                            <label class="ys-label font-bold !mb-0">📂 시험지 선택</label>
                            <select id="sci" class="ys-field mt-1.5 !bg-slate-50/50 hover:border-blue-400 focus:bg-white transition-all shadow-sm" onchange="handleCategorySelect()">
                                <option value="" disabled selected hidden>시험지를 선택하세요</option>
                                ${catOptions}
                            </select>
                        </div>

                        <!-- [2] 학생명 + 학년 -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="ys-label font-bold !mb-0">📝 학생명</label>
                                <input type="text" id="snm" autocomplete="off" class="ys-field mt-1.5 !bg-slate-50/50 focus:bg-white transition-all shadow-sm" placeholder="이름을 입력하세요">
                            </div>
                            <div>
                                <label class="ys-label font-bold !mb-0">🎓 학년</label>
                                <select id="sgr" class="ys-field mt-1.5 !bg-slate-50/50 focus:bg-white transition-all shadow-sm">
                                    <option value="" disabled selected hidden>학년을 선택하세요</option>
                                </select>
                            </div>
                        </div>

                        <!-- [3] 응시일 + 시험시간 -->
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="ys-label font-bold !mb-0">📅 응시일</label>
                                <input type="text" id="sdt" class="ys-field mt-1.5 !bg-slate-50/50 focus:bg-white transition-all shadow-sm" placeholder="날짜 선택">
                            </div>
                            <div>
                                <label class="ys-label font-bold !mb-0">⏱️ 시험 시간 (분)</label>
                                <input type="number" id="stm" class="ys-field mt-1.5 !bg-slate-50/50 focus:bg-white transition-all shadow-sm" placeholder="0 = 무제한" value="0" min="0">
                            </div>
                        </div>

                        <!-- [4] 버튼 -->
                        <div>
                            <button onclick="renderExamInstructions()" class="btn-ys w-full !py-4 fs-16 font-bold transition-all active:scale-95 shadow-lg mt-1">
                                시험 안내보기 →
                            </button>
                            <button onclick="goHome()" class="w-full mt-3 text-slate-400 fs-14 underline hover:text-red-500 transition-all font-medium text-center">
                                CANCEL &amp; RETURN
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    `;
    setTimeout(() => {
        document.getElementById('snm')?.focus();
        // Flatpickr 적용
        if (typeof flatpickr !== 'undefined') {
            const updateYearDropdown = (instance) => {
                const yearInput = instance.yearElements[0];
                if (yearInput && yearInput.tagName !== 'SELECT') {
                    if (!yearInput.parentNode) return; // [Fix] parentNode null 방어
                    const yearSelect = document.createElement("select");
                    yearSelect.className = "flatpickr-monthDropdown-months !w-auto !m-0";
                    const currentYear = new Date().getFullYear();
                    for (let y = currentYear - 10; y <= currentYear + 10; y++) {
                        const opt = document.createElement("option");
                        opt.value = y;
                        opt.text = y;
                        if (y === instance.currentYear) opt.selected = true;
                        yearSelect.appendChild(opt);
                    }
                    yearSelect.addEventListener("change", (e) => {
                        instance.changeYear(parseInt(e.target.value));
                    });
                    yearInput.parentNode.replaceChild(yearSelect, yearInput);
                } else if (yearInput && yearInput.tagName === 'SELECT') {
                    // 이미 셀렉트박스인 경우 값만 업데이트
                    yearInput.value = instance.currentYear;
                }
            };

            flatpickr("#sdt", {
                locale: "ko",
                dateFormat: "Y-m-d",
                disableMobile: true,
                altInput: true,
                altFormat: "Y-m-d (D)",
                defaultDate: new Date(),
                monthSelectorType: "dropdown",
                onReady: function (selectedDates, dateStr, instance) {
                    updateYearDropdown(instance);
                },
                onMonthChange: function (selectedDates, dateStr, instance) {
                    setTimeout(() => updateYearDropdown(instance), 0);
                },
                onYearChange: function (selectedDates, dateStr, instance) {
                    setTimeout(() => updateYearDropdown(instance), 10);
                },
                onOpen: function (selectedDates, dateStr, instance) {
                    setTimeout(() => updateYearDropdown(instance), 0);
                }
            });
        }
    }, 100);
    // 등록된 학년만 학생 로그인 학년 드롭박스에 채우기
    const gradeLabels = { '초1':'초등 1학년','초2':'초등 2학년','초3':'초등 3학년','초4':'초등 4학년','초5':'초등 5학년','초6':'초등 6학년','중1':'중등 1학년','중2':'중등 2학년','중3':'중등 3학년','고1':'고등 1학년','고2':'고등 2학년','고3':'고등 3학년' };
    populateGradeSelect(document.getElementById('sgr'), { placeholder: '학년을 선택하세요', labelFn: g => g });
}

// [Added] 카테고리 선택 시 권장 학년 및 평가 시간 자동완성
function handleCategorySelect() {
    const sciSelect = document.getElementById('sci');
    if (!sciSelect) return;

    const selectedId = sciSelect.value;
    const cat = globalConfig.categories.find(c => c.id === selectedId);

    if (cat) {
        // 권장 평가 학년 덮어쓰기
        if (cat.targetGrade) {
            const sgrSelect = document.getElementById('sgr');
            if (sgrSelect) sgrSelect.value = cat.targetGrade;
        }

        // 권장 평가 시간 덮어쓰기
        if (typeof cat.timeLimit !== 'undefined' && cat.timeLimit !== '') {
            const stmInput = document.getElementById('stm');
            if (stmInput) stmInput.value = cat.timeLimit;
        }
    }
}

// [Added] 오디오 테스트 함수
function playAudioTest() {
    window._audioTestDone = true;
    const btn = document.getElementById('audio-test-btn');
    if (btn) { btn.disabled = true; btn.textContent = '🔊 재생중...'; }
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.4, ctx.currentTime); gain.connect(ctx.destination);
        const freqs = [261,293,329,349,392,440,494,523,440,392,349,329,293,261,329,392];
        let t = ctx.currentTime;
        freqs.forEach(function(f) {
            const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.setValueAtTime(f, t);
            osc.connect(gain); osc.start(t); osc.stop(t + 0.4); t += 0.5;
        });
        setTimeout(function() {
            ctx.close();
            if (btn) { btn.disabled = false; btn.textContent = '✅ 오디오 정상 확인됨'; btn.style.background='#16a34a'; btn.style.color='#fff'; }
        }, 8500);
    } catch(e) {
        if (btn) { btn.disabled = false; btn.textContent = '⚠️ 오디오 오류'; }
        showToast('오디오 API 오류: ' + e.message);
    }
}

// [Added] 시험 안내 화면
function renderExamInstructions() {
    const name = document.getElementById('snm')?.value?.trim();
    const grade = document.getElementById('sgr')?.value;
    const catId = document.getElementById('sci')?.value;
    const date = document.getElementById('sdt')?.value || new Date().toISOString().split('T')[0];
    const timeLimit = parseInt(document.getElementById('stm')?.value) || 0;
    if (!name) return showToast('⚠️ 학생 이름을 입력해주세요.');
    if (!catId) return showToast('⚠️ 시험지를 선택해주세요.');
    if (!grade) return showToast('⚠️ 학년을 선택해주세요.');
    window._examPending = { name, grade, catId, date, timeLimit };
    window._audioTestDone = false;
    setCanvasId('02-3');
    setTimeout(function() { preloadBundleAudios(catId); }, 200);
    const timeTxt = timeLimit > 0 ? timeLimit + '분' : '시간 제한 없음';
    const dynContent = document.getElementById('dynamic-content');
    if (!dynContent) return;
    const ac = document.getElementById('app-canvas');
    if (ac) { ac.style.padding = '0'; ac.classList.add('!overflow-hidden'); }
    dynContent.innerHTML = `
        <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#013976,#0a5294);overflow:hidden;">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-10">
                <div class="text-center mb-6">
                    <div class="text-[12px] text-[#013976] font-black tracking-[0.25em] uppercase mb-2">YONSEI INTERNATIONAL ENGLISH</div>
                    <h1 class="text-3xl font-black text-[#013976] mb-1">시험 안내</h1>
                </div>
                <div class="bg-amber-50 border border-amber-200 rounded-xl px-6 py-4 mb-6 text-center">
                    <p class="text-amber-800 font-bold text-[17px]">화면의 내용을 잘 읽고 시험에 응하세요.</p>
                </div>
                <ol class="space-y-3 mb-7">
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-[#013976] text-white text-[14px] font-bold flex items-center justify-center">1</span><span class="text-[16px] text-slate-700 pt-1"><b>START EXAM</b> 버튼을 누르면 시험이 시작됩니다.</span></li>
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-[#013976] text-white text-[14px] font-bold flex items-center justify-center">2</span><span class="text-[16px] text-slate-700 pt-1">시작과 동시에 <b>${timeTxt}</b>의 카운트다운이 진행되며, 시간이 종료되면 자동으로 제출됩니다.</span></li>
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-[#013976] text-white text-[14px] font-bold flex items-center justify-center">3</span><span class="text-[16px] text-slate-700 pt-1">듣기 평가는 재생 가능 횟수가 각 문제에 표시되어 있으며, 해당 횟수 내에서만 재생이 가능합니다.</span></li>
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-[#013976] text-white text-[14px] font-bold flex items-center justify-center">4</span><span class="text-[16px] text-slate-700 pt-1">듣기 평가 재생 시 일시정지, 빨리감기, 뒤로감기 등의 기능은 없습니다.</span></li>
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-[#013976] text-white text-[14px] font-bold flex items-center justify-center">5</span><span class="text-[16px] text-slate-700 pt-1">아래 <b>🔊 오디오 테스트</b> 버튼으로 소리가 정상 출력되는지 확인한 후 START EXAM을 눌러 주세요.</span></li>
                    <li class="flex gap-3 items-start"><span class="flex-shrink-0 w-8 h-8 rounded-full bg-red-500 text-white text-[14px] font-bold flex items-center justify-center">6</span><span class="text-[16px] text-slate-700 pt-1">소리가 들리지 않는다면, 즉시 <b>선생님께 도움을 요청</b>하세요.</span></li>
                </ol>
                <div class="flex gap-3 justify-center">
                    <button id="audio-test-btn" onclick="playAudioTest()" class="flex items-center gap-2 px-5 py-3 rounded-xl border-2 border-slate-300 bg-white text-slate-700 font-bold text-[14px] hover:border-blue-400 hover:bg-blue-50 transition-all">
                        🔊 오디오 테스트
                    </button>
                    <button onclick="startExamFromInstructions()" class="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#013976] text-white font-bold text-[14px] hover:bg-blue-800 active:scale-95 transition-all shadow-md">
                        ▶ START EXAM
                    </button>
                </div>
            </div>
        </div>
    `;
}


// [New] 오디오 백그라운드 프리로드
function preloadBundleAudios(catId) {
    if (!globalConfig.bundles || !Array.isArray(globalConfig.bundles)) return;
    window._preloadedAudioCache = window._preloadedAudioCache || {};
    const bundles = globalConfig.bundles.filter(function(b) {
        return b.audioFileId && b.audioFileId.trim() !== '';
    });
    if (bundles.length === 0) return;
    console.log('[Preload] 오디오 ' + bundles.length + '개 백그라운드 로드 시작');
    bundles.forEach(function(bundle) {
        const bid = bundle.id;
        if (window._preloadedAudioCache[bid]) { console.log('[Preload] 캐시 히트:', bid); return; }
        sendReliableRequest({ type: 'GET_AUDIO_B64', fileId: bundle.audioFileId })
            .then(function(res) {
                if (!res || res.status !== 'Success' || !res.data) return;
                const byteStr = atob(res.data);
                const ab = new ArrayBuffer(byteStr.length);
                const ia = new Uint8Array(ab);
                for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
                const blob = new Blob([ab], { type: res.mimeType || 'audio/mpeg' });
                window._preloadedAudioCache[bid] = URL.createObjectURL(blob);
                console.log('[Preload] 완료:', bid);
            })
            .catch(function(e) { console.warn('[Preload] 실패:', bid, e.message); });
    });
}

// [Added] 안내화면에서 START EXAM 클릭
function startExamFromInstructions() {
    if (!window._audioTestDone) {
        showToast('⚠️ 먼저 오디오 테스트를 시행하세요!');
        const btn = document.getElementById('audio-test-btn');
        if (btn) { btn.style.animation = 'pulse 0.4s 3'; setTimeout(() => { if(btn) btn.style.animation=''; }, 1200); }
        return;
    }
    startExamSequence();
}

// [Restored Feature] startExamSequence
async function startExamSequence() {
    const _p = window._examPending || {};
    const name = _p.name || document.getElementById('snm')?.value || '';
    const grade = _p.grade || document.getElementById('sgr')?.value || '';
    const catId = _p.catId || document.getElementById('sci')?.value || '';
    const date = _p.date || document.getElementById('sdt')?.value || new Date().toISOString().split('T')[0];
    const timeLimit = _p.timeLimit != null ? _p.timeLimit : parseInt(document.getElementById('stm')?.value) || 0;
    window._examPending = null;
    window._audioPlaysUsed = {};

    if (!name) return showToast("⚠️ 학생 이름을 입력해주세요.");
    if (!catId) return showToast("⚠️ 시험지를 선택해주세요.");
    if (!grade) return showToast("⚠️ 학년들을 선택해주세요.");

    // [Debug & Fix] Data Source Dual Check (globalConfig vs globalData)
    let sourceQuestions = [];
    let sourceName = "";

    if (globalConfig.questions && globalConfig.questions.length > 0) {
        sourceQuestions = globalConfig.questions;
        sourceName = "globalConfig";
    } else if (typeof globalData !== 'undefined' && globalData.questions && globalData.questions.length > 0) {
        sourceQuestions = globalData.questions;
        sourceName = "globalData";
    }

    console.log("Start Exam Debug:", {
        catId,
        configLen: globalConfig.questions ? globalConfig.questions.length : 0,
        dataLen: (typeof globalData !== 'undefined' && globalData.questions) ? globalData.questions.length : 0,
        selectedSource: sourceName
    });

    // [Auto-Fetch] 로컬에 문항 데이터가 없으면 클라우드 빈 데이터이거나 캐시 삭제 상태이므로 자동 복구를 시도
    let catQuestions = sourceQuestions.filter(q => String(q.catId) === String(catId));

    if (sourceQuestions.length === 0 || catQuestions.length === 0) {
        console.log("🔄 문항이 비어있어 클라우드에서 자동 로딩 시작...");
        showToast("🔄 시험 문항을 불러오는 중입니다...");
        await loadBankQuestions(catId); // 해당 카테고리의 문항만 서버에서 로드

        // 새로 받아온 로컬 데이터 갱신
        if (globalConfig.questions && globalConfig.questions.length > 0) {
            sourceQuestions = globalConfig.questions;
            sourceName = "globalConfig";
            catQuestions = sourceQuestions.filter(q => String(q.catId) === String(catId));
        }
    }

    // Final Check (여전히 없으면 실제 비어있는 시험지로 간주)
    if (catQuestions.length === 0) {
        alert("🚨 문항 데이터가 비어있습니다.\n\n관리자 모드에서 문항(Question Bank Master)을 먼저 등록해 주세요.");
        return;
    }

    // Sync globalConfig if came from globalData
    if (sourceName === "globalData" && (!globalConfig.questions || globalConfig.questions.length === 0)) {
        globalConfig.questions = sourceQuestions;
    }

    // Generate Student ID (Wait for it)
    toggleLoading(true);
    try {
        const studentId = await generateUniqueStudentId(new Date().toISOString(), grade);

        // Set Session
        examSession = {
            studentName: name,
            studentId: studentId, // Add ID to session
            grade: grade,
            categoryId: catId,
            date: date, // User input date
            answers: {},
            startTime: Date.now(),
            isExamActive: true,
            timeLimit: timeLimit // User input time limit
        };

        // Filter Questions
        const filteredQuestions = globalConfig.questions.filter(q => String(q.catId) === String(catId));

        // [Fix] Data Mapping & Bundle Injection
        // Join Bundle Data (Passage/Title) and Normalize Choices
        const mappedQuestions = filteredQuestions.map(q => {
            const copy = { ...q };

            if (copy.setId) {
                const bundle = globalConfig.bundles ? globalConfig.bundles.find(b => b.id === copy.setId) : null;
                if (bundle) {
                    copy.commonTitle = bundle.title;
                    // [Fix] Removed the intentional overwrite to preserve individual single passage inside bundle
                    copy.bundlePassageText = bundle.text; // Better to save it in a separate property if needed elsewhere
                }
            }

            // 2. Normalize Choices (Array -> choice1, choice2...)
            if (Array.isArray(copy.choices)) {
                copy.choices.forEach((c, i) => {
                    copy[`choice${i + 1}`] = c;
                });
            } else if (typeof copy.options === 'string') {
                // Try parsing options string if choices is missing
                try {
                    const parsed = JSON.parse(copy.options);
                    if (Array.isArray(parsed)) {
                        parsed.forEach((c, i) => copy[`choice${i + 1}`] = c);
                    }
                } catch (e) { }
            }

            // 3. Normalize Passage (if independent)

            // 3. Normalize Content
            if (!copy.text || copy.text.trim() === "") {
                copy.text = copy.content || copy.question || copy.title || "No Content";
            }
            if (!copy.passage1 && copy.text && copy.text.length > 300) {
                // Heuristic: Long text might be a passage? 
                // But let's stick to explicit Passage fields.
            }

            return copy;
        });

        console.log(`Filtered Questions: ${mappedQuestions.length} / Total: ${globalConfig.questions.length}`);

        if (mappedQuestions.length === 0) {
            toggleLoading(false);
            const catName = globalConfig.categories.find(c => String(c.id) === String(catId))?.name || catId;
            alert(`⚠️ '${catName}' 시험지에 등록된 문항이 없습니다.\n(선택한 ID: ${catId})\n\n관리자 페이지에서 해당 시험지에 문항이 등록되었는지 확인해주세요.`);
            return;
        }

        // Render Exam
        renderExamPaper(mappedQuestions);
        // Start Timer
        startExamTimer(0); // 0 means count up

    } catch (e) {
        console.error(e);
        showToast("❌ 시험 시작 중 오류 발생");
        alert("오류 상세: " + e.message);
    } finally {
        toggleLoading(false);
    }
}

// [Restored Feature] renderExamPaper
function renderExamPaper(list) {
    // Hide Header/Footer/Sidebar
    const header = document.getElementById('app-header');
    const footer = document.getElementById('app-footer');
    const sidebar = document.getElementById('app-sidebar');
    const mainContainer = document.getElementById('main-container');

    if (header) header.style.display = 'none';
    if (footer) footer.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (mainContainer) {
        mainContainer.style.height = '100vh';
        mainContainer.style.padding = '0';
        mainContainer.style.margin = '0';
        mainContainer.style.maxWidth = 'none';
        mainContainer.style.display = 'block';
    }

    const c = document.getElementById('dynamic-content');
    setCanvasId('02-1', 'full');
    c.className = "w-full h-full bg-slate-50 relative overflow-hidden flex flex-row";

    examSession.currentPage = 0;

    // Grouping Logic
    // Step 1: 원본 유닛 생성 (bundle/single)
    const rawUnits = [];
    let currentGroup = [];
    let globalDisplayIdx = 1;

    list.forEach(q => q.displayIndex = globalDisplayIdx++);

    list.forEach((q, i) => {
        const prev = list[i - 1];
        const currTitle = String(q.commonTitle || "").trim().toLowerCase();
        let prevTitle = prev ? String(prev.commonTitle || "").trim().toLowerCase() : "";

        if (currTitle !== "" && currTitle === prevTitle) {
            currentGroup.push(q);
        } else {
            if (currentGroup.length > 0) {
                const only = currentGroup[0];
                if (currentGroup.length === 1 && !only.setId && !only.bundlePassageText) rawUnits.push({ type: 'single', data: only });
                else rawUnits.push({ type: 'bundle', data: currentGroup });
            }
            currentGroup = [q];
        }
    });
    if (currentGroup.length > 0) {
        const only = currentGroup[0];
        if (currentGroup.length === 1 && !only.setId && !only.bundlePassageText) rawUnits.push({ type: 'single', data: only });
        else rawUnits.push({ type: 'bundle', data: currentGroup });
    }

    // Step 2: 페이지 유닛으로 재구성 (2분할 고정)
    const pageUnits = [];
    let singleBuffer = [];

    // 문항이 "큰" 문항인지 판별 (이미지 있음 or 발문 1000자 이상)
    function isLargeQuestion(q) {
        if (q.imgUrl && q.imgUrl !== "" && q.imgUrl !== "undefined" && q.imgUrl !== "null") return true;
        const textLen = (q.text || "").length + (q.passage1 || "").length;
        if (textLen >= 1000) return true;
        return false;
    }

    function flushSingles() {
        while (singleBuffer.length > 0) {
            const first = singleBuffer[0];
            if (isLargeQuestion(first)) {
                // 큰 문항 → 무조건 혼자 1열 사용
                pageUnits.push({ type: 'solo', data: singleBuffer.shift() });
            } else if (singleBuffer.length >= 2) {
                const second = singleBuffer[1];
                if (isLargeQuestion(second)) {
                    // 다음 문항이 큰 문항이면 현재 문항도 solo
                    pageUnits.push({ type: 'solo', data: singleBuffer.shift() });
                } else {
                    // 둘 다 작은 문항 → pair
                    pageUnits.push({ type: 'pair', data: [singleBuffer.shift(), singleBuffer.shift()] });
                }
            } else {
                // 1개만 남음 → solo
                pageUnits.push({ type: 'solo', data: singleBuffer.shift() });
            }
        }
    }

    rawUnits.forEach(unit => {
        if (unit.type === 'bundle') {
            flushSingles();
            pageUnits.push(unit); // 번들은 1페이지 전체 사용
        } else {
            singleBuffer.push(unit.data);
        }
    });
    flushSingles();

    examSession.displayUnits = pageUnits;

    const sidebarHtml = renderStudentSidebar();

    c.innerHTML = `
        ${sidebarHtml}
        <div class="flex-1 flex flex-col min-w-0 bg-slate-100/50 relative">
             <div id="exam-scroll-area" class="flex-1 overflow-hidden relative">
                <div id="exam-grid-container" class="w-full h-full transition-all duration-300">
                    <!-- Questions Injected Here -->
                </div>
             </div>
        </div>
    `;

    updateExamGrid(2); // Default to 2 columns
    renderExamContent();
}

// [Restored Feature] renderStudentSidebar - omitted for brevity (unchanged)

// [New] Render Bundle in Split Column (Top: Passage, Bottom: Questions)
// [New] Render Bundle in Split Column (Top: Passage, Bottom: Questions)
// (Consolidated into the function below)
// [New] Render Bundle in Split Column (Top: Passage, Bottom: Questions)
// [Refactored] 번들 좌측 (지문+이미지) 렌더링
function renderBundleLeft(data) {
    const group = Array.isArray(data) ? data : [data];
    const first = group[0];
    const passage = first.bundlePassageText || "";
    const title = first.commonTitle || "";
    const min = Math.min(...group.map(q => q.displayIndex));
    const max = Math.max(...group.map(q => q.displayIndex));
    const range = (min === max) ? `[${min}]` : `[${min}~${max}]`;

    let bundleImgHtml = "";
    if (first.setId && globalConfig.bundles) {
        const bundle = globalConfig.bundles.find(b => b.id === first.setId);
        const bImg = bundle ? (bundle.imgUrl || bundle.img) : null;
        if (bImg) {
            const safeImg = typeof fixDriveUrl === 'function' ? fixDriveUrl(bImg) : bImg;
            if (safeImg) {
                bundleImgHtml = `<div class="mt-4 mb-2"><img src="${safeImg}" class="w-full h-auto object-contain mx-auto rounded border border-slate-200 shadow-sm bg-white" alt="Bundle Image" loading="lazy"></div>`;
            }
        }
    }

    let bundleAudioHtml = '';
    const _bndA2 = first.setId && globalConfig.bundles ? globalConfig.bundles.find(function(b){ return b.id === first.setId; }) : null;
    if (_bndA2 && _bndA2.audioFileId) {
        const _maxP = parseInt(_bndA2.audioMaxPlay)||1;
        const _sid = first.setId;
        const _used = ((window._audioPlaysUsed||{})[_sid]||0);
        const _displayLeft = Math.max(0, _maxP - _used);
        const _dis = _displayLeft <= 0;
        bundleAudioHtml = '<div class="mt-3 mb-2 flex items-center gap-3 flex-wrap">'
            + '<button id="audio-btn-' + _sid + '" data-max-play="' + _maxP + '" data-file-id="' + _bndA2.audioFileId + '" onclick="playBundleAudio(this,\'' + _sid + '\')"'
            + ' class="exam-audio-btn flex items-center gap-2 bg-[#013976] text-white px-5 py-2 rounded-xl font-bold text-[15px] hover:bg-blue-800 active:scale-95 transition-all shadow-sm flex-shrink-0' + (_dis?' opacity-50 cursor-not-allowed':'') + '"'
            + (_dis?' disabled':'') + '>'
            + ' 🔊 듣기 &nbsp;<span class="plays-left">' + _displayLeft + '</span>회 남음'
            + '</button>'
            + '<div id="audio-player-' + _sid + '" class="hidden flex items-center gap-2 bg-slate-800 rounded-xl px-4 py-2 flex-1" style="min-width:0;max-width:380px">'
            + '<span id="audio-status-' + _sid + '" class="text-green-400 text-[13px] font-bold whitespace-nowrap">▶ 재생중</span>'
            + '<div class="flex-1 bg-slate-600 rounded-full overflow-hidden" style="height:6px"><div id="audio-progress-' + _sid + '" class="bg-green-400 h-full rounded-full" style="width:0%;transition:width 0.5s linear"></div></div>'
            + '<span id="audio-time-' + _sid + '" class="text-slate-300 text-[12px] whitespace-nowrap">0:00</span>'
            + '</div>'
            + '<audio id="audio-elem-' + _sid + '" preload="none"></audio>'
            + '</div>';
    }

    return `
        ${title ? `<div class="px-0 pb-3 bg-white border-b border-slate-200 flex items-center"><h3 class="font-bold text-slate-700 text-[15px] flex items-center gap-2 m-0 leading-tight"><span class="text-indigo-600 text-[17px] font-bold shrink-0">${range}</span><span>${title}</span></h3></div>` : ''}
        ${passage ? `<div class="mt-3 mb-0 p-4 border border-black rounded shadow-sm bg-white"><div class="prose prose-sm max-w-none text-slate-700 leading-relaxed font-serif text-[15px]">${passage}</div></div>` : ''}
        ${bundleAudioHtml}
        ${bundleImgHtml}
    `;
}


// [Refactored] 번들 우측 (문항들) 렌더링
function renderBundleRight(data) {
    const group = Array.isArray(data) ? data : [data];
    return group.map(q => renderSubQuestion(q)).join('<hr class="border-t border-slate-200 my-8" />');
}

// [Backward Compat] renderSplitBundle — 기존 호출 호환용
function renderSplitBundle(data) {
    return `<div class="flex h-full w-full bg-white"><div class="w-1/2 h-full overflow-y-auto p-6 border-r border-black">${renderBundleLeft(data)}</div><div class="w-1/2 h-full overflow-y-auto p-6">${renderBundleRight(data)}</div></div>`;
}

// [Refactor] Render Sub Question (Seamless Style)
function renderSubQuestion(q) {
    const mediaHtml = getMediaHtml(q);
    const inputHtml = getInputHtml(q);

    let subPassageHtml = "";
    // [Fix] Reverted to ensure individual passage logic ALWAYS works (as requested by user)
    if (q.passage1 && q.passage1.trim() !== "") {
        subPassageHtml = `
            <div class="mb-3 p-3 bg-slate-100/50 border border-black rounded-lg text-[14px] leading-relaxed font-serif text-slate-700">
                ${q.passage1}
            </div>
         `;
    }

    // [Fix] Remove "Card" Style (No shadow/border/bg-white), Just Layout
    return `
        <div class="mb-0">
            <div class="flex items-start gap-3 mb-2">
                 <!-- Number Box -->
                 <div class="flex-shrink-0 w-7 h-7 rounded bg-indigo-600 text-white flex items-center justify-center font-bold text-[15px] pt-0.5 shadow-sm">
                    ${q.displayIndex}
                 </div>
                 <!-- Question Text (Aligned) -->
                 <h4 class="text-[15px] font-normal text-slate-800 leading-snug pt-0.5 break-keep select-text">${q.text}</h4>
            </div>
            
            <div class="space-y-3 pl-0">
                ${subPassageHtml}
                ${mediaHtml}
                <div class="text-[14px]">
                    ${inputHtml}
                </div>
            </div>
        </div>
    `;
}

// [Refactor] Input HTML (Compact & Grid Choices)
function getInputHtml(q) {
    if (q.type === '객관형') {
        const choices = [q.choice1, q.choice2, q.choice3, q.choice4, q.choice5].filter(c => c && c.trim() !== "");
        return renderChoices(q, choices);
    } else {
        // Subjective: Compact 1-Line
        const saved = examSession.answers[q.id] || "";
        return `
            <div class="mt-1">
                <textarea 
                    oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'; saveAnswer('${q.id}', this.value)"
                    class="w-full p-2 bg-white border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all font-serif text-[14px] leading-relaxed resize-none overflow-hidden min-h-[40px]"
                    rows="1"
                    placeholder="답안을 입력하세요">${saved}</textarea>
            </div>
        `;
    }
}

// [Refactor] Render Choices (원문자 버튼, 2-Col Grid) — [Fix] labelType(alpha/number) 분기 지원
function renderChoices(q, choices) {
    const savedAns = examSession.answers[q.id];
    // [Fix] labelType에 따라 원문자 및 선택값 분기
    const _lType = q.labelType || 'number';
    const _alphaCircled = ['Ⓐ','Ⓑ','Ⓒ','Ⓓ','Ⓔ'];
    const _numCircled   = ['①','②','③','④','⑤','⑥'];
    const cnums = _lType === 'alpha' ? _alphaCircled : _numCircled;
    // alpha 모드: 선택값 = A/B/C/D/E, number 모드: 선택값 = 1/2/3/4/5
    const getVal = (idx) => _lType === 'alpha' ? ['A','B','C','D','E'][idx] : (idx + 1).toString();
    // 선택지 길이 기반 레이아웃: 25자 초과 시 1열, 이하 2열
    const isLong = choices.some(c => c.length > 25);
    const gridClass = isLong ? "grid-cols-1" : "grid-cols-2";
    return `
        <div class="grid ${gridClass} gap-x-6 gap-y-2">
            ${choices.map((choice, idx) => {
        const val = getVal(idx);
        const isSel = String(savedAns) === val;
        const textClass = isSel ? 'text-indigo-700 font-bold' : 'text-slate-700';
        return `<label class="exam-choice-btn flex items-start gap-2 cursor-pointer p-1 -ml-1 transition-colors" data-qid="${q.id}" data-val="${val}" onclick="selectObjAnswer('${q.id}','${val}')">
                    <span class="exam-circle-num flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-[15px] font-bold mt-0.5"
                        style="background:${isSel?'#4f46e5':'#ffffff'};color:${isSel?'#ffffff':'#4f46e5'};border-color:${isSel?'#4f46e5':'#c7d2fe'}"
                    >${cnums[idx]||val}</span>
                    <span class="${textClass} text-[14px] leading-snug hover:text-indigo-600 transition-colors mt-1">${choice}</span>
                </label>`;
    }).join('')}
        </div>
    `;
}

// [Refactored] updateExamGrid — 항상 2분할 고정
function updateExamGrid(cols) {
    currentExamGridCols = 2;
    examPageSize = 1; // 1 page unit per page
    renderExamContent();
}

// --- RESTORED MISSING FUNCTIONS ---

// [Restored] getMediaHtml
function getMediaHtml(q) {
    if (!q.imgUrl || q.imgUrl === "undefined" || q.imgUrl === "null") return "";

    // [Fix] Apply Google Drive URL Fixer
    const safeUrl = typeof fixDriveUrl === 'function' ? fixDriveUrl(q.imgUrl) : q.imgUrl;

    return `
        <div class="mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img src="${safeUrl}" 
                 class="w-full h-auto max-h-[400px] object-contain mx-auto" 
                 alt="Question Image" 
                 loading="lazy"
                 onerror="this.style.display='none'; if(this.parentElement) this.parentElement.style.display='none';">
        </div>
    `;
}

// [Restored] getInputHtml
/* Overwritten above */

// [Restored] renderChoices
/* Overwritten above */

/* saveAnswer below */
/* setupScrollArrows below */

function saveAnswer(qId, val) {
    examSession.answers[qId] = val;
    updateProgressUI();
    // Auto-save logic if needed
}

// [Restored] setupScrollArrows (Left Side)
function setupScrollArrows() {
    const wrappers = document.querySelectorAll('.custom-scroll-wrapper');
    wrappers.forEach(wrapper => {
        if (wrapper.dataset.hasArrows) return; // Prevent double injection
        const content = wrapper.querySelector('.custom-scrollbar');
        if (!content) return;

        wrapper.dataset.hasArrows = "true";

        // Create Arrows
        const upBtn = document.createElement('button');
        const downBtn = document.createElement('button');

        // Style: Right Side, Floating
        const btnClass = "absolute right-2 z-20 p-2 bg-white/90 rounded-full shadow-lg border border-slate-200 text-blue-600 hover:bg-blue-50 hover:scale-110 transition-all hidden opacity-90 hover:opacity-100 flex items-center justify-center";

        upBtn.className = `${btnClass} top-3 animate-fade-in-safe`;
        downBtn.className = `${btnClass} bottom-3 animate-fade-in-safe`;

        upBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>`;
        downBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="3" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>`;

        // Insert
        wrapper.appendChild(upBtn);
        wrapper.appendChild(downBtn);

        // Logic
        const updateArrows = () => {
            const { scrollTop, scrollHeight, clientHeight } = content;
            // Show Up if scrolled down > 10px
            if (scrollTop > 10) upBtn.classList.remove('hidden');
            else upBtn.classList.add('hidden');

            // Show Down if more content exists > 10px
            if (scrollTop + clientHeight < scrollHeight - 10) downBtn.classList.remove('hidden');
            else downBtn.classList.add('hidden');
        };

        content.addEventListener('scroll', updateArrows);
        // Initial Check
        updateArrows();
        // Resize Observer for dynamic content changes
        new ResizeObserver(updateArrows).observe(content);

        // Click Scroll actions
        // Scroll amount: ~150px or 1 item height
        upBtn.onclick = (e) => { e.stopPropagation(); content.scrollBy({ top: -200, behavior: 'smooth' }); };
        downBtn.onclick = (e) => { e.stopPropagation(); content.scrollBy({ top: 200, behavior: 'smooth' }); };
    });
}

// [Restored] fixDriveUrl
function fixDriveUrl(url) {
    if (!url || typeof url !== 'string') return "";
    const patterns = [
        /file\/d\/([a-zA-Z0-9-_]+)/,
        /id=([a-zA-Z0-9-_]+)/,
        /folders\/([a-zA-Z0-9-_]+)/,
        /open\?id=([a-zA-Z0-9-_]+)/,
        /uc\?.*id=([a-zA-Z0-9-_]+)/
    ];
    for (let pattern of patterns) {
        let match = url.match(pattern);
        if (match && match[1]) {
            return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w1000`;
        }
    }
    return url;
}


// [Restored] renderQuestionCard (Required for renderExamContent)
function renderQuestionCard(q) {
    return renderSubQuestion(q);
}

// [Merged] renderExamResult → line 3240 참조 (중복 제거)



