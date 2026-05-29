import { NextResponse } from 'next/server';
import { YoutubeTranscript } from 'youtube-transcript';
import { GoogleGenAI } from '@google/genai';

export async function POST(request) {
  try {
    const { videoId, title, channelTitle, category, description, tags, url, geminiKey } = await request.json();

    if (!videoId) {
      return NextResponse.json({ error: 'videoId가 누락되었습니다.' }, { status: 400 });
    }
    if (!geminiKey) {
      return NextResponse.json({ error: 'Gemini API Key가 누락되었습니다.' }, { status: 400 });
    }

    // 1. 서버사이드 자막 스크래핑 (CORS 제약 없는 안전한 추출)
    let transcriptText = null;
    try {
      const transcriptList = await YoutubeTranscript.fetchTranscript(videoId);
      if (transcriptList && transcriptList.length > 0) {
        transcriptText = transcriptList.map(item => item.text).join(' ');
      }
    } catch (err) {
      console.warn(`[API] ${title} 자막 추출 실패 (자막이 없거나 비활성화됨):`, err.message);
      // 에러 시 멈추지 않고 transcriptText = null 상태 유지하여 폴백 진행
    }

    // 2. `@google/genai` 신규 SDK 초기화 및 Gemini AI 요약 진행
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    
    const prompt = `
당신은 사용자의 옵시디언(Obsidian) 지식 베이스(RAG) 구축을 돕는 완벽한 AI 개인 비서입니다.
제공하는 유튜브 영상의 메타데이터와 자막 텍스트(Transcript)를 면밀히 분석한 후, 추후 사용자가 자연어로 검색하기 용이하도록 핵심 요약문과 RAG용 태그를 생성해 주세요.

[유튜브 영상 메타데이터]
- 제목: ${title}
- 채널명: ${channelTitle}
- 카테고리: ${category}
- 설명글 요약: ${description ? description.slice(0, 1000) : '없음'}
- 제작자 오리지널 태그: ${tags ? tags.join(', ') : '없음'}

[영상 자막(일부 또는 전체)]
${transcriptText ? transcriptText.slice(0, 120000) : "자막 정보가 제공되지 않습니다. 설명글을 참고해 주세요."}

---
다음 규칙에 맞추어 한국어 마크다운 본문을 작성해 주세요:
1. **RAG 자동 추천 옵시디언 태그**:
   제작자 태그와 본문 내용을 종합하여, 나중에 사용자가 옵시디언 그래프 뷰에서 연결하기 유용한 핵심 키워드 3~5개를 생성하세요. (예: \`#밀리터리 #국방기술 #SLBM #전문가분석 #대담\`)
2. **AI 자막 기반 심층 종합 요약**:
   - 영상의 전체적인 배경/상황맥락을 두괄식으로 탄탄하고 조밀하게 설명해 주세요.
   - 단숨에 요약하지 말고, 전체 분량에 걸쳐 중요한 디테일, 인용구, 구체적인 사례 및 통계 수치를 풍성하게 담아 매우 고밀도로 요약하세요. 40분 이상의 긴 영상의 경우 생략되는 정보가 없도록 특히 세세한 주석 수준으로 상세하게 기재해 주세요.
3. **📂 주요 세부 챕터 및 핵심 논거 흐름 (타임라인 기반)**:
   - 영상을 논리적 흐름에 따라 **최소 4개에서 6개 사이의 상세 챕터(Chapter)**로 분류하세요.
   - 각 챕터별 제목을 달고, 해당 단락에서 연사가 설명한 핵심 논제, 주장의 세부 근거, 그리고 구체적인 작동 원리나 일화 등을 최소 2~3줄 이상의 조밀한 줄글로 풍성하게 서술해 주세요.
4. **💡 오늘의 발견 및 인사이트**:
   - 사용자가 이 영상에서 얻었을 만한 가치 있는 비즈니스/개발/지식적 시사점이나 통찰력을 정성껏 정리해 주세요.
5. **어조**:
   - 차분하고 지적인 존댓말(작업일지/일기체)로 정돈되게 써 주세요.

형식은 아래 틀에 맞춰 텍스트로만 반환해 주세요. (별도의 감사 멘트나 추가 말없이 마크다운 서식만 반환해 주세요)

### 📊 메타데이터
*   **채널**: ${channelTitle}
*   **영상 링크**: [링크 바로가기](${url})
*   **카테고리**: ${category}
*   **제작자 오리지널 태그**: ${tags && tags.length > 0 ? tags.map(t => `\`#${t}\``).join(', ') : "없음"}
*   **AI 자동 추천 옵시디언 태그**: [여기에 #태그1 #태그2 형식으로 출력]

### 📝 AI 자막 기반 심층 종합 요약
*   **상황맥락 및 대주제**: [영상의 전체적인 배경, 기획 의도 및 중심 주제에 대해 풍성하게 서술]
*   **핵심 요약 요점**:
    - [전체 핵심 논제 1: 자세하게 수치와 논거를 포함하여 2~3줄로 설명]
    - [전체 핵심 논제 2: 자세하게 수치와 논거를 포함하여 2~3줄로 설명]
    - [전체 핵심 논제 3: 자세하게 수치와 논거를 포함하여 2~3줄로 설명]

### 📂 주요 세부 챕터 및 핵심 논거 흐름
*   **[챕터 1] [주제/내용에 맞는 제목]**
    - [해당 챕터에서 강조한 핵심 논리와 근거, 구체적인 사례를 담아 상세 서술 (3줄 이상)]
*   **[챕터 2] [주제/내용에 맞는 제목]**
    - [해당 챕터에서 강조한 핵심 논리와 근거, 구체적인 사례를 담아 상세 서술 (3줄 이상)]
*   **[챕터 3] [주제/내용에 맞는 제목]**
    - [해당 챕터에서 강조한 핵심 논리와 근거, 구체적인 사례를 담아 상세 서술 (3줄 이상)]
*   **[챕터 4] [주제/내용에 맞는 제목]**
    - [해당 챕터에서 강조한 핵심 논리와 근거, 구체적인 사례를 담아 상세 서술 (3줄 이상)]
*   *(필요시 챕터 5, 6 추가 작성 가능)*

### 💡 오늘의 발견 및 인사이트
*   [인사이트 분석 내용 (단순 반복이 아닌, 실생활/비즈니스에 적용할 수 있는 깊이 있는 시사점을 매우 풍부하게 작성)]
`;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return NextResponse.json({ summary: response.text });
    } catch (aiErr) {
      console.error('[API] Gemini generateContent 실패:', aiErr);
      return NextResponse.json({ error: `Gemini API 호출 중 에러가 발생했습니다: ${aiErr.message}` }, { status: 500 });
    }

  } catch (err) {
    console.error('[API] 서버 내부 오류:', err);
    return NextResponse.json({ error: `서버 내부 오류가 발생했습니다: ${err.message}` }, { status: 500 });
  }
}
