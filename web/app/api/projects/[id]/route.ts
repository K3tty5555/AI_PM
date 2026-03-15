import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getProject,
  deleteProject,
  advanceToNextPhase,
  updateProjectPhase,
} from "@/lib/project-service";

const PatchSchema = z.object({
  action: z.enum(["advance", "updatePhase"]),
  // advance 不需要额外参数
  // updatePhase 需要 phase + status
  phase: z.string().optional(),
  status: z.string().optional(),
  outputFile: z.string().optional(),
});

// GET /api/projects/[id] — 项目详情
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to get project:", error);
    return NextResponse.json(
      { error: "获取项目详情失败" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] — 更新项目（阶段推进 / 状态更新）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = PatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { action, phase, status, outputFile } = parsed.data;

    if (action === "advance") {
      const nextPhase = advanceToNextPhase(id);
      if (!nextPhase) {
        return NextResponse.json(
          { error: "已是最后阶段，无法继续推进" },
          { status: 400 }
        );
      }
      const updated = getProject(id);
      return NextResponse.json(updated);
    }

    if (action === "updatePhase") {
      if (!phase || !status) {
        return NextResponse.json(
          { error: "updatePhase 需要 phase 和 status 参数" },
          { status: 400 }
        );
      }
      updateProjectPhase(id, phase, status, outputFile);
      const updated = getProject(id);
      return NextResponse.json(updated);
    }

    return NextResponse.json(
      { error: "未知的 action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "更新项目失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id] — 删除项目
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = getProject(id);

    if (!project) {
      return NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      );
    }

    deleteProject(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "删除项目失败" },
      { status: 500 }
    );
  }
}
