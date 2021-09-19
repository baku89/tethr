import {Tethr} from '..'

export class TethrRicoh extends Tethr {
	protected _class = TethrRicoh

	protected static ExposureModeTable = (() => {
		const table = Tethr.ExposureModeTable
		table.set(0x8003, 'C1')
		return table
	})()
}
