import { Context, Schema } from 'koishi';
import { inv } from './cs-inv';
import { apply as getId } from './getid';
import { bind } from './csbind';
import { } from 'koishi-plugin-umami-statistics-service';

export const name = 'cs-lookup';

export const umami: [string, string] = ["29272bd1-0f4c-4db8-ad22-bec20ee15810", "https://data.itzdrli.cc"];

export const inject = ['puppeteer', 'database', 'umamiStatisticsService'];

export interface Config {
  data_collect: boolean,
  useSteamAPI: boolean,
  SteamWebAPIKey: string,
  theme: boolean,
  imageQuality: number,
  proxyAddr: string,
  userAgent: string,
  cookie: string,
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    data_collect: Schema.boolean()
      .default(true)
      .description('是否允许匿名数据收集 隐私政策见上方链接'),
    useSteamAPI: Schema.boolean()
      .default(true)
      .description("是否使用Steam官方API查询 (大陆地区实例可能存在网络不佳情况)"),
    SteamWebAPIKey: Schema.string()
      .description("Steam Web API Key from www.steamwebapi.com"),
  }).description("基础设置"),
  Schema.object({
    theme: Schema.boolean()
      .default(false)
      .description('使用浅色主题'),
    imageQuality: Schema.number()
      .default(10)
      .min(0).max(100).step(0.1)
      .role('slider'),
  }).description("puppeteer网页截图配置"),
  Schema.object({
    proxyAddr: Schema.string()
      .default("socks5h://192.168.31.84:7891")
      .description("格式是为以下三者之一(仅测试过clash-cli+socks5 awa): \n\t(1)socks5h://ip:port \n\t(2)http://ip:port \n\t(3)https://ip:port")
      .role('link'),
    userAgent: Schema.string()
      .description("chrome打开chrome://version页面，找到用户代理")
      .role('textarea', { rows: [2, 10] }),
    cookie: Schema.string()
      .description("浏览器访问https://steamcommunity.com/inventory/76561198307564265/730/2?l=schinese，然后F12打开Network，找到这个请求的cookie填入")
      .role('textarea', { rows: [2, 10] }),
  }).description("代理配置")
])


export const usage = `
## 如遇使用问题可以前往QQ群: 957500313 讨论
## 本插件需要来自 [steamwebapi.com](https://www.steamwebapi.com) 的 SteamWebAPI Key 进行非官方接口的背包查询和SteamID查询  
## 匿名数据收集 👉 [隐私协议](https://legal.itzdrli.cc)  

### 使用官方api查询背包: 不需要key(仅查询背包(中文)且容易被墙)</br>不使用官方api查询背包: 需要key(可以查背包(英文)和SteamID)</h3>
请我喝杯咖啡 👇   
[![ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/itzdrli)
### [爱发电](https://afdian.com/a/itzdrli)`;

declare module 'koishi' {
  interface Tables {
    cs_lookup: CsLookup
  }
}

export interface CsLookup {
  id: string
  steamId: string
  userid: string
  platform: string
}

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('cs_lookup', {
    id: 'string',
    steamId: 'string',
    userid: 'string',
    platform: 'string'
  }, {})
  inv(ctx, config);
  getId(ctx, config);
  bind(ctx);
}