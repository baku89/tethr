import {BiMap} from 'bim'
import _ from 'lodash'

import {PropType} from '../props'
import {DatatypeCode} from '../PTPDatacode'
import {PropDesc, PropScheme, Tethr} from './Tethr'

enum DevicePropCodeRicohTheta {
	ShutterSpeed = 0xd00f,
	ColorTemperature = 0xd813,
}

export class TethrRicohTheta extends Tethr {
	public async getDesc<K extends keyof PropType, T extends PropType[K]>(
		name: K
	): Promise<PropDesc<T>> {
		if (name === 'focalLength') {
			return {
				writable: false,
				value: 'spherical' as T,
				options: [],
			}
		}
		return super.getDesc(name)
	}

	protected propScheme = (() => {
		const propScheme: PropScheme = {
			...super.propScheme,
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

		return propScheme
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