import {Tethr} from '..'

export class TethrRicohTheta extends Tethr {
	protected _class = TethrRicohTheta

	protected static ExposureModeTable = (() => {
		const table = Tethr.ExposureModeTable
		table.set(0x8003, 'vendor iso-priority')
		return table
	})()
}
