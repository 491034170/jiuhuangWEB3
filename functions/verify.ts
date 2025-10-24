import { type Env, json, badRequest } from './_utils'

// 演示版签名校验占位：仅做基本格式检查（生产请使用 ECDSA 恢复地址校验，如 noble-secp256k1）
export const onRequestPost: PagesFunction<Env> = async ({ request }) => {
  const { address, signature, message } = await request.json().catch(() => ({} as any))
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) return badRequest('地址格式不正确')
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature)) return badRequest('签名格式不正确')
  if (!message || typeof message !== 'string') return badRequest('缺少 message')
  // 返回占位校验结果
  return json({ ok: true, verified: false, note: '演示接口：仅检查格式，未进行密码学验证' })
}

