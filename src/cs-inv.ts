import { Context, h } from 'koishi';
import { Config, umami } from './index';
import { createAxiosInstance } from './proxy';
import { } from 'koishi-plugin-puppeteer';
import { } from 'koishi-plugin-umami-statistics-service';

export function isOnlyDigits(str: string): boolean {
  return /^\d+$/.test(str);
}

export const light = ['#81a1c1', '#2e3440', '#5e81ac']; // Changed font color to a dark gray
export const dark = ['#2e3440', '#ffffff', '#434c5e'];

export function inv(ctx: Context, config: any) {
  const axiosWithProxy = createAxiosInstance(config);

  const umamiD = umami;
  ctx.command('cs-inv', '查看CS背包', { authority: 0 })
    .option('arg1_steamid', '-s, --steamid <arg1_steamid:string> steam的id')
    .action(async ({ session, options }) => {

      if (config.data_collect) {
        ctx.umamiStatisticsService.send({
          dataHostUrl: umamiD[1],
          website: umamiD[0],
          url: '/cs-inv',
          urlSearchParams: {
            args: session.argv.args?.join(', '),
            ...(session.argv.options || {}),
          },
        });
      }

      ctx.logger.info(`options.arg1_steamId = ${options.arg1_steamid}`);
      const first_at_user = h.parse(session.content).find(e => e.type === 'at') ?? null;
      ctx.logger.info(`first_at_user = ${JSON.stringify(first_at_user)}`);

      let PLATFORM = session.platform;
      let USERID;
      let STEAMID;

      if (first_at_user) {
        USERID = first_at_user.attrs.id;
      } else {
        USERID = session.userId;
      }

      if (options.arg1_steamid) {
        STEAMID = options.arg1_steamid;
      } else if (!options.arg1_steamid) {
        const res = await ctx.database.get('cs_lookup', { userid: USERID, platform: PLATFORM });
        if (res.length) {
          STEAMID = res[0].steamId;
        } else {
          return "请提供 steamID 或者使用 `getid` 命令获取或者使用 `csBind <steamID>` 进行绑定";
        }
      }

      ctx.logger.info(`STEAMID = ${STEAMID}, USERID = ${USERID}`);
      const waitMsgId = await session.send(`${h.quote(session.messageId)}正在获取steam库存... \n\t steamId = ${STEAMID}\n\t 渲染图片中....`);

      if (!isOnlyDigits(STEAMID)) {
        return "无效steamID, 若不知道steamID请使用指令 `getid Steam个人资料页链接` 获取";
      }
      const playerUrl = `https://us-cc.vincentzyu233.cn/fastapi_wrap/cs/player/${STEAMID}`;
      const invUrl = `https://us-cc.vincentzyu233.cn/fastapi_wrap/cs/inv/${STEAMID}`;
      const currentColorArr = config.enableDarkTheme ? dark : light;


      try {
        const userRes = await axiosWithProxy.get(playerUrl);
        const playerAvatarFullUrl = userRes?.data?.response?.players[0]?.avatarfull;
        const proxiedPlayerAvatarFullUrl = `https://us-cc.vincentzyu233.cn/fastapi_wrap/image_proxy?url=${playerAvatarFullUrl}`;
        ctx.logger.info(`playerAvatarFullUrl = ${playerAvatarFullUrl}`);
        const playerPersonName = userRes?.data?.response?.players[0]?.personaname;
        const playerLastLogoff = userRes?.data?.response?.players[0]?.lastlogoff;
        const playerLastLogoffTimeStr = (new Date(playerLastLogoff * 1000)).toLocaleString();

        const invRes = await axiosWithProxy.get(invUrl);
        const invData = invRes.data;

        ctx.logger.info(`[debug] invData = ${JSON.stringify(invData).slice(0, 1000)}[end]`);

        let cardHtml = ``;
        let gridColumns = config.gridColumns || 4;
        let totalStr = '';
        let pageHeight = 500;

        if (!invData.descriptions || invData.descriptions.length === 0) {
          // 如果没有库存，显示一个醒目的提示
          ctx.logger.info(`invData没有descriptions字段。`);
          gridColumns = 1;
          totalStr = `总物品数: 0`;
          cardHtml = `
            <div style="text-align: center; padding: 50px; font-size: 24px; font-weight: bold; color: ${currentColorArr[1]}; background-color: rgba(255, 255, 255, 0.15); border-radius: 20px;">该用户没有CS2库存</div>
          `;
          pageHeight = 500;
        } else {
          // 否则，正常处理库存数据
          ctx.logger.info(`invData有有descriptions字段。`);
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

          for (const [itemName, itemInfo] of itemMap.entries()) {
            cardHtml += `
              <div class="card-item">
                <h2 class="card-item-title">${itemName}</h2>
                <div class="card-image-container">
                  <img src="${itemInfo.imageUrl}" alt="${itemName}" class="card-item-image">
                </div>
              </div>
            `;
          }

          totalStr = `总物品数: ${invData.total_inventory_count}`;
          // 动态计算高度，每行4个卡片，每个卡片高度约300px，加上padding
          const rowCount = Math.ceil(itemMap.size / 4);
          pageHeight = rowCount * 45 + 90;
        }

        const html = generateHtml(cardHtml, gridColumns, totalStr, STEAMID, playerPersonName, proxiedPlayerAvatarFullUrl, playerLastLogoffTimeStr, config.enableDarkTheme);
        const invPage = await ctx.puppeteer.page();
        await invPage.setContent(html);
        await invPage.waitForSelector('.main-card');

        await invPage.setViewport({ width: 1666, height: pageHeight });

        const invImageRes = await invPage.screenshot({
          encoding: 'base64',
          type: 'jpeg',
          omitBackground: true,
          fullPage: true,
          quality: config.imageQuality
        });
        const invImageBase64 = `data:image/png;base64,${invImageRes}`;
        await session.send(`${h.quote(session.messageId)}查询结果:${h.image(invImageBase64)}`);

      } catch (e) {
        let cardHtml = '';
        let errorMessage = "发生未知错误";

        if (e.response && e.response.data && e.response.data.detail) {
          const detail = e.response.data.detail;
          if (detail.includes('Unauthorized')) {
            errorMessage = `获取CS2库存失败，可能是对方未公开库存。`;
          }
          errorMessage += `<br/><br/>**原文:** ${detail}`;
        }
        
        cardHtml = `
            <div style="text-align: center; padding: 50px; font-size: 20px; font-weight: bold; color: ${currentColorArr[1]}; background-color: rgba(255, 255, 255, 0.15); border-radius: 20px;">
                ${errorMessage}
            </div>
        `;

        const userRes = await axiosWithProxy.get(playerUrl);
        const playerAvatarFullUrl = userRes?.data?.response?.players[0]?.avatarfull;
        const proxiedPlayerAvatarFullUrl = `https://us-cc.vincentzyu233.cn/fastapi_wrap/image_proxy?url=${playerAvatarFullUrl}`;
        const playerPersonName = userRes?.data?.response?.players[0]?.personaname;
        const playerLastLogoff = userRes?.data?.response?.players[0]?.lastlogoff;
        const playerLastLogoffTimeStr = (new Date(playerLastLogoff * 1000)).toLocaleString();

        const html = generateHtml(cardHtml, 1, '总物品数: ??', STEAMID, playerPersonName, proxiedPlayerAvatarFullUrl, playerLastLogoffTimeStr, config.enableDarkTheme);
        const invPage = await ctx.puppeteer.page();
        await invPage.setContent(html);
        await invPage.waitForSelector('.main-card');
        await invPage.setViewport({ width: 1666, height: 500 }); // fixed height for error page

        const invImageRes = await invPage.screenshot({
          encoding: 'base64',
          type: 'jpeg',
          omitBackground: true,
          fullPage: true,
          quality: config.imageQuality
        });
        const invImageBase64 = `data:image/png;base64,${invImageRes}`;
        await session.send(`${h.quote(session.messageId)}查询结果:${h.image(invImageBase64)}`);
        
      } finally {
        try {
          await session.bot.deleteMessage(session.guildId, String(waitMsgId));
        } catch (err) {
          ctx.logger.info(`消息撤回失败，有可能是过太久了导致qq无法撤回。 err: ${err}`);
        }
      }

    });
}

