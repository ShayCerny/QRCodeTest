/**
 * QR data encoder.
 *
 * Converts a raw string into a padded binary payload ready for Reed-Solomon
 * error correction. Supports numeric, alphanumeric, and byte encoding modes.
 *
 * Encoding flow:
 *   1. Detect the most compact mode for the input (detectMode)
 *   2. Find the smallest QR version that fits the data at the given ECL
 *   3. Build the bit stream: mode indicator → character count → encoded data
 *   4. Append up to 4 terminator zero bits
 *   5. Pad to the next byte boundary
 *   6. Fill remaining capacity with alternating 0xEC / 0x11 pad bytes
 */

import qrData from "./qr_data.json" assert { type: "json" };

const characterCapacities  = qrData.characterCapacities;
const alphanumericValues   = qrData.alphanumericValues;
const errorCorrectionBlocks = qrData.errorCorrectionBlocks;

/** 4-bit mode indicators as defined in the QR standard. */
const MODES = {
	numeric:      0b0001, // digits 0–9 only
	alphanumeric: 0b0010, // uppercase A–Z, digits, and $%*+-./:  space
	byte:         0b0100, // arbitrary ISO-8859-1 data
	kanji:        0b1000, // double-byte Shift-JIS (not yet implemented)
};

/**
 * Number of bits used for the character count indicator, grouped by QR version:
 *   index 0 → versions  1–9
 *   index 1 → versions 10–26
 *   index 2 → versions 27–40
 */
const CHAR_COUNT_BITS = {
	numeric:      [10, 12, 14],
	alphanumeric: [ 9, 11, 13],
	byte:         [ 8, 16, 16],
	kanji:        [ 8, 10, 12],
};

/**
 * Alternating pad bytes written when the encoded payload is shorter than the
 * version's total data capacity.
 * 0xEC = 11101100, 0x11 = 00010001
 */
const PAD_BYTES = ["11101100", "00010001"];

/**
 * Returns the number of bits used for the character count indicator.
 * The width varies by encoding mode and by which version-group the QR version falls in.
 *
 * @param {string} mode    - Encoding mode ('numeric', 'alphanumeric', 'byte', 'kanji')
 * @param {number} version - QR code version (1–40)
 * @returns {number} Bit width of the character count indicator
 */
function getCharCountBits(mode, version) {
	const groupIndex = version <= 9 ? 0 : version <= 26 ? 1 : 2;
	return CHAR_COUNT_BITS[mode][groupIndex];
}

/**
 * Encodes a numeric string as a binary bit string.
 *
 * Digits are grouped into chunks of up to 3, then each chunk is encoded as an
 * integer: 3-digit chunks use 10 bits, 2-digit chunks use 7, single digits use 4.
 *
 * @param {string} data - String of decimal digits
 * @returns {string} Concatenated binary bit string
 */
function encodeNumeric(data) {
	const groups = data.match(/.{1,3}/g);

	return groups
		.map((group) => {
			const bits = group.length === 3 ? 10 : group.length === 2 ? 7 : 4;
			return parseInt(group, 10).toString(2).padStart(bits, "0");
		})
		.join("");
}

/**
 * Encodes an alphanumeric string as a binary bit string.
 *
 * Characters are processed in pairs. Each pair is encoded as a single 11-bit value:
 *   (value of first char × 45) + value of second char
 * A lone trailing character is encoded as 6 bits.
 *
 * @param {string} data - Uppercase alphanumeric string (A–Z, 0–9, $%*+-./:, space)
 * @returns {string} Concatenated binary bit string
 */
function encodeAlphanumeric(data) {
	const pairs = data.match(/.{1,2}/g);

	return pairs
		.map((pair) => {
			if (pair.length === 2) {
				const val = alphanumericValues[pair[0]] * 45 + alphanumericValues[pair[1]];
				return val.toString(2).padStart(11, "0");
			} else {
				return alphanumericValues[pair[0]].toString(2).padStart(6, "0");
			}
		})
		.join("");
}

/**
 * Encodes a byte string as a binary bit string.
 *
 * Each character is represented by its ISO-8859-1 code point in 8 bits.
 *
 * @param {string} data - Arbitrary string within the ISO-8859-1 range (code points 0–255)
 * @returns {string} Concatenated binary bit string
 */
