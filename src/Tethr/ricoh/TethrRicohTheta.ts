import {BiMap} from 'bim'
import _ from 'lodash'

import {PTPDevice} from '@/PTPDevice'

import {DatatypeCode} from '../../PTPDatacode'
import {PropScheme, Tethr} from '../Tethr'

enum DevicePropCodeRicohTheta {
	ShutterSpeed = 0xd00f,
}

export class TethrRicohTheta extends Tethr {
	public constructor(device: PTPDevice) {
		super(device)

		this._class = TethrRicohTheta
	}

	protected static PropScheme = (() => {
		const propScheme: PropScheme = {
			...Tethr.PropScheme,
			shutterSpeed: {
				devicePropCode: DevicePropCodeRicohTheta.ShutterSpeed,
				dataType: DatatypeCode.String,
				encode: _.identity,
				decode: _.identity,
			},
		}

		return propScheme
	})()

	protected static ExposureModeTable = (() => {
		const table = new BiMap(Tethr.ExposureModeTable.entries())
		table.set(0x8003, 'vendor iso-priority')
		return table
	})()
}
