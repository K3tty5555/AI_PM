import { NextResponse } from "next/server"
import { getProject } from "@/lib/project-service"
import { readProjectFile } from "@/lib/file-manager"

// GET /api/projects/[id]/files/[...path] — 读取项目文件
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const { id, path: pathSegments } = await params

    const project = getProject(id)
    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      )
    }

    const fileName = pathSegments.join("/")
    if (!fileName) {
      return NextResponse.json(
        { error: "文件路径不能为空" },
        { status: 400 }
      )
    }

    const content = readProjectFile(project.name, fileName)
    if (content === null) {
      return NextResponse.json(
        { error: "文件不存在" },
        { status: 404 }
      )
    }

    return new NextResponse(content, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (error) {
    console.error("Failed to read project file:", error)
    return NextResponse.json(
      { error: "读取文件失败" },
      { status: 500 }
    )
  }
}
