import { ipcMain } from 'electron'
import { generateArticle } from '../agent/articleAgent'
import { optimizeArticle } from '../agent/articleOptimizer'
import { batchOptimizePage } from '../agent/batchPageOptimizer'
import { reviseArticle } from '../agent/articleReviser'
import type { PipelineCheckpoint } from '../agent/pipelineCheckpoint'
import {
  beginArticleRun,
  cancelArticleRun,
  endArticleRun
} from '../agent/articleRunRegistry'
import { runWithAbortSignal } from '../agent/abortContext'

export function registerArticleIpc(): void {
  ipcMain.handle('article:generate', async (event, options) => {
    const signal = beginArticleRun(event.sender.id)
    try {
      return await runWithAbortSignal(signal, () => generateArticle(options, event.sender))
    } finally {
      endArticleRun(event.sender.id)
    }
  })

  ipcMain.handle('article:optimize', async (event, options) => {
    const signal = beginArticleRun(event.sender.id)
    try {
      return await runWithAbortSignal(signal, () => optimizeArticle(options, event.sender))
    } finally {
      endArticleRun(event.sender.id)
    }
  })

  ipcMain.handle('article:batchOptimize', async (event, options) => {
    const signal = beginArticleRun(event.sender.id)
    try {
      return await runWithAbortSignal(signal, () => batchOptimizePage(options, event.sender))
    } finally {
      endArticleRun(event.sender.id)
    }
  })

  ipcMain.handle('article:cancel', async (event) => {
    const cancelled = cancelArticleRun(event.sender.id)
    return { ok: cancelled as boolean }
  })

  ipcMain.handle('article:revise', async (event, options) => {
    const signal = beginArticleRun(event.sender.id)
    try {
      return await runWithAbortSignal(signal, () => reviseArticle(options, event.sender))
    } finally {
      endArticleRun(event.sender.id)
    }
  })

  ipcMain.handle('article:resume', async (event, checkpoint: PipelineCheckpoint) => {
    const signal = beginArticleRun(event.sender.id)
    try {
      if (checkpoint.kind === 'create') {
        return await runWithAbortSignal(signal, () =>
          generateArticle(
            {
              topic: checkpoint.options.topic,
              extraInstructions: checkpoint.options.extraInstructions,
              outputLanguage: checkpoint.options.outputLanguage,
              resume: checkpoint
            },
            event.sender
          )
        )
      }
      return await runWithAbortSignal(signal, () =>
        optimizeArticle(
          {
            sourceUrl: checkpoint.options.sourceUrl,
            extraInstructions: checkpoint.options.extraInstructions,
            outputLanguage: checkpoint.options.outputLanguage,
            resume: checkpoint
          },
          event.sender
        )
      )
    } finally {
      endArticleRun(event.sender.id)
    }
  })

}
