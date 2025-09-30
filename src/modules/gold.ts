import { Context, Schema } from 'koishi'
import { logInfo, logError } from '../index'

export interface GoldConfig {}

export const GoldConfig: Schema<GoldConfig> = Schema.object({})

interface GoldPriceResponse {
  code: number
  msg: string
  data: {
    bank_gold_bar_price: Array<{
      bank: string
      price: string
    }>
    gold_recycle_price: Array<{
      gold_type: string
      recycle_price: string
      updated_date: string
    }>
    precious_metal_price: Array<{
      brand: string
      bullion_price: string
      gold_price: string
      platinum_price: string
      updated_date: string
    }>
  }
  request_id: string
}

export class GoldModule {
  private ctx: Context
  private config: GoldConfig

  constructor(ctx: Context, config: GoldConfig) {
    this.ctx = ctx
    this.config = config
    
    this.setupCommand()
  }

  private setupCommand() {
    this.ctx.command('今日金价', '获取今日金价信息')
      .action(async (session) => {
        try {
          logInfo('金价模块: 开始获取金价数据')
          
          const response = await this.ctx.http.get('https://v2.xxapi.cn/api/goldprice', {
            timeout: 10000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }) as GoldPriceResponse
          
          logInfo('金价模块: API响应状态', { code: response.code })
          
          if (!response || response.code !== 200) {
            logError('金价模块: API返回状态码错误', response?.code)
            return '获取金价数据失败: API返回状态码 ' + (response?.code || '未知')
          }
          
          if (!response.data || !response.data.bank_gold_bar_price) {
            logError('金价模块: API返回数据为空或格式错误')
            return '获取金价数据失败: 数据为空'
          }

          // 查找包含"中国银行"关键字的银行金条价格
          const bankPrices = response.data.bank_gold_bar_price
          const chinaBankPrices = bankPrices.filter(item => 
            item.bank && item.bank.includes('中国银行')
          )
          
          if (chinaBankPrices.length === 0) {
            logError('金价模块: 未找到中国银行相关金价信息')
            return '未找到中国银行相关金价信息'
          }
          
          let message = ''
          for (const item of chinaBankPrices) {
            message += `今日${item.bank}: ${item.price}\n`
          }
          
          logInfo('金价模块: 成功获取金价数据', { 
            totalBanks: bankPrices.length, 
            chinaBanks: chinaBankPrices.length 
          })
          
          return message.trim()
          
        } catch (error) {
          logError('金价模块错误', error)
          return '获取金价失败，请稍后重试: ' + error.message
        }
      })
  }
}

