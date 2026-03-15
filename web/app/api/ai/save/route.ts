import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getProject } from '@/lib/project-service'
import { writeProjectFile } from '@/lib/file-manager'

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

const SaveSchema = z.object({
  projectId: z.string().min(1, 'projectId 不能为空'),
  fileName: z.string().min(1, 'fileName 不能为空'),
  content: z.string(),
})

// ---------------------------------------------------------------------------
// POST /api/ai/save — 手动保存产出物
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = SaveSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: '参数校验失败', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { projectId, fileName, content } = parsed.data

    // 查项目，获取项目名
    const project = getProject(projectId)
    if (!project) {
      return NextResponse.json(
        { error: '项目不存在' },
        { status: 404 }
      )
    }

    writeProjectFile(project.name, fileName, content)

    return NextResponse.json({ success: true, fileName })
  } catch (error) {
    console.error('Failed to save file:', error)
    return NextResponse.json(
      { error: '保存文件失败' },
      { status: 500 }
    )
  }
}
