function convertBGRAToYUV4228bit (width, height, data) {
    // BT.709 or BT.601
    const KR = height >= 720 ? 0.2126 : 0.299
    const KB = height >= 720 ? 0.0722 : 0.114
    const KG = 1 - KR - KB

    const KRi = 1 - KR
    const KBi = 1 - KB

    const YRange = 219
    const CbCrRange = 224
    const HalfCbCrRange = CbCrRange / 2

    const YOffset = 16 << 8
    const CbCrOffset = 128 << 8

    const KRoKBi = KR / KBi * HalfCbCrRange
    const KGoKBi = KG / KBi * HalfCbCrRange
    const KBoKRi = KB / KRi * HalfCbCrRange
    const KGoKRi = KG / KRi * HalfCbCrRange

    const buffer = Buffer.alloc(width * height * 2) // for every pixels I need 2 bytes
    let yuvi = 0
    for (let i = 0; i < width * (height) * 4; i += 8) { // read the input in steps of 2 pixels
        // pixel1:
        const b1 = data[i + 0] || 0
        const g1 = data[i + 1] || 0
        const r1 = data[i + 2] || 0

        // pixel 2:
        const b2 = data[i + 4] || 0
        const g2 = data[i + 5] || 0
        const r2 = data[i + 6] || 0

        // create 16 bit ycbcr components
        const y16a = YOffset + KR * YRange * r1 + KG * YRange * g1 + KB * YRange * b1
        const cb16 = CbCrOffset + (-KRoKBi * r1 - KGoKBi * g1 + HalfCbCrRange * b1)
        const y16b = YOffset + KR * YRange * r2 + KG * YRange * g2 + KB * YRange * b2
        const cr16 = CbCrOffset + (HalfCbCrRange * r1 - KGoKRi * g1 - KBoKRi * b1)

        // convert components to 8 bit by shifting
        const y8a = y16a >> 8
        const cb8 = cb16 >> 8
        const y8b = y16b >> 8
        const cr8 = cr16 >> 8

        // write components to buffer as LE
        buffer.writeUIntLE(cb8, yuvi++, 1)
        buffer.writeUIntLE(y8a, yuvi++, 1)
        buffer.writeUIntLE(cr8, yuvi++, 1)
        buffer.writeUIntLE(y8b, yuvi++, 1)
    }
    return buffer
}

module.exports = convertBGRAToYUV4228bit