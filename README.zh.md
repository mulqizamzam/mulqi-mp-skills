# Mulqi MP Skills

一个原生的 **DeepSeek Harness** 插件，将 39 个可复用的 agent 技能——面向真实
工程工作与日常效率——以只读捆绑技能提供者的形式暴露出来。

该插件向宿主技能注册表注册一个 provider。每个技能都以原样文件形式放在
`vendor/skills/` 下；provider 在运行时发现它们，因此磁盘上的技能集合
是唯一事实来源。技能内容不嵌入代码，任何 `SKILL.md` 的修改都会即时生效，
无需重新构建模块。

## 你将获得

- **39 个技能**，分四个类别：engineering（20）、productivity（7）、
  misc（4）、in-progress（8）。
- **原生发现** —— 技能会出现在宿主技能目录中，可被模型调用
  （用户调用型技能也可由人显式调用）。
- **内容原样保留** —— 每个技能的指令正文及其同目录参考文件
  （`references/`、`scripts/`、术语表、ADR）完整保留。技能内的
  相对路径解析到该技能自己的目录。
- **零宿主表面改动** —— 插件仅挂载一行 Cordis 插件行并注册一个
  provider。不开放端口、不改变模型输出、不发送遥测。

## 要求

| 要求 | 值 |
| --- | --- |
| DeepSeek Harness | `0.2.1-rc.2`（精确匹配） |
| Node.js | `^22.19.0 \|\| >=24.0.0` |
| 宿主技能服务 | `@deepseek-ai/dsh-skill`（由基础捆绑提供） |

插件将 `engines.dsh` 锁定为 `0.2.1-rc.2`。使用其他 Harness 版本会在
安装/激活时被拒绝，除非授予精确版本豁免。

## 安装

### 从 GitHub 安装（推荐）

使用 `github:` install-spec 简写将捆绑装入某个 profile，然后重启该
profile：

```bash
dsh plugin --profile <profile> add github:mulqizamzam/mulqi-mp-skills
```

CLI 会在 profile 目录中执行 `pnpm add`，并——由于 `package.json`
声明了 `dsh.bundle` → `./cordis.patch.yml`——自动把捆绑注册进
`dsh.profile.bundles`。无需手动编辑 manifest；补丁会插入一行挂载行，
该行加载本模块，其 `apply(ctx)` 注册 provider。

### 从本地检出安装

CLI 接受的所有 install-spec 形式均可：完整 git URL、tarball 或本地路径。

```bash
git clone https://github.com/mulqizamzam/mulqi-mp-skills.git
dsh plugin --profile <profile> add /path/to/mulqi-mp-skills
```

### 无需启动即可验证

```bash
dsh --profile <profile> --dump-config | grep mulqi-mp-skills
```

出现挂载行（且没有 `skipping profile bundle` 行）即表示引擎锁定满足、
捆绑已接入。重启 profile 后，启动日志会显示 provider 注册
`vendor/skills/` 下的 39 个技能。

### 宿主版本锁定

插件将 `engines.dsh` 精确锁定为 `0.2.1-rc.2`。在宿主版本不同时，
安装/激活会被拒绝；仅当你愿意为这些精确版本承担风险时再授予豁免：

```bash
dsh plugin --profile <profile> allow-version mulqi-mp-skills@0.1.0 \
  --dsh-version <精确宿主版本> --accept-risk
```

## 语言

- English: [README.md](README.md)
- Bahasa Indonesia: [README.id.md](README.id.md)
- 中文: [README.zh.md](README.zh.md)

## 使用

安装完成后，39 个技能通过正常技能目录可用。模型可调用型技能可由任务
触发；用户调用型技能（目录中有标注）需显式调用。

技能按意图分组，因此大多数任务通过一小组入口技能即可路由：

| 我想要… | 从…开始 |
| --- | --- |
| 为某个情境找到合适的技能或流程 | `ask-matt`（用户）/ `grill-with-docs` |
| 把对话变成 spec，再变成 ticket，再变成代码 | `to-spec` → `to-tickets` → `implement-spec` |
| 测试先行开发 | `tdd` |
| 设计或深化模块接口 | `codebase-design` / `domain-modeling` |
| 排查难 bug 或回归 | `diagnosing-bugs` |
| 评审分支或 PR | `code-review` / `pr` |
| 规划大批量工作 | `wayfinder` |
| 复盘或交接 | `retro` / `handoff` |

完整、原样的目录——每个技能及其精确描述与调用方式——见
[docs/skills-catalog.md](docs/skills-catalog.md)。

## Provider 工作原理

- `index.js` 导出一个 Cordis 插件：`name`、`inject: ['skills']` 和
  `apply(ctx)`。
- `apply(ctx)` 调用 `ctx.skills.registerProvider(...)`，注册一个只读
  provider：其 `list()` 遍历 `vendor/skills/**/SKILL.md`，`get()`
  按需加载单个技能正文。
- 每个候选项携带 `resourceBase = { kind: 'directory', path: <技能目录> }`，
  因此技能对同目录文件的引用解析到其自身文件夹。
  `disable-model-invocation` frontmatter 被尊重，使技能仅限用户调用。
- provider 注册进调用方上下文的层；teardown 时返回的 disposer 将其注销。

契约细节与 provider 读取的 frontmatter 字段见
[docs/provider.md](docs/provider.md)。

## 配置

没有配置面。行为完全由 `vendor/skills/` 下的技能文件驱动。要新增或
修改技能，在那里编辑或添加 `SKILL.md`（需要合法的 kebab-case `name`
和 `description`），然后重启 profile。

## 故障排查

| 症状 | 可能原因 / 处理 |
| --- | --- |
| `Plugin mulqi-mp-skills@0.1.0 is incompatible with dsh <ver>` | 运行的 Harness 不是 `0.2.1-rc.2`。使用该版本，或授予精确版本豁免。 |
| 技能未出现在目录中 | 确认挂载行存在（`--dump-config \| grep mulqi-mp-skills`）且 `vendor/skills/` 完整。 |
| 宿主版本升级后 `engines.dsh` 被拒 | 精确锁定是有意为之。仅为愿意承担风险的精确插件与运行时版本授予豁免。 |

## 验证

- `node --check index.js` —— 模块语法。
- `npm test` —— provider 断言（发现、形状、调用标志、加载往返、
  消失候选项处理）。
- `node tests/verify.mjs` —— 用宿主相同的 YAML 解析器重新解析每个
  `SKILL.md` 的 frontmatter。

## 许可

MIT。捆绑的技能内容 © 2026 Matt Pocock，采用 MIT 许可；见
[LICENSE](LICENSE) 与 [NOTICE.md](NOTICE.md)。`index.js` 中的
provider 代码及 manifest/挂载文件同样以该许可发布。