function encodeByte(data) {
	return data
		.split("")
		.map((char) => char.charCodeAt(0).toString(2).padStart(8, "0"))
		.join("");
}

/**
 * Detects the most compact QR encoding mode for the given string.
 *
 * Modes are tested in order of compactness: numeric → alphanumeric → byte.
 * Kanji mode (double-byte Shift-JIS) is not yet implemented.
 *
 * @param {string} data - Input string to encode
 * @returns {'numeric'|'alphanumeric'|'byte'} The most compact applicable mode
 * @throws {Error} If the data cannot be represented in any supported mode
 */
export function detectMode(data) {
	if (/^\d+$/.test(data)) return "numeric";
	if (/^[0-9A-Z $%*+\-./:]+$/.test(data)) return "alphanumeric";
	if (/^[\x00-\xFF]+$/.test(data)) return "byte";
	// TODO: kanji mode (double-byte Shift-JIS encoding)
	throw new Error("Data cannot be encoded in a standard QR mode");
}

/**
 * Encodes data into a padded byte array ready for error correction.
 *
 * Steps:
 *   1. Find the smallest QR version whose capacity fits the data at the chosen ECL
 *   2. Prepend the 4-bit mode indicator and the character count indicator
 *   3. Append the encoded data payload
 *   4. Append a terminator of up to 4 zero bits
 *   5. Pad to the next byte boundary with zero bits
 *   6. Fill any remaining capacity with alternating pad bytes (0xEC, 0x11)
 *
 * @param {string} data                        - Input string to encode
 * @param {'numeric'|'alphanumeric'|'byte'} mode - Encoding mode (from detectMode)
 * @param {'L'|'M'|'Q'|'H'} ECL               - Error correction level
 * @returns {{ version: number, bytes: string[] }} QR version and array of 8-bit strings
 */
export function encodeData(data, mode, ECL) {
	const len = data.length;
	let version = 1;

	// Find the smallest version whose data capacity fits the input length
	while (characterCapacities[version][ECL][mode] < len) {
		version++;
	}

	// 4-bit mode indicator
	const modeIndicator = MODES[mode].toString(2).padStart(4, "0");

	// Character count indicator — bit width depends on mode and version group
	const charCountBitWidth  = getCharCountBits(mode, version);
	const charCountIndicator = len.toString(2).padStart(charCountBitWidth, "0");

	console.log(version, modeIndicator, charCountIndicator);

	// Assemble: mode indicator + character count + encoded data payload
	let encoding = modeIndicator + charCountIndicator;

	switch (mode) {
		case "numeric":
			encoding += encodeNumeric(data);
			break;
		case "alphanumeric":
			encoding += encodeAlphanumeric(data);
			break;
		case "byte":
			encoding += encodeByte(data);
			break;
		default:
			break;
	}

	// Total bits available in this version/ECL combination
	const bitsNeeded = errorCorrectionBlocks[version][ECL].totalDataCW * 8;
	let bitDifference = bitsNeeded - encoding.length;

	// Append terminator: up to 4 zero bits (fewer if we're already close to capacity)
	if (bitDifference >= 4) {
		encoding += "0000";
		bitDifference -= 4;
	} else {
		encoding += "0".repeat(bitDifference);
		bitDifference = 0;
	}

	// Pad to the next byte boundary if the bit count is not a multiple of 8
	const bitRemainder = encoding.length % 8;
	if (bitRemainder !== 0) {
		const bitsToNextByte = 8 - bitRemainder;
		encoding += "0".repeat(bitsToNextByte);
		bitDifference -= bitsToNextByte;
	}

	// Fill any remaining capacity with alternating pad bytes (0xEC, 0x11)
	if (bitDifference > 0) {
		const numPads = bitDifference / 8;
		for (let i = 0; i < numPads; i++) {
			encoding += PAD_BYTES[i % 2];
		}
	}

	// Split the complete bit string into individual 8-bit bytes
	const bytes = encoding.match(/.{1,8}/g);

	return { version, bytes };
}
