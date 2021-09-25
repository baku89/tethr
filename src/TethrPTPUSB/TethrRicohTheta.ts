import {BiMap} from 'bim'
import _ from 'lodash'

import {ConfigType} from '../configs'
import {DatatypeCode} from '../PTPDatacode'
import {ConfigDesc} from '../Tethr'
import {DevicePropScheme, TethrPTPUSB} from './TethrPTPUSB'

enum DevicePropCodeRicohTheta {
	ShutterSpeed = 0xd00f,
	ColorTemperature = 0xd813,
}

export class TethrRicohTheta extends TethrPTPUSB {
	public async getDesc<K extends keyof ConfigType, T extends ConfigType[K]>(
		name: K
	): Promise<ConfigDesc<T>> {
		if (name === 'focalLength') {
			return {
				writable: false,
				value: 'spherical' as T,
				options: [],
			}
		}
		return super.getDesc(name)
	}

	protected devicePropScheme = (() => {
		const devicePropScheme: DevicePropScheme = {
			...super.devicePropScheme,
			shutterSpeed: {
				devicePropCode: DevicePropCodeRicohTheta.ShutterSpeed,
				dataType: DatatypeCode.Uint64,
				encode: function (str: string) {
					let fraction, denominator: number

					if (str.endsWith('"')) {
						const secs = parseFloat(str.slice(0, -1))
						denominator = secs % 1 > 0 ? 10 : 1
						fraction = Math.round(secs * denominator)
					} else {
						const [fractionStr, denominatorStr] = str.split('/')
						fraction = parseInt(fractionStr)
						denominator = parseInt(denominatorStr)
					}

					return (BigInt(denominator) << BigInt(32)) | BigInt(fraction)
				},
				decode: function (num: bigint) {
					const denominator = Number(num >> BigInt(32))
					const fraction = Number(num & BigInt(0xffffffff))

					if (denominator === 1 || denominator === 10) {
						return fraction / denominator + '"'
					}

					return fraction + '/' + denominator
				},
			},
			colorTemperature: {
				devicePropCode: DevicePropCodeRicohTheta.ColorTemperature,
				dataType: DatatypeCode.Uint16,
				decode: _.identity,
				encode: _.identity,
			},
		}

		return devicePropScheme
	})()

	protected exposureModeTable = (() => {
		const table = new BiMap(super.exposureModeTable.entries())
		table.set(0x8003, 'vendor iso-priority')
		return table
	})()

	protected WhiteBalanceTable = (() => {
		const table = new BiMap(super.whiteBalanceTable.entries())
		table.set(0x8001, 'shade')
		table.set(0x0004, 'daylight')
		table.set(0x0006, 'incandescent')
		table.set(0x8002, 'cloud')
		table.set(0x8020, 'vendor incandescent 2')
		table.set(0x8003, 'vendor fluorescent daylight')
		table.set(0x8004, 'vendor fluorescent natural white')
		table.set(0x8005, 'vendor fluorescent white')
		table.set(0x8006, 'tungsten')
		table.set(0x8007, 'manual')
		table.set(0x8008, 'underwater')
		return table
	})()
}
