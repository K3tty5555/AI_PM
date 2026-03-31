import { createBrowserRouter, Navigate } from "react-router-dom"
import { AppLayout } from "./layouts/AppLayout"
import { DashboardPage } from "./pages/Dashboard"
import { SettingsPage } from "./pages/Settings"
import { OfficeHoursPage } from "./pages/project/OfficeHours"
import { RequirementPage } from "./pages/project/Requirement"
import { AnalysisPage } from "./pages/project/Analysis"
import { ResearchPage } from "./pages/project/Research"
import { StoriesPage } from "./pages/project/Stories"
import { PrdPage } from "./pages/project/Prd"
import { AnalyticsPage } from "./pages/project/Analytics"
import { PrototypePage } from "./pages/project/Prototype"
import { ReviewPage } from "./pages/project/Review"
import { RetrospectivePage } from "./pages/project/Retrospective"
import { ToolPriorityPage }  from "./pages/tools/Priority"
import { ToolWeeklyPage }    from "./pages/tools/Weekly"
import { ToolKnowledgePage } from "./pages/tools/Knowledge"
import { ToolPersonaPage }   from "./pages/tools/Persona"
import { ToolDataPage }      from "./pages/tools/Data"
import { ToolInterviewPage } from "./pages/tools/Interview"
import { ToolDesignSpecPage } from "./pages/tools/DesignSpec"
import { ToolPlazaPage } from "./pages/tools/Plaza"
// Wave 4 — 图像创作
import { BaoyuImaginePage }            from "./pages/tools/plaza/BaoyuImaginePage"
import { BaoyuCoverImagePage }         from "./pages/tools/plaza/BaoyuCoverImagePage"
import { BaoyuArticleIllustratorPage } from "./pages/tools/plaza/BaoyuArticleIllustratorPage"
import { BaoyuInfographicPage }        from "./pages/tools/plaza/BaoyuInfographicPage"
import { BaoyuXhsImagesPage }          from "./pages/tools/plaza/BaoyuXhsImagesPage"
import { BaoyuComicPage }              from "./pages/tools/plaza/BaoyuComicPage"
import { GifStickerMakerPage }         from "./pages/tools/plaza/GifStickerMakerPage"
import { MinimaxImagePage }            from "./pages/tools/plaza/MinimaxImagePage"
// Wave 5 — 文档生成
import { PptxGeneratorPage }           from "./pages/tools/plaza/PptxGeneratorPage"
import { BaoyuSlideDeckPage }          from "./pages/tools/plaza/BaoyuSlideDeckPage"
import { MinimaxPdfPage }              from "./pages/tools/plaza/MinimaxPdfPage"
import { MinimaxDocxPage }             from "./pages/tools/plaza/MinimaxDocxPage"
import { MinimaxXlsxPage }             from "./pages/tools/plaza/MinimaxXlsxPage"
// Wave 6 — 内容处理
import { BaoyuTranslatePage }          from "./pages/tools/plaza/BaoyuTranslatePage"
import { BaoyuFormatMarkdownPage }     from "./pages/tools/plaza/BaoyuFormatMarkdownPage"
import { BaoyuMarkdownToHtmlPage }     from "./pages/tools/plaza/BaoyuMarkdownToHtmlPage"
import { BaoyuUrlToMarkdownPage }      from "./pages/tools/plaza/BaoyuUrlToMarkdownPage"
import { BaoyuYoutubeTranscriptPage }  from "./pages/tools/plaza/BaoyuYoutubeTranscriptPage"
import { VisionAnalysisPage }          from "./pages/tools/plaza/VisionAnalysisPage"
import { BaoyuCompressImagePage }      from "./pages/tools/plaza/BaoyuCompressImagePage"
// Wave 7 — 视频音频 & 社交发布
import { MinimaxMultimodalAVPage }     from "./pages/tools/plaza/MinimaxMultimodalAVPage"
import { BaoyuPostToWechatPage }       from "./pages/tools/plaza/BaoyuPostToWechatPage"
import { BaoyuPostToWeiboPage }        from "./pages/tools/plaza/BaoyuPostToWeiboPage"
import { BaoyuPostToXPage }            from "./pages/tools/plaza/BaoyuPostToXPage"
import { BaoyuXToMarkdownPage }        from "./pages/tools/plaza/BaoyuXToMarkdownPage"

