import {connectCamera} from '../src/CameraControl'

const $connect = document.getElementById('connect') as HTMLButtonElement
const $takePicture = document.getElementById('takePicture') as HTMLButtonElement
const $imageViewer = document.getElementById('imageViewer') as HTMLImageElement
const $deviceInfo = document.getElementById('deviceInfo') as HTMLDivElement
const $deviceProps = document.getElementById('deviceProps') as HTMLDivElement

const connect = async () => {
	const cam = await connectCamera()

	$deviceInfo.innerHTML = listify(await cam.getDeviceInfo())

	$connect.disabled = true

	$deviceProps.innerHTML = listify({
		focalLength: await cam.getFocalLength(),
		batteryLevel: await cam.getBatteryLevel(),
		exposureMode: await cam.getExposureMode(),
		iso: await cam.getISO(),
		aperture: await cam.getAperture(),
		shutterSpeed: await cam.getShutterSpeed(),
	})

	window.addEventListener('beforeunload', cam.close)

	$takePicture.addEventListener('click', async () => {
		const image = await cam.takePicture()
		if (image) $imageViewer.src = image
	})
}

function listify(object: Record<string, any>) {
	return Object.entries(object)
		.map(([field, value]) => `<li>${field}: ${JSON.stringify(value)}`)
		.join('')
}

$connect.addEventListener('click', connect)

connect()
