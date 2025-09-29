import { Context, Schema } from 'koishi'
import { promises as fs } from 'fs'
import { join } from 'path'

export const name = 'xxapi'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
  // 创建缓存目录
  const cacheDir = join(process.cwd(), 'cache', 'xxapi')
  
  // 确保缓存目录存在
  fs.mkdir(cacheDir, { recursive: true }).catch(() => {})

  ctx.command('今日新闻', '获取今日新闻图片')
    .action(async (session) => {
      try {
        // 获取API数据
        const response = await ctx.http.get('http://192.168.50.55:4399/v2/60s')
        
        if (response.code !== 200 || !response.data?.image) {
          return '获取新闻数据失败'
        }

        const imageUrl = response.data.image
        const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
        const cacheFile = join(cacheDir, `${today}.jpg`)
        
        let imagePath = cacheFile
        
        // 检查缓存是否存在
        try {
          await fs.access(cacheFile)
          // 缓存存在，直接使用
        } catch {
          // 缓存不存在，下载图片
          const imageBuffer = await ctx.http.get(imageUrl, { responseType: 'arraybuffer' })
          await fs.writeFile(cacheFile, Buffer.from(imageBuffer))
        }
        
        // 发送图片
        return `[CQ:image,file=file:///${imagePath.replace(/\\/g, '/')}]`
        
      } catch (error) {
        console.error('今日新闻插件错误:', error)
        return '获取今日新闻失败，请稍后重试'
      }
    })
}
