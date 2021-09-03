const initDevice = async () => {
	let [device] = await navigator.usb.getDevices()

	if (!device) {
		device = await navigator.usb.requestDevice({filters: []})
	}

	await device.open()

	console.log(`device=${device.productName}`)

	if (!device.configuration) {
		await device.selectConfiguration(1)
	}
	
	await device.claimInterface(0)

	console.log('Claim succeed')

	await device.transferOut(1, Uint16Array.of(0x9035, 0x0, 0x0, 0x0, 0x0, 0x00))
	console.log('sent')

	const res = await device.transferIn(2, 1)

	console.log('received', res)
}


document.getElementById('execute')?.addEventListener('click', initDevice)

