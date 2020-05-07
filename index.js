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

    getMs() {
//        console.log('ms', (new Date()).getMilliseconds(), this.startTime.getMilliseconds(), new Date() - this.startTime)
        return new Date() - this.startTime;
    }

    printElapsed(prefix) {
/*        this.startTime = new Date()
        for (var i = 0; i < 100990; i++)
            this.v += new Date()
        ms =16*/
        var ms = this.getMs()
        console.log(`${prefix}: ${ms} ms elapsed ${1000/ms} fps`)
    }
}

function timer(t) {
    return new Promise((f, r) => {
        setTimeout(f, t);
    });
}

// GPU [


const sharedGPU = new GPU({ mode: 'cpu' })
//const sharedGPU = new GPU({ mode: 'dev' })
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
        var r1 = imgr[offs]
        var g1 = imgr[offs+1]
        var b1 = imgr[offs+2]

        var y16a = this.constants.YOffset + this.constants.KR * this.constants.YRange * r1 + this.constants.KG * this.constants.YRange * g1 + this.constants.KB * this.constants.YRange * b1
        //y16a = YOffset + KR * YRange * r1 + KG * YRange * g1 + KB * YRange * b1
//        var cb16 = 0
//        cb16 = CbCrOffset
        //cb16 = CbCrOffset + (-KRoKBi * r1 - KGoKBi * g1 + HalfCbCrRange * b1)
        var cb16 = this.constants.CbCrOffset + (-this.constants.KRoKBi * r1 - this.constants.KGoKBi * g1 + this.constants.HalfCbCrRange * b1)
        
        var out16 = Math.floor(y16a / 256) * 256 + Math.floor(cb16 / 256)
//        console.log(out16)

        return out16;
    }, { 
        output: [rgb.length / 6], 
        constants: {
            YOffset: YOffset,
            KR: KR,
            YRange: YRange,
            KG: KG,
            KB: KB,
            CbCrOffset: CbCrOffset,
            KRoKBi: KRoKBi,
            KGoKBi: KGoKBi,
            HalfCbCrRange: HalfCbCrRange,
        } 
    })

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

//        var y16b = 0
//        y16b = YOffset + KR * YRange * r2 + KG * YRange * g2 + KB * YRange * b2
        var y16b = this.constants.YOffset + this.constants.KR * this.constants.YRange * r2 + this.constants.KG * this.constants.YRange * g2 + this.constants.KB * this.constants.YRange * b2
//        var cr16 = 0
//        cr16 = CbCrOffset + (HalfCbCrRange * r1 - KGoKRi * g1 - KBoKRi * b1)
        var cr16 = this.constants.CbCrOffset + (this.constants.HalfCbCrRange * r1 - this.constants.KGoKRi * g1 - this.constants.KBoKRi * b1)
        
        var out16 = Math.floor(y16b / 256) * 256 + Math.floor(cr16 / 256)

//        var out16 = 0
        return out16
    }, { 
        output: [rgb.length / 6],
        constants: {
            YOffset: YOffset,
            KR: KR,
            YRange: YRange,
            KG: KG,
            KB: KB,
            CbCrOffset: CbCrOffset,
            KGoKRi: KGoKRi,
            KBoKRi: KBoKRi,
            HalfCbCrRange: HalfCbCrRange,
        }
    })

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
//    var buffer

    const buffer = Buffer.alloc(width * height * 2) // for every pixels I need 2 bytes

    var n = width * height / 2
    var j = 0
    for (var i = 0; i < n; i++) {
        
        var ycr0 = ycr[i]
        var ycb0 = ycb[i]

        buffer[j++] = ycr0 >> 8
        buffer[j++] = ycr0
        buffer[j++] = ycb0 >> 8
        buffer[j++] = ycb0
/*        buffer.writeUIntLE(ycr0 >> 8, i, 1)
        buffer.writeUIntLE((ycr0 >> 0) & 0xFF, i, 1)
        buffer.writeUIntLE(ycb0 >> 8, i, 1)
        buffer.writeUIntLE((ycb0 >> 0) & 0xFF, i, 1)*/
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
    
    const expected_output = fs.readFileSync("convertedToYUV4228bit.bmp")

    // TEST COMPARE [

    function testCompare() {
        var t1 = new Measurement

        var t2 = new Measurement
        const yuv = gpu_rgba8888_to_yuv422(1920, 1080, rgbabitmap)
        t2.printElapsed('CALL gpu_rgba8888_to_yuv422')

        var t2c = new Measurement
        const isEqual = Buffer.compare(yuv, expected_output) === 0
        console.log('gpu.js isEqual', isEqual)
        t2c.printElapsed('Buffer.compare')
        console.log('')

        var t3 = new Measurement
        const yuv1 = convertBGRAToYUV4228bit(1920, 1080, rgbabitmap)
        t3.printElapsed('CALL convertBGRAToYUV4228bit')

        var t3c = new Measurement
        const isEqual1 = Buffer.compare(yuv1, expected_output) === 0
        console.log('convert isEqual', isEqual1)
        t3c.printElapsed('Buffer.compare')
        console.log('')

        t1.printElapsed('testCompare')

        console.log('\n**** ****\n')
    }
    
    testCompare()

    // TEST COMPARE ]
    
    for ( let x = 0 ; x < 400 ; x++ ) {
        
        var t1 = new Measurement

        const yuv = gpu_rgba8888_to_yuv422(1920, 1080, rgbabitmap)

        t1.printElapsed('gpu_rgba8888_to_yuv422')
/*
        var t2 = new Measurement
    
        // Insert magic here to convert BGRA to YUV using the GPU:
        const yuv = convertBGRAToYUV4228bit(1920, 1080, rgbabitmap)
        
        t2.printElapsed('convertBGRAToYUV4228bit')
*/        
        const timing = timer.takeMeasurement()
        if (timing.hz) {
            console.log(`Speed: ${timing.hz}hz`)
            if (timing.hz > 60) {
                console.log("Target speed achieved!")
            }
            console.log('')
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

startPlayback2()
//startPlayback()
