/**
 * 구글 스프레드시트용 Google Apps Script (GAS) 코드
 * 
 * 스프레드시트 상단 메뉴: [확장 프로그램] -> [Apps Script] 에 이 코드를 붙여넣으세요.
 * 변경 후 [배포] -> [배포 관리] -> 연필(수정) 아이콘 클릭 -> 버전: [새 버전] 선택 -> [배포] 클릭!
 */

// finishtime(mm:ss 또는 s초)을 초(number) 단위로 변환하는 유틸리티
function parseFinishTimeToSeconds(timeStr) {
  if (!timeStr) return 999999;
  var str = String(timeStr).trim();
  
  if (str.indexOf(":") !== -1) {
    var parts = str.split(":");
    if (parts.length === 2) {
      var mins = parseInt(parts[0], 10) || 0;
      var secs = parseInt(parts[1], 10) || 0;
      return mins * 60 + secs;
    }
  }
  var parsed = parseInt(str, 10);
  return isNaN(parsed) ? 999999 : parsed;
}

// 상위 3위(오름차순) 랭킹 조회 함수
function getTop3Rankings(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return []; // 헤더만 있거나 데이터가 없음
  }

  // 데이터 가져오기 (2행부터 마지막 행까지, 4개 열: timestamp, name, score, finishtime)
  var rangeData = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var records = [];

  for (var i = 0; i < rangeData.length; i++) {
    var row = rangeData[i];
    var timestamp = row[0];
    var name = row[1];
    var score = row[2];
    var finishtime = String(row[3]);

    if (!name && !finishtime) continue;

    var seconds = parseFinishTimeToSeconds(finishtime);

    records.push({
      timestamp: timestamp,
      name: name,
      score: score,
      finishtime: finishtime,
      seconds: seconds
    });
  }

  // 종료시간(초) 기준 오름차순 정렬, 동률인 경우 시도 횟수(score) 오름차순 정렬
  records.sort(function(a, b) {
    if (a.seconds !== b.seconds) {
      return a.seconds - b.seconds;
    }
    return (Number(a.score) || 0) - (Number(b.score) || 0);
  });

  // 상위 3개 추출 및 순위(rank) 부여
  var top3 = records.slice(0, 3).map(function(item, index) {
    return {
      rank: index + 1,
      name: item.name,
      score: item.score,
      finishtime: item.finishtime
    };
  });

  return top3;
}

// 데이터 저장 및 저장 후 최신 Top3 반환
function doPost(e) {
  try {
    var postData = "";
    if (e && e.postData && e.postData.contents) {
      postData = e.postData.contents;
    }
    
    var data = {};
    if (postData) {
      data = JSON.parse(postData);
    } else if (e && e.parameter) {
      data = e.parameter;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    var timestamp = data.timestamp || Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
    var name = data.name || "익명";
    var score = data.score !== undefined ? data.score : 0;
    var finishtime = data.finishtime || "00:00";

    // 헤더 행 자동 생성
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["timestamp", "name", "score", "finishtime"]);
      sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f1f5f9");
    }

    // 새 데이터 기록
    sheet.appendRow([timestamp, name, score, finishtime]);

    // 저장 직후 최신 Top3 랭킹 계산
    var top3 = getTop3Rankings(sheet);

    var result = {
      status: "success",
      message: "성공적으로 저장되었습니다.",
      top3: top3
    };

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    var errorResult = {
      status: "error",
      message: error.toString()
    };
    return ContentService.createTextOutput(JSON.stringify(errorResult))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 요청으로 Top3 랭킹 조회 (JSONP callback 파라미터 완벽 지원)
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var top3 = getTop3Rankings(sheet);

    var callback = e && e.parameter ? e.parameter.callback : null;
    var resultObj = {
      status: "success",
      top3: top3
    };

    if (callback) {
      // JSONP 응답
      return ContentService.createTextOutput(callback + "(" + JSON.stringify(resultObj) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    } else {
      // 일반 JSON 응답
      return ContentService.createTextOutput(JSON.stringify(resultObj))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    var errorObj = {
      status: "error",
      message: error.toString(),
      top3: []
    };
    var cb = e && e.parameter ? e.parameter.callback : null;
    if (cb) {
      return ContentService.createTextOutput(cb + "(" + JSON.stringify(errorObj) + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(JSON.stringify(errorObj))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
