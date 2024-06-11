import EventEmitter from 'eventemitter3'

import {Tethr} from './Tethr'
import {initTethrUSBPTP} from './TethrPTPUSB'
import {TethrWebcam} from './TethrWebcam'
import {isntNil} from './util'

export class TethrManager extends EventEmitter {
	#cameras: Tethr[] | null = null

	constructor() {
		super()
	}

	/**
	 * Get all cameras that are connected and already paired with the browser. This can be called at any time.
	 * @returns A list of cameras that are already connected
n	 */
	private async getPairedCameras() {
		// Enumerate all USB devices
		const usbDevices = await navigator.usb.getDevices()
		const usbPromises = await Promise.all(usbDevices.map(initTethrUSBPTP))
		const usbCameras = usbPromises.filter(isntNil)

		// Enumerate all media devices (webcams)
		const webcamDevices = await this.enumerateWebcamo()

		return [...usbCameras]
	}

	/**
	 * Request an exclusive connection to a camera. This will prompt the user to select a camera to connect to. This should be called in response to a user action, such as a button click.
	 * @param type The type of camera to request
	 * @returns A list of cameras that were successfully connected to
	 */
	async requestCameras(type: 'usbptp' | 'webcam') {
		switch (type) {
			case 'usbptp':
				return this.requestUSBPTPCameras()
			case 'webcam':
				return this.requestWebcams()
		}
	}

	private async requestUSBPTPCameras() {
		let usbDevice: USBDevice
		try {
			usbDevice = await navigator.usb.requestDevice({filters: []})
		} catch {
			return []
		}

		const camera = await initTethrUSBPTP(usbDevice)

		if (!camera) return []

		return [camera]
	}

	private async requestWebcams() {
		const media = await navigator.mediaDevices.getUserMedia({video: true})
		media.getTracks().forEach(track => track.stop())

		const camera = new TethrWebcam()
		return [camera]
	}

	private async enumerateWebcamDeviceInfo() {
		const devices = await navigator.mediaDevices.enumerateDevices()
		const webcams = devices.filter(device => device.kind === 'videoinput')
		return webcams
	}
}
