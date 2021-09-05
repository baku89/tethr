import {connectCamera} from '../src/CameraControl'

const $connect = document.getElementById('connect') as HTMLButtonElement
const $takePicture = document.getElementById('takePicture') as HTMLButtonElement
const $deviceInfo = document.getElementById('deviceInfo') as HTMLDivElement
const $deviceProps = document.getElementById('deviceProps') as HTMLDivElement

const connect = async () => {
	const cam = await connectCamera()

	$deviceInfo.innerHTML = listify(await cam.getDeviceInfo())

	$connect.disabled = true

	$deviceProps.innerHTML = listify({
		focalLength: await cam.getFocalLength(),
		batteryLevel: await cam.getBatteryLevel(),
	})

	window.addEventListener('beforeunload', cam.close)

	$takePicture.addEventListener('click', async () => {
		const info = await cam.takePicture()
		console.log(info)
		if (info) await cam.getThumb(info.objectID)
	})
}

function listify(object: Record<string, any>) {
	return Object.entries(object)
		.map(([field, value]) => `<li>${field}: ${JSON.stringify(value)}`)
		.join('')
}

$connect.addEventListener('click', connect)

connect()
