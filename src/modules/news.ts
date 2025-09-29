import { Context, Schema, h } from 'koishi'
import { promises as fs } from 'fs'
import { join } from 'path'
import { logInfo, logError } from '../index'

export interface NewsConfig {
  autoSend: boolean
  sendTime: string
  targetGroups: string[]
}

export const NewsConfig: Schema<NewsConfig> = Schema.object({
  autoSend: Schema.boolean().default(false).description('启用自动发送'),
  sendTime: Schema.string().default('08:00').description('发送时间 (HH:MM)'),
  targetGroups: Schema.array(Schema.string()).default([]).description('目标群组ID列表，使用 * 表示所有群组')
})

export class NewsModule {
  private ctx: Context
  private config: NewsConfig
  private cacheDir: string
  private timer: NodeJS.Timeout | null = null

  constructor(ctx: Context, config: NewsConfig) {
    this.ctx = ctx
    this.config = config
    this.cacheDir = join(process.cwd(), 'cache', 'xxapi', 'news')
    
    // 确保缓存目录存在
    fs.mkdir(this.cacheDir, { recursive: true }).catch(() => {})
    
    this.setupCommand()
    this.setupScheduler()
  }

  private setupCommand() {
    this.ctx.command('今日新闻', '获取今日新闻图片')
      .action(async (argv) => {
        try {
          logInfo('今日新闻模块: 开始获取新闻图片')
          const imagePath = await this.getNewsImage()
          await argv.session.send(h.image(imagePath))
          logInfo('今日新闻模块: 成功发送新闻图片')
          return ''
        } catch (error) {
          logError('今日新闻插件错误', error)
          return '获取今日新闻失败，请稍后重试'
        }
      })
  }

  private setupScheduler() {
    if (!this.config.autoSend) return

    this.scheduleNextSend()
  }

  private scheduleNextSend() {
    if (this.timer) {
      clearTimeout(this.timer)
    }

    const [hours, minutes] = this.config.sendTime.split(':').map(Number)
    const now = new Date()
    const targetTime = new Date()
    targetTime.setHours(hours, minutes, 0, 0)

    // 如果目标时间已过，设置为明天
    if (targetTime <= now) {
      targetTime.setDate(targetTime.getDate() + 1)
    }

    const delay = targetTime.getTime() - now.getTime()
    
    this.timer = setTimeout(async () => {
      await this.sendNewsToGroups()
      this.scheduleNextSend() // 安排下一次发送
    }, delay)
  }

  private async sendNewsToGroups() {
    if (this.config.targetGroups.length === 0) return

    try {
      logInfo('今日新闻模块: 开始自动发送新闻')
      const imagePath = await this.getNewsImage()
      const imageMessage = h.image(imagePath)
      
      // 检查是否包含通配符 *
      if (this.config.targetGroups.includes('*')) {
        // 发送到所有群组
        logInfo('今日新闻模块: 发送到所有群组')
        await this.ctx.broadcast([], imageMessage)
      } else {
        // 发送到指定群组
        logInfo('今日新闻模块: 发送到指定群组', { groups: this.config.targetGroups })
        for (const groupId of this.config.targetGroups) {
          await this.ctx.broadcast([groupId], imageMessage)
        }
      }
      logInfo('今日新闻模块: 自动发送完成')
    } catch (error) {
      logError('自动发送今日新闻失败', error)
    }
  }

  private async getNewsImage(): Promise<string> {
    // 获取API数据
    logInfo('今日新闻模块: 请求新闻API')
    const response = await this.ctx.http.get('http://192.168.50.55:4399/v2/60s')
    
    if (response.code !== 200 || !response.data?.image) {
      logError('今日新闻模块: API返回数据错误', { code: response.code, hasImage: !!response.data?.image })
      throw new Error('获取新闻数据失败')
    }

    const imageUrl = response.data.image
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const cacheFile = join(this.cacheDir, `${today}.jpg`)
    
    // 检查缓存是否存在
    try {
      await fs.access(cacheFile)
      logInfo('今日新闻模块: 使用缓存图片', { file: cacheFile })
      return cacheFile
    } catch {
      // 缓存不存在，下载图片
      logInfo('今日新闻模块: 下载新图片', { url: imageUrl })
      const imageBuffer = await this.ctx.http.get(imageUrl, { responseType: 'arraybuffer' })
      await fs.writeFile(cacheFile, Buffer.from(imageBuffer))
      logInfo('今日新闻模块: 图片下载完成', { file: cacheFile })
      return cacheFile
    }
  }

  public async clearCache() {
    try {
      const files = await fs.readdir(this.cacheDir)
      for (const file of files) {
        await fs.unlink(join(this.cacheDir, file))
      }
      logInfo('今日新闻模块: 缓存已清空', { count: files.length })
      return `已清空 ${files.length} 个缓存文件`
    } catch (error) {
      logError('今日新闻模块: 清空缓存失败', error)
      return '清空缓存失败'
    }
  }

  public updateConfig(config: NewsConfig) {
    this.config = config
    this.setupScheduler()
  }

  public destroy() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
