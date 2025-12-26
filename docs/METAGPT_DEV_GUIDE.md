# MetaGPT 开发工具使用指南（Dev-Only）

本项目将 MetaGPT 作为**开发期工具**使用：用于辅助生成原型/脚本/探索性代码，不进入线上 runtime，不进入 TrendRadar 生产镜像，不加入 `requirements.txt`。

## 1. 前置条件

- Python: `>=3.10, <3.12`
- Node.js: 建议 `>=18`
- pnpm: MetaGPT 部分能力需要（仅 dev）

## 2. 安装（隔离环境）

建议使用独立虚拟环境，避免污染 TrendRadar 运行依赖。

### 2.1 创建独立 venv（推荐）

在项目根目录执行：

```bash
python -m venv .venv-metagpt
source .venv-metagpt/bin/activate
pip install --upgrade pip
pip install --upgrade metagpt
```

> Windows 请使用对应的 venv 激活方式。

## 3. 初始化本机配置（包含 API Key）

MetaGPT 使用本机配置文件：`~/.metagpt/config2.yaml`。

```bash
metagpt --init-config
```

然后编辑 `~/.metagpt/config2.yaml`，配置你的 LLM：

- `llm.api_type`
- `llm.base_url`
- `llm.model`
- `llm.api_key`

注意：**不要**把该配置文件提交到仓库。

## 4. 输出目录约定

MetaGPT 的输出统一写入：

- `workspace/metagpt/`

该目录已在 `.gitignore` 中忽略，仅保留 `.gitkeep` 用于占位。

## 5. 一键运行

项目根目录提供脚本：

```bash
./metagpt-dev.sh "Write a small script to ..."
```

脚本会在 `workspace/metagpt/` 下运行 MetaGPT，从而保证输出落点可控。

## 6. 常见问题

- 如果提示缺少 Node/pnpm：按 MetaGPT 文档安装后重试。
- 如果报鉴权错误：检查 `~/.metagpt/config2.yaml` 的 `api_key` 和 `base_url`。
- 如果输出目录不符合预期：确认你是通过 `./metagpt-dev.sh` 运行。
