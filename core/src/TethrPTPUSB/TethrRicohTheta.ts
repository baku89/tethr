import {BiMap} from 'bim'

import {
	ExposureMode,
	ExposureModeTable,
	FocalLength,
	WhiteBalance,
	WhiteBalanceTable,
} from '../configs'
import {DatatypeCode, DevicePropCode} from '../PTPDatacode'
import {ConfigDesc} from '../Tethr'
import {TethrPTPUSB} from './TethrPTPUSB'

enum DevicePropCodeRicohTheta {
	ShutterSpeed = 0xd00f,
	ColorTemperature = 0xd813,
}

export class TethrRicohTheta extends TethrPTPUSB {
	// PTP extension specs here: https://api.ricoh/docs/theta-usb-api/

	// Configs

	setColorTemperature(value: number) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCodeRicohTheta.ColorTemperature,
			datatypeCode: DatatypeCode.Uint16,
			encode: value => value,
			value,
		})
	}
	getColorTemperatureDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCodeRicohTheta.ColorTemperature,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => data,
		})
	}

	setExposureMode(value: ExposureMode) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint16,
			encode: value => {
				return this.exposureModeTable.getKey(value) ?? null
			},
			value,
		})
	}

	getExposureModeDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => {
				return this.exposureModeTable.get(data) ?? null
			},
		})
	}

	async getFocalLengthDesc(): Promise<ConfigDesc<FocalLength>> {
		return {
			writable: false,
			value: 'spherical',
		}
	}

	setShutterSpeed(value: string) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCodeRicohTheta.ShutterSpeed,
			datatypeCode: DatatypeCode.Uint64,
			encode(str: string) {
				let fraction, denominator: number

				if (str.includes('/')) {
					const [fractionStr, denominatorStr] = str.split('/')
					fraction = parseInt(fractionStr)
					denominator = parseInt(denominatorStr)
				} else {
					const secs = parseFloat(str)
					denominator = secs % 1 > 0 ? 10 : 1
					fraction = Math.round(secs * denominator)
				}

				return (BigInt(denominator) << BigInt(32)) | BigInt(fraction)
			},
			value,
		})
	}

	getShutterSpeedDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCodeRicohTheta.ShutterSpeed,
			datatypeCode: DatatypeCode.Uint64,
			decode(num: bigint) {
				const denominator = Number(num >> BigInt(32))
				const fraction = Number(num & BigInt(0xffffffff))

				if (denominator === 1 || denominator === 10) {
					return `${fraction / denominator}` as const
				}

				return `${fraction}/${denominator}` as const
			},
		})
	}

	setWhiteBalance(value: WhiteBalance) {
		return this.setDevicePropValue({
			devicePropCode: DevicePropCode.WhiteBalance,
			datatypeCode: DatatypeCode.Uint16,
			encode: value => {
				return this.WhiteBalanceTable.getKey(value) ?? null
			},
			value,
		})
	}

	getWhiteBalanceDesc() {
		return this.getDevicePropDesc({
			devicePropCode: DevicePropCode.ExposureProgramMode,
			datatypeCode: DatatypeCode.Uint16,
			decode: data => {
				return this.WhiteBalanceTable.get(data) ?? null
			},
		})
	}

	private exposureModeTable = new BiMap<number, ExposureMode>([
		...ExposureModeTable.entries(),
		[0x8003, 'vendor:iso-priority'],
	])

	private WhiteBalanceTable = new BiMap<number, WhiteBalance>([
		...WhiteBalanceTable.entries(),
		[0x8001, 'shade'],
		[0x0004, 'daylight'],
		[0x0006, 'incandescent'],
		[0x8002, 'cloud'],
		[0x8020, 'vendor:incandescent 2'],
		[0x8003, 'vendor:fluorescent daylight'],
		[0x8004, 'vendor:fluorescent natural white'],
		[0x8005, 'vendor:fluorescent white'],
		[0x8006, 'tungsten'],
		[0x8007, 'manual'],
		[0x8008, 'underwater'],
	])
}
