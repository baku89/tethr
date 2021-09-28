import {BiMap} from 'bim'
import {identity} from 'lodash'

import {
	ConfigName,
	ConfigType,
	ExposureModeTable,
	WhiteBalanceTable,
} from '../configs'
import {DatatypeCode} from '../PTPDatacode'
import {ConfigDesc} from '../Tethr'
import {DevicePropScheme, TethrPTPUSB} from './TethrPTPUSB'

enum DevicePropCodeRicohTheta {
	ShutterSpeed = 0xd00f,
	ColorTemperature = 0xd813,
}

export class TethrRicohTheta extends TethrPTPUSB {
	public async getDesc<N extends ConfigName, T extends ConfigType[N]>(
		name: N
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
			...this.devicePropScheme,
			shutterSpeed: {
				devicePropCode: DevicePropCodeRicohTheta.ShutterSpeed,
				dataType: DatatypeCode.Uint64,
				encode: function (str: string) {
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
				decode: function (num: bigint) {
					const denominator = Number(num >> BigInt(32))
					const fraction = Number(num & BigInt(0xffffffff))

					if (denominator === 1 || denominator === 10) {
						return (fraction / denominator).toString()
					}

					return fraction + '/' + denominator
				},
			},
			colorTemperature: {
				devicePropCode: DevicePropCodeRicohTheta.ColorTemperature,
				dataType: DatatypeCode.Uint16,
				decode: identity,
				encode: identity,
			},
		}

		return devicePropScheme
	})()

	protected exposureModeTable = new BiMap([
		...ExposureModeTable.entries(),
		[0x8003, 'vendor iso-priority'],
	])

	protected WhiteBalanceTable = new BiMap([
		...WhiteBalanceTable.entries(),
		[0x8001, 'shade'],
		[0x0004, 'daylight'],
		[0x0006, 'incandescent'],
		[0x8002, 'cloud'],
		[0x8020, 'vendor incandescent 2'],
		[0x8003, 'vendor fluorescent daylight'],
		[0x8004, 'vendor fluorescent natural white'],
		[0x8005, 'vendor fluorescent white'],
		[0x8006, 'tungsten'],
		[0x8007, 'manual'],
		[0x8008, 'underwater'],
	])
}
