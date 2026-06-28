import {ConfigName, ConfigType} from './configs'
import {DatatypeCode} from './PTPDatacode'

/**
 * Declarative description of how a single config maps to a (numeric) PTP device
 * property: which property code, its datatype, and how the raw value converts
 * to/from the config's value type. Omitting `encode` marks it read-only.
 *
 * This is the unit of the {@link defineConfigs} table — a vendor describes its
 * configs as data instead of hand-writing a getter/setter/desc method trio per
 * config. The base engine drives get/set/desc and the change-event reverse map
 * (code → config name) off the same table.
 *
 * Scope note: `decode`'s input is `number`, so this covers numeric device
 * properties (the vast majority). String/derived configs (model, imageSize,
 * capability flags) stay as explicit methods — deliberately, to keep the table
 * type-inference sharp. Tying the raw type to the datatype tag as well is the
 * one axis that makes inference and error messages degrade, so we don't.
 */
export interface ConfigScheme<N extends ConfigName> {
	devicePropCode: number
	datatypeCode: DatatypeCode
	decode: (raw: number) => ConfigType[N] | null
	encode?: (value: ConfigType[N]) => number | null
}

/**
 * A vendor's config table. The homomorphic mapped type ties each entry's
 * value type to its own key, so inside a {@link defineConfigs} literal the
 * `aperture` entry's `encode` is typed `(v: Aperture) => …`, the
 * `shutterSpeed` entry's `(v: ShutterSpeed) => …`, and a mismatch is reported
 * at that one entry rather than as a giant union error.
 */
export type ConfigTable = {
	[N in ConfigName]?: ConfigScheme<N>
}

/**
 * Identity helper that constrains a config table while preserving its exact
 * keys. Wrapping the literal turns on contextual typing, so `decode`/`encode`
 * params are inferred per-key with no annotations needed.
 *
 * @example
 * const table = defineConfigs({
 *   aperture: {
 *     devicePropCode: DevicePropCode.FNumber,
 *     datatypeCode: DatatypeCode.Uint16,
 *     decode: raw => (raw / 100) as Aperture,   // returns Aperture
 *     encode: v => (v === 'auto' ? null : Math.round(v * 100)), // v: Aperture
 *   },
 * })
 */
export const defineConfigs = <T extends ConfigTable>(table: T): T => table

/**
 * Reverse map from device property code to config name, derived from a table.
 * Used to translate a DevicePropChanged event into the config(s) to re-read,
 * so a vendor gets change-event wiring for free from the same table.
 */
export function buildConfigCodeMap(
	table: ConfigTable
): Map<number, ConfigName> {
	const map = new Map<number, ConfigName>()
	for (const name of Object.keys(table) as ConfigName[]) {
		const scheme = table[name]
		if (scheme) map.set(scheme.devicePropCode, name)
	}
	return map
}
