import {connectCamera} from '../src/CameraControl'

const test = async () => {
	const cam = await connectCamera()

	// await cam.getStorageInfo()

	console.log({
		focalLength: await cam.getFocalLength(),
		batteryLevel: await cam.getBatteryLevel(),
	})

	await cam.close()
}
document.getElementById('execute')?.addEventListener('click', test)
