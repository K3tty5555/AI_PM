"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ProgressBar } from "@/components/ui/progress-bar"
import { RarityStripeCard } from "@/components/rarity-stripe-card"
import { StageNav, type Stage } from "@/components/stage-nav"
import { InlineChat } from "@/components/inline-chat"

const demoStages: Stage[] = [
  { id: "research", label: "竞品研究" },
  { id: "analyze", label: "需求分析" },
  { id: "story", label: "用户故事" },
  { id: "prd", label: "PRD" },
  { id: "prototype", label: "原型设计" },
  { id: "review", label: "评审" },
  { id: "done", label: "完成" },
]

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-4">
      <h2
        className="text-sm font-bold uppercase tracking-[2px] text-[var(--text-muted)]"
        style={{ fontFamily: "'Courier New', Courier, monospace" }}
      >
        // {title}
      </h2>
      <div className="border border-[var(--border)] p-6 space-y-4">
        {children}
      </div>
    </section>
  )
}

export default function ComponentShowcase() {
  const [currentStage, setCurrentStage] = useState("prd")
  const [chatCollapsed, setChatCollapsed] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--background)] p-8 space-y-12 max-w-4xl mx-auto">
      {/* Page header */}
      <header className="space-y-2">
        <h1
          className="text-2xl font-bold text-[var(--dark)]"
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
        >
          // TERMINAL DESIGN SYSTEM
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Component showcase for visual verification
        </p>
        <div className="h-[2px] bg-[var(--yellow)] w-16" />
      </header>

      {/* ===================== BUTTON ===================== */}
      <Section title="BUTTON">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary</Button>
          <Button variant="primary" size="sm">Primary SM</Button>
          <Button variant="primary" size="lg">Primary LG</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="ghost" size="sm">Ghost SM</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="ghost" disabled>Ghost Disabled</Button>
        </div>
      </Section>

      {/* ===================== CARD ===================== */}
      <Section title="CARD">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>默认卡片</CardTitle>
              <CardDescription>Hover 查看黄色辉光效果</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--text-muted)]">
                极浅阴影，直角边框，悬停时发出荧光黄辉光。
              </p>
            </CardContent>
          </Card>
          <Card className="bg-[var(--secondary)]">
            <CardHeader>
              <CardTitle>灰底卡片</CardTitle>
              <CardDescription>Secondary background variant</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--text-muted)]">
                使用 F5F5F5 背景色的变体。
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* ===================== BADGE ===================== */}
      <Section title="BADGE">
        <div className="flex flex-wrap items-center gap-3">
          <Badge>DEFAULT</Badge>
          <Badge variant="outline">OUTLINE</Badge>
          <Badge>P0</Badge>
          <Badge variant="outline">PHASE-3</Badge>
          <Badge>ACTIVE</Badge>
          <Badge variant="outline">LOCKED</Badge>
        </div>
      </Section>

      {/* ===================== PROGRESS BAR ===================== */}
      <Section title="PROGRESS BAR">
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>0%</span>
            </div>
            <ProgressBar value={0} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>30%</span>
            </div>
            <ProgressBar value={30} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>50% (animated)</span>
            </div>
            <ProgressBar value={50} animated />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>75%</span>
            </div>
            <ProgressBar value={75} />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span>100%</span>
            </div>
            <ProgressBar value={100} />
          </div>
        </div>
      </Section>

      {/* ===================== RARITY STRIPE CARD ===================== */}
      <Section title="RARITY STRIPE CARD">
        <div className="space-y-3">
          <RarityStripeCard rarity="gold">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge>P0</Badge>
                <span className="text-sm font-semibold text-[var(--dark)]">
                  关键功能 — 用户登录流程重构
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                金色左侧竖条表示最高优先级
              </p>
            </div>
          </RarityStripeCard>
          <RarityStripeCard rarity="teal">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">P1</Badge>
                <span className="text-sm font-semibold text-[var(--dark)]">
                  建议优化 — 搜索结果排序
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                青色左侧竖条表示中等优先级
              </p>
            </div>
          </RarityStripeCard>
          <RarityStripeCard rarity="gray">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">P2</Badge>
                <span className="text-sm font-semibold text-[var(--dark)]">
                  补充需求 — 暗色模式支持
                </span>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                灰色左侧竖条表示较低优先级
              </p>
            </div>
          </RarityStripeCard>
        </div>
      </Section>

      {/* ===================== STAGE NAV ===================== */}
      <Section title="STAGE NAV">
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              当前阶段: PRD | 已完成: 竞品研究, 需求分析, 用户故事
            </p>
            <StageNav
              stages={demoStages}
              currentStage={currentStage}
              completedStages={["research", "analyze", "story"]}
              onStageClick={(id) => setCurrentStage(id)}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              初始状态: 仅第一阶段进行中
            </p>
            <StageNav
              stages={demoStages}
              currentStage="research"
              completedStages={[]}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              全部完成
            </p>
            <StageNav
              stages={demoStages}
              currentStage="done"
              completedStages={["research", "analyze", "story", "prd", "prototype", "review"]}
            />
          </div>
        </div>
      </Section>

      {/* ===================== INLINE CHAT ===================== */}
      <Section title="INLINE CHAT">
        <div className="space-y-6">
          {/* Expanded state */}
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">展开态</p>
            <InlineChat
              question="这个需求的目标用户是谁？请描述他们的核心使用场景。"
              options={["B端企业用户", "C端消费者", "内部运营人员"]}
              onAnswer={(answer) => console.log("Answer:", answer)}
            />
          </div>

          {/* Collapsed state */}
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">折叠态</p>
            <InlineChat
              question="产品的核心竞争力是什么？"
              isCollapsed
              collapsedSummary="已回答：AI 驱动的自动化工作流"
            />
          </div>

          {/* Interactive demo */}
          <div className="space-y-1">
            <p className="text-xs text-[var(--text-muted)]">
              交互演示（选择或输入后自动折叠）
            </p>
            <InlineChat
              question="需求优先级如何？"
              options={["P0 紧急", "P1 重要", "P2 一般"]}
              isCollapsed={chatCollapsed}
              onAnswer={(answer) => {
                console.log("Priority:", answer)
                setChatCollapsed(true)
              }}
            />
            {chatCollapsed && (
              <button
                type="button"
                onClick={() => setChatCollapsed(false)}
                className="text-xs text-[var(--yellow)] hover:underline cursor-pointer ml-5"
              >
                重新展开
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Footer */}
      <footer className="pt-8 border-t border-[var(--border)]">
        <p
          className="text-xs text-[var(--text-muted)] tracking-[1px]"
          style={{ fontFamily: "'Courier New', Courier, monospace" }}
        >
          // TERMINAL DESIGN SYSTEM v0.1 &mdash; AI_PM
        </p>
      </footer>
    </div>
  )
}
