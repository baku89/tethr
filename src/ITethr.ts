import {PropType} from './props'
import {PropDesc, SetPropResult} from './Tethr/Tethr'

type PropName = keyof PropType

export interface ITethr {
	open: () => Promise<void>
	close: () => Promise<void>

	listProps: () => Promise<PropName>
	listActions: () => Promise<string[]>

	get: <N extends PropName>(name: N) => Promise<PropType[N]>
	set: <N extends PropName>(
		name: N,
		value: PropType[N]
	) => Promise<SetPropResult<PropType[N]>>
	desc: <N extends PropName>(name: N) => Promise<PropDesc<PropType[N]>>

	onPropChanged: <N extends PropName>(
		name: N,
		callback: (desc: PropDesc<PropType[N]>) => void
	) => void
}