export const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/",         element: <DashboardPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/project/:id/office-hours", element: <OfficeHoursPage /> },
      { path: "/project/:id/requirement", element: <RequirementPage /> },
      { path: "/project/:id/analysis",    element: <AnalysisPage /> },
      { path: "/project/:id/research",    element: <ResearchPage /> },
      { path: "/project/:id/stories",     element: <StoriesPage /> },
      { path: "/project/:id/prd",         element: <PrdPage /> },
      { path: "/project/:id/analytics",   element: <AnalyticsPage /> },
      { path: "/project/:id/prototype",   element: <PrototypePage /> },
      { path: "/project/:id/review",         element: <ReviewPage /> },
      { path: "/project/:id/retrospective", element: <RetrospectivePage /> },
      { path: "/tools/priority",          element: <ToolPriorityPage /> },
      { path: "/tools/weekly",            element: <ToolWeeklyPage /> },
      { path: "/tools/knowledge",         element: <ToolKnowledgePage /> },
      { path: "/tools/persona",           element: <ToolPersonaPage /> },
      { path: "/tools/data",              element: <ToolDataPage /> },
      { path: "/tools/interview",         element: <ToolInterviewPage /> },
      { path: "/tools/design-spec",       element: <ToolDesignSpecPage /> },
      { path: "/tools/plaza",             element: <ToolPlazaPage /> },
      // Wave 4 — 图像创作
      { path: "/tools/plaza/baoyu-imagine",             element: <BaoyuImaginePage /> },
      { path: "/tools/plaza/baoyu-cover-image",         element: <BaoyuCoverImagePage /> },
      { path: "/tools/plaza/baoyu-article-illustrator", element: <BaoyuArticleIllustratorPage /> },
      { path: "/tools/plaza/baoyu-infographic",         element: <BaoyuInfographicPage /> },
      { path: "/tools/plaza/baoyu-xhs-images",          element: <BaoyuXhsImagesPage /> },
      { path: "/tools/plaza/baoyu-comic",               element: <BaoyuComicPage /> },
      { path: "/tools/plaza/gif-sticker-maker",         element: <GifStickerMakerPage /> },
      { path: "/tools/plaza/minimax-multimodal-image",  element: <MinimaxImagePage /> },
      // Wave 5 — 文档生成
      { path: "/tools/plaza/pptx-generator",   element: <PptxGeneratorPage /> },
      { path: "/tools/plaza/baoyu-slide-deck", element: <BaoyuSlideDeckPage /> },
      { path: "/tools/plaza/minimax-pdf",       element: <MinimaxPdfPage /> },
      { path: "/tools/plaza/minimax-docx",      element: <MinimaxDocxPage /> },
      { path: "/tools/plaza/minimax-xlsx",      element: <MinimaxXlsxPage /> },
      // Wave 6 — 内容处理
      { path: "/tools/plaza/baoyu-translate",          element: <BaoyuTranslatePage /> },
      { path: "/tools/plaza/baoyu-format-markdown",    element: <BaoyuFormatMarkdownPage /> },
      { path: "/tools/plaza/baoyu-markdown-to-html",   element: <BaoyuMarkdownToHtmlPage /> },
      { path: "/tools/plaza/baoyu-url-to-markdown",    element: <BaoyuUrlToMarkdownPage /> },
      { path: "/tools/plaza/baoyu-youtube-transcript", element: <BaoyuYoutubeTranscriptPage /> },
      { path: "/tools/plaza/vision-analysis",          element: <VisionAnalysisPage /> },
      { path: "/tools/plaza/baoyu-compress-image",     element: <BaoyuCompressImagePage /> },
      // Wave 7 — 视频音频 & 社交发布
      { path: "/tools/plaza/minimax-multimodal-video",  element: <MinimaxMultimodalAVPage /> },
      { path: "/tools/plaza/minimax-multimodal-audio",  element: <MinimaxMultimodalAVPage /> },
      { path: "/tools/plaza/baoyu-post-to-wechat",      element: <BaoyuPostToWechatPage /> },
      { path: "/tools/plaza/baoyu-post-to-weibo",       element: <BaoyuPostToWeiboPage /> },
      { path: "/tools/plaza/baoyu-post-to-x",           element: <BaoyuPostToXPage /> },
      { path: "/tools/plaza/baoyu-danger-x-to-markdown", element: <BaoyuXToMarkdownPage /> },
      { path: "*",                         element: <Navigate to="/" replace /> },
    ],
  },
])
