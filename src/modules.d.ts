declare module 'get-user-media-promise' {
	interface GetUserMediaPromise {
		(constraints: MediaStreamConstraints): Promise<MediaStream>
		isSupported: boolean
	}
	const getUserMedia: GetUserMediaPromise
	export default getUserMedia
}
