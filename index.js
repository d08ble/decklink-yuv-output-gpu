const fs = require("fs")
const { GPU } = require('gpu.js');

const convertBGRAToYUV4228bit = require("./converters/convertBGRAtoYUV4228bit")

class Measurement {
    constructor(interval) {
        this.i = 0
        this.emitChange = 0
        this.interval = interval || 1
        
        this.startTime = new Date()
    }
    
    takeMeasurement() {
        this.i++;
        this.emitChange++;
        
        if (this.emitChange === this.interval) {
            let totalTime = new Date() - this.startTime;
            totalTime /= 1000;
            const period = totalTime / 100;
            const hz = 1 / period;
            this.startTime = new Date();
            this.emitChange = 0;
            return { hz, i: this.i }
        }
        return { i: this.i }
    }

    getTicks() {
        return new Date() - this.startTime;
    }

    printElapsed(prefix) {
        console.log(`${prefix}: ${this.getTicks()} ticks elapsed`)
    }
}

function timer(t) {
    return new Promise((f, r) => {
        setTimeout(f, t);
    });
}

// GPU [


const sharedGPU = new GPU({ mode: 'cpu' })
//const sharedGPU = new GPU({ mode: 'gpu' })

function gpu_rgba8888_to_yuv422(width, height, rgb) {
    const gpu = sharedGPU

    // YUV CONV PARAMS [

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

    // YUV CONV PARAMS ]
    // KERNEL YCR [

    const kernelYCR = gpu.createKernel(function(imgr) {

        var offs = this.thread.x * 6
        var r1 = imgr[offs];
        var g1 = imgr[offs+1];
        var b1 = imgr[offs+2];

        const y16a = YOffset + KR * YRange * r1 + KG * YRange * g1 + KB * YRange * b1
        const cb16 = CbCrOffset + (-KRoKBi * r1 - KGoKBi * g1 + HalfCbCrRange * b1)
        
        var out16 = Math.floor(y16a / 256) * 256 + Math.floor(cb16 / 256)

        return out16
    }, { output: [rgb.length / 6] })

    // KERNEL YCR ]
    // KERNEL YCB [

    const kernelYCB = gpu.createKernel(function(imgr) {

        var offs = this.thread.x * 6

        var r1 = imgr[offs];
        var g1 = imgr[offs+1];
        var b1 = imgr[offs+2];

        var r2 = imgr[offs+3];
        var g2 = imgr[offs+4];
        var b2 = imgr[offs+5];

        const y16b = YOffset + KR * YRange * r2 + KG * YRange * g2 + KB * YRange * b2
        const cr16 = CbCrOffset + (HalfCbCrRange * r1 - KGoKRi * g1 - KBoKRi * b1)
        
        var out16 = Math.floor(y16b / 256) * 256 + Math.floor(cr16 / 256)

        return out16
    }, { output: [rgb.length / 6] })

    // KERNEL YCB ]
    // CONVERT KERNEL [

    var t0 = new Measurement

    var ycr = kernelYCB(rgb)

    t0.printElapsed('kernelYCB')
    var t1 = new Measurement

    var ycb = kernelYCR(rgb)

    t1.printElapsed('kernelYCR')

    // CONVERT KERNEL ]
    // Float32Array to Buffer [

    var t2 = new Measurement

    const buffer = Buffer.alloc(width * height * 2) // for every pixels I need 2 bytes

    var n = width * height
    for (var i = 0; i < n; i++) {
        
        var ycr0 = ycr[i]
        var ycb0 = ycb[i]

        buffer.writeUIntLE(ycr0 >> 8, i, 1)
        buffer.writeUIntLE((ycr0 >> 0) & 0xFF, i, 1)
        buffer.writeUIntLE(ycb0 >> 8, i, 1)
        buffer.writeUIntLE((ycb0 >> 0) & 0xFF, i, 1)
    }

    t2.printElapsed('ToBuffer')

    // Float32Array to Buffer ]

    return buffer
}

// Alias
async function gpuRgbaToYuv422(width, height, rgb) { return await gpu_rgba8888_to_yuv422(width, height, rgb) }
async function gpuRGBAtoYUV422(width, height, rgb) { return await gpu_rgba8888_to_yuv422(width, height, rgb) }

// GPU ]


async function startPlayback2() {
    // Normally frames would be provided at 60hz by Electron rendering BGRA output from an HTML page
    // Instead of this we provide a BGRA bitmap from file
    const rgbabitmap = fs.readFileSync("bgrabitmap.bmp")
    const timer = new Measurement(10)
    
    for ( let x = 0 ; x < 400 ; x++ ) {
        
        var t1 = new Measurement

        const yuv = gpu_rgba8888_to_yuv422(1920, 1080, rgbabitmap)

        t1.printElapsed('gpu_rgba8888_to_yuv422')
/*        var t2 = new Measurement
    
        // Insert magic here to convert BGRA to YUV using the GPU:
        const yuv = convertBGRAToYUV4228bit(1920, 1080, rgbabitmap)
        
        t2.printElapsed('convertBGRAToYUV4228bit')
*/
        // Now check if the output matches what we are expecting to receive
        const expected_output = fs.readFileSync("convertedToYUV4228bit.bmp")

        const isEqual = Buffer.compare(yuv, expected_output) === 0
        
        const timing = timer.takeMeasurement()
        if (timing.hz) {
            console.log(`Speed: ${timing.hz}hz - conversion: ${isEqual ? "Good" : "Problem"}`)
            if (timing.hz > 60) {
                console.log("Target speed achieved!")
            }
        }
    }
}

async function startPlayback() {
    const rgbabitmap = fs.readFileSync("bgrabitmap.bmp")
    const timer = new Measurement(100)
    
    for ( let x = 0 ; x < 400 ; x++ ) {
        
        var t2 = new Measurement
    
        // Insert magic here to convert BGRA to YUV using the GPU:
        const yuv = convertBGRAToYUV4228bit(1920, 1080, rgbabitmap)
        
        t2.printElapsed('convertBGRAToYUV4228bit')

        // Now check if the output matches what we are expecting to receive
        const expected_output = fs.readFileSync("convertedToYUV4228bit.bmp")

        const isEqual = BuffeMar.compare(yuv, expected_output) === 0
        
        const timing = timer.takeMeasurement()
        if (timing.hz) {
            console.log(`Speed: ${timing.hz}hz - conversion: ${isEqual ? "Good" : "Problem"}`)
            if (timing.hz > 60) {
                console.log("Target speed achieved!")
            }
        }
    }
}

startPlayback2()
startPlayback()
