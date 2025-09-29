const path = require('path');
const os = require('os');

const ffmpegPath = path.resolve(
  __dirname,
  'ffmpeg-bin',
  os.platform() === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
);

console.log(ffmpegPath);

console.log('Usando carpeta temporal:', os.tmpdir());