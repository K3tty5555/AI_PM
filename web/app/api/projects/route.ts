import { NextResponse } from "next/server";
import { z } from "zod";
import { createProjectFn, listProjects } from "@/lib/project-service";

const CreateProjectSchema = z.object({
  name: z.string().min(1, "项目名称不能为空"),
  description: z.string().optional().default(""),
});

// GET /api/projects — 项目列表
export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json(projects);
  } catch (error) {
    console.error("Failed to list projects:", error);
    return NextResponse.json(
      { error: "获取项目列表失败" },
      { status: 500 }
    );
  }
}

// POST /api/projects — 创建项目
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, description } = parsed.data;
    const project = createProjectFn(name, description);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "创建项目失败" },
      { status: 500 }
    );
  }
}
