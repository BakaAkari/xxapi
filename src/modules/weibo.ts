import { Context, Schema } from 'koishi'
import { logInfo, logError } from '../index'

export interface WeiboConfig {}

export const WeiboConfig: Schema<WeiboConfig> = Schema.object({})

export class WeiboModule {
  private ctx: Context
  private config: WeiboConfig

  constructor(ctx: Context, config: WeiboConfig) {
    this.ctx = ctx
    this.config = config
    
    this.setupCommand()
  }

  private setupCommand() {
    this.ctx.command('微博热搜', '获取微博热搜榜')
      .action(async (session) => {
        try {
          logInfo('微博热搜模块: 开始获取热搜数据')
          
          const response = await this.ctx.http.get('https://v2.xxapi.cn/api/weibohot', {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          })
          
          logInfo('微博热搜模块: API响应状态', { code: response.code, type: typeof response })
          logInfo('微博热搜模块: 响应数据', response)
          
          if (!response || response.code !== 200) {
            logError('微博热搜模块: API返回状态码错误', response?.code)
            return '获取微博热搜数据失败: API返回状态码 ' + (response?.code || '未知')
          }
          
          if (!response.data) {
            logError('微博热搜模块: API返回数据为空')
            return '获取微博热搜数据失败: 数据为空'
          }
          
          if (!Array.isArray(response.data)) {
            logError('微博热搜模块: API返回数据格式错误，data不是数组', typeof response.data)
            return '获取微博热搜数据失败: 数据格式错误'
          }

          const hotList = response.data
          let message = '🔥 微博热搜榜\n\n'
          
          for (const item of hotList) {
            if (item && item.index && item.title) {
              message += `${item.index}. ${item.title}\n`
            }
          }
          
          logInfo('微博热搜模块: 成功获取热搜数据', { count: hotList.length })
          
          return message.trim()
          
        } catch (error) {
          logError('微博热搜模块错误', error)
          return '获取微博热搜失败，请稍后重试: ' + error.message
        }
      })
  }
}
