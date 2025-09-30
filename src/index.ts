import { Context, Schema } from 'koishi'
import { NewsModule, NewsConfig } from './modules/news'
import { WeiboModule, WeiboConfig } from './modules/weibo'
import { GoldModule, GoldConfig } from './modules/gold'

export const name = 'xxapi'

export interface Config {
  news: NewsConfig
  weibo: WeiboConfig
  gold: GoldConfig
  enableLog: boolean
}

export const Config: Schema<Config> = Schema.object({
  news: NewsConfig,
  weibo: WeiboConfig,
  gold: GoldConfig,
  enableLog: Schema.boolean().default(true).description('启用全局日志记录')
})

let newsModule: NewsModule
let weiboModule: WeiboModule
let goldModule: GoldModule
let globalConfig: Config
let logger: any

export function apply(ctx: Context, config: Config) {
  globalConfig = config
  logger = ctx.logger('xxapi')
  
  // 初始化今日新闻模块
  newsModule = new NewsModule(ctx, config.news)
  
  // 初始化微博热搜模块
  weiboModule = new WeiboModule(ctx, config.weibo)
  
  // 初始化金价模块
  goldModule = new GoldModule(ctx, config.gold)
  
  // 添加清空缓存命令
  ctx.command('清空缓存', '清空今日新闻缓存')
    .action(async (argv) => {
      if (newsModule) {
        const result = await newsModule.clearCache()
        return result
      }
      return '今日新闻模块未初始化'
    })
  
  // 监听指令调用，记录指令执行
  ctx.on('command/before-execute', (argv) => {
    if (globalConfig.enableLog && argv.command.name) {
      logger.info(`指令调用: ${argv.session.userId} 在 ${argv.session.guildId || '私聊'} 执行指令: ${argv.command.name}`)
    }
  })
  
  // 监听所有用户消息，记录消息内容用于调试
  ctx.on('message', (session) => {
    if (globalConfig.enableLog) {
      logger.info(`用户消息: ${session.userId} 在 ${session.guildId || '私聊'}`, {
        content: session.content,
        elements: session.elements?.map(el => ({
          type: el.type,
          attrs: el.attrs
        })),
        messageId: session.messageId,
        timestamp: session.timestamp
      })
    }
  })
  
  // 监听配置变化
  ctx.on('config', () => {
    globalConfig = config
    if (newsModule && config.news) {
      newsModule.updateConfig(config.news)
    }
  })
  
  // 插件卸载时清理资源
  ctx.on('dispose', () => {
    if (newsModule) {
      newsModule.destroy()
    }
  })
}

// 导出全局日志函数供模块使用
export function logInfo(message: string, data?: any) {
  if (globalConfig?.enableLog && logger) {
    logger.info(message, data)
  }
}

export function logError(message: string, error?: any) {
  if (globalConfig?.enableLog && logger) {
    logger.error(message, error)
  }
}

export function logWarn(message: string, data?: any) {
  if (globalConfig?.enableLog && logger) {
    logger.warn(message, data)
  }
}

export function logDebug(message: string, data?: any) {
  if (globalConfig?.enableLog && logger) {
    logger.debug(message, data)
  }
}
