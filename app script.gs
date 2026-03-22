/*
========================================================================================
🚨 [CRITICAL WARNING] - DO NOT EDIT WITHOUT READING 'PRE_WORK_CHECKLIST.md' 🚨
모든 수정/보완/지시 수행 전, 반드시 프로젝트 루트의 `PRE_WORK_CHECKLIST.md`를 읽고
5대 절대 원칙을 마음속으로 복창한 뒤에만 작업을 진행하십시오.
이 경고를 무시하면 사용자의 150시간이 다시 사라집니다.
========================================================================================
*/
/**
 * [연세국제영어 마스터 통제소 v18]
 * - 원장님 전용 이미지 엔진 및 데이터 허브
 * - 기능: 로고/배너 권한 강제 갱신, 문항 및 이미지 독립 저장, 중앙 설정 관리
 */

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var rootFolderId = data.parentFolderId;
    var assetFolderId = data.assetFolderId;
    
    // --- [기능 1] 로고 및 배너 클라우드 저장 (Single Root Policy) ---
    if (data.type === "LOGO_SAVE") {
      var targetFolder;
      
      // 사용자 요청: "그 링크(최상위)에 다 때려넣는다"
      // 별도 자산 폴더나 하위 폴더 생성 없이 바로 루트 사용
      if (rootFolderId) {
        targetFolder = DriveApp.getFolderById(rootFolderId);
      }
      else {
        return ContentService.createTextOutput(JSON.stringify({
          status: "Error",
          message: "저장할 최상위 폴더 ID가 없습니다."
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // 파일명 결정 (로고는 academy_logo, 배너는 academy_banner)
      var finalFileName = (data.assetName === "banner") ? "academy_banner.png" : "academy_logo.png";
      
      // 기존 동일 이름 파일 제거 (중복 방지 및 최신화)
      var oldFiles = targetFolder.getFilesByName(finalFileName);
      while (oldFiles.hasNext()) { oldFiles.next().setTrashed(true); }
      
      // 신규 이미지 파일 생성
      var blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType, finalFileName);
      var file = targetFolder.createFile(blob);
      
      // [중요] 외부 가시성 확보를 위한 권한 강제 설정
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      // 브라우저에서 깨짐 없이 출력되는 URL 형식 생성 (uc?id=)
      var directUrl = "https://drive.google.com/uc?id=" + file.getId();
      
      return ContentService.createTextOutput(JSON.stringify({
        url: directUrl,
        folderName: targetFolder.getName(),
        status: "Success"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 2] (Deprecated) 독립 저장 핸들러 제거됨
    // 사용자 요청에 따라 구버전 스키마를 사용하는 독립 저장/수정/삭제/재정렬 로직은 모두 제거했습니다.
    // 모든 저장은 'SAVE_FULL_TEST_DATA' (기능 14)를 통해 통합 처리됩니다.

    
    // --- [기능 3] 시스템 설정 불러오기 (클라우드 중앙 관리) ---
    else if (data.type === "GET_CONFIG") {
      var configSheet = getOrCreateConfigSheet(rootFolderId);
      var configData = {};
      
      // 시트에서 모든 설정 읽기
      var lastRow = configSheet.getLastRow();
      if (lastRow > 1) {
        var values = configSheet.getRange(2, 1, lastRow - 1, 2).getValues();
        for (var i = 0; i < values.length; i++) {
          var key = values[i][0];
          var value = values[i][1];
          if (key && value) {
            // JSON 형태 데이터는 파싱
            try {
              configData[key] = JSON.parse(value);
            } catch (e) {
              configData[key] = value;
            }
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "Success",
        config: configData
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 4] 시스템 설정 저장 (클라우드 동기화) ---
    else if (data.type === "SAVE_CONFIG") {
      var configSheet = getOrCreateConfigSheet(rootFolderId);
      var configToSave = data.config;
      
      // 기존 데이터만 지우고 행렬(포맷)은 유지하여 구글 시트 오류(모든 비고정행 삭제 에러) 방지
      var lastRow = configSheet.getLastRow();
      if (lastRow > 1) {
        configSheet.getRange(2, 1, lastRow - 1, 2).clearContent();
      }
      
      // 새로운 설정 저장 (일괄 저장을 위해 배열 형태로 준비)
      var newRows = [];
      for (var key in configToSave) {
        var value = configToSave[key];
        // 객체/배열은 JSON 문자열로 변환
        if (typeof value === 'object') {
          value = JSON.stringify(value);
        }
        newRows.push([key, value]);
      }
      
      // 일괄 배열 업데이트 (appendRow루프보다 압도적으로 빠르고 확실함)
      if (newRows.length > 0) {
        configSheet.getRange(2, 1, newRows.length, 2).setValues(newRows);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "Success"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 5] 학생 성적 저장 ---
    else if (data.type === "STUDENT_SAVE") {
      if (!rootFolderId) throw new Error("카테고리 폴더가 설정되지 않았습니다.");
      
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var categoryName = data.categoryName || "미분류";
      
      // 학생DB 시트 자동 생성/연결
      var studentSheet = getOrCreateSpreadsheet(rootFolder, categoryName + "_학생DB");
      var sheet = studentSheet.getSheets()[0];
      
      // 헤더가 없으면 생성 (실제 시트 컬럼 구조에 맞게)
      if (sheet.getLastRow() === 0) {
        var headers = [
          "응시일", "학생ID", "학생명", "학년",
          "문항별상세(JSON)",
          "Grammar_점수", "Grammar_만점",
          "Writing_점수", "Writing_만점",
          "Reading_점수", "Reading_만점",
          "Listening_점수", "Listening_만점",
          "Vocabulary_점수", "Vocabulary_만점",
          "최상_점수", "최상_만점",
          "상_점수",   "상_만점",
          "중_점수",   "중_만점",
          "하_점수",   "하_만점",
          "기초_점수", "기초_만점",
          "총점", "만점", "정답률(%)",
          "등록학급"
        ];
        sheet.appendRow(headers);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#4A90E2").setFontColor("#FFFFFF");
      }

      // 점수 계산
      var totalScore  = data.totalScore  || 0;
      var maxScore    = data.maxScore    || 100;
      var percentage  = maxScore > 0 ? ((totalScore / maxScore) * 100).toFixed(2) : 0;

      // 데이터 행 구성 (실제 시트 컬럼 순서에 정확히 일치)
      var rowData = [
        data.testDate || new Date().toISOString().split('T')[0],
        data.studentId,
        data.studentName,
        data.grade,
        data.questionScores || "",          // 문항별상세(JSON)
        data.grammarScore   || 0, data.grammarMax    || 0,
        data.writingScore   || 0, data.writingMax    || 0,
        data.readingScore   || 0, data.readingMax    || 0,
        data.listeningScore || 0, data.listeningMax  || 0,
        data.vocabScore     || 0, data.vocabMax      || 0,
        data.difficulty_highest      || 0, data.difficulty_highest_max      || 0,
        data.difficulty_high         || 0, data.difficulty_high_max         || 0,
        data.difficulty_mid          || 0, data.difficulty_mid_max          || 0,
        data.difficulty_low          || 0, data.difficulty_low_max          || 0,
        data.difficulty_basic        || 0, data.difficulty_basic_max        || 0,
        totalScore, maxScore, percentage,
        data.studentClass || ""             // 등록학급 (맨 끝)
      ];

      sheet.appendRow(rowData);
      
      return ContentService.createTextOutput("Success").setMimeType(ContentService.MimeType.TEXT);
    }

    // --- [\uae30\ub2a5 5-2] \ub4f1\ub85d\ud559\uae09 \uc800\uc7a5/\uc5c5\ub370\uc774\ud2b8 ---
    else if (data.type === "SAVE_STUDENT_CLASS") {
      if (!rootFolderId) throw new Error("\ud3f4\ub354\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.");
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var files3 = rootFolder.getFiles();
      var tf3 = null;
      while (files3.hasNext()) { var f3=files3.next(); if(f3.getName().endsWith("_\ud559\uc0ddDB")){ tf3=f3; break; } }
      if (!tf3) throw new Error("\ud559\uc0ddDB\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.");
      var sc3 = SpreadsheetApp.open(tf3).getSheets()[0];
      var hdr3 = sc3.getRange(1,1,1,sc3.getLastColumn()).getValues()[0];
      var clsCol = hdr3.indexOf("\ub4f1\ub85d\ud559\uae09") + 1;
      if (clsCol === 0) {
        clsCol = sc3.getLastColumn() + 1;
        sc3.getRange(1, clsCol).setValue("\ub4f1\ub85d\ud559\uae09").setFontWeight("bold").setBackground("#27ae60").setFontColor("#FFFFFF");
      }
      var lr3 = sc3.getLastRow();
      var sid3 = String(data.studentId);
      var updated = false;
      for (var i3=2; i3<=lr3; i3++) {
        if (String(sc3.getRange(i3,2).getValue()) === sid3) {
          sc3.getRange(i3, clsCol).setValue(data.studentClass || "");
          updated = true; break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status:"Success", updated:updated })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 5-1] AI 코멘트 자동 저장 ---
    else if (data.type === "SAVE_AI_COMMENT") {
      if (!rootFolderId) throw new Error("폴더가 없습니다.");
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var files2 = rootFolder.getFiles();
      var targetFile2 = null;
      while (files2.hasNext()) {
        var f2 = files2.next();
        if (f2.getName().endsWith("_학생DB")) { targetFile2 = f2; break; }
      }
      if (!targetFile2) throw new Error("학생DB 파일을 찾을 수 없습니다.");
      var sai = SpreadsheetApp.open(targetFile2).getSheets()[0];
      var lcai = sai.getLastColumn();
      var hdrai = sai.getRange(1, 1, 1, lcai).getValues()[0];
      var aiOvCol = hdrai.indexOf("AI_종합코멘트") + 1;
      var aiScCol = hdrai.indexOf("AI_영역코멘트(JSON)") + 1;
      var notesCol = hdrai.indexOf("기타사항") + 1;
      if (aiOvCol === 0) {
        aiOvCol = lcai + 1; lcai++;
        sai.getRange(1, aiOvCol).setValue("AI_종합코멘트").setFontWeight("bold").setBackground("#6c5ce7").setFontColor("#FFFFFF");
      }
      if (aiScCol === 0) {
        aiScCol = lcai + 1; lcai++;
        sai.getRange(1, aiScCol).setValue("AI_영역코멘트(JSON)").setFontWeight("bold").setBackground("#6c5ce7").setFontColor("#FFFFFF");
      }
      if (notesCol === 0) {
        notesCol = lcai + 1; lcai++;
        sai.getRange(1, notesCol).setValue("기타사항").setFontWeight("bold").setBackground("#6c5ce7").setFontColor("#FFFFFF");
      }
      var lrai = sai.getLastRow();
      var sidai = String(data.studentId);
      for (var ii = 2; ii <= lrai; ii++) {
        if (String(sai.getRange(ii, 2).getValue()) === sidai) {
          if (data.overallComment !== undefined) sai.getRange(ii, aiOvCol).setValue(data.overallComment || "");
          if (data.sectionComments !== undefined) sai.getRange(ii, aiScCol).setValue(JSON.stringify(data.sectionComments || {}));
          if (data.notes !== undefined) sai.getRange(ii, notesCol).setValue(data.notes || "");
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", message: "AI 코멘트 저장 완료" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 6-1] 학생 목록 조회 (Dropdown용) ---
    else if (data.type === "GET_STUDENT_LIST") {
      if (!rootFolderId) throw new Error("카테고리 폴더가 설정되지 않았습니다.");
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var categoryName = data.categoryName || "미분류";
      var files = rootFolder.getFilesByName(categoryName + "_학생DB");
      if (!files.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({ status: "Success", data: [] })).setMimeType(ContentService.MimeType.JSON);
      }
      var sheet = SpreadsheetApp.open(files.next()).getSheets()[0];
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow <= 1) return ContentService.createTextOutput(JSON.stringify({ status: "Success", data: [] })).setMimeType(ContentService.MimeType.JSON);
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var dataValues = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var list = [];
      for (var i = 0; i < dataValues.length; i++) {
        var row = {};
        for (var j = 0; j < headers.length; j++) { row[headers[j]] = dataValues[i][j]; }
        row.id = dataValues[i][1]; row.name = dataValues[i][2]; row.date = dataValues[i][0]; row.grade = dataValues[i][3];
        list.push(row);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "Success", data: list })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 6-2] 특정 학생 성적표 조회 ---
    else if (data.type === "GET_STUDENT_REPORT") {
      if (!rootFolderId) throw new Error("카테고리 폴더가 설정되지 않았습니다.");
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var files = rootFolder.getFiles();
      var targetFile = null;
      while (files.hasNext()) {
        var f = files.next();
        if (f.getName().endsWith("_학생DB")) { targetFile = f; break; }
      }
      if (!targetFile) return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "학생 DB 파일을 찾을 수 없습니다." })).setMimeType(ContentService.MimeType.JSON);
      var sheet = SpreadsheetApp.open(targetFile).getSheets()[0];
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      var body = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      var report = null;
      var studentId = data.studentId;
      for (var i = 0; i < body.length; i++) {
        if (String(body[i][1]) === String(studentId)) {
          report = {};
          for (var h = 0; h < headers.length; h++) {
            var headerName = headers[h];
            var val = body[i][h];
            if (headerName === "응시일") report.testDate = val;
            else if (headerName === "학생명") report.studentName = val;
            else if (headerName === "학년") report.grade = val;
            else if (headerName === "입력방식") report.inputMode = val;
            else if (headerName === "총점") report.totalScore = val;
            else if (headerName === "만점") report.maxScore = val;
            else if (headerName === "정답률(%)") report["정답률(%)"] = val;
            else if (headerName === "Grammar_점수") report.grammarScore = val;
            else if (headerName === "Grammar_만점") report.grammarMax = val;
            else if (headerName === "Writing_점수") report.writingScore = val;
            else if (headerName === "Writing_만점") report.writingMax = val;
            else if (headerName === "Reading_점수") report.readingScore = val;
            else if (headerName === "Reading_만점") report.readingMax = val;
            else if (headerName === "Listening_점수") report.listeningScore = val;
            else if (headerName === "Listening_만점") report.listeningMax = val;
            else if (headerName === "Vocabulary_점수") report.vocabScore = val;
            else if (headerName === "Vocabulary_만점") report.vocabMax = val;
            else if (headerName === "문항별상세(JSON)") report.questionScores = val;
            else if (headerName === "등록학급") report.studentClass = val || null;
            else if (headerName === "기타사항") report.notes = val || null;
            else if (headerName === "AI_종합코멘트") report.aiOverallComment = val || null;
            else if (headerName === "AI_영역코멘트(JSON)") {
              try { report.aiSectionComments = val ? JSON.parse(val) : {}; }
              catch(e) { report.aiSectionComments = {}; }
            }
          }
          break;
        }
      }
      if (report) {
        return ContentService.createTextOutput(JSON.stringify({ status: "Success", data: report })).setMimeType(ContentService.MimeType.JSON);
      } else {
        return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "학생 데이터를 찾을 수 없습니다." })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // --- [기능 6-3] 학생 레코드 삭제 (DELETE_STUDENT) ---
    else if (data.type === "DELETE_STUDENT") {
      if (!rootFolderId) throw new Error("폴더 없음");
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var delFiles = rootFolder.getFiles();
      var delTarget = null;
      while (delFiles.hasNext()) { var df = delFiles.next(); if (df.getName().endsWith("_학생DB")) { delTarget = df; break; } }
      if (!delTarget) throw new Error("학생DB 파일 없음");
      var delSheet = SpreadsheetApp.open(delTarget).getSheets()[0];
      var delLast = delSheet.getLastRow();
      var delSid = String(data.studentId);
      for (var di = 2; di <= delLast; di++) {
        if (String(delSheet.getRange(di, 2).getValue()) === delSid) {
          delSheet.deleteRow(di);
          return ContentService.createTextOutput(JSON.stringify({ status: "Success", message: "삭제 완료" })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: "학생 미발견" })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 7] 문항 조회 (통계용) ---
    else if (data.type === "GET_QUESTIONS") {
      if (!rootFolderId) throw new Error("카테고리 폴더가 설정되지 않았습니다.");
      
      var rootFolder = DriveApp.getFolderById(rootFolderId);
      var categoryName = data.categoryName || "미분류";
      
      var files = rootFolder.getFilesByName(categoryName + "_문항DB");
      if (!files.hasNext()) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "Success",
          questions: []
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      var qSheet = SpreadsheetApp.open(files.next());
      var sheet = qSheet.getSheets()[0];
      
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "Success",
          questions: []
        })).setMimeType(ContentService.MimeType.JSON);
      }
      
      // 헤더 읽기
      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      
      // 데이터 읽기
      var values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
      
      var questions = [];
      for (var i = 0; i < values.length; i++) {
        var question = {};
        for (var j = 0; j < headers.length; j++) {
          question[headers[j]] = values[i][j];
        }
        questions.push(question);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "Success",
        questions: questions
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // --- [기능 8] 폴더 백업 (카테고리 삭제 시) ---
    else if (data.type === "BACKUP_FOLDER") {
      var folderId = data.folderId;
      var categoryName = data.categoryName || "미분류";
      
      if (!folderId) throw new Error("폴더 ID가 없습니다.");
      
      try {
        var folderToBackup = DriveApp.getFolderById(folderId);
        var folderName = folderToBackup.getName();
        
        // 루트에서 "백업" 폴더 찾기 또는 생성
        var backupFolder = null;
        var parentFolders = folderToBackup.getParents();
        
        if (parentFolders.hasNext()) {
          var parentFolder = parentFolders.next();
          var backupFolders = parentFolder.getFoldersByName("백업");
          
          if (backupFolders.hasNext()) {
            backupFolder = backupFolders.next();
          } else {
            backupFolder = parentFolder.createFolder("백업");
          }
          
          // 폴더 이름에 타임스탬프 추가하여 백업 폴더로 이동
          var timestamp = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmmss");
          var newName = folderName + "_백업_" + timestamp;
          folderToBackup.setName(newName);
          
          // 백업 폴더로 이동
          backupFolder.addFolder(folderToBackup);
          parentFolder.removeFolder(folderToBackup);
          
          return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            message: "폴더가 백업되었습니다."
          })).setMimeType(ContentService.MimeType.JSON);
        } else {
          throw new Error("부모 폴더를 찾을 수 없습니다.");
        }
      } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "Error",
          message: err.toString()
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    // --- [기능 9] 새 카테고리 폴더 자동 생성 (Frontend 요청) ---
    else if (data.type === "CREATE_FOLDER") {
        if (!rootFolderId) throw new Error("최상위(자산) 폴더 ID가 필요합니다.");
        
        var parentFolder = DriveApp.getFolderById(rootFolderId);
        // 폴더 생성
        var newFolder = parentFolder.createFolder(data.folderName);
        
        // 권한 설정 (뷰어 권한 부여: 선택사항)
        newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            folderUrl: newFolder.getUrl(),
            folderId: newFolder.getId()
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 10] 카테고리 폴더 이름 변경 (Frontend 요청) ---
    else if (data.type === "RENAME_FOLDER") {
        if (!data.folderId || !data.newName) throw new Error("폴더 ID와 새 이름이 누락되었습니다.");
        
        var targetFolder = DriveApp.getFolderById(data.folderId);
        targetFolder.setName(data.newName);
        
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            message: "폴더명이 성공적으로 변경되었습니다."
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 11] 루트 하위 폴더 목록 조회 (복구용) ---
    else if (data.type === "LIST_FOLDERS") {
        if (!rootFolderId) throw new Error("루트 폴더 ID가 필요합니다.");
        var root = DriveApp.getFolderById(rootFolderId);
        var folders = root.getFolders();
        var folderList = [];
        while (folders.hasNext()) {
            var f = folders.next();
            // 시스템 자산 폴더나 백업 폴더는 제외 (선택 사항)
            if (f.getName() !== "System_Assets" && f.getName() !== "이미지창고") {
                folderList.push({
                    name: f.getName(),
                    id: f.getId(),
                    url: f.getUrl()
                });
            }
        }
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            folders: folderList
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 12] DB 초기화 (RESET_DB) ---
    else if (data.type === "RESET_DB") {
        if (!rootFolderId) throw new Error("폴더 ID가 필요합니다.");
        
        var categoryName = data.categoryName || "미분류";
        var dbType = data.dbType; // 'student' or 'question'
        var suffix = (dbType === 'student') ? "_학생DB" : "_문항DB";
        var fileName = categoryName + suffix;

        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var files = rootFolder.getFilesByName(fileName);
        
        if (files.hasNext()) {
            var spreadsheet = SpreadsheetApp.open(files.next());
            var sheet = spreadsheet.getSheets()[0];
            var lastRow = sheet.getLastRow();
            
            // 데이터가 있는 경우(헤더 제외 2행부터)만 삭제 진행
            if (lastRow > 1) {
                sheet.deleteRows(2, lastRow - 1);
            }
            
            return ContentService.createTextOutput(JSON.stringify({
                status: "Success",
                message: fileName + " 초기화 완료"
            })).setMimeType(ContentService.MimeType.JSON);
        } else {
            return ContentService.createTextOutput(JSON.stringify({
                status: "Error",
                message: "해당 DB 파일을 찾을 수 없습니다: " + fileName
            })).setMimeType(ContentService.MimeType.JSON);
        }
    }

    // --- [기능 13] PDF to Text (OCR) - v2/v3 Hybrid ---
    else if (data.type === "PDF_TO_TEXT") {
        try {
            var blob = Utilities.newBlob(Utilities.base64Decode(data.fileData), data.mimeType, data.fileName);
            var title = data.fileName;
            var docId;

            // 1. Try Drive API v2 (insert)
            if (Drive.Files.insert) {
                var resource = { title: title, mimeType: data.mimeType };
                // v2 uses 'ocr' and 'ocrLanguage' in optional args
                var file = Drive.Files.insert(resource, blob, { ocr: true, ocrLanguage: 'ko' });
                docId = file.id;
            } 
            // 2. Try Drive API v3 (create)
            else if (Drive.Files.create) {
                // [Fix] v3에서 OCR을 하려면 타겟 mimeType을 Google Doc으로 지정해야 함
                var resource = { 
                    name: title, 
                    mimeType: "application/vnd.google-apps.document" 
                };
                
                // create(resource, blob, optionalArgs)
                var file = Drive.Files.create(resource, blob, { ocrLanguage: 'ko' });
                docId = file.id;
            } 
            else {
                throw new Error("Drive API (Advanced Service) is not enabled.");
            }
            
            // 2. Open Document & Extract Text
            var doc = DocumentApp.openById(docId);
            var text = doc.getBody().getText();
            
            // 3. Cleanup
            try { Drive.Files.remove(docId); } catch(e) {} // v2
            try { DriveApp.getFileById(docId).setTrashed(true); } catch(e) {} // Fallback cleanup
            
            return ContentService.createTextOutput(JSON.stringify({
                status: "Success",
                text: text
            })).setMimeType(ContentService.MimeType.JSON);
            
        } catch (e) {
             return ContentService.createTextOutput(JSON.stringify({
                status: "Error",
                message: "OCR Error: " + e.toString() + " (Check Drive API Service)"
            })).setMimeType(ContentService.MimeType.JSON);
        }
    }

    // --- [기능 14] 관계형 문항 통합 저장 (SAVE_FULL_TEST_DATA) ---
    else if (data.type === "SAVE_FULL_TEST_DATA") {
        if (!rootFolderId) throw new Error("대분류 폴더가 연결되지 않았습니다.");
        
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var categoryName = data.categoryName || "미분류";
        var imgFolder = getOrCreateFolder(rootFolder, "이미지창고");
        
        // 1. 통합 DB 파일 열기 (없으면 생성)
        var dbSpreadsheet = getOrCreateSpreadsheet(rootFolder, categoryName + "_통합DB");
        
        // (Sheet1 deletion moved to after sheet creation)
        
        // 2. 시트 확보 (Questions, Bundles)
        var sheetQ = getOrCreateSheet(dbSpreadsheet, "Questions");
        var sheetB = getOrCreateSheet(dbSpreadsheet, "Bundles");
        
        // 3. 헤더 설정 (A탭: 문항) - [REFACTORED SCHEMA v2]
        if (sheetQ.getLastRow() === 0) {
            sheetQ.appendRow([
                "문항번호", "영역", "세부영역", "문항유형", "난이도", 
                "배점", "질문 내용", "지문 내용", "이미지URL", "보기(JSON)", "정답", "모범답안",
                "세트번호"
            ]);
            sheetQ.getRange("A1:M1").setFontWeight("bold").setBackground("#4A90E2").setFontColor("#FFFFFF");
        }
        
        // 4. 헤더 설정 (B탭: 묶음)
        if (sheetB.getLastRow() === 0) {
            sheetB.appendRow([
                "세트번호", "질문 내용", "지문 내용", "이미지URL", "연결문항번호"
            ]);
            sheetB.getRange("A1:E1").setFontWeight("bold").setBackground("#EA580C").setFontColor("#FFFFFF");
        }

        // [Moved] 불필요한 '시트1' 삭제 (시트 생성 후 수행해야 삭제 가능)
        var defaultSheet = dbSpreadsheet.getSheetByName("시트1");
        if (defaultSheet && dbSpreadsheet.getSheets().length > 1) {
            dbSpreadsheet.deleteSheet(defaultSheet);
        }
        
        // 5. 이전 데이터 클리어 (Overwrite Mode)
        if (sheetQ.getLastRow() > 1) sheetQ.deleteRows(2, sheetQ.getLastRow() - 1);
        if (sheetB.getLastRow() > 1) sheetB.deleteRows(2, sheetB.getLastRow() - 1);
        
        // 6. 데이터 저장: 묶음 (Bundles)
        if (data.bundles && data.bundles.length > 0) {
            var bRows = data.bundles.map(function(b) {
                var bImgUrl = "";
                if (b.imgData && b.imgData.base64) {
                    bImgUrl = saveImg(imgFolder, b.imgData.base64, b.imgData.mimeType, b.imgData.fileName);
                } else if (b.imgUrl) {
                    bImgUrl = b.imgUrl;
                }
                
                return [
                    b.id,               
                    b.title || "",      
                    b.text || "",       
                    bImgUrl,            
                    b.questionIds || "" 
                ];
            });
            sheetB.getRange(2, 1, bRows.length, 5).setValues(bRows);
        }
        
        // 7. 데이터 저장: 문항 (Questions)
        if (data.questions && data.questions.length > 0) {
            var qRows = data.questions.map(function(q) {
                var qImgUrl = "";
                if (q.imgData && q.imgData.base64) {
                    qImgUrl = saveImg(imgFolder, q.imgData.base64, q.imgData.mimeType, q.imgData.fileName);
                } else if (q.imgUrl) {
                    qImgUrl = q.imgUrl;
                }
                
                return [
                    q.no || 0,              // 문항번호 (No)
                    q.section || "",
                    q.subType || "",
                    q.type || "객관형",
                    q.difficulty || "중",
                    q.score || 0,
                    q.title || "",          // 질문 내용
                    q.text || "",           // [New] 지문 내용 (Passage Content)
                    qImgUrl,                // 이미지 URL
                    JSON.stringify(q.options || q.choices || []), // 보기 (프론트엔드 options 파라미터 매핑)
                    q.answer || "",         // 정답
                    q.modelAnswer || "",    // 모범답안
                    q.setId || ""           // 세트번호
                ];
            });
            sheetQ.getRange(2, 1, qRows.length, 13).setValues(qRows);
        }
        
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            message: "통합 DB 저장 완료",
            qCount: data.questions.length,
            bCount: data.bundles ? data.bundles.length : 0
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 15] 통합 DB 조회 (GET_FULL_DB) ---
    else if (data.type === "GET_FULL_DB") {
        if (!rootFolderId) throw new Error("대분류 폴더가 연결되지 않았습니다.");
        
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var categoryName = data.categoryName || "미분류";
        
        var files = rootFolder.getFilesByName(categoryName + "_통합DB");
        if (!files.hasNext()) {
             return ContentService.createTextOutput(JSON.stringify({
                status: "Success",
                questions: [],
                bundles: []
            })).setMimeType(ContentService.MimeType.JSON);
        }
        
        var spreadsheet = SpreadsheetApp.open(files.next());
        var sheetQ = spreadsheet.getSheetByName("Questions");
        var sheetB = spreadsheet.getSheetByName("Bundles");
        
        var questions = [];
        var bundles = [];
        
        // Load Questions (Updated Mapper v2)
        if (sheetQ && sheetQ.getLastRow() > 1) {
            var qData = sheetQ.getRange(2, 1, sheetQ.getLastRow() - 1, sheetQ.getLastColumn()).getValues();
            // Updated Indexes: 0=No, 1=Sec, 2=Sub, 3=Type, 4=Diff, 5=Score, 6=Title, 7=Text, 8=Img, 9=Choices, 10=Ans, 11=Model, 12=SetID
            questions = qData.map(function(r) {
                var choices = [];
                // [Fix] 시트에서 읽어온 문자열 (r[9]) 내 줄바꿈, 탭, 따옴표 문제로 인한 Unterminated string in JSON 파싱 방어
                if (r[9]) {
                    try { 
                        choices = JSON.parse(r[9]); 
                    } catch(e) {
                        try {
                            var safeStr = String(r[9]).replace(/[\n\r]/g, '\\n').replace(/\t/g, '\\t');
                            choices = JSON.parse(safeStr);
                        } catch (e2) {
                            // 최후의 수단: 배열 형태가 아니면 요소를 수동 추정하거나 그냥 빈 배열 반환
                            choices = [];
                        }
                    }
                }
                
                // [Compat] 한글 영역명 → 영문 자동 변환
                var secCompat = {'문법':'Grammar','독해':'Reading','어휘':'Vocabulary','듣기':'Listening','작문':'Writing'};
                var rawSec = String(r[1] || "");
                
                return {
                    no: r[0],
                    section: secCompat[rawSec] || rawSec,
                    subType: r[2],
                    type: r[3],
                    difficulty: r[4],
                    score: r[5],
                    title: r[6],
                    text: r[7],      // [New] Passage Content
                    imgUrl: r[8],    // Index 7 -> 8
                    choices: choices,
                    answer: r[10],   // Index 9 -> 10
                    modelAnswer: r[11], // Index 10 -> 11
                    setId: r[12],    // Index 11 -> 12
                    // Backwards Compatibility for Frontend
                    id: generateMockId() // Need ID for frontend flow
                };
            });
        }
        
        // ... Bundles loading remains same ...
        if (sheetB && sheetB.getLastRow() > 1) {
            var bData = sheetB.getRange(2, 1, sheetB.getLastRow() - 1, sheetB.getLastColumn()).getValues();
            bundles = bData.map(function(r) {
                return {
                    id: r[0],
                    title: r[1],
                    text: r[2],
                    imgUrl: r[3],
                    questionIds: r[4]
                };
            });
        }
        
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            questions: questions,
            bundles: bundles
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 16] AI Proxy (CALL_GEMINI) - Robust Fallback ---
    else if (data.type === "CALL_GEMINI") {
        var apiKey = data.key;
        var prompt = data.prompt;
        
        if (!apiKey) throw new Error("API Key is missing.");
        
        // List of models to try in order (Updated based on Diagnostic: User has access to 2.0/Latest)
        var models = [
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-flash-latest",
            "gemini-pro-latest"
        ];
        
        var lastError = null;
        var successResponse = null;
        
        for (var i = 0; i < models.length; i++) {
            var model = models[i];
            var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + apiKey;
            
            var options = {
                'method': 'post',
                'contentType': 'application/json',
                'payload': JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                'muteHttpExceptions': true
            };
            
            try {
                var response = UrlFetchApp.fetch(url, options);
                var responseCode = response.getResponseCode();
                
                if (responseCode === 200) {
                    var json = JSON.parse(response.getContentText());
                    // Success! Return immediately
                    return ContentService.createTextOutput(JSON.stringify({
                        status: "Success",
                        data: json,
                        modelUsed: model // Inform client which model worked
                    })).setMimeType(ContentService.MimeType.JSON);
                } else {
                    // Log error and try next
                    lastError = "Model " + model + " failed (" + responseCode + "): " + response.getContentText();
                    // If 404, specifically try next. If 400 (Bad Request), maybe stop? No, keep trying just in case.
                }
            } catch (e) {
                lastError = "Exception with " + model + ": " + e.toString();
            }
        }
        
        // --- [Diagnostic] If all failed, check what models ARE available ---
        var availableModels = "Unknown";
        try {
            var listUrl = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
            var listResp = UrlFetchApp.fetch(listUrl, { 'muteHttpExceptions': true });
            if (listResp.getResponseCode() === 200) {
                var listData = JSON.parse(listResp.getContentText());
                if (listData.models) {
                    availableModels = listData.models.map(function(m) { return m.name; }).join(", ");
                }
            } else {
                availableModels = "ListModels Failed (" + listResp.getResponseCode() + ")";
            }
        } catch (e) {
            availableModels = "ListModels Exception: " + e.toString();
        }
        
        // If loop finishes without return, all failed
        return ContentService.createTextOutput(JSON.stringify({
            status: "Error",
            message: "All models failed. Last Error: " + lastError + ". \n[Diagnostic] Available Models for this Key: " + availableModels
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- [기능 16] 부분 업데이트 (UPDATE_QUESTION) — 해당 행만 수정 ---
    else if (data.type === "UPDATE_QUESTION") {
        if (!rootFolderId) throw new Error("카테고리 폴더가 연결되지 않았습니다.");
        
        var rootFolder = DriveApp.getFolderById(rootFolderId);
        var categoryName = data.categoryName || "미분류";
        var imgFolder = getOrCreateFolder(rootFolder, "이미지창고");
        
        // 1. 통합DB 파일 찾기
        var files = rootFolder.getFilesByName(categoryName + "_통합DB");
        if (!files.hasNext()) throw new Error("통합DB 파일을 찾을 수 없습니다. 먼저 문항을 등록해주세요.");
        
        var spreadsheet = SpreadsheetApp.open(files.next());
        var sheetQ = spreadsheet.getSheetByName("Questions");
        var sheetB = spreadsheet.getSheetByName("Bundles");
        
        if (!sheetQ) throw new Error("Questions 시트를 찾을 수 없습니다.");
        
        var q = data.question;
        if (!q) throw new Error("수정할 문항 데이터가 없습니다.");
        
        // 2. Questions 시트에서 해당 행 찾기 (문항번호로 검색)
        var qLastRow = sheetQ.getLastRow();
        var targetRow = -1;
        
        if (qLastRow > 1) {
            var noColumn = sheetQ.getRange(2, 1, qLastRow - 1, 1).getValues(); // A열 = 문항번호
            for (var i = 0; i < noColumn.length; i++) {
                if (String(noColumn[i][0]) === String(q.no)) {
                    targetRow = i + 2; // 1-indexed + header
                    break;
                }
            }
        }
        
        if (targetRow === -1) throw new Error("문항번호 " + q.no + "번을 시트에서 찾을 수 없습니다.");
        
        // 3. 이미지 처리
        var qImgUrl = "";
        if (q.imgData && q.imgData.base64) {
            qImgUrl = saveImg(imgFolder, q.imgData.base64, q.imgData.mimeType, q.imgData.fileName);
        } else if (q.imgUrl) {
            qImgUrl = q.imgUrl;
        } else {
            // 기존 이미지 URL 유지
            qImgUrl = sheetQ.getRange(targetRow, 9).getValue() || "";
        }
        
        // 4. 해당 행만 덮어쓰기 (시트 헤더: No, Sec, Sub, Type, Diff, Score, Title, Text, Img, Choices, Ans, Model, SetID)
        var newRow = [
            q.no,
            q.section || "",
            q.subType || "",
            q.type || "객관식",
            q.difficulty || "중",
            q.score || 0,
            q.title || "",
            q.text || "",
            qImgUrl,
            q.choices ? JSON.stringify(q.choices) : "[]",
            q.answer || "",
            q.modelAnswer || "",
            q.setId || ""
        ];
        
        sheetQ.getRange(targetRow, 1, 1, newRow.length).setValues([newRow]);
        
        // 5. 번들 수정 (있는 경우만)
        if (data.bundle && sheetB) {
            var b = data.bundle;
            var bLastRow = sheetB.getLastRow();
            var bTargetRow = -1;
            
            if (bLastRow > 1) {
                var bIdColumn = sheetB.getRange(2, 1, bLastRow - 1, 1).getValues(); // A열 = 세트번호
                for (var j = 0; j < bIdColumn.length; j++) {
                    if (String(bIdColumn[j][0]) === String(b.id)) {
                        bTargetRow = j + 2;
                        break;
                    }
                }
            }
            
            if (bTargetRow !== -1) {
                var bImgUrl = "";
                if (b.imgData && b.imgData.base64) {
                    bImgUrl = saveImg(imgFolder, b.imgData.base64, b.imgData.mimeType, b.imgData.fileName);
                } else if (b.imgUrl) {
                    bImgUrl = b.imgUrl;
                } else {
                    bImgUrl = sheetB.getRange(bTargetRow, 4).getValue() || "";
                }
                
                var bRow = [
                    b.id,
                    b.title || "",
                    b.text || "",
                    bImgUrl,
                    sheetB.getRange(bTargetRow, 5).getValue() || "" // 연결문항번호 유지
                ];
                
                sheetB.getRange(bTargetRow, 1, 1, bRow.length).setValues([bRow]);
            }
        }
        
        return ContentService.createTextOutput(JSON.stringify({
            status: "Success",
            message: "문항 #" + q.no + " 부분 업데이트 완료"
        })).setMimeType(ContentService.MimeType.JSON);
    }
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
        status: "Error",
        message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper: Mock ID
function generateMockId() {
  return 'GEN_' + Math.random().toString(36).substr(2, 9);
}

/**
 * 헬퍼 함수: 이미지 파일 저장 및 권한 설정
 */
function saveImg(folder, base64, mime, name) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, name);
  var file = folder.createFile(blob);
  // 외부 링크 권한 허용
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/uc?id=" + file.getId();
}

/**
 * 헬퍼 함수: 폴더 내 스프레드시트 찾기 또는 생성
 */
function getOrCreateSpreadsheet(parentFolder, name) {
  var files = parentFolder.getFilesByName(name);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  
  var newSS = SpreadsheetApp.create(name);
  var file = DriveApp.getFileById(newSS.getId());
  parentFolder.addFile(file);
  DriveApp.getRootFolder().removeFile(file);
  return newSS;
}

/**
 * 헬퍼 함수: 시트 찾기 또는 생성
 */
function getOrCreateSheet(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (sheet) return sheet;
  return spreadsheet.insertSheet(name);
}

/**
 * 헬퍼 함수: 하위 폴더 찾기 또는 생성
 */
function getOrCreateFolder(parentFolder, name) {
  var folders = parentFolder.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return parentFolder.createFolder(name);
}

/**
 * 헬퍼 함수: 시스템 설정 시트 찾기 또는 생성
 */
function getOrCreateConfigSheet(rootFolderId) {
  var configSpreadsheet = null;

  
  if (rootFolderId) {
    // 1. 특정 폴더 지정됨 -> 해당 폴더 내에서만 검색
    var rootFolder = DriveApp.getFolderById(rootFolderId);
    var files = rootFolder.getFilesByName("연세국제 설정링크 중앙관리");
    if (files.hasNext()) {
      configSpreadsheet = SpreadsheetApp.open(files.next());
    } else {
      configSpreadsheet = SpreadsheetApp.create("연세국제 설정링크 중앙관리");
      var file = DriveApp.getFileById(configSpreadsheet.getId());
      rootFolder.addFile(file);
      DriveApp.getRootFolder().removeFile(file);
    }
  } else {
    // 2. 폴더 미지정 -> 전체 드라이브에서 '살아있는' 설정 파일 검색
    var files = DriveApp.getFilesByName("연세국제 설정링크 중앙관리");
    var candidates = [];

    while (files.hasNext()) {
      var f = files.next();
      if (!f.isTrashed()) {
        candidates.push(f);
      }
    }

    if (candidates.length > 0) {
      // 여러 개일 경우, 데이터가 있는(크기가 큰) 파일을 우선 선택
      // (단순 크기 비교보다는 실제 시트를 열어봐야 확실하지만, 속도 이슈로 수정일 최신순 정렬)
      candidates.sort(function(a, b) {
        return b.getLastUpdated().getTime() - a.getLastUpdated().getTime();
      });
      configSpreadsheet = SpreadsheetApp.open(candidates[0]);
    } else {
      // 아예 없으면 생성 (루트)
      configSpreadsheet = SpreadsheetApp.create("연세국제 설정링크 중앙관리");
    }
  }
  
  var sheet = configSpreadsheet.getSheets()[0];
  
  // 헤더가 없으면 생성
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["설정키", "설정값"]);
    sheet.getRange("A1:B1").setFontWeight("bold").setBackground("#4A90E2").setFontColor("#FFFFFF");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 400);
  }
  
  return sheet;
}
