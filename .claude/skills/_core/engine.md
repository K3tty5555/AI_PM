---
name: ai-pm-core
description: >-
  AI_PM 核心引擎。提供统一的状态管理、工作流引擎、插件系统和数据总线。
  支撑所有技能的协调执行和上下文共享。
argument-hint: "[command] [options]"
allowed-tools: Read Write Edit Bash(ls) Bash(mkdir) Bash(cat)
---

# AI_PM Core Engine

## 定位

核心引擎是 AI_PM 的基础设施层，提供：
- 统一的状态管理和持久化
- 工作流的定义和执行
- 技能的注册和协调
- 数据的传递和缓存

## 架构设计

```
┌─────────────────────────────────────────┐
│           AI_PM Core Engine             │
├─────────────────────────────────────────┤
│  StateManager  │  WorkflowEngine        │
│  ConfigCenter  │  PluginSystem          │
│  DataBus       │  EventSystem           │
└─────────────────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
   ┌───────┐   ┌───────┐   ┌───────┐
   │Skill 1│   │Skill 2│   │Skill N│
   └───────┘   └───────┘   └───────┘
```

## 核心组件

### 1. StateManager - 状态管理器

**职责**:
- 维护项目全局状态
- 支持断点续传
- 跨阶段数据共享
- 版本管理

**状态结构**:
```json
{
  "version": "2.0",
  "project": {
    "id": "project-name-20260228",
    "name": "项目名称",
    "currentPhase": "prd",
    "workflow": {
      "mode": "standard",
      "phases": [
        {
          "id": "clarify",
          "name": "需求澄清",
          "status": "completed",
          "output": "01-requirement-draft.md",
          "completedAt": "2026-02-28T10:00:00Z"
        }
      ]
    }
  },
  "context": {
    "userProfile": {
      "level": "professional",
      "productType": "b2b",
      "role": "pm"
    },
    "config": {}
  }
}
```

**API**:
```javascript
// 获取状态
const state = StateManager.get(projectId);

// 更新阶段状态
StateManager.updatePhase(projectId, phaseId, { status: 'in_progress' });

// 保存上下文
StateManager.setContext(projectId, key, value);

// 获取断点
const checkpoint = StateManager.getCheckpoint(projectId);
```

### 2. WorkflowEngine - 工作流引擎

**职责**:
- 定义阶段依赖关系
- 支持条件分支
- 动态流程编排

**工作流定义**:
```yaml
workflows:
  quick:
    name: "快速模式"
    description: "15分钟快速输出"
    phases:
      - clarify
      - prd
      - prototype

  standard:
    name: "标准模式"
    description: "45分钟完整流程"
    phases:
      - clarify
      - analyze
      - research
      - story
      - prd
      - prototype

  deep:
    name: "深度模式"
    description: "2小时深度分析"
    phases:
      - reference
      - clarify
      - analyze
      - research
      - story
      - prd
      - prototype
      - review

  adaptive:
    name: "自适应模式"
    description: "根据需求复杂度自动选择"
    selector: "complexity_based"
```

**API**:
```javascript
// 获取工作流
const workflow = WorkflowEngine.get(workflowId);

// 执行下一阶段
const nextPhase = WorkflowEngine.getNextPhase(projectId);

// 条件分支
if (WorkflowEngine.shouldSkip(projectId, phaseId)) {
  WorkflowEngine.skip(projectId, phaseId);
}
```

### 3. PluginSystem - 插件系统

**职责**:
- 技能注册和发现
- 生命周期管理
- 事件机制

**技能接口契约**:
```typescript
interface Skill {
  id: string;
  name: string;
  version: string;
  dependencies: string[];

  // 生命周期方法
  onInit(): void;
  onExecute(context: Context): Result;
  onComplete(): void;
  onError(error: Error): void;
}
```

**API**:
```javascript
// 注册技能
PluginSystem.register(skill);

// 获取技能
const skill = PluginSystem.get(skillId);

// 检查依赖
const deps = PluginSystem.checkDependencies(skillId);

// 广播事件
PluginSystem.broadcast(event, data);
```

### 4. DataBus - 数据总线

**职责**:
- 阶段间数据传递
- 缓存和持久化
- 版本管理

**API**:
```javascript
// 发布数据
DataBus.publish(channel, data);

// 订阅数据
DataBus.subscribe(channel, callback);

// 缓存
DataBus.cache(key, data, ttl);

// 获取缓存
DataBus.getCache(key);
```

## 使用示例

### 初始化项目

```javascript
// 创建新项目
const project = CoreEngine.createProject({
  name: "智能会议助手",
  workflow: "standard",
  userProfile: {
    level: "professional",
    productType: "b2b"
  }
});

// 自动检测断点
const checkpoint = CoreEngine.detectCheckpoint(project.id);
if (checkpoint) {
  console.log(`检测到未完成的项目，当前阶段: ${checkpoint.currentPhase}`);
}
```

