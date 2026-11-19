# Domain 文档

工程类 skill 在探索代码库时，应如何消费本仓库的领域文档。

## 探索之前先读这些

- 根目录的 **`GLOSSARY.md`**。
- **`docs/adr/`**：读和工作区域相关的 ADR。

这些文件不存在就**静默继续**。别指出缺失，也别预先建议创建。`/domain-modeling` skill（经 `/grill-with-docs` 和 `/improve-codebase-architecture` 触达）会在术语或决策真正落定时惰性创建它们。

本仓库是单一上下文（single-context）布局：没有 `GLOSSARY-MAP.md`，词汇和决策统一放在仓库根。虽然 `apps/*` 和 `packages/*` 是 Bun workspaces 的多包结构，但它们是同一个聊天应用的分层而非独立产品域，共享词汇本来就归 `packages/shared` 管，不需要按包拆分词汇表。

## 文件结构

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-xxx.md
│   └── 0002-xxx.md
├── apps/
└── packages/
```

## 使用 glossary 的词汇

当你的输出命名一个领域概念（issue 标题、重构提案、假设、测试名）时，用 `GLOSSARY.md` 里定义的术语。别漂移到 glossary 明确回避的同义词。

如果需要的概念不在 glossary 里，这是个信号：要么你在发明项目不用的语言（重新考虑），要么存在真实空缺（记下来给 `/domain-modeling`）。

## 标出 ADR 冲突

如果你的输出与现有 ADR 矛盾，显式摆到明面上，而不是默默覆盖：

> _与 ADR-0007 矛盾，但值得重开，因为…_