export function generateHtml(cardHTML, grid_columns: number, totalStr, steamId, steamName, playerAvatarUrl, playerLastLogoffTimeStr, theme: boolean): string {
  const current = theme ? dark : light;
  const opacity = theme ? '0.2' : '0.7';
  const backgroundColor = theme ? '#000000' : '#ffffff';
  const fontColor = theme ? '#ffffff' : '#2e3440'; // Use a different variable for font color

  return `
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>CS 库存查询</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap');
        body {
          font-family: 'Noto Sans SC', sans-serif;
          background-color: ${current[0]};
          color: ${fontColor};
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          position: relative;
        }
        .background-blur {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url('${playerAvatarUrl}');
          background-size: cover;
          background-position: center;
          filter: blur(30px);
          z-index: -1;
          opacity: ${opacity};
          background-blend-mode: overlay;
          background-color: ${backgroundColor};
        }
        .container {
          width: 90%;
          max-width: 1400px;
          padding: 40px;
        }
        .main-card {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 30px;
          padding: 40px;
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
          border: 1px solid rgba(255, 255, 255, 0.18);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }
        .header-card {
          background-color: rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 30px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .header-card h1 {
          font-size: 32px;
          font-weight: bold;
          margin: 0;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        .header-card .subtitle {
          font-size: 16px;
          color: ${fontColor};
        }
        .header-card .last-logoff {
          font-size: 14px;
          color: ${fontColor};
          margin-top: 5px;
        }
        .avatar {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid ${fontColor};
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }
        .grid-container {
          display: grid;
          grid-template-columns: repeat(${grid_columns}, minmax(250px, 1fr));
          gap: 20px;
        }
        .card-item {
          background-color: rgba(255, 255, 255, 0.15);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-radius: 20px;
          padding: 20px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          overflow: hidden;
          position: relative;
        }
        .card-item-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 10px;
          word-wrap: break-word;
          max-width: 100%;
          position: relative;
          z-index: 2;
        }
        .card-image-container {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 150%;
          height: 150%;
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }
        .card-item-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          opacity: 0.5;
        }
      </style>
    </head>
    <body>
      <div class="background-blur"></div>
      <div class="container">
        <div class="main-card">
          <div class="header-card">
            <img src="${playerAvatarUrl}" alt="Player Avatar" class="avatar">
            <div>
              <h1>CS 库存查询 - ${steamName}</h1>
              <div class="subtitle">(${steamId})</div>
              <div class="subtitle">${totalStr}</div>
              <div class="last-logoff">最后在线时间: ${playerLastLogoffTimeStr}</div>
            </div>
          </div>
          <div class="grid-container">
            ${cardHTML}
          </div>
        </div>
      </div>
    </body>
  `;
}