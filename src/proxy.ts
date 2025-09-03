import axios from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent as Socks4ProxyAgent } from 'socks-proxy-agent'; // socks-proxy-agent supports SOCKS4
import { PROXY_PROTOCOL } from './types';
import { Config } from './index';

export function createAxiosInstance(config: any) {
  if (!config.proxy.enabled) {
    return axios.create({
      timeout: 15000,
      headers: {
        'User-Agent': config.userAgent,
        'Accept': 'application/json'
      }
    });
  }

  const { protocol, host, port } = config.proxy;
  const proxyUrl = `${protocol}://${host}:${port}`;
  
  let agent;
  switch (protocol) {
    case PROXY_PROTOCOL.HTTP:
      agent = new HttpProxyAgent(proxyUrl);
      break;
    case PROXY_PROTOCOL.HTTPS:
      agent = new HttpsProxyAgent(proxyUrl);
      break;
    case PROXY_PROTOCOL.SOCKS4:
    case PROXY_PROTOCOL.SOCKS5:
    case PROXY_PROTOCOL.SOCKS5H:
      agent = new SocksProxyAgent(proxyUrl);
      break;
    default:
      // 如果协议未知，默认不使用代理
      console.warn(`Unknown proxy protocol: ${protocol}. Not using proxy.`);
      return axios.create({
        timeout: 15000,
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'application/json'
        }
      });
  }

  return axios.create({
    httpAgent: agent,
    httpsAgent: agent,
    timeout: 15000,
    headers: {
      'User-Agent': config.userAgent,
      'Accept': 'application/json'
    }
  });
}