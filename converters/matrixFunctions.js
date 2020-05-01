const colParams = {
	'601-625': {
		// https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.601-7-201103-I!!PDF-E.pdf
		kR: 0.299,
		kB: 0.114,
		rx: 0.64,
		ry: 0.33,
		gx: 0.29,
		gy: 0.6,
		bx: 0.15,
		by: 0.06,
		wx: 0.3127,
		wy: 0.329,
		alpha: 1.099,
		beta: 0.018,
		gamma: 0.45,
		delta: 4.5
	},
	'601_525': {
		// https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.601-7-201103-I!!PDF-E.pdf
		kR: 0.299,
		kB: 0.114,
		rx: 0.63,
		ry: 0.34,
		gx: 0.31,
		gy: 0.595,
		bx: 0.155,
		by: 0.07,
		wx: 0.3127,
		wy: 0.329,
		alpha: 1.099,
		beta: 0.018,
		gamma: 0.45,
		delta: 4.5
	},
	'709': {
		// https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.709-6-201506-I!!PDF-E.pdf
		kR: 0.2126,
		kB: 0.0722,
		rx: 0.64,
		ry: 0.33,
		gx: 0.3,
		gy: 0.6,
		bx: 0.15,
		by: 0.06,
		wx: 0.3127,
		wy: 0.329,
		alpha: 1.099,
		beta: 0.018,
		gamma: 0.45,
		delta: 4.5
	},
	'2020': {
		// https://www.itu.int/dms_pubrec/itu-r/rec/bt/R-REC-BT.2020-2-201510-I!!PDF-E.pdf
		kR: 0.2627,
		kB: 0.0593,
		rx: 0.708,
		ry: 0.292,
		gx: 0.17,
		gy: 0.797,
		bx: 0.131,
		by: 0.046,
		wx: 0.3127,
		wy: 0.329,
		alpha: 1.099,
		beta: 0.018,
		gamma: 0.45,
		delta: 4.5
	},
	sRGB: {
		// https://en.wikipedia.org/wiki/SRGB
		kR: 0.0,
		kB: 0.0,
		rx: 0.64,
		ry: 0.33,
		gx: 0.3,
		gy: 0.6,
		bx: 0.15,
		by: 0.06,
		wx: 0.3127,
		wy: 0.329,
		alpha: 1.055,
		beta: 0.0031308,
		gamma: 1.0 / 2.4,
		delta: 12.92
	}
}

function rgb2ycbcrMatrix(colSpec, numBits, lumaBlack, lumaWhite, chrRange) {
	if (!(colSpec in colParams)) {
		console.error(`Unrecognised colourspace ${colSpec} - defaulting to BT.709`)
		colSpec = '709'
	}
	const chrNull = 128.0 << (numBits - 8)
	const lumaRange = lumaWhite - lumaBlack

	const kR = colParams[colSpec].kR
	const kB = colParams[colSpec].kB
	const kG = 1.0 - kR - kB

	const Yy = lumaRange
	const Uy = 0.0
	const Vy = 0.0

	const Yu = 0.0
	const Uu = chrRange / 2.0
	const Vu = 0.0

	const Yv = 0.0
	const Uv = 0.0
	const Vv = chrRange / 2.0

	const scaleMatrix = [...new Array(3)].map(() => new Float32Array(3))
	scaleMatrix[0] = Float32Array.from([Yy, Uy, Vy])
	scaleMatrix[1] = Float32Array.from([Yu, Uu, Vu])
	scaleMatrix[2] = Float32Array.from([Yv, Uv, Vv])

	const Ry = kR
	const Gy = kG
	const By = kB
	const Oy = lumaBlack / lumaRange

	const Ru = -kR / (1.0 - kB)
	const Gu = -kG / (1.0 - kB)
	const Bu = (1.0 - kB) / (1.0 - kB)
	const Ou = (chrNull / chrRange) * 2.0

	const Rv = (1.0 - kR) / (1.0 - kR)
	const Gv = -kG / (1.0 - kR)
	const Bv = -kB / (1.0 - kR)
	const Ov = (chrNull / chrRange) * 2.0

	const colMatrix = [...new Array(3)].map(() => new Float32Array(4))
	colMatrix[0] = Float32Array.from([Ry, Gy, By, Oy])
	colMatrix[1] = Float32Array.from([Ru, Gu, Bu, Ou])
	colMatrix[2] = Float32Array.from([Rv, Gv, Bv, Ov])

	return matrixMultiply(scaleMatrix, colMatrix)
}

function matrixMultiply(a, b) {
	let result = [...new Float32Array(a.length)].map(() => new Float32Array(b[0].length))
	return result.map((row, i) => {
		return row.map((val, j) => {
			return a[i].reduce((sum, elm, k) => sum + elm * b[k][j], 0.0)
		})
	})
}

function matrixFlatten(a) {
	let result = new Float32Array(a.length * a[0].length)
	return result.map((row, i) => {
		return a[(i / a[0].length) >>> 0][i % a[0].length]
	})
}

module.exports = {
	colParams,
	rgb2ycbcrMatrix,
	matrixMultiply,
	matrixFlatten
}