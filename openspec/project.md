# Project Context

## Purpose
Hotnews 是一个多平台热点新闻聚合与 AI 分析工具，用于：
- 监控 35+ 平台的热点新闻（抖音、知乎、B站、微博、华尔街见闻、财联社等）
- 智能关键词筛选和热度权重计算
- 自动推送到企业微信、飞书、钉钉、Telegram 等渠道
- 通过 MCP (Model Context Protocol) 提供 AI 对话分析能力

## Tech Stack
- **语言**: Python 3.10+
- **包管理**: UV (astral-sh/uv)
- **MCP框架**: FastMCP
- **数据存储**: SQLite（本地）/ S3兼容存储（远程）
- **部署方式**: Docker / GitHub Actions / 本地运行

## Project Conventions

### Code Style
- 遵循 PEP 8 Python 代码风格
- 使用类型注解 (Type Hints)
- 函数和类使用 docstring 文档
- 中文注释和文档

### Architecture Patterns
- 爬虫模块化设计：每个平台一个爬虫类
- MCP 工具分离：每个功能独立的 MCP 工具
- 配置驱动：通过 config/config.yaml 管理配置

### 大文件重构规则
当遇到较大的代码文件（超过 500 行）时，必须考虑重构：
- **模块化拆分**：将不同功能拆分为独立文件，每个模块职责单一
- **构建工具**：使用 esbuild 等工具打包模块为单一文件
- **避免冲突**：模块化设计可避免多功能在同一文件中产生冲突
- **便于维护**：独立模块更易于开发、调试、修复和测试

#### 前端 JavaScript 模块化示例
```
static/js/src/           # 模块化源代码
├── index.js             # 入口文件，按依赖顺序导入
├── core.js              # 核心工具函数、命名空间
├── storage.js           # localStorage 封装
├── [feature].js         # 各功能模块
└── init.js              # 初始化入口（最后导入）

static/js/viewer.bundle.js  # 构建输出（页面引用）
```

#### 构建命令
```bash
npm run build:js         # 构建打包文件
npm run build:js:watch   # 开发时监听模式
```

### Testing Strategy
- **E2E 测试 (Playwright)**：前端功能自动化测试，每次变更必须通过
  - 运行命令：`npm test`
  - 测试目录：`tests/e2e/`
  - Page Objects：`tests/e2e/pages/`
- **功能测试**：手动触发爬取验证
- **MCP 工具测试**：通过 AI 客户端调用验证

### E2E Testing Requirements
- 每个前端功能变更必须通过所有 E2E 测试
- 新功能必须添加对应的测试用例
- Bug 修复必须添加回归测试
- 测试失败时，先修复代码再继续开发

### Git Workflow
- main 分支为稳定版本
- 功能开发使用 feature/* 分支
- Conventional Commits 提交规范

## Domain Context
- 新闻聚合：从多个平台 API 或网页抓取热点新闻
- 热度计算：基于排名、平台权重计算综合热度分数
- 情感分析：分析新闻标题的情感倾向
- 趋势追踪：跟踪话题的热度变化趋势

## Important Constraints
- 爬虫频率需遵守各平台限制
- 数据存储需考虑隐私合规
- MCP 工具需保持低延迟响应

## External Dependencies
- 各平台热榜 API（知乎、微博、B站等）
- S3 兼容存储（Cloudflare R2、阿里云 OSS 等）
- 推送服务（企业微信、飞书、钉钉 Webhook）
