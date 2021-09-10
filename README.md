<div align="center">
  <img src="docs/logo.svg" width="50%" />
  <br>
  <br>
  <h1>Tethr</h1>
</div>
  
Tethr is a JavaScript/TypeScript library for accessing and controlling USB-connected digital cameras from browsers.

It is built on the top of WebUSB API and aims to support cameras from various vendors. There is a protocol called PTP (Picture Transfer Protocol), which provides a way to access cameras' functionalities such as shutter, aperture, ISO and so on via USB or TCP/IP. However, most of cameras adopt their own vendor extensions to communitate with PC and there's hardly any compatability between them. Tethr also aims to fill the gap and provide an uniform and modern interface for developers without worrying about the difference. The project is deeply inspired by [libgphoto2](https://github.com/gphoto/libgphoto2).