### 执行工作流

```javascript
// 开始执行
CoreEngine.start(project.id);

// 获取当前进度
const progress = CoreEngine.getProgress(project.id);
console.log(`进度: ${progress.percentage}%, 当前阶段: ${progress.currentPhase}`);

// 暂停（可恢复）
CoreEngine.pause(project.id);

// 恢复
CoreEngine.resume(project.id);
```

### 技能协作

```javascript
// 在 ai-pm-prd 技能中获取前置输出
const analyzeResult = DataBus.getCache(`project:${projectId}:analyze:output`);

// 发布当前输出
DataBus.publish(`project:${projectId}:prd:output`, prdContent);

// 触发下一阶段事件
PluginSystem.broadcast('phase:complete', {
  projectId,
  phase: 'prd',
  nextPhase: 'prototype'
});
```

## 配置中心

### 配置分层

```
System Default → Organization → Project → User
     ↓                ↓             ↓         ↓
   系统默认          团队配置       项目配置    个人偏好
```

### 配置项

```yaml
# 系统默认配置
system:
  maxTokens: 4000
  timeout: 120
  cacheEnabled: true

# 工作流配置
workflows:
  default: "standard"

# 输出配置
output:
  format: "markdown"
  template: "default"
  verbose: false

# 用户偏好
user:
  level: "professional"
  theme: "dark"
  language: "zh-CN"
```

## 事件系统

### 事件类型

```typescript
type EventType =
  | 'project:create'
  | 'project:start'
  | 'phase:start'
  | 'phase:complete'
  | 'phase:error'
  | 'project:complete'
  | 'project:pause'
  | 'project:resume';
```

### 事件监听示例

```javascript
// 监听阶段完成
EventSystem.on('phase:complete', ({ projectId, phase }) => {
  console.log(`项目 ${projectId} 完成阶段: ${phase}`);

  // 自动保存进度
  StateManager.saveCheckpoint(projectId);
});

// 监听错误
EventSystem.on('phase:error', ({ projectId, phase, error }) => {
  console.error(`项目 ${projectId} 阶段 ${phase} 出错:`, error);

  // 自动回滚到上一阶段
  WorkflowEngine.rollback(projectId);
});
```

## 性能优化

### 缓存策略

```javascript
// 多级缓存
CacheManager.setStrategy({
  l1: 'memory',      // 内存缓存，最快
  l2: 'file',        // 文件缓存，持久化
  l3: 'database'     // 数据库，长期存储
});

// 缓存预热
CacheManager.preload(['common:prompts', 'templates:prd']);
```

### 懒加载

```javascript
// 按需加载技能
const skill = await PluginSystem.lazyLoad(skillId);

// 按需加载历史数据
const history = await DataBus.lazyLoad(projectId, { limit: 10 });
```

## 扩展点

### 自定义技能

```javascript
// 创建自定义技能
const mySkill = {
  id: 'my-skill',
  name: '我的技能',
  version: '1.0.0',
  dependencies: ['ai-pm-analyze'],

  onExecute(context) {
    // 获取前置输出
    const input = context.getInput();

    // 执行逻辑
    const output = process(input);

    // 返回结果
    return { success: true, output };
  }
};

// 注册
PluginSystem.register(mySkill);
```

### 自定义工作流

```javascript
// 定义新工作流
WorkflowEngine.define('custom', {
  phases: ['clarify', 'my-skill', 'prd'],
  conditions: {
    'my-skill': (context) => context.get('complexity') === 'high'
  }
});
```

## 监控和调试

### 日志系统

```javascript
// 启用调试模式
CoreEngine.setDebug(true);

// 查看执行日志
const logs = CoreEngine.getLogs(projectId);

// 性能分析
const profile = CoreEngine.getProfile(projectId);
console.log(`各阶段耗时:`, profile.phaseDurations);
```

### 健康检查

```javascript
// 系统健康检查
const health = CoreEngine.healthCheck();
console.log(`状态: ${health.status}`);
console.log(`技能加载: ${health.skills.loaded}/${health.skills.total}`);
console.log(`存储使用: ${health.storage.usage}%`);
```

## 迁移指南

### 从 v1.x 迁移

1. **状态迁移**:
   ```bash
   # 自动迁移旧项目状态
   /ai-pm migrate --from=1.x --to=2.0
   ```

2. **技能迁移**:
   - 更新 skill 接口实现
   - 注册到 PluginSystem

3. **配置迁移**:
   - 旧配置自动导入 ConfigCenter
   - 新增配置项使用默认值

---

**引擎版本**: 2.0
**最后更新**: 2026-02-28
