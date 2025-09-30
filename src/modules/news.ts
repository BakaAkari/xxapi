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

    // 调试自动推送功能
    this.ctx.command('调试推送', '调试自动推送功能')
      .option('status', '-s 查看推送状态')
      .option('test', '-t 测试推送功能')
      .option('reset', '-r 重置定时器')
      .option('timer', '-timer 测试定时器（5秒后触发）')
      .action(async (argv) => {
        if (argv.options.status) {
          return this.getPushStatus()
        }
        if (argv.options.test) {
          return await this.testPush()
        }
        if (argv.options.reset) {
          return this.resetScheduler()
        }
        if (argv.options.timer) {
          return this.testTimer()
        }
        return this.getPushStatus()
      })

    // 手动触发自动推送
    this.ctx.command('手动推送', '手动触发自动推送功能')
      .action(async (argv) => {
        try {
          logInfo('今日新闻模块: 手动触发自动推送')
          await this.sendNewsToGroups()
          return '手动推送完成'
        } catch (error) {
          logError('手动推送失败', error)
          return `手动推送失败: ${error.message}`
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
    
    logInfo('今日新闻模块: 设置定时器', { 
      now: now.toLocaleString('zh-CN'),
      targetTime: targetTime.toLocaleString('zh-CN'),
      delay: Math.round(delay / 1000 / 60) + '分钟'
    })
    
    this.timer = setTimeout(async () => {
      logInfo('今日新闻模块: 定时器触发，开始自动推送')
      await this.sendNewsToGroups()
      this.scheduleNextSend() // 安排下一次发送
    }, delay)
  }

  private async sendNewsToGroups() {
    if (this.config.targetGroups.length === 0) {
      logInfo('今日新闻模块: 未配置目标群组，跳过自动发送')
      return
    }

    try {
      logInfo('今日新闻模块: 开始自动发送新闻')
      const imagePath = await this.getNewsImage()
      const imageMessage = h.image(imagePath)
      
      // 检查是否包含通配符 *
      if (this.config.targetGroups.includes('*')) {
        // 发送到所有群组
        logInfo('今日新闻模块: 发送到所有群组')
        await this.sendToAllGroups(imageMessage)
      } else {
        // 发送到指定群组
        logInfo('今日新闻模块: 发送到指定群组', { groups: this.config.targetGroups })
        await this.sendToSpecificGroups(imageMessage)
      }
      logInfo('今日新闻模块: 自动发送完成')
    } catch (error) {
      logError('自动发送今日新闻失败', error)
    }
  }

  private async sendToAllGroups(imageMessage: any) {
    try {
      // 获取所有bot实例
      const bots = this.ctx.bots
      if (bots.length === 0) {
        logError('今日新闻模块: 没有可用的bot实例')
        return
      }

      logInfo('今日新闻模块: 发送到所有群组功能暂不支持，请使用指定群组ID')
      logError('今日新闻模块: 发送到所有群组需要配置具体的群组ID列表')
    } catch (error) {
      logError('今日新闻模块: 发送到所有群组失败', error)
    }
  }

  private async sendToSpecificGroups(imageMessage: any) {
    const bots = this.ctx.bots
    if (bots.length === 0) {
      logError('今日新闻模块: 没有可用的bot实例')
      return
    }

    for (const groupId of this.config.targetGroups) {
      let sent = false
      
      // 尝试通过所有bot发送到指定群组
      for (const bot of bots) {
        try {
          await bot.sendMessage(groupId, imageMessage)
          logInfo('今日新闻模块: 发送到指定群组成功', { botId: bot.selfId, groupId })
          sent = true
          break // 发送成功就退出
        } catch (sendError) {
          logError('今日新闻模块: bot发送到指定群组失败', { botId: bot.selfId, groupId, error: sendError })
        }
      }
      
      if (!sent) {
        logError('今日新闻模块: 所有bot都无法发送到群组', { groupId })
      }
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
      // 返回网络URL而不是本地路径，这样OneBot可以正确处理
      return imageUrl
    } catch {
      // 缓存不存在，下载图片
      logInfo('今日新闻模块: 下载新图片', { url: imageUrl })
      const imageBuffer = await this.ctx.http.get(imageUrl, { responseType: 'arraybuffer' })
      await fs.writeFile(cacheFile, Buffer.from(imageBuffer))
      logInfo('今日新闻模块: 图片下载完成', { file: cacheFile })
      // 返回网络URL而不是本地路径
      return imageUrl
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

  // 调试方法
  private getPushStatus(): string {
    const now = new Date()
    const [hours, minutes] = this.config.sendTime.split(':').map(Number)
    const nextSend = new Date()
    nextSend.setHours(hours, minutes, 0, 0)
    
    // 如果目标时间已过，设置为明天
    if (nextSend <= now) {
      nextSend.setDate(nextSend.getDate() + 1)
    }

    const status = {
      '自动推送启用': this.config.autoSend ? '是' : '否',
      '发送时间': this.config.sendTime,
      '下次发送时间': nextSend.toLocaleString('zh-CN'),
      '目标群组': this.config.targetGroups.length > 0 ? this.config.targetGroups.join(', ') : '未配置',
      '定时器状态': this.timer ? '运行中' : '未运行',
      '缓存目录': this.cacheDir
    }

    return `自动推送状态:\n${Object.entries(status).map(([key, value]) => `${key}: ${value}`).join('\n')}`
  }

  private async testPush(): Promise<string> {
    try {
      logInfo('今日新闻模块: 开始测试推送功能')
      
      // 测试获取新闻图片
      const imagePath = await this.getNewsImage()
      logInfo('今日新闻模块: 成功获取新闻图片', { path: imagePath })
      
      // 测试发送到当前会话
      const imageMessage = h.image(imagePath)
      
      return `测试推送成功!\n图片路径: ${imagePath}\n配置状态: ${this.getPushStatus()}`
    } catch (error) {
      logError('测试推送失败', error)
      return `测试推送失败: ${error.message}`
    }
  }

  private resetScheduler(): string {
    try {
      // 清除现有定时器
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      
      // 重新设置定时器
      this.setupScheduler()
      
      logInfo('今日新闻模块: 定时器已重置')
      return `定时器已重置\n${this.getPushStatus()}`
    } catch (error) {
      logError('重置定时器失败', error)
      return `重置定时器失败: ${error.message}`
    }
  }

  private testTimer(): string {
    try {
      logInfo('今日新闻模块: 开始测试定时器功能')
      
      // 清除现有定时器
      if (this.timer) {
        clearTimeout(this.timer)
        this.timer = null
      }
      
      // 设置5秒后的测试定时器
      this.timer = setTimeout(async () => {
        logInfo('今日新闻模块: 测试定时器触发')
        try {
          await this.sendNewsToGroups()
          logInfo('今日新闻模块: 测试定时器执行完成')
        } catch (error) {
          logError('今日新闻模块: 测试定时器执行失败', error)
        }
      }, 5000)
      
      logInfo('今日新闻模块: 测试定时器已设置，5秒后触发')
      return '测试定时器已设置，5秒后触发自动推送功能'
    } catch (error) {
      logError('设置测试定时器失败', error)
      return `设置测试定时器失败: ${error.message}`
    }
  }
}
