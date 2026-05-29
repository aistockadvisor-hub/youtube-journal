'use client';

import { useState, useEffect } from 'react';

// 카테고리 ID를 한국어 명칭으로 변환하기 위한 매핑 딕셔너리
const CATEGORY_MAP = {
  "1": "영화/애니메이션",
  "2": "자동차/교통",
  "10": "음악",
  "15": "반려동물/동물",
  "17": "스포츠",
  "18": "단편 영화",
  "19": "여행/이벤트",
  "20": "게임",
  "21": "인물/블로그",
  "22": "인물/블로그",
  "23": "코미디",
  "24": "엔터테인먼트",
  "25": "뉴스/정치",
  "26": "노하우/스타일",
  "27": "교육",
  "28": "과학/기술",
  "29": "비영리/사회운동"
};

export default function Home() {
  // 상태 관리
  const [googleClient, setGoogleClient] = useState(null);
  const [accessToken, setAccessToken] = useState('');
  const [userInfo, setUserInfo] = useState(null);
  const [geminiKey, setGeminiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [timeRange, setTimeRange] = useState(24); // 기본 24시간 필터
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summarizedCount, setSummarizedCount] = useState(0);
  const [markdownResult, setMarkdownResult] = useState('');
  const [showGuide, setShowGuide] = useState(false);

  // 1. Google OAuth2 및 로컬스토리지 복구 초기화
  useEffect(() => {
    // 로컬스토리지에서 Gemini API Key 복구
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setGeminiKey(savedKey);

    // Google GIS 스크립트 비동기 로드
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: '163395465148-evvet5niu45ne4beg8qct7blh1q69hc7.apps.googleusercontent.com',
          scope: 'https://www.googleapis.com/auth/youtube.readonly',
          callback: (response) => {
            if (response.access_token) {
              setAccessToken(response.access_token);
              fetchUserInfo(response.access_token);
            }
          },
        });
        setGoogleClient(client);
      } catch (err) {
        console.error('구글 GIS 클라이언트 초기화 실패:', err);
      }
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // 2. Gemini API 키 저장 로직
  const handleKeyChange = (e) => {
    const val = e.target.value;
    setGeminiKey(val);
    localStorage.setItem('gemini_api_key', val);
  };

  // 3. 연동된 사용자 구글 정보 조회
  const fetchUserInfo = async (token) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUserInfo(data);
    } catch (err) {
      console.error('사용자 프로필 페칭 실패:', err);
    }
  };

  // 4. 구글 로그인(OAuth2 팝업) 트리거
  const handleGoogleLogin = () => {
    if (googleClient) {
      googleClient.requestAccessToken();
    } else {
      alert('구글 로그인 모듈이 로딩 중입니다. 잠시 후 다시 시도해 주세요.');
    }
  };

  // 5. 유튜브 좋아요(LL) 목록 조회
  const fetchLikedVideos = async () => {
    if (!accessToken) {
      alert('구글 로그인이 먼저 필요합니다!');
      return;
    }
    setLoading(true);
    setVideos([]);
    setMarkdownResult('');
    
    try {
      // 5-1. Liked Videos playlistItems 조회
      const res = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=LL&maxResults=50', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      
      if (!data.items || data.items.length === 0) {
        alert('조회된 좋아요 영상이 없습니다.');
        setLoading(false);
        return;
      }

      // 시간 범위 기준 정의 (현재 시점 기준 - timeRange 시간)
      const limitTime = new Date();
      limitTime.setHours(limitTime.getHours() - timeRange);

      const filteredItems = data.items.filter(item => {
        const publishedAt = new Date(item.snippet.publishedAt);
        return publishedAt >= limitTime;
      });

      if (filteredItems.length === 0) {
        alert(`최근 ${timeRange}시간 동안 '좋아요'를 누른 영상이 없습니다. 조회 범위를 넓혀보세요!`);
        setLoading(false);
        return;
      }

      // 5-2. 필터링된 비디오들의 상세 메타데이터 긁어오기 (videos.list)
      const videoIds = filteredItems.map(item => item.snippet.resourceId.videoId).join(',');
      const detailRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoIds}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const detailData = await detailRes.json();
      
      const videoDetailsMap = {};
      detailData.items?.forEach(item => {
        videoDetailsMap[item.id] = {
          tags: item.snippet.tags || [],
          categoryId: item.snippet.categoryId,
          categoryName: CATEGORY_MAP[item.snippet.categoryId] || '기타',
          description: item.snippet.description || '',
          viewCount: item.statistics?.viewCount || '0',
          likeCount: item.statistics?.likeCount || '0',
          duration: item.contentDetails?.duration || ''
        };
      });

      // 최종 프론트엔드 바인딩용 데이터 구조 정렬
      const finalVideosList = filteredItems.map((item, index) => {
        const vId = item.snippet.resourceId.videoId;
        const details = videoDetailsMap[vId] || { tags: [], categoryName: '기타', description: '' };
        return {
          id: vId,
          index: index + 1,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url,
          publishedAt: item.snippet.publishedAt,
          url: `https://youtu.be/${vId}`,
          tags: details.tags,
          category: details.categoryName,
          description: details.description,
          status: 'ready', // ready ➡️ analyzing ➡️ done
          summaryText: ''
        };
      });

      setVideos(finalVideosList);
    } catch (err) {
      console.error('유튜브 데이터 조회 실패:', err);
      alert('유튜브 데이터를 읽어오는 중 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 5-3. 구글 API 오류 메시지를 지인 친화적인 초친절 한글로 변환하는 유틸리티
  const formatErrorMessage = (err) => {
    const msg = err.message || '';
    if (msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand')) {
      return '구글 AI 서버가 현재 일시적으로 매우 혼잡합니다. 5초 후에 아래 [🔄 재시도] 버튼을 다시 눌러주세요.';
    }
    if (msg.includes('429') || msg.includes('quota') || msg.includes('limit')) {
      return '무료 요약 한도(분당 최대 15회)를 일시 초과했습니다. 10초 후에 [🔄 재시도]를 눌러주세요.';
    }
    if (msg.includes('400') || msg.includes('API key') || msg.includes('not valid')) {
      return '입력하신 Gemini API Key가 유효하지 않거나 복사가 잘못되었습니다. 설정을 다시 확인해 주세요.';
    }
    return msg || '네트워크 연결이 일시적으로 원활하지 않습니다.';
  };

  // 6. 마크다운 최종 조립 함수 (재시도 시에도 실시간 갱신 지원)
  const rebuildMarkdown = (updatedVideos) => {
    const allTags = new Set();
    updatedVideos.forEach(v => {
      if (v.status === 'done' || v.status === 'error') {
        const recommendedTags = v.summaryText.match(/#([ㄱ-ㅎㅏ-ㅣ가-힣a-zA-Z0-9_]+)/g) || [];
        recommendedTags.forEach(t => allTags.add(t.replace('#', '')));
      }
    });

    const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    const tagsFormatted = Array.from(allTags).slice(0, 15).map(t => `#${t}`).join(', ');

    let compiledMarkdown = `---
date: ${todayStr}
total_videos: ${updatedVideos.length}
tags: [${tagsFormatted}]
---

# 📅 ${todayStr} 유튜브 시청 기록 일지

> 오늘 '좋아요'를 누르고 배운 ${updatedVideos.length}개의 소중한 시청 기록입니다.

---

`;

    updatedVideos.forEach((v, idx) => {
      compiledMarkdown += `## 🎥 ${idx + 1}. ${v.title}\n\n${v.summaryText}\n\n---\n\n`;
    });

    setMarkdownResult(compiledMarkdown);
  };

  // 6-2. 전체 Gemini AI 일지 자동 요약 및 생성
  const startAIAnalysis = async () => {
    if (!geminiKey) {
      alert('AI 요약을 위해 Gemini API Key를 입력해 주세요!');
      return;
    }
    if (videos.length === 0) {
      alert('분석할 영상이 존재하지 않습니다. 먼저 조회해 주세요.');
      return;
    }

    setSummarizing(true);
    setSummarizedCount(0);

    const updatedVideos = [...videos];

    for (let i = 0; i < updatedVideos.length; i++) {
      const video = updatedVideos[i];
      // 이미 완료된 영상은 스킵하고 대기 중이거나 에러 상태였던 것만 분석
      if (video.status === 'done') {
        setSummarizedCount(prev => prev + 1);
        continue;
      }

      video.status = 'analyzing';
      setVideos([...updatedVideos]);

      try {
        const res = await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoId: video.id,
            title: video.title,
            channelTitle: video.channelTitle,
            category: video.category,
            description: video.description,
            tags: video.tags,
            url: video.url,
            geminiKey: geminiKey
          })
        });

        const data = await res.json();
        
        if (res.ok && data.summary) {
          video.status = 'done';
          video.summaryText = data.summary;
        } else {
          throw new Error(data.error || '요약 실패');
        }
      } catch (err) {
        console.error(`${video.title} 요약 중 에러 발생:`, err);
        video.status = 'error';
        video.summaryText = `### 📊 메타데이터
*   **채널**: ${video.channelTitle}
*   **영상 링크**: [링크 바로가기](${video.url})
*   **카테고리**: ${video.category}

⚠️ **AI 요약 보류**: ${formatErrorMessage(err)}`;
      }

      setSummarizedCount(prev => prev + 1);
      setVideos([...updatedVideos]);
    }

    rebuildMarkdown(updatedVideos);
    setSummarizing(false);
  };

  // 6-3. 개별 영상에 대한 1초 스마트 재요약 (Retry)
  const retrySingleAnalysis = async (vId) => {
    if (!geminiKey) {
      alert('AI 요약을 위해 Gemini API Key를 입력해 주세요!');
      return;
    }

    const updatedVideos = [...videos];
    const video = updatedVideos.find(v => v.id === vId);
    if (!video) return;

    video.status = 'analyzing';
    setVideos([...updatedVideos]);

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: video.id,
          title: video.title,
          channelTitle: video.channelTitle,
          category: video.category,
          description: video.description,
          tags: video.tags,
          url: video.url,
          geminiKey: geminiKey
        })
      });

      const data = await res.json();
      
      if (res.ok && data.summary) {
        video.status = 'done';
        video.summaryText = data.summary;
      } else {
        throw new Error(data.error || '요약 실패');
      }
    } catch (err) {
      console.error(`${video.title} 재시도 에러 발생:`, err);
      video.status = 'error';
      video.summaryText = `### 📊 메타데이터
*   **채널**: ${video.channelTitle}
*   **영상 링크**: [링크 바로가기](${video.url})
*   **카테고리**: ${video.category}

⚠️ **AI 요약 보류**: ${formatErrorMessage(err)}`;
    }

    setVideos([...updatedVideos]);
    rebuildMarkdown(updatedVideos);
  };

  // 7. 브라우저 로컬 마크다운 파일 다운로드
  const downloadMarkdown = () => {
    if (!markdownResult) return;

    const todayStr = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\. /g, '-').replace('.', '');
    const blob = new Blob([markdownResult], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${todayStr}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <main className="min-h-screen px-6 py-12 max-w-6xl mx-auto flex flex-col justify-between">
      
      {/* 헤더 섹션 */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-white/5">
        <div className="text-center md:text-left">
          <h1 className="text-4xl font-black tracking-tight gradient-text mb-2">My YouTube Journal</h1>
          <p className="text-gray-400 text-sm">좋아요 누른 영상들을 옵시디언 마크다운 일지로 3초 만에 생성하세요.</p>
        </div>

        {/* 구글 소셜 로그인 연동 카드 */}
        <div className="flex items-center gap-4">
          {userInfo ? (
            <div className="glass-card px-5 py-3 flex items-center gap-3">
              {userInfo.picture && (
                <img src={userInfo.picture} alt="프로필" className="w-10 h-10 rounded-full border-2 border-indigo-500/50" />
              )}
              <div>
                <p className="text-sm font-semibold text-white">{userInfo.name} 연동됨</p>
                <p className="text-xs text-gray-400">{userInfo.email}</p>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleGoogleLogin}
              className="px-6 py-3 rounded-xl bg-white text-black font-bold text-sm flex items-center gap-3 transition hover:bg-gray-100 hover:scale-105 active:scale-95 shadow-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google 계정으로 유튜브 연동하기
            </button>
          )}
        </div>
      </header>

      {/* 설정 및 키 입력 영역 */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 py-10">
        
        {/* API Key 입력 카드 */}
        <div className="glass-card p-6 flex flex-col justify-between gap-4 lg:col-span-2">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-bold tracking-tight text-sm">🔑 Gemini API Key 설정</label>
              <button 
                onClick={() => setShowGuide(!showGuide)}
                className="guide-badge hover:bg-cyan-500/25 transition cursor-pointer"
              >
                <span>💡 1분 무료 발급 가이드</span>
              </button>
            </div>
            
            {showGuide && (
              <div className="mb-4 p-4 rounded-xl bg-cyan-950/30 border border-cyan-800/30 text-cyan-200 text-xs leading-relaxed space-y-2">
                <p className="font-semibold text-cyan-300">🔑 Gemini API Key 1분 무료 발급 가이이드</p>
                <ol className="list-decimal pl-4 space-y-1 text-gray-300">
                  <li><a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-cyan-400 font-bold underline hover:text-cyan-300">Google AI Studio [바로가기]</a>를 클릭해 이동합니다. (구글 로그인 필요)</li>
                  <li>파란색 <strong>'Create API Key'</strong> 버튼을 클릭합니다.</li>
                  <li>검색창에서 원하는 프로젝트를 선택하고 생성된 키를 <strong>Copy(복사)</strong>합니다.</li>
                  <li>아래 입력칸에 붙여넣으면 완료! (로컬 브라우저에 안전히 평생 자동 저장됩니다)</li>
                </ol>
              </div>
            )}

            <div className="relative">
              <input 
                type={showKey ? 'text' : 'password'}
                value={geminiKey}
                onChange={handleKeyChange}
                placeholder="AI Studio에서 발급받은 Gemini API 키를 입력해 주세요 (AI_...)"
                className="w-full bg-[#0d0e17] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 transition pr-10"
              />
              <button 
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-200"
              >
                {showKey ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500">※ 입력한 API 키는 본인의 브라우저 밖으로 절대 전송되지 않고 로컬스토리지에 안전하게 관리됩니다.</p>
        </div>

        {/* 필터링 범위 조정 카드 */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div>
            <label className="text-white font-bold tracking-tight text-sm block mb-3">🕒 수집 시간 범위 조절</label>
            <div className="flex gap-2">
              {[24, 72, 168].map(h => (
                <button
                  key={h}
                  onClick={() => setTimeRange(h)}
                  className={`flex-1 py-3 text-sm font-semibold rounded-xl transition ${
                    timeRange === h 
                      ? 'bg-indigo-600/35 text-indigo-200 border border-indigo-500/50' 
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  {h === 24 ? '최근 24시간' : h === 72 ? '최근 3일' : '최근 1주일'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={fetchLikedVideos}
            disabled={loading || !accessToken}
            className="w-full py-3.5 rounded-xl font-black text-sm tracking-wide bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white transition hover:scale-102 active:scale-98 disabled:opacity-40 disabled:pointer-events-none mt-4 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                데이터 가져오는 중...
              </>
            ) : '유튜브 좋아요 영상 수집하기'}
          </button>
        </div>
      </section>

      {/* 실시간 영상 피드 렌더링 */}
      {videos.length > 0 && (
        <section className="py-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold text-white tracking-tight">🎯 분석 대상 영상 ({videos.length}개)</h2>
            
            {!markdownResult && (
              <button
                onClick={startAIAnalysis}
                disabled={summarizing}
                className="px-6 py-3.5 rounded-xl font-extrabold text-sm text-white bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 transition hover:scale-105 active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2"
              >
                {summarizing ? 'AI 요약본 분석 진행 중...' : '⚡ AI 자동 마크다운 일지 생성'}
              </button>
            )}
          </div>

          {summarizing && (
            <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden">
              <div 
                className="progress-bar-fill" 
                style={{ width: `${(summarizedCount / videos.length) * 100}%` }}
              ></div>
            </div>
          )}

          {/* 비디오 리스트 카드 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(video => (
              <div key={video.id} className="glass-card overflow-hidden flex flex-col justify-between">
                <div>
                  {video.thumbnail && (
                    <div className="relative aspect-video w-full overflow-hidden">
                      <img src={video.thumbnail} alt={video.title} className="object-cover w-full h-full" />
                      <span className="absolute top-2 right-2 px-2.5 py-1 rounded bg-[#07080e]/80 text-[10px] font-bold text-gray-200 border border-white/5">
                        {video.category}
                      </span>
                    </div>
                  )}
                  
                  <div className="p-5 space-y-2">
                    <h3 className="text-sm font-bold text-white leading-snug line-clamp-2">{video.title}</h3>
                    <p className="text-xs text-gray-400 font-medium">{video.channelTitle}</p>
                  </div>
                </div>

                {/* 상태 렌더러 */}
                <div className="px-5 pb-5 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-500">상태</span>
                  {video.status === 'ready' && (
                    <span className="text-xs font-bold text-yellow-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-yellow-400"></span> 대기 중
                    </span>
                  )}
                  {video.status === 'analyzing' && (
                    <span className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span> AI 요약 중...
                    </span>
                  )}
                  {video.status === 'done' && (
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span> 요약 완료
                    </span>
                  )}
                  {video.status === 'error' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-400"></span> 실패 (폴백)
                      </span>
                      <button 
                        onClick={() => retrySingleAnalysis(video.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-[10px] font-bold text-rose-300 transition cursor-pointer flex items-center gap-1"
                      >
                        🔄 재시도
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 일지 완성 및 다운로드 영역 */}
      {markdownResult && (
        <section className="py-10 text-center space-y-6 animate-fade-in border-t border-white/5 mt-6">
          <div className="glass-card max-w-xl mx-auto p-8 space-y-4">
            <h2 className="text-2xl font-black text-white gradient-text">🎉 RAG 마크다운 일지 생성 완료!</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              최근 {timeRange}시간 동안의 학습 및 기록 요약이 끝났습니다.<br/>
              아래 다운로드 버튼을 눌러 일지 파일(.md)을 받고 각자의 <strong>옵시디언 볼트 폴더</strong>에 직접 끌어다 넣으세요!
            </p>

            <button
              onClick={downloadMarkdown}
              className="glowing-btn w-full py-4 text-white font-extrabold tracking-wide text-sm mt-2 flex items-center justify-center gap-2 cursor-pointer shadow-2xl"
            >
              📥 내 옵시디언 일지 다운로드 (.md)
            </button>
          </div>
        </section>
      )}

      {/* 푸터 영역 */}
      <footer className="text-center text-xs text-gray-600 pt-12 border-t border-white/5">
        <p>© 2026 My YouTube Journal. Created by Antigravity AI.</p>
      </footer>
    </main>
  );
}
