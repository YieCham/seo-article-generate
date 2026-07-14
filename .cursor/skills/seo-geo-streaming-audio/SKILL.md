---
name: seo-geo-streaming-audio
description: >-
  （兼容）已拆分为 streaming-audio-domain + streaming-audio-compliance。由文章类型自动启用新 Skill，请勿手动启用。
---

# 兼容说明

本 Skill 已拆分为：

- **`streaming-audio-domain`** — 流媒体领域知识、关键词、E-E-A-T、竞品洞察
- **`streaming-audio-compliance`** — 合规禁词、免责声明、敏感表述边界

在写作页选择 **How to** 或 **Top rank** 时会自动启用以上两项。文章结构（Quick Answer / Part / FAQ）由 Pipeline 代码注入。

**请勿单独启用本兼容项**，以免与新版 Skill 重复占用上下文。
