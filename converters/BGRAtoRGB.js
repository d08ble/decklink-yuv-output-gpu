function BGRAtoRGB(width, height, data) {
    const buffer = Buffer.alloc(width * height * 3);
    let readPos = 0
    let writePos = 0

    while (readPos < width * height * 4) {
        const b1 = data[readPos + 0]
        const g1 = data[readPos + 1]
        const r1 = data[readPos + 2]
        // const a1 = data[i + 3]

        buffer[writePos + 0] = r1
        buffer[writePos + 1] = g1
        buffer[writePos + 2] = b1
        // buffer[i + 3] = a1

        readPos += 4
        writePos += 3
    }
    return buffer;
}

module.exports = BGRAtoRGB