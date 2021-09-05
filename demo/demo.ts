import {CameraControl} from '../src/CameraControl'

const test = async () => {
	const cam = new CameraControl()

	await cam.open()

	await cam.getDeviceInfo()
	await cam.getStorageInfo()

	await cam.close()
}
document.getElementById('execute')?.addEventListener('click', test)
