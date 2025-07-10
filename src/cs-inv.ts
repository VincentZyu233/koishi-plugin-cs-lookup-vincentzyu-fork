import { Context, h } from 'koishi'
import { Config, umami } from './index'
import { } from 'koishi-plugin-puppeteer'
import { } from 'koishi-plugin-umami-statistics-service'

import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'


export const light = ['#81a1c1', '#ffffff', '#5e81ac']
export const dark = ['#2e3440', '#ffffff', '#434c5e']

export function isOnlyDigits(str: string): boolean {
  return /^\d+$/.test(str);
}

export function inv(ctx: Context, config: Config) {
  const agent = new SocksProxyAgent(config.proxyAddr);

  const axiosWithProxy = axios.create({
    httpAgent: agent,
    httpsAgent: agent,
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
  })

  const umamiD = umami;
  ctx.command('cs-inv [steamId]', '查看CS背包', { authority: 0 })
    .action(async ({ session }, steamId) => {

      const waitMsgId = await session.send(`调用cs-inv!, steamId = ${steamId}\n\t 获取inv+渲染中....`);

      if (config.data_collect) {
        ctx.umamiStatisticsService.send({
          dataHostUrl: umamiD[1],
          website: umamiD[0],
          url: '/cs-inv',
          urlSearchParams: {
            args: session.argv.args?.join(', '),
            ...(session.argv.options || {}),
          },
        })
      }
      if (!steamId) {
        const res = await ctx.database.get('cs_lookup', { userid: session.userId, platform: session.platform })
        if (res.length) {
          steamId = res[0].steamId
        } else {
          return "请提供 steamID 或者使用 `getid` 命令获取或者使用 `csBind <steamID>` 进行绑定"
        }
      }
      if (!config.useSteamAPI) {
        //不使用steam API
        if (steamId.startsWith("https://steamcommunity.com/")) {
          const profUrl = `https://www.steamwebapi.com/steam/api/profile?key=${config.SteamWebAPIKey}&id=${steamId}`;
          const data = await ctx.http.get(profUrl);
          steamId = data.steamid;
        }
        const invUrl = `https://www.steamwebapi.com/steam/api/inventory?key=${config.SteamWebAPIKey}&steam_id=${steamId}&game=csgo`;
        const profUrl = `https://www.steamwebapi.com/steam/api/profile?key=${config.SteamWebAPIKey}&steam_id=${steamId}`;
        try {
          const invData = await ctx.http.get(invUrl);
          const profData = await ctx.http.get(profUrl);
          const itemMap = new Map<string, { count: number, imageUrl: string }>();

          let totalItemCount = 0;
          for (const item of invData) {
            totalItemCount++;
            const itemName = item.marketname;
            const imageUrl = item.image;
            if (!itemMap.has(itemName)) {
              itemMap.set(itemName, { count: 0, imageUrl: imageUrl });
            }
            let itemInfo = itemMap.get(itemName);
            itemInfo.count += 1;
          }

          let cardHtml = ``;
          const current = config.theme ? light : dark
          for (const [itemName, itemInfo] of itemMap.entries()) {
            cardHtml += `
            <div class="col-4 flex flex-col h-full w-full min-w-[250px] max-w-[350px]">
              <div class="bg-[${current[2]}] shadow-2xl rounded-2xl p-4 flex flex-col justify-between h-full">
                <h2 class="text-base font-semibold mb-2 flex-grow break-words text-[${current[1]}] mb-5">${itemName}</h2>
                <img src="${itemInfo.imageUrl}" alt="${itemName}" style="width:90%;">
              </div>
            </div>
          `;
          }

          const totalStr = `总物品数: ${totalItemCount}`;
          const html = generateHtml(cardHtml, totalStr, steamId, profData.personaname, config.theme);
          const image = await ctx.puppeteer.render(html);
          // return image;
          await session.send(image);
        } catch (e) {
          let errMsg = `出现错误, 请检查该用户库存是否公开或者网络连接是否正常. err: ${e}`;
          ctx.logger('cs-lookup').error(errMsg);
          await session.send(h.quote(session.messageId) + errMsg);          
          return;
        }
      } else {
        //使用Steam API
        if (!isOnlyDigits(steamId)) {
          return "无效steamID, 若不知道steamID请使用指令 `getid Steam个人资料页链接` 获取";
        }
        const invUrl = `https://steamcommunity.com/inventory/${steamId}/730/2?l=schinese`
        try {
          // const invData = await ctx.http.get(invUrl);

          const invRes = await axiosWithProxy.get(
            invUrl,
            {
              headers: {
                'User-Agent': config.userAgent,
                'Accept': 'application/json',
                'Cookie': config.cookie
              }
            }
          );
          const invData = invRes.data;

          // const page = ctx.puppeteer.page();
          // await (await page).goto(invUrl, {waitUntil: 'networkidle2'});
          // const invData = await (await page).evaluate(() => JSON.parse(document.body.innerText));
          // (await page).close();

          ctx.logger.info(`[debug] invData = ${JSON.stringify(invData).slice(0,300)}[end]`);

          const itemMap = new Map<string, { count: number, imageUrl: string }>();

          for (const item of invData.descriptions) {
            const itemName = item.market_name;
            const imageUrl = "https://community.cloudflare.steamstatic.com/economy/image/" + item.icon_url;
            if (!itemMap.has(itemName)) {
              itemMap.set(itemName, { count: 0, imageUrl: imageUrl });
            }
            let itemInfo = itemMap.get(itemName);
            itemInfo.count += 1; 
          }

          let cardHtml = ``;
          const current = config.theme ? light : dark
          for (const [itemName, itemInfo] of itemMap.entries()) {
            cardHtml += `
            <div class="col-4 flex flex-col h-full w-full min-w-[250px] max-w-[350px]">
              <div class="bg-[${current[2]}] shadow-2xl rounded-2xl p-4 flex flex-col justify-between h-full">
                <h2 class="text-base font-semibold mb-2 flex-grow break-words text-[${current[1]}] mb-5">${itemName}</h2>
                <img src="${itemInfo.imageUrl}" alt="${itemName}" style="width:90%;">
              </div>
            </div>
          `;
          }

          const totalStr = `总物品数: ${invData.total_inventory_count}`;
          const html = generateHtml(cardHtml, totalStr, steamId, '', config.theme);
          // const image = await ctx.puppeteer.render(html);
          // return image;
          // await session.send(image);
          const invPage = await ctx.puppeteer.page();
          await invPage.setContent(html);

          const invImageRes = await invPage.screenshot(
            {
              encoding: 'base64',
              type: 'jpeg',
              omitBackground: true,
              fullPage: true,
              quality: config.imageQuality
            }
          )
          await session.send( h.image(`data:image/png;base64,${invImageRes}`) );

        } catch (e) {
          ctx.logger('cs-lookup').error(e)
          return "出现错误, 请检查该用户库存是否公开或者与SteamAPI的连接是否正常"
        }
      }

      try{
        await session.bot.deleteMessage(session.guildId, String(waitMsgId));
      } catch(err){
        ctx.logger.info(`消息撤回失败，有可能是过太久了导致qq无法撤回。 err: ${err}`)
      }

    })
}

export function generateHtml(cardHTML, totalStr, steamId, steamName, theme: boolean): string {
  const current = theme ? light : dark
  return `
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CS 库存查询</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-[${current[0]}] text-[${current[1]}]">
    <div class="max-w-7xl mx-auto p-4">
    
      <div class="text-center mb-5">
        <div class="bg-[${current[2]}] shadow-2xl rounded-2xl py-4 px-6">
          <p class="text-3xl font-bold text-[${current[1]}]">CS 库存查询 - ${steamName}(${steamId})</p>
          <div class="text-sm">${totalStr}</div>
        </div>
      </div>
    
      <div class="grid grid-cols-5 gap-3">
        ${cardHTML}
      </div>
    </div>
  </body>
  `;
}