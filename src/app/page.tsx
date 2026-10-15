"use client";

import React, { useState, useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Home as HomeIcon, 
  Trophy, 
  Timer, 
  User, 
  Sparkles,
  Flame,
  Sun,
  Moon,
  Gamepad2,
  Medal,
  Crown
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RankingRecord {
  rank: number;
  name: string;
  score: number;
  finishtime: string;
}

// 8가지 과일 정의 (4x4 = 16장)
interface FruitItem {
  id: string;
  name: string;
  emoji: string;
  borderGlow: string;
}

const FRUITS: FruitItem[] = [
  { id: "apple", name: "사과", emoji: "🍎", borderGlow: "border-red-300 dark:border-red-500/40" },
  { id: "banana", name: "바나나", emoji: "🍌", borderGlow: "border-amber-300 dark:border-amber-500/40" },
  { id: "grapes", name: "포도", emoji: "🍇", borderGlow: "border-purple-300 dark:border-purple-500/40" },
  { id: "watermelon", name: "수박", emoji: "🍉", borderGlow: "border-emerald-300 dark:border-emerald-500/40" },
  { id: "orange", name: "오렌지", emoji: "🍊", borderGlow: "border-orange-300 dark:border-orange-500/40" },
  { id: "strawberry", name: "딸기", emoji: "🍓", borderGlow: "border-rose-300 dark:border-rose-500/40" },
  { id: "peach", name: "복숭아", emoji: "🍑", borderGlow: "border-pink-300 dark:border-pink-500/40" },
  { id: "pineapple", name: "파인애플", emoji: "🍍", borderGlow: "border-yellow-300 dark:border-yellow-500/40" },
];

interface CardState {
  uniqueId: number;
  fruit: FruitItem;
  isFlipped: boolean;
  isMatched: boolean;
}

export default function MemoryGame() {
  // 테마 (라이트/다크)
  const [isDark, setIsDark] = useState<boolean>(false);

  // 단계: 'login' | 'ready' | 'playing' | 'paused' | 'completed'
  const [gameState, setGameState] = useState<"login" | "ready" | "playing" | "paused" | "completed">("login");
  const [userName, setUserName] = useState<string>("");
  const [tempName, setTempName] = useState<string>("");

  // 카드 상태
  const [cards, setCards] = useState<CardState[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [moves, setMoves] = useState<number>(0);
  const [matchedPairs, setMatchedPairs] = useState<number>(0);

  // 시간 측정 (초 단위)
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // 구글 스프레드시트 웹앱 URL (.env.local의 NEXT_PUBLIC_GOOGLE_SCRIPT_URL 키 값 우선 연동)
  const [sheetWebhookUrl] = useState<string>(() => {
    return (
      process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL ||
      (typeof window !== "undefined" ? localStorage.getItem("gas_sheet_url") || "" : "")
    );
  });
  const [sheetSaveStatus, setSheetSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [topRankings, setTopRankings] = useState<RankingRecord[]>([]);
  const [isLoadingRankings, setIsLoadingRankings] = useState<boolean>(false);

  // Top 3 랭킹 조회 함수 (JSONP 방식으로 브라우저 CORS 문제 해결)
  const fetchTopRankings = (targetUrl: string, fallbackRecord?: RankingRecord) => {
    setIsLoadingRankings(true);
    const callbackName = `gas_cb_${Date.now()}`;
    const script = document.createElement("script");
    const delimiter = targetUrl.includes("?") ? "&" : "?";
    script.src = `${targetUrl}${delimiter}callback=${callbackName}`;

    // 전역 콜백 등록
    (window as unknown as Record<string, unknown>)[callbackName] = (response: { top3?: RankingRecord[] }) => {
      if (response && Array.isArray(response.top3) && response.top3.length > 0) {
        setTopRankings(response.top3);
      } else if (fallbackRecord) {
        setTopRankings([fallbackRecord]);
      }
      setIsLoadingRankings(false);
      cleanup();
    };

    const cleanup = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    script.onerror = () => {
      console.warn("JSONP 랭킹 조회 실패, 기본 기록 표시");
      if (fallbackRecord) {
        setTopRankings((prev) => {
          const list = [...prev, fallbackRecord];
          list.sort((a, b) => a.finishtime.localeCompare(b.finishtime));
          return list.slice(0, 3).map((item, idx) => ({ ...item, rank: idx + 1 }));
        });
      }
      setIsLoadingRankings(false);
      cleanup();
    };

    document.body.appendChild(script);
  };

  // 구글 시트 저장 함수
  const sendDataToGoogleSheet = async (name: string, score: number, timeStr: string) => {
    const targetUrl = sheetWebhookUrl || process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;

    if (!targetUrl) {
      console.log("구글 앱스 스크립트 웹앱 URL이 설정되지 않았습니다.", { name, score, timeStr });
      return;
    }

    try {
      setSheetSaveStatus("saving");
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

      const payload = {
        timestamp,
        name,
        score,
        finishtime: timeStr,
      };

      // 1. Google Apps Script로 게임 결과 전송
      await fetch(targetUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "text/plain",
        },
        body: JSON.stringify(payload),
      });

      setSheetSaveStatus("success");

      // 2. 저장 후 스프레드시트의 최신 Top 3 랭킹 불러오기
      const currentPlay: RankingRecord = {
        rank: 1,
        name,
        score,
        finishtime: timeStr,
      };
      // 약간의 지연(시트 기록 반영 시간) 후 랭킹 조회
      setTimeout(() => {
        fetchTopRankings(targetUrl, currentPlay);
      }, 700);

    } catch (err) {
      console.error("구글 시트 저장 중 오류 발생:", err);
      setSheetSaveStatus("error");
    }
  };

  // 다크모드 초기화 및 동기화
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (savedTheme === "dark" || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    } else {
      setIsDark(false);
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  // 카드 셔플
  const initializeCards = () => {
    const pairedFruits = [...FRUITS, ...FRUITS];
    for (let i = pairedFruits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pairedFruits[i], pairedFruits[j]] = [pairedFruits[j], pairedFruits[i]];
    }

    const initialCards: CardState[] = pairedFruits.map((fruit, index) => ({
      uniqueId: index,
      fruit,
      isFlipped: false,
      isMatched: false,
    }));

    setCards(initialCards);
    setFlippedIndices([]);
    setIsProcessing(false);
    setMoves(0);
    setMatchedPairs(0);
    setElapsedTime(0);
  };

  // 타이머
  useEffect(() => {
    if (gameState === "playing") {
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState]);

  // 이름 등록 후 대기 화면으로
  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    setUserName(tempName.trim());
    setGameState("ready");
    initializeCards();
  };

  // 게임 시작
  const startGame = () => {
    initializeCards();
    setGameState("playing");
  };

  // 게임 일시정지 / 재개
  const togglePause = () => {
    if (gameState === "playing") {
      setGameState("paused");
    } else if (gameState === "paused") {
      setGameState("playing");
    }
  };

  // 다시 시작
  const restartGame = () => {
    initializeCards();
    setGameState("playing");
  };

  // 처음으로 (이름 작성 화면으로)
  const resetToHome = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState("login");
    setTempName("");
    setUserName("");
    setCards([]);
    setFlippedIndices([]);
    setMoves(0);
    setElapsedTime(0);
  };

  // 카드 클릭 핸들러
  const handleCardClick = (index: number) => {
    if (gameState !== "playing" || isProcessing) return;

    const clickedCard = cards[index];
    if (clickedCard.isFlipped || clickedCard.isMatched) return;

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    // 2장이 뒤집혔을 때 비교
    if (newFlipped.length === 2) {
      setIsProcessing(true);
      const nextMoves = moves + 1;
      setMoves(nextMoves);

      const [firstIdx, secondIdx] = newFlipped;
      const firstCard = newCards[firstIdx];
      const secondCard = newCards[secondIdx];

      if (firstCard.fruit.id === secondCard.fruit.id) {
        // 일치
        setTimeout(() => {
          setCards((prevCards) =>
            prevCards.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, isMatched: true } : c
            )
          );
          setFlippedIndices([]);
          setIsProcessing(false);
          const newPairs = matchedPairs + 1;
          setMatchedPairs(newPairs);

          if (newPairs === FRUITS.length) {
            setGameState("completed");
            try {
              confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
              });
            } catch (e) {
              console.error(e);
            }

            // 게임 성공 시에만 구글 시트에 데이터 전송 (중단/포기 시에는 실행되지 않음)
            sendDataToGoogleSheet(userName, nextMoves, formatTime(elapsedTime));
          }
        }, 400);
      } else {
        // 불일치
        setTimeout(() => {
          setCards((prevCards) =>
            prevCards.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, isFlipped: false } : c
            )
          );
          setFlippedIndices([]);
          setIsProcessing(false);
        }, 900);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-between overflow-x-hidden bg-slate-50 dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors duration-500">
      {/* 부드럽고 차분한 배경 앰비언트 글로우 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full bg-indigo-200/40 dark:bg-indigo-950/30 blur-[130px]" />
        <div className="absolute top-[40%] -right-[15%] w-[450px] h-[450px] sm:w-[650px] sm:h-[650px] rounded-full bg-rose-100/50 dark:bg-rose-950/20 blur-[140px]" />
        <div className="absolute -bottom-[20%] left-[20%] w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full bg-emerald-100/40 dark:bg-emerald-950/20 blur-[130px]" />
      </div>

      {/* 상단 네비게이션 & 테마 토글 */}
      <header className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-10 h-10 rounded-2xl glass-panel flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm">
            <Gamepad2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              카드 맞추기 게임
            </h1>
            <p className="hidden sm:block text-xs text-slate-500 dark:text-slate-400">
              두 장의 과일 카드를 뒤집어 짝을 맞춰보세요
            </p>
          </div>
        </div>

        {/* 다크모드 토글 버튼 */}
        <button
          onClick={toggleDarkMode}
          type="button"
          aria-label="테마 전환"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl glass-panel text-slate-700 dark:text-slate-200 hover:scale-105 active:scale-95 transition-all cursor-pointer text-xs sm:text-sm font-medium shadow-xs"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">라이트 모드</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-500" />
              <span className="hidden sm:inline">다크 모드</span>
            </>
          )}
        </button>
      </header>

      {/* 중앙 메인 컨텐츠 영역 */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-6">
        {/* 1단계: 이름 입력 화면 */}
        {gameState === "login" && (
          <div className="w-full max-w-md glass-panel rounded-3xl p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-300">
            <div className="w-20 h-20 rounded-2xl mx-auto mb-5 glass-card-front flex items-center justify-center text-4xl shadow-inner border border-white/60 dark:border-white/10">
              🍒
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-2">
              카드 맞추기 게임
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-7">
              플레이어 이름을 입력하고 게임을 시작하세요!
            </p>

            <form onSubmit={handleNameSubmit} className="space-y-4">
              <div className="text-left">
                <label
                  htmlFor="playerName"
                  className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 ml-1"
                >
                  플레이어 이름
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    id="playerName"
                    type="text"
                    required
                    placeholder="이름이나 닉네임을 입력하세요"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-white/70 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 backdrop-blur-sm transition"
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full py-6 text-base font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition cursor-pointer"
              >
                입장하기
              </Button>
            </form>
          </div>
        )}

        {/* 2단계: 게임 플레이/대기 화면 */}
        {gameState !== "login" && (
          <div className="w-full max-w-xl flex flex-col items-center">
            {/* 상단 통계 및 컨트롤러 바 */}
            <div className="w-full glass-panel rounded-2xl p-3.5 sm:p-4 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/40 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                  <User className="w-4 h-4" />
                </div>
                <div className="leading-tight">
                  <span className="text-[11px] text-slate-400 font-medium">플레이어</span>
                  <p className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                    {userName}
                  </p>
                </div>
              </div>

              {/* 스탯 표시 (시간 / 시도 / 맞춘 쌍) */}
              <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-semibold">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                  <Timer className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{formatTime(elapsedTime)}</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  <span>{moves}회</span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{matchedPairs}/8</span>
                </div>
              </div>

              {/* 제어 버튼 그룹 */}
              <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/50 dark:border-slate-800/60">
                {gameState === "ready" && (
                  <Button
                    onClick={startGame}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium cursor-pointer shadow-xs rounded-xl"
                  >
                    <Play className="w-3.5 h-3.5 mr-1" /> 시작
                  </Button>
                )}

                {(gameState === "playing" || gameState === "paused") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={togglePause}
                    className="cursor-pointer rounded-xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/80 dark:hover:bg-slate-800 text-xs sm:text-sm"
                  >
                    {gameState === "paused" ? (
                      <>
                        <Play className="w-3.5 h-3.5 mr-1 text-emerald-600" /> 재개
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 mr-1 text-amber-600" /> 정지
                      </>
                    )}
                  </Button>
                )}

                {gameState !== "ready" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={restartGame}
                    className="cursor-pointer rounded-xl bg-white/40 dark:bg-slate-800/40 hover:bg-white/80 dark:hover:bg-slate-800 text-xs sm:text-sm"
                    title="다시 시작"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1 text-indigo-500" /> 다시
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetToHome}
                  className="cursor-pointer rounded-xl text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 text-xs sm:text-sm"
                  title="이름 작성 화면으로 이동"
                >
                  <HomeIcon className="w-3.5 h-3.5 mr-1" /> 처음으로
                </Button>
              </div>
            </div>

            {/* 4x4 카드 보드 영역 (모바일 반응형 정사각형) */}
            <div className="relative w-full max-w-[480px] aspect-square">
              {/* 일시 정지 안내 오버레이 */}
              {gameState === "paused" && (
                <div className="absolute inset-0 z-20 glass-panel rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                    <Pause className="w-8 h-8 animate-pulse" />
                  </div>
                  <h3 className="text-xl font-bold mb-1">게임 일시정지</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-5">
                    잠시 쉬어가는 중입니다. 준비되면 계속하세요!
                  </p>
                  <Button
                    onClick={togglePause}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-6 py-2.5 font-semibold cursor-pointer shadow-md"
                  >
                    <Play className="w-4 h-4 mr-1.5" /> 게임 재개하기
                  </Button>
                </div>
              )}

              {/* 게임 시작 전 준비 안내 오버레이 */}
              {gameState === "ready" && (
                <div className="absolute inset-0 z-20 glass-panel rounded-3xl flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-200">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-3 text-3xl">
                    ✨
                  </div>
                  <h3 className="text-xl font-bold mb-1">준비되셨나요?</h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6">
                    시작 버튼을 누르면 카드가 활성화되고 시간이 측정됩니다.
                  </p>
                  <Button
                    onClick={startGame}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-xl cursor-pointer shadow-lg shadow-indigo-500/20 active:scale-95 transition"
                  >
                    <Play className="w-4 h-4 mr-1.5" /> 게임 시작
                  </Button>
                </div>
              )}

              {/* 카드 그리드 컨테이너 */}
              <div className="grid grid-cols-4 grid-rows-4 gap-2.5 sm:gap-3.5 w-full h-full p-2.5 sm:p-3 glass-panel rounded-3xl">
                {cards.map((card, idx) => {
                  const showFront = card.isFlipped || card.isMatched;

                  return (
                    <button
                      key={card.uniqueId}
                      type="button"
                      disabled={gameState !== "playing" || isProcessing || card.isMatched}
                      onClick={() => handleCardClick(idx)}
                      className={`relative w-full h-full rounded-2xl transition-all duration-300 select-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400/40 ${
                        card.isMatched
                          ? "opacity-50 scale-95"
                          : "hover:scale-105 active:scale-95"
                      }`}
                    >
                      <div
                        className={`w-full h-full rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
                          showFront
                            ? `glass-card-front border-2 ${card.fruit.borderGlow} scale-100`
                            : "glass-card-back hover:brightness-105"
                        }`}
                      >
                        {showFront ? (
                          <div className="flex flex-col items-center justify-center animate-in zoom-in-75 duration-200">
                            <span className="text-2xl sm:text-4xl filter drop-shadow-sm select-none">
                              {card.fruit.emoji}
                            </span>
                            <span className="text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 mt-1">
                              {card.fruit.name}
                            </span>
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full border border-slate-300/40 dark:border-white/10 flex items-center justify-center">
                            <span className="text-sm sm:text-base font-bold text-slate-400 dark:text-slate-500">
                              ?
                            </span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 게임 완료 축하 모달 */}
            {gameState === "completed" && (
              <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="glass-panel bg-white/90 dark:bg-slate-900/90 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="w-18 h-18 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 mx-auto flex items-center justify-center mb-4 text-amber-500">
                    <Trophy className="w-9 h-9 animate-bounce" />
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-1">
                    축하합니다! 🎉
                  </h2>
                  <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-6">
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{userName}</span> 님, 모든 카드를 맞추셨습니다!
                  </p>

                  {/* 결과 스탯 박스 */}
                  <div className="grid grid-cols-2 gap-3 bg-slate-100/60 dark:bg-slate-800/50 p-4 rounded-2xl mb-6 border border-slate-200/50 dark:border-slate-700/50">
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mb-1">
                        <Timer className="w-3.5 h-3.5 text-indigo-500" /> 완료 시간
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {formatTime(elapsedTime)}
                      </span>
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mb-1">
                        <Flame className="w-3.5 h-3.5 text-amber-500" /> 시도 횟수
                      </span>
                      <span className="text-xl sm:text-2xl font-bold text-amber-500">
                        {moves} 회
                      </span>
                    </div>
                  </div>

                  {/* 구글 시트 저장 알림 상태 */}
                  {sheetSaveStatus === "saving" && (
                    <div className="text-xs text-indigo-500 font-medium mb-4 flex items-center justify-center gap-1.5 animate-pulse">
                      <span>📊 구글 스프레드시트에 기록 저장 중...</span>
                    </div>
                  )}
                  {sheetSaveStatus === "success" && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-4 flex items-center justify-center gap-1.5">
                      <span>✓ 구글 스프레드시트에 성공적으로 저장되었습니다!</span>
                    </div>
                  )}
                  {sheetSaveStatus === "error" && (
                    <div className="text-xs text-rose-500 font-medium mb-4 flex items-center justify-center gap-1.5">
                      <span>✕ 구글 시트 저장 실패 (URL 확인 필요)</span>
                    </div>
                  )}

                  {/* 명예의 전당 (Top 3 랭킹) 영역 */}
                  <div className="w-full bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-3.5 mb-5 border border-slate-200/60 dark:border-slate-700/60 text-left">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span>명예의 전당 (Top 3 랭킹)</span>
                      </div>
                      <span className="text-[10px] text-slate-400">빠른 종료시간 순</span>
                    </div>

                    {isLoadingRankings ? (
                      <div className="py-4 text-center text-xs text-slate-400 animate-pulse">
                        스프레드시트 랭킹 계산 중...
                      </div>
                    ) : topRankings.length === 0 ? (
                      <div className="py-3 text-center text-xs text-slate-400">
                        기록을 불러오는 중이거나 등록된 랭킹이 없습니다.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {topRankings.slice(0, 3).map((item) => {
                          const isCurrent = item.name === userName;
                          return (
                            <div
                              key={`${item.rank}-${item.name}-${item.finishtime}`}
                              className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all ${
                                item.rank === 1
                                  ? "bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 font-bold"
                                  : item.rank === 2
                                  ? "bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-semibold"
                                  : "bg-orange-50/60 dark:bg-orange-950/30 border border-orange-200/60 dark:border-orange-900/40 font-medium"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                                    item.rank === 1
                                      ? "bg-amber-400 text-amber-950"
                                      : item.rank === 2
                                      ? "bg-slate-300 text-slate-800 dark:bg-slate-600 dark:text-white"
                                      : "bg-amber-600/70 text-white"
                                  }`}
                                >
                                  {item.rank}
                                </span>
                                <span className={`truncate max-w-[100px] sm:max-w-[120px] ${isCurrent ? "text-indigo-600 dark:text-indigo-400 font-bold" : "text-slate-800 dark:text-slate-200"}`}>
                                  {item.name} {isCurrent && "(나)"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 font-mono">
                                <span className="text-[11px] text-slate-400">{item.score}회</span>
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-100">
                                  {item.finishtime}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex flex-col gap-2.5">
                    <Button
                      onClick={restartGame}
                      className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl cursor-pointer shadow-md shadow-indigo-500/20"
                    >
                      <RotateCcw className="w-4 h-4 mr-1.5" /> 다시 플레이
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetToHome}
                      className="w-full py-5 rounded-xl font-semibold cursor-pointer border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <HomeIcon className="w-4 h-4 mr-1.5" /> 처음으로
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 메인 페이지 하단 카피라이트 푸터 */}
      <footer className="relative z-10 w-full py-5 text-center text-xs text-slate-500 dark:text-slate-400">
        <p className="font-medium tracking-wide">
          Copyright INU 카드 맞추기 게임 by acy
        </p>
      </footer>
    </div>
  );
}
