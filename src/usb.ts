let _usb: USB | null = null

if ('navigator' in globalThis) {
	if (navigator.usb) {
		_usb = navigator.usb
	}
}

if ('process' in globalThis) {
	_usb = eval('require')('webusb').usb
}

export const usb = _usb
