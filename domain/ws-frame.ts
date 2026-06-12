export interface FrameHeader {
  id: string
  success: boolean
  error?: string
  code?: string
}

export function encodeBinaryFrame(header: FrameHeader, payload: Uint8Array): Uint8Array {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const frame = new Uint8Array(4 + headerBytes.length + payload.length)
  new DataView(frame.buffer).setUint32(0, headerBytes.length, false)
  frame.set(headerBytes, 4)
  frame.set(payload, 4 + headerBytes.length)
  return frame
}

export function decodeBinaryFrame(frame: Uint8Array): { header: FrameHeader; payload: Uint8Array } {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  const headerLength = view.getUint32(0, false)
  const headerBytes = frame.subarray(4, 4 + headerLength)
  const header = JSON.parse(new TextDecoder().decode(headerBytes)) as FrameHeader
  return { header, payload: frame.subarray(4 + headerLength) }
}
